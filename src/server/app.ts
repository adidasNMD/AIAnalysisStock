import express, { Request, Response } from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { healthMonitor } from '../utils/health-monitor';
import { taskQueue } from '../utils/task-queue';
import { loadNarratives } from '../utils/narrative-store';
import { getActiveTickers } from '../utils/dynamic-watchlist';
import { eventBus } from '../utils/event-bus';
import { getFullConfig, saveModelsConfig, reloadConfig } from '../utils/model-config';
import { getRuntimeConfig, updateRuntimeConfig } from '../config';
import { checkOpenBBHealth } from '../utils/openbb-provider';
import { checkTAHealth } from '../utils/ta-client';
import { getTokenUsage } from '../utils/llm';
import { watchIPO } from '../tools/edgar-monitor';
import {
  buildHeatTransferGraphs,
  buildOpportunityBoardHealthMap,
  buildNewCodeRadarCandidates,
  buildOpportunityInbox,
  buildOpportunityActionTimeline,
  buildOpportunityPlaybook,
  buildOpportunitySuggestedMission,
  buildOpportunitySuggestedMissions,
  buildWhyNowSummary,
  listMissions,
  getMission,
  listMissionEvents,
  listMissionRuns,
  getLatestMissionRun,
  buildLatestMissionDiff,
  getMissionEvidence,
  saveMissionEvidence,
  markMissionCanceled,
  cancelMissionRun,
  createQueuedMission,
  retryMissionRun,
  createOpportunity,
  detectOpportunityHeatInflection,
  emitOpportunityDerivedEvents,
  getOpportunity,
  getOpportunityHeatHistory,
  getLatestOpportunityDiff,
  listOpportunities,
  listOpportunityEvents,
  listOpportunityEventsAfter,
  syncHeatTransferGraphOpportunities,
  syncNewCodeRadarOpportunities,
  toOpportunityEventEnvelope,
  updateOpportunity,
  appendOpportunityEvent,
  type OpportunityEventEnvelope,
  type OpportunityEventRecord,
  markOpportunityMissionCanceled,
  type OpportunityRecord,
  type OpportunitySummaryRecord,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
  type OpportunityStage,
  type OpportunityStatus,
  type OpportunityScores,
  type OpportunityHeatProfile,
  type OpportunityProxyProfile,
  type OpportunityIpoProfile,
  type OpportunityCatalystItem,
  type MissionInput,
} from '../workflows';
import { diagnosticsHandler } from './routes/diagnostics';
import { rssProxyHandler } from './routes/rss-proxy';
import { logger } from '../utils/logger';
import { getTraceByMissionId, getTraceByRunId } from '../utils/agent-logger';
import * as fs from 'fs';
import * as path from 'path';

export const app = express();

app.use(cors());
app.use(express.json());

function loadEdgarWatchCompanies(): string[] {
  const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
  if (!fs.existsSync(watchlistPath)) return [];
  const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8')) as {
    tickers?: Array<{ name?: string; alerts?: { edgarWatch?: boolean } }>;
  };
  return (data.tickers || [])
    .filter((ticker) => ticker.alerts?.edgarWatch && ticker.name)
    .map((ticker) => ticker.name as string);
}

async function buildOpportunitySummary(opportunity: OpportunityRecord): Promise<OpportunitySummaryRecord> {
  const latestMission = opportunity.latestMissionId ? getMission(opportunity.latestMissionId) : null;
  const runs = latestMission ? await listMissionRuns(latestMission.id) : [];
  const latestRun = runs[0] || null;
  const latestDiff = latestMission ? buildLatestMissionDiff(latestMission, runs) : null;
  const latestOpportunityDiff = await getLatestOpportunityDiff(opportunity.id);
  const recentHeatHistory = opportunity.type === 'relay_chain'
    ? await getOpportunityHeatHistory(opportunity.id, 5)
    : [];
  const recentOpportunityEvents = await listOpportunityEvents(opportunity.id, 4);
  const recentMissionEvents = latestMission ? listMissionEvents(latestMission.id).slice(-3) : [];
  const heatInflection = opportunity.type === 'relay_chain'
    ? recentHeatHistory.length > 1
      ? detectOpportunityHeatInflection(recentHeatHistory)
      : null
    : null;
  const summaryBase: OpportunitySummaryRecord = {
    ...opportunity,
    ...(latestMission
      ? {
          latestMission: {
            id: latestMission.id,
            query: latestMission.input.query,
            status: latestMission.status,
            updatedAt: latestMission.updatedAt,
            ...(latestMission.input.source ? { source: latestMission.input.source } : {}),
          },
        }
      : {}),
    ...(latestRun ? { latestRun } : {}),
    ...(latestDiff ? { latestDiff } : {}),
    ...(latestOpportunityDiff ? { latestOpportunityDiff } : {}),
    ...(recentHeatHistory.length > 0 ? { recentHeatHistory } : {}),
    ...(heatInflection ? { heatInflection } : {}),
  };

  return {
    ...summaryBase,
    whyNowSummary: buildWhyNowSummary(summaryBase),
    playbook: buildOpportunityPlaybook(summaryBase),
    suggestedMission: buildOpportunitySuggestedMission(summaryBase),
    suggestedMissions: buildOpportunitySuggestedMissions(summaryBase),
    recentActionTimeline: buildOpportunityActionTimeline(recentOpportunityEvents, recentMissionEvents, 6),
  };
}

// API: 代理内部 RSS 数据 (X / Reddit bypass)
app.get('/api/rss/:source', rssProxyHandler);

// API: 系统诊断与健康探针
app.get('/api/diagnostics', diagnosticsHandler);

// API: 核心调度健康状态 (原有)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: healthMonitor.getStatusSummary(),
    isDegraded: healthMonitor.shouldSkipAnalysis()
  });
});

// API: 任务队列查看
app.get('/api/queue', async (req: Request, res: Response) => {
  try {
    const summary = await taskQueue.getStatusSummary();
    const tasks = await taskQueue.getAll();
    res.json({
      summary,
      tasks: tasks.sort((a, b) => b.createdAt - a.createdAt)
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 手动下发任务 (Manual Trigger)
app.post('/api/trigger', async (req: Request, res: Response) => {
  const { query, depth, source = 'manual', opportunityId } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  const mission = await createQueuedMission({
    query,
    depth: depth || 'deep',
    source,
    priority: 100,
    ...(opportunityId ? { opportunityId } : {}),
  });
  if (mission) {
    const latestRun = await getLatestMissionRun(mission.id);
    res.status(202).json({
      success: true,
      message: 'Mission queued successfully',
      missionId: mission.id,
      runId: latestRun?.id,
    });
  } else {
    res.status(409).json({ error: 'Task already in queue or running' });
  }
});

// API: 强制中止任务 (Cancel Mission)
app.delete('/api/queue/:id', async (req: Request, res: Response) => {
  try {
    const task = await taskQueue.cancelTask(req.params.id as string);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== 'canceled') {
      return res.status(409).json({ error: `Task is already ${task.status}` });
    }
    if (task.runId) {
      await cancelMissionRun(task.runId, 'Canceled by user');
    }
    if (task.missionId) {
      const canceledMission = markMissionCanceled(task.missionId, 'Canceled by user');
      if (canceledMission && task.runId) {
        saveMissionEvidence(canceledMission, task.runId, 'canceled');
      }
      if (canceledMission?.input.opportunityId) {
        await markOpportunityMissionCanceled(canceledMission.input.opportunityId, canceledMission.id, task.runId, 'Canceled by user');
      }
    }
    res.json({ success: true, message: 'Mission canceled' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities/graphs/heat-transfer', async (_req: Request, res: Response) => {
  try {
    const opportunities = await listOpportunities(500);
    const graphs = buildHeatTransferGraphs(getActiveTickers(), opportunities);
    res.json(graphs);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/opportunities/graphs/heat-transfer/sync', async (_req: Request, res: Response) => {
  try {
    const synced = await syncHeatTransferGraphOpportunities(getActiveTickers());
    res.json({
      success: true,
      syncedCount: synced.length,
      opportunities: synced,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/opportunities/radar/new-codes/refresh', async (_req: Request, res: Response) => {
  try {
    const companies = loadEdgarWatchCompanies();
    const filings = await watchIPO(companies);
    const synced = await syncNewCodeRadarOpportunities(filings);
    const candidates = buildNewCodeRadarCandidates(filings, synced);
    res.json({
      success: true,
      companyCount: companies.length,
      filingCount: filings.length,
      syncedCount: synced.length,
      candidates,
      opportunities: synced,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities/inbox', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 12;
    const opportunities = await listOpportunities(200);
    const summaries = await Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
    res.json(buildOpportunityInbox(summaries, limit));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities/inbox/:id', async (req: Request, res: Response) => {
  try {
    const opportunity = await getOpportunity(req.params.id as string);
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const summary = await buildOpportunitySummary(opportunity);
    const [item] = buildOpportunityInbox([summary], 1);
    if (!item) {
      return res.status(404).json({ error: 'Inbox item not found' });
    }
    return res.json(item);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities/board-health', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const opportunities = await listOpportunities(limit);
    const summaries = await Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
    return res.json(buildOpportunityBoardHealthMap(summaries));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const opportunities = await listOpportunities(limit);
    const summaries = await Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
    res.json(summaries);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunity-events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(await listOpportunityEvents(undefined, limit));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

function getSseReplayCursor(req: Request): string | undefined {
  const queryCursor = req.query.since;
  if (typeof queryCursor === 'string' && queryCursor.trim()) {
    return queryCursor.trim();
  }

  const headerCursor = req.headers['last-event-id'];
  if (typeof headerCursor === 'string' && headerCursor.trim()) {
    return headerCursor.trim();
  }
  if (Array.isArray(headerCursor) && typeof headerCursor[0] === 'string' && headerCursor[0].trim()) {
    return headerCursor[0].trim();
  }

  return undefined;
}

function writeSseEnvelope(res: Response, envelope: OpportunityEventEnvelope): void {
  res.write(`id: ${envelope.id}\n`);
  res.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

app.get('/api/opportunities/stream', async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onEvent = (data: unknown) => {
    const event = data as OpportunityEventRecord;
    writeSseEnvelope(res, toOpportunityEventEnvelope(event, { service: 'api' }));
  };

  eventBus.on('opportunity_event', onEvent);

  const replayCursor = getSseReplayCursor(req);
  if (replayCursor) {
    try {
      const replayEvents = await listOpportunityEventsAfter(replayCursor, 100);
      replayEvents.forEach((event) => {
        writeSseEnvelope(res, toOpportunityEventEnvelope(event, { service: 'api' }));
      });
    } catch (e: unknown) {
      logger.warn(`[SSE] Opportunity replay failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.removeListener('opportunity_event', onEvent);
  });
});

app.get('/api/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const opportunity = await getOpportunity(req.params.id as string);
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    return res.json(await buildOpportunitySummary(opportunity));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities/:id/events', async (req: Request, res: Response) => {
  try {
    res.json(await listOpportunityEvents(req.params.id as string, parseInt(req.query.limit as string, 10) || 50));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/opportunities/:id/heat-history', async (req: Request, res: Response) => {
  try {
    res.json(await getOpportunityHeatHistory(req.params.id as string, parseInt(req.query.limit as string, 10) || 8));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/opportunities', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<CreateOpportunityInput>;
    const title = (body.title || body.query || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'title or query is required' });
    }
    const type = body.type || 'ad_hoc';
    const opportunity = await createOpportunity({
      type,
      title,
      ...(body.query ? { query: body.query } : {}),
      ...(body.thesis ? { thesis: body.thesis } : {}),
      ...(body.summary ? { summary: body.summary } : {}),
      ...(body.stage ? { stage: body.stage } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.primaryTicker ? { primaryTicker: body.primaryTicker } : {}),
      ...(body.leaderTicker ? { leaderTicker: body.leaderTicker } : {}),
      ...(body.proxyTicker ? { proxyTicker: body.proxyTicker } : {}),
      ...(body.relatedTickers ? { relatedTickers: body.relatedTickers } : {}),
      ...(body.relayTickers ? { relayTickers: body.relayTickers } : {}),
      ...(body.nextCatalystAt ? { nextCatalystAt: body.nextCatalystAt } : {}),
      ...(body.supplyOverhang ? { supplyOverhang: body.supplyOverhang } : {}),
      ...(body.policyStatus ? { policyStatus: body.policyStatus } : {}),
      ...(body.scores ? { scores: body.scores } : {}),
      ...(body.heatProfile ? { heatProfile: body.heatProfile } : {}),
      ...(body.proxyProfile ? { proxyProfile: body.proxyProfile } : {}),
      ...(body.ipoProfile ? { ipoProfile: body.ipoProfile } : {}),
      ...(body.catalystCalendar ? { catalystCalendar: body.catalystCalendar } : {}),
    });
    res.status(201).json(opportunity);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.patch('/api/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const previous = await getOpportunity(req.params.id as string);
    const updates: UpdateOpportunityInput = {};
    if (typeof body.title === 'string') updates.title = body.title;
    if (typeof body.query === 'string') updates.query = body.query;
    if (typeof body.thesis === 'string') updates.thesis = body.thesis;
    if (typeof body.summary === 'string') updates.summary = body.summary;
    if (typeof body.stage === 'string') updates.stage = body.stage as OpportunityStage;
    if (typeof body.status === 'string') updates.status = body.status as OpportunityStatus;
    if (typeof body.primaryTicker === 'string') updates.primaryTicker = body.primaryTicker;
    if (typeof body.leaderTicker === 'string') updates.leaderTicker = body.leaderTicker;
    if (typeof body.proxyTicker === 'string') updates.proxyTicker = body.proxyTicker;
    if (Array.isArray(body.relatedTickers)) updates.relatedTickers = body.relatedTickers as string[];
    if (Array.isArray(body.relayTickers)) updates.relayTickers = body.relayTickers as string[];
    if (typeof body.nextCatalystAt === 'string') updates.nextCatalystAt = body.nextCatalystAt;
    if (typeof body.supplyOverhang === 'string') updates.supplyOverhang = body.supplyOverhang;
    if (typeof body.policyStatus === 'string') updates.policyStatus = body.policyStatus;
    if (typeof body.scores === 'object' && body.scores !== null) updates.scores = body.scores as Partial<OpportunityScores>;
    if (typeof body.heatProfile === 'object' && body.heatProfile !== null) updates.heatProfile = body.heatProfile as Partial<OpportunityHeatProfile>;
    if (typeof body.proxyProfile === 'object' && body.proxyProfile !== null) updates.proxyProfile = body.proxyProfile as Partial<OpportunityProxyProfile>;
    if (typeof body.ipoProfile === 'object' && body.ipoProfile !== null) updates.ipoProfile = body.ipoProfile as OpportunityIpoProfile;
    if (Array.isArray(body.catalystCalendar)) updates.catalystCalendar = body.catalystCalendar as OpportunityCatalystItem[];

    const opportunity = await updateOpportunity(req.params.id as string, updates);
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    await appendOpportunityEvent(opportunity.id, {
      type: 'updated',
      message: `Opportunity updated: ${opportunity.title}`,
      meta: {
        stage: opportunity.stage,
        status: opportunity.status,
      },
    });
    await emitOpportunityDerivedEvents(previous, opportunity);
    res.json((await getOpportunity(opportunity.id)) || opportunity);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取所有叙事记忆
app.get('/api/narratives', async (req: Request, res: Response) => {
  try {
    const narratives = await loadNarratives();
    res.json(narratives);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取现在的动态标的池
app.get('/api/watchlist/dynamic', (req: Request, res: Response) => {
  try {
    const dynamicTickers = getActiveTickers();
    res.json(dynamicTickers);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取静态 Watchlist
app.get('/api/watchlist/static', (req: Request, res: Response) => {
  try {
    const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
    if (fs.existsSync(watchlistPath)) {
      const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
      res.json(data.tickers || []);
    } else {
      res.json([]);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: Server-Sent Events (SSE) 直播流，推送 Agent 思考过程
app.get('/api/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const onLog = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  req.on('close', () => {
    eventBus.removeListener('agent_log', onLog);
  });
});

// API: 获取所有叙事记忆
app.get('/api/reports', (req: Request, res: Response) => {
  try {
    const reportsDir = path.join(process.cwd(), 'out', 'reports');
    if (!fs.existsSync(reportsDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(reportsDir).filter(d => fs.statSync(path.join(reportsDir, d)).isDirectory());
    const reports = [];
    for (const date of dates) {
      const dateDir = path.join(reportsDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        reports.push({ date, filename: file });
      }
    }
    res.json(reports.sort((a, b) => (b.date + b.filename).localeCompare(a.date + a.filename)));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/reports/content', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.query;
    if (!date || !filename || typeof date !== 'string' || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Missing date or filename' });
    }
    const reportPath = path.join(process.cwd(), 'out', 'reports', path.basename(date), path.basename(filename));
    
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const content = fs.readFileSync(reportPath, 'utf-8');
    res.json({ content });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取所有 Trace
app.get('/api/traces', (req: Request, res: Response) => {
  try {
    const tracesDir = path.join(process.cwd(), 'out', 'traces');
    if (!fs.existsSync(tracesDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(tracesDir).filter(d => fs.statSync(path.join(tracesDir, d)).isDirectory());
    const traces = [];
    for (const date of dates) {
      const dateDir = path.join(tracesDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        traces.push({ date, filename: file });
      }
    }
    res.json(traces.sort((a, b) => (b.date + b.filename).localeCompare(a.date + a.filename)));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/traces/content', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.query;
    if (!date || !filename || typeof date !== 'string' || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Missing date or filename' });
    }
    const tracePath = path.join(process.cwd(), 'out', 'traces', path.basename(date), path.basename(filename));
    
    if (!fs.existsSync(tracePath)) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    
    const content = fs.readFileSync(tracePath, 'utf-8');
    res.json({ content: JSON.parse(content) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 根据 Mission ID 直接定位 Trace（消灭 N+1）
app.get('/api/traces/byMission/:missionId', (req: Request, res: Response) => {
  try {
    const missionId = req.params.missionId as string;
    const trace = getTraceByMissionId(missionId);
    if (!trace) {
      return res.status(404).json({ error: 'Trace not found for mission' });
    }
    res.json({ content: trace });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 根据 Mission + Run 定位特定执行轨迹
app.get('/api/traces/byMission/:missionId/runs/:runId', (req: Request, res: Response) => {
  try {
    const missionId = req.params.missionId as string;
    const runId = req.params.runId as string;
    const trace = getTraceByRunId(missionId, runId);
    if (!trace) {
      return res.status(404).json({ error: 'Trace not found for mission run' });
    }
    res.json({ content: trace });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ================================================================
// 新增 API: TrendRadar 实时雷达数据
// ================================================================

// 获取可查询的日期列表
app.get('/api/trendradar/dates', (req: Request, res: Response) => {
  try {
    const newsDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'news');
    if (!fs.existsSync(newsDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(newsDir)
      .filter(f => f.endsWith('.db'))
      .map(f => f.replace('.db', ''))
      .sort()
      .reverse();
    res.json(dates);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ── TrendRadar HTML 报告 API ──

// 列出所有可用的 HTML 报告
app.get('/api/trendradar/reports', (req: Request, res: Response) => {
  try {
    const htmlDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'html');
    if (!fs.existsSync(htmlDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(htmlDir)
      .filter(d => fs.statSync(path.join(htmlDir, d)).isDirectory())
      .sort()
      .reverse();
    const reports: { date: string; filename: string; time: string }[] = [];
    for (const date of dates) {
      const dateDir = path.join(htmlDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.html')).sort().reverse();
      for (const file of files) {
        reports.push({ date, filename: file, time: file.replace('.html', '') });
      }
    }
    res.json(reports);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// 提供单个 HTML 报告的内容（直接作为 HTML 返回，可嵌入 iframe）
app.get('/api/trendradar/reports/:date/:filename', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.params;
    const safeDateStr = path.basename(date as string);
    const safeFilename = path.basename(filename as string);
    const reportPath = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'html', safeDateStr, safeFilename);
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const content = fs.readFileSync(reportPath, 'utf-8');
    res.send(content);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// 获取 TrendRadar 数据（支持 ?date= 指定日期，默认最新）
app.get('/api/trendradar/latest', (req: Request, res: Response) => {
  try {
    const newsDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'news');
    if (!fs.existsSync(newsDir)) {
      return res.json({ date: null, items: [] });
    }
    
    const dbFiles = fs.readdirSync(newsDir).filter(f => f.endsWith('.db')).sort();
    if (dbFiles.length === 0) {
      return res.json({ date: null, items: [] });
    }
    
    // 支持指定日期，否则取最新
    const requestedDate = typeof req.query.date === 'string' ? req.query.date : null;
    let targetFile: string;
    if (requestedDate && dbFiles.includes(`${requestedDate}.db`)) {
      targetFile = `${requestedDate}.db`;
    } else {
      targetFile = dbFiles[dbFiles.length - 1]!; // 回溯修复：之前获取的最新文件应为数组最后一个
    }
    
    const dbPath = path.join(newsDir, targetFile);
    const rssDbPath = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'rss', targetFile);
    const dateStr = targetFile.replace('.db', '');
    
    const db = new sqlite3.Database(dbPath);
    
    const hasRss = fs.existsSync(rssDbPath);
    const query = hasRss ? `
      SELECT n.id, n.title, n.url, n.rank, n.first_crawl_time, n.last_crawl_time, n.crawl_count, p.name as platform_name 
      FROM news_items n 
      JOIN platforms p ON n.platform_id = p.id 
      JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
      WHERE fn.matched = 1
      UNION ALL
      SELECT r.id, r.title, r.url, -1 as rank, r.first_crawl_time, r.last_crawl_time, r.crawl_count, f.name as platform_name 
      FROM rss_db.rss_items r
      JOIN rss_db.rss_feeds f ON r.feed_id = f.id
      JOIN ai_filter_analyzed_news fn ON r.id = fn.news_item_id AND fn.source_type = 'rss'
      WHERE fn.matched = 1
      ORDER BY last_crawl_time DESC, rank ASC 
      LIMIT 100
    ` : `
      SELECT n.id, n.title, n.url, n.rank, n.first_crawl_time, n.last_crawl_time, n.crawl_count, p.name as platform_name 
      FROM news_items n 
      JOIN platforms p ON n.platform_id = p.id 
      JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
      WHERE fn.matched = 1
      ORDER BY n.last_crawl_time DESC, n.rank ASC 
      LIMIT 100
    `;

    const executeQuery = () => {
      db.all(query, [], (err: Error | null, rows: any[]) => {
        db.close();
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ date: dateStr, items: rows });
      });
    };

    if (hasRss) {
      db.run(`ATTACH DATABASE '${rssDbPath}' AS rss_db`, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        executeQuery();
      });
    } else {
      executeQuery();
    }
    
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// 新增 API: 返回原汁原味的未筛选数据以及筛选状态
app.get('/api/trendradar/raw', async (req: Request, res: Response) => {
  try {
    const outputDir = path.join(__dirname, '../../vendors/trendradar/output/news');
    if (!fs.existsSync(outputDir)) {
      return res.json({ date: null, items: [] });
    }

    // 获取最近七天的数据库文件
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.db')).sort().reverse().slice(0, 7);
    if (files.length === 0) {
      return res.json({ date: null, items: [] });
    }

    let allItems: any[] = [];
    const dateRangeStr = `${files[files.length - 1]?.replace('.db', '')} ~ ${files[0]?.replace('.db', '')}`;

    for (const file of files) {
      const dbPath = path.join(outputDir, file);
      const rssDbPath = path.join(__dirname, '../../vendors/trendradar/output/rss', file);
      const hasRss = fs.existsSync(rssDbPath);

      await new Promise<void>((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) { resolve(); return; } // 跳过打不开的数据库
        });

        // 先检查 ai_filter_analyzed_news 表是否存在
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_filter_analyzed_news'", (err, row) => {
          const hasAiTable = !err && !!row;

          const buildQuery = (withRss: boolean) => {
            if (hasAiTable) {
              return withRss ? `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, IFNULL(fn.matched, -1) as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
                LEFT JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
                UNION ALL
                SELECT r.id, r.title, r.url, r.first_crawl_time, r.last_crawl_time, f.name as platform_name, 'rss' as source_type, IFNULL(fn.matched, -1) as matched, NULL as matched_tag
                FROM rss_db.rss_items r
                JOIN rss_db.rss_feeds f ON r.feed_id = f.id
                LEFT JOIN ai_filter_analyzed_news fn ON r.id = fn.news_item_id AND fn.source_type = 'rss'
              ` : `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, IFNULL(fn.matched, -1) as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
                LEFT JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
              `;
            } else {
              // 老数据库没有 ai_filter 表，直接查原始数据
              return withRss ? `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, -1 as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
                UNION ALL
                SELECT r.id, r.title, r.url, r.first_crawl_time, r.last_crawl_time, f.name as platform_name, 'rss' as source_type, -1 as matched, NULL as matched_tag
                FROM rss_db.rss_items r
                JOIN rss_db.rss_feeds f ON r.feed_id = f.id
              ` : `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, -1 as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
              `;
            }
          };

          const query = buildQuery(hasRss);

          const executeQuery = () => {
            db.all(query, [], (err2: Error | null, rows: any[]) => {
              db.close();
              if (!err2 && rows) allItems = allItems.concat(rows);
              resolve();
            });
          };

          if (hasRss) {
            db.run(`ATTACH DATABASE '${rssDbPath}' AS rss_db`, (attachErr) => {
              if (attachErr) {
                // RSS 附加失败，退化为仅热榜查询
                const fallbackQuery = buildQuery(false);
                db.all(fallbackQuery, [], (err3: Error | null, rows: any[]) => {
                  db.close();
                  if (!err3 && rows) allItems = allItems.concat(rows);
                  resolve();
                });
              } else {
                executeQuery();
              }
            });
          } else {
            executeQuery();
          }
        });
      });
    }

    // 按时间先后排序（降序：最新在最前，或者升序） 用户说：按时间先后排序
    // 这里使用第一获取时间降序，如果用户想要升序可以改这里。默认降序体验更好
    allItems.sort((a, b) => {
      const timeA = new Date(a.first_crawl_time || a.last_crawl_time).getTime();
      const timeB = new Date(b.first_crawl_time || b.last_crawl_time).getTime();
      return timeB - timeA; // 降序
    });

    res.json({ date: `最近七天 (${dateRangeStr})`, items: allItems });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});


// ================================================================
// 新增 API: 统一模型配置中心
// ================================================================

// API: 读取模型配置
app.get('/api/config/models', (req: Request, res: Response) => {
  try {
    const config = getFullConfig();
    res.json(config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 保存模型配置 (Dashboard Settings 页面调用)
app.put('/api/config/models', (req: Request, res: Response) => {
  try {
    saveModelsConfig(req.body);
    const updated = reloadConfig();
    res.json({ success: true, config: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 运行时特性配置 (T1 开关 / leader tickers / SMA250 veto)
app.get('/api/config', (req: Request, res: Response) => {
  res.json(getRuntimeConfig());
});

app.patch('/api/config', (req: Request, res: Response) => {
  const allowed = ['t1Enabled', 'leaderTickers', 'sma250VetoEnabled'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  const updated = updateRuntimeConfig(patch);
  res.json(updated);
});

app.get('/api/token-usage', (req: Request, res: Response) => {
  res.json(getTokenUsage());
});

// ================================================================
// 新增 API: 多服务健康检查
// ================================================================

// API: 全部服务健康状态一览
async function checkTrendRadarHealth(): Promise<{status: string, note: string}> {
  try {
    const fs = require('fs');
    const path = require('path');
    const logs = [
      path.join(__dirname, '../../vendors/trendradar/crawler.log'),
      path.join(__dirname, '../../vendors/trendradar/manual_run.log')
    ];
    
    let latestLogFile = '';
    let latestTime = 0;
    
    for (const file of logs) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          latestLogFile = file;
        }
      }
    }

    if (!latestLogFile) {
      return { status: 'unknown', note: '未发现爬虫日志' };
    }
    
    const stats = fs.statSync(latestLogFile);
    // 判断进程活跃或最后存活：如果超 3 小时没更新，标记为离线
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    
    const readLen = Math.min(stats.size, 5000);
    const fd = fs.openSync(latestLogFile, 'r');
    const buffer = Buffer.alloc(readLen);
    fs.readSync(fd, buffer, 0, readLen, stats.size - readLen);
    fs.closeSync(fd);
    
    const content = buffer.toString('utf-8');
    fs.closeSync(fs.openSync(latestLogFile, 'r')); // dummy close? No, already closed

    // 监测致命词汇
    if (content.match(/Timeout|APITimeoutError|Traceback|Error communicating|ConnectionRefusedError/i)) {
      return { status: 'error', note: '触发警报: 日志出现报错或大模型超时' };
    }

    if (stats.mtimeMs < threeHoursAgo) {
      return { status: 'offline', note: '长达3小时没运作，爬虫可能停转' };
    }

    return { status: 'running', note: '爬虫运作正常，无报错' };
  } catch (e: unknown) {
    return { status: 'unknown', note: '读取监控日志失败' };
  }
}

app.get('/api/health/services', async (req: Request, res: Response) => {
  try {
    const [openbbOk, taOk, trHealth] = await Promise.all([
      checkOpenBBHealth(),
      checkTAHealth(),
      checkTrendRadarHealth(),
    ]);

    res.json({
      openclaw: { status: 'running', port: 3000 },
      openbb: { status: openbbOk ? 'running' : 'offline', port: 8000 },
      tradingAgents: { status: taOk ? 'running' : 'offline', port: 8001 },
      trendradar: trHealth,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ================================================================
// 新增 API: 统一 Mission 管理
// ================================================================

// API: 列出所有 Mission
app.get('/api/missions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const missions = listMissions(limit);
    // 返回轻量列表（不含完整报告内容）
    const summaries = await Promise.all(missions.map(async (m) => {
      const runs = await listMissionRuns(m.id);
      const latestRun = runs[0] || null;
      const latestDiff = buildLatestMissionDiff(m, runs);

      return {
        id: m.id,
        mode: m.input.mode,
        query: m.input.query,
        source: m.input.source,
        status: m.status,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        openclawTickers: m.openclawTickers,
        taCount: m.taResults.length,
        consensus: m.consensus,
        totalDurationMs: m.totalDurationMs,
        ...(latestRun ? { latestRun } : {}),
        ...(latestDiff ? { latestDiff } : {}),
      };
    }));
    res.json(summaries);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: Mission 实时事件流（SSE）— 必须在 :id 路由之前
app.get('/api/missions/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onLog = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  // 发送心跳保持连接
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.removeListener('agent_log', onLog);
  });
});

// API: 获取单个 Mission 完整详情
app.get('/api/missions/:id', (req: Request, res: Response) => {
  try {
    const mission = getMission(req.params.id as string);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    res.json(mission);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取 Mission 生命周期事件
app.get('/api/missions/:id/events', (req: Request, res: Response) => {
  try {
    res.json(listMissionEvents(req.params.id as string));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取 Mission 的执行实例
app.get('/api/missions/:id/runs', async (req: Request, res: Response) => {
  try {
    res.json(await listMissionRuns(req.params.id as string));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 获取某次 run 的证据快照
app.get('/api/missions/:id/runs/:runId/evidence', (req: Request, res: Response) => {
  try {
    const mission = getMission(req.params.id as string);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const evidence = getMissionEvidence(req.params.runId as string);
    if (!evidence || evidence.missionId !== mission.id) {
      return res.status(404).json({ error: 'Mission evidence not found' });
    }

    res.json(evidence);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 重试已有 Mission，复用同一个 missionId，生成新的 run
app.post('/api/missions/:id/retry', async (req: Request, res: Response) => {
  try {
    const missionId = req.params.id as string;
    const existingMission = getMission(missionId);
    if (!existingMission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const body = req.body as Partial<MissionInput>;
    const mission = await retryMissionRun(missionId, {
      source: body.source || 'manual_retry',
      priority: 90,
      ...(body.depth ? { depth: body.depth } : {}),
    });
    if (!mission) {
      return res.status(409).json({ error: 'Task already in queue or running' });
    }

    const latestRun = await getLatestMissionRun(mission.id);
    res.status(202).json({
      success: true,
      message: 'Mission retry queued',
      missionId: mission.id,
      runId: latestRun?.id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// API: 创建并触发 Mission（Dashboard Command Center 调用）
app.post('/api/missions', async (req: Request, res: Response) => {
  try {
    const { mode, query, tickers, depth, source, opportunityId } = req.body as MissionInput;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    const inputTickers = tickers || [];

    const input: MissionInput = {
      mode: mode || 'explore',
      query,
      tickers: inputTickers,
      depth: depth || 'deep',
      source: source || 'manual',
      ...(opportunityId ? { opportunityId } : {}),
    };

    const mission = await createQueuedMission({
      query: input.query,
      depth: input.depth || 'deep',
      source: input.source || 'manual',
      priority: 100,
      mode: input.mode,
      ...(inputTickers.length > 0 ? { tickers: inputTickers } : {}),
      ...(input.date ? { date: input.date } : {}),
      ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
    });
    if (!mission) {
      return res.status(409).json({ error: 'Task already in queue or running' });
    }

    const latestRun = await getLatestMissionRun(mission.id);
    res.status(202).json({
      success: true,
      message: 'Mission queued',
      missionId: mission.id,
      runId: latestRun?.id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// 监听端口，供 worker.ts 调用
export function startServer(port = 3000) {
  app.listen(port, () => {
    logger.info(`[API Server] 📡 Intelligence Desk API is running on http://localhost:${port}`);
  });
}
