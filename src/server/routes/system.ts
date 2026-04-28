import { Router, Request, Response } from 'express';
import { getActiveTickers } from '../../utils/dynamic-watchlist';
import { eventBus } from '../../utils/event-bus';
import { healthMonitor } from '../../utils/health-monitor';
import { loadNarratives } from '../../utils/narrative-store';
import { checkOpenBBHealth } from '../../utils/openbb-provider';
import { checkTAHealth } from '../../utils/ta-client';
import { taskQueue } from '../../utils/task-queue';
import {
  cancelMissionRun,
  createQueuedMission,
  getLatestMissionRun,
  markMissionCanceled,
  markOpportunityMissionCanceled,
  saveMissionEvidence,
} from '../../workflows';
import {
  recoverQueueTaskForApi,
  recoverStaleQueueTasksForApi,
} from '../services/queue-recovery-service';
import * as fs from 'fs';
import * as path from 'path';

export const systemRouter = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkTrendRadarHealth(): Promise<{ status: string; note: string }> {
  try {
    const logs = [
      path.join(process.cwd(), 'vendors', 'trendradar', 'crawler.log'),
      path.join(process.cwd(), 'vendors', 'trendradar', 'manual_run.log'),
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
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const readLen = Math.min(stats.size, 5000);
    const buffer = Buffer.alloc(readLen);
    const fd = fs.openSync(latestLogFile, 'r');
    try {
      fs.readSync(fd, buffer, 0, readLen, Math.max(0, stats.size - readLen));
    } finally {
      fs.closeSync(fd);
    }

    const content = buffer.toString('utf-8');
    if (content.match(/Timeout|APITimeoutError|Traceback|Error communicating|ConnectionRefusedError/i)) {
      return { status: 'error', note: '触发警报: 日志出现报错或大模型超时' };
    }

    if (stats.mtimeMs < threeHoursAgo) {
      return { status: 'offline', note: '长达3小时没运作，爬虫可能停转' };
    }

    return { status: 'running', note: '爬虫运作正常，无报错' };
  } catch {
    return { status: 'unknown', note: '读取监控日志失败' };
  }
}

systemRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: healthMonitor.getStatusSummary(),
    isDegraded: healthMonitor.shouldSkipAnalysis(),
  });
});

systemRouter.get('/health/services', async (_req: Request, res: Response) => {
  try {
    const [openbbOk, taOk, trendRadarHealth] = await Promise.all([
      checkOpenBBHealth(),
      checkTAHealth(),
      checkTrendRadarHealth(),
    ]);

    res.json({
      openclaw: { status: 'running', port: 3000 },
      openbb: { status: openbbOk ? 'running' : 'offline', port: 8000 },
      tradingAgents: { status: taOk ? 'running' : 'offline', port: 8001 },
      trendradar: trendRadarHealth,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.get('/queue', async (_req: Request, res: Response) => {
  try {
    const summary = await taskQueue.getStatusSummary();
    const tasks = await taskQueue.getAll();
    res.json({
      summary,
      tasks: tasks.sort((a, b) => b.createdAt - a.createdAt),
    });
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.post('/queue/recover-stale', async (req: Request, res: Response) => {
  try {
    return res.json(await recoverStaleQueueTasksForApi(req.body));
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.post('/queue/:id/recover', async (req: Request, res: Response) => {
  try {
    const result = await recoverQueueTaskForApi(req.params.id as string);
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (result.status === 'conflict') {
      return res.status(409).json({ error: result.error });
    }
    return res.status(202).json(result.response);
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { query, depth, source = 'manual', opportunityId, idempotencyKey: bodyIdempotencyKey } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });
    const headerIdempotencyKey = req.header('Idempotency-Key')?.trim();
    const idempotencyKey = headerIdempotencyKey || bodyIdempotencyKey;

    const mission = await createQueuedMission({
      query,
      depth: depth || 'deep',
      source,
      priority: 100,
      ...(opportunityId ? { opportunityId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    if (!mission) {
      return res.status(409).json({ error: 'Task already in queue or running' });
    }

    const latestRun = await getLatestMissionRun(mission.id);
    return res.status(202).json({
      success: true,
      message: 'Mission queued successfully',
      missionId: mission.id,
      runId: latestRun?.id,
    });
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.delete('/queue/:id', async (req: Request, res: Response) => {
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
        await markOpportunityMissionCanceled(
          canceledMission.input.opportunityId,
          canceledMission.id,
          task.runId,
          'Canceled by user',
        );
      }
    }
    return res.json({ success: true, message: 'Mission canceled' });
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.get('/narratives', async (_req: Request, res: Response) => {
  try {
    res.json(await loadNarratives());
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.get('/watchlist/dynamic', (_req: Request, res: Response) => {
  try {
    res.json(getActiveTickers());
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.get('/watchlist/static', (_req: Request, res: Response) => {
  try {
    const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
    if (!fs.existsSync(watchlistPath)) {
      return res.json([]);
    }
    const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8')) as {
      tickers?: unknown[];
    };
    return res.json(data.tickers || []);
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

systemRouter.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onLog = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  req.on('close', () => {
    eventBus.removeListener('agent_log', onLog);
  });
});
