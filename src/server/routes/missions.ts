import { Router, Request, Response } from 'express';
import { eventBus } from '../../utils/event-bus';
import {
  buildLatestMissionDiff,
  createQueuedMission,
  getLatestMissionRun,
  getMission,
  getMissionEvidence,
  listMissionEvents,
  listMissionRuns,
  listMissions,
  retryMissionRun,
  type MissionInput,
} from '../../workflows';
import { missionPayloadSchema, sendValidationError } from '../validation';

export const missionsRouter = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

missionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const missions = listMissions(limit);
    const summaries = await Promise.all(missions.map(async (mission) => {
      const runs = await listMissionRuns(mission.id);
      const latestRun = runs[0] || null;
      const latestDiff = buildLatestMissionDiff(mission, runs);

      return {
        id: mission.id,
        mode: mission.input.mode,
        query: mission.input.query,
        source: mission.input.source,
        status: mission.status,
        createdAt: mission.createdAt,
        updatedAt: mission.updatedAt,
        openclawTickers: mission.openclawTickers,
        taCount: mission.taResults.length,
        consensus: mission.consensus,
        totalDurationMs: mission.totalDurationMs,
        ...(latestRun ? { latestRun } : {}),
        ...(latestDiff ? { latestDiff } : {}),
      };
    }));
    res.json(summaries);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onLog = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.removeListener('agent_log', onLog);
  });
});

missionsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const mission = getMission(req.params.id as string);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    res.json(mission);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id/events', (req: Request, res: Response) => {
  try {
    res.json(listMissionEvents(req.params.id as string));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    res.json(await listMissionRuns(req.params.id as string));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id/runs/:runId/evidence', (req: Request, res: Response) => {
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
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.post('/:id/retry', async (req: Request, res: Response) => {
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
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = missionPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid mission payload');
    }
    const body = parsed.data;
    const inputTickers = body.tickers || [];

    const input: MissionInput = {
      mode: body.mode || 'explore',
      query: body.query,
      tickers: inputTickers,
      depth: body.depth || 'deep',
      source: body.source || 'manual',
      ...(body.date ? { date: body.date } : {}),
      ...(body.opportunityId ? { opportunityId: body.opportunityId } : {}),
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
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});
