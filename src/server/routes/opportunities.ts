import { Router, Request, Response } from 'express';
import { getActiveTickers } from '../../utils/dynamic-watchlist';
import { eventBus } from '../../utils/event-bus';
import { logger } from '../../utils/logger';
import { watchIPO } from '../../tools/edgar-monitor';
import {
  appendOpportunityEvent,
  buildHeatTransferGraphs,
  buildLatestMissionDiff,
  buildNewCodeRadarCandidates,
  buildOpportunityActionTimeline,
  buildOpportunityBoardHealthMap,
  buildOpportunityInbox,
  buildOpportunityPlaybook,
  buildOpportunitySuggestedMission,
  buildOpportunitySuggestedMissions,
  buildWhyNowSummary,
  createOpportunity,
  detectOpportunityHeatInflection,
  emitOpportunityDerivedEvents,
  getLatestOpportunityDiff,
  getMission,
  getOpportunity,
  getOpportunityHeatHistory,
  listMissionEvents,
  listMissionRuns,
  listOpportunities,
  listOpportunityEvents,
  listOpportunityEventsAfter,
  syncHeatTransferGraphOpportunities,
  syncNewCodeRadarOpportunities,
  toOpportunityEventEnvelope,
  updateOpportunity,
  type OpportunityCatalystItem,
  type OpportunityEventEnvelope,
  type OpportunityEventRecord,
  type OpportunityHeatProfile,
  type OpportunityIpoProfile,
  type OpportunityProxyProfile,
  type OpportunityRecord,
  type OpportunityScores,
  type OpportunitySummaryRecord,
  type UpdateOpportunityInput,
} from '../../workflows';
import {
  createOpportunityPayloadSchema,
  sendValidationError,
  updateOpportunityPayloadSchema,
} from '../validation';
import * as fs from 'fs';
import * as path from 'path';

export const opportunitiesRouter = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

opportunitiesRouter.get('/opportunities/graphs/heat-transfer', async (_req: Request, res: Response) => {
  try {
    const opportunities = await listOpportunities(500);
    res.json(buildHeatTransferGraphs(getActiveTickers(), opportunities));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.post('/opportunities/graphs/heat-transfer/sync', async (_req: Request, res: Response) => {
  try {
    const synced = await syncHeatTransferGraphOpportunities(getActiveTickers());
    res.json({
      success: true,
      syncedCount: synced.length,
      opportunities: synced,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.post('/opportunities/radar/new-codes/refresh', async (_req: Request, res: Response) => {
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
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/inbox', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 12;
    const opportunities = await listOpportunities(200);
    const summaries = await Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
    res.json(buildOpportunityInbox(summaries, limit));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/inbox/:id', async (req: Request, res: Response) => {
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
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/board-health', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const opportunities = await listOpportunities(limit);
    const summaries = await Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
    return res.json(buildOpportunityBoardHealthMap(summaries));
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const opportunities = await listOpportunities(limit);
    const summaries = await Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
    res.json(summaries);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunity-events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(await listOpportunityEvents(undefined, limit));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/stream', async (req: Request, res: Response) => {
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
    } catch (error: unknown) {
      logger.warn(`[SSE] Opportunity replay failed: ${errorMessage(error)}`);
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

opportunitiesRouter.get('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const opportunity = await getOpportunity(req.params.id as string);
    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    return res.json(await buildOpportunitySummary(opportunity));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/:id/events', async (req: Request, res: Response) => {
  try {
    res.json(await listOpportunityEvents(req.params.id as string, parseInt(req.query.limit as string, 10) || 50));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/:id/heat-history', async (req: Request, res: Response) => {
  try {
    res.json(await getOpportunityHeatHistory(req.params.id as string, parseInt(req.query.limit as string, 10) || 8));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.post('/opportunities', async (req: Request, res: Response) => {
  try {
    const parsed = createOpportunityPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid opportunity payload');
    }
    const body = parsed.data;
    const title = (body.title || body.query || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'title or query is required' });
    }
    const opportunity = await createOpportunity({
      type: body.type,
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
      ...(body.scores ? { scores: body.scores as Partial<OpportunityScores> } : {}),
      ...(body.heatProfile ? { heatProfile: body.heatProfile as Partial<OpportunityHeatProfile> } : {}),
      ...(body.proxyProfile ? { proxyProfile: body.proxyProfile as Partial<OpportunityProxyProfile> } : {}),
      ...(body.ipoProfile ? { ipoProfile: body.ipoProfile as OpportunityIpoProfile } : {}),
      ...(body.catalystCalendar ? { catalystCalendar: body.catalystCalendar } : {}),
    });
    res.status(201).json(opportunity);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.patch('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const parsed = updateOpportunityPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid opportunity payload');
    }
    const body = parsed.data;
    const previous = await getOpportunity(req.params.id as string);
    const updates: UpdateOpportunityInput = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.query !== undefined) updates.query = body.query;
    if (body.thesis !== undefined) updates.thesis = body.thesis;
    if (body.summary !== undefined) updates.summary = body.summary;
    if (body.stage !== undefined) updates.stage = body.stage;
    if (body.status !== undefined) updates.status = body.status;
    if (body.primaryTicker !== undefined) updates.primaryTicker = body.primaryTicker;
    if (body.leaderTicker !== undefined) updates.leaderTicker = body.leaderTicker;
    if (body.proxyTicker !== undefined) updates.proxyTicker = body.proxyTicker;
    if (body.relatedTickers !== undefined) updates.relatedTickers = body.relatedTickers;
    if (body.relayTickers !== undefined) updates.relayTickers = body.relayTickers;
    if (body.nextCatalystAt !== undefined) updates.nextCatalystAt = body.nextCatalystAt;
    if (body.supplyOverhang !== undefined) updates.supplyOverhang = body.supplyOverhang;
    if (body.policyStatus !== undefined) updates.policyStatus = body.policyStatus;
    if (body.scores !== undefined) updates.scores = body.scores as Partial<OpportunityScores>;
    if (body.heatProfile !== undefined) updates.heatProfile = body.heatProfile as Partial<OpportunityHeatProfile>;
    if (body.proxyProfile !== undefined) updates.proxyProfile = body.proxyProfile as Partial<OpportunityProxyProfile>;
    if (body.ipoProfile !== undefined) updates.ipoProfile = body.ipoProfile as OpportunityIpoProfile;
    if (body.catalystCalendar !== undefined) updates.catalystCalendar = body.catalystCalendar as OpportunityCatalystItem[];

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
    res.json(await buildOpportunitySummary((await getOpportunity(opportunity.id)) || opportunity));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});
