import { Router, Request, Response } from 'express';
import { eventBus } from '../../utils/event-bus';
import {
  createQueuedMission,
  getLatestMissionRun,
  type MissionInput,
} from '../../workflows';
import {
  getMissionDetail,
  getMissionEvidenceForApi,
  getMissionRecoveryForApi,
  listMissionEventsForApi,
  listMissionRunsForApi,
  listMissionSummaries,
  retryMissionForApi,
} from '../services/mission-service';
import { missionPayloadSchema, sendValidationError } from '../validation';

export const missionsRouter = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

missionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(await listMissionSummaries(limit));
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

missionsRouter.get('/:id/recovery', async (req: Request, res: Response) => {
  try {
    const result = await getMissionRecoveryForApi(req.params.id as string);
    if (result.status === 'mission_not_found') {
      return res.status(404).json({ error: 'Mission not found' });
    }

    res.json(result.recovery);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const mission = await getMissionDetail(req.params.id as string);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    res.json(mission);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id/events', async (req: Request, res: Response) => {
  try {
    res.json(await listMissionEventsForApi(req.params.id as string));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    res.json(await listMissionRunsForApi(req.params.id as string));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.get('/:id/runs/:runId/evidence', async (req: Request, res: Response) => {
  try {
    const result = await getMissionEvidenceForApi(req.params.id as string, req.params.runId as string);
    if (result.status === 'mission_not_found') {
      return res.status(404).json({ error: 'Mission not found' });
    }
    if (result.status === 'evidence_not_found') {
      return res.status(404).json({ error: 'Mission evidence not found' });
    }

    res.json(result.evidence);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

missionsRouter.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const missionId = req.params.id as string;
    const result = await retryMissionForApi(missionId, req.body as Partial<MissionInput>);
    if (result.status === 'mission_not_found') {
      return res.status(404).json({ error: 'Mission not found' });
    }
    if (result.status === 'conflict') {
      return res.status(409).json({ error: 'Task already in queue or running' });
    }

    res.status(202).json(result.response);
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
    const headerIdempotencyKey = req.header('Idempotency-Key')?.trim();
    const idempotencyKey = headerIdempotencyKey || body.idempotencyKey;

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
      ...(idempotencyKey ? { idempotencyKey } : {}),
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
