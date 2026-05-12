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
  listMissionArtifactsForApi,
  listMissionEventsForApi,
  listMissionRunsForApi,
  listMissionSummaries,
  listMissionSummariesPage,
  retryMissionForApi,
} from '../services/mission-service';
import {
  parsePaginationQuery,
  sendConflict,
  sendInternalError,
  sendNotFound,
} from '../route-helpers';
import { missionPayloadSchema, missionRetryPayloadSchema, sendValidationError } from '../validation';

export const missionsRouter = Router();

missionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const pagination = parsePaginationQuery(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100,
    });
    if (pagination.envelope) {
      return res.json(await listMissionSummariesPage(pagination));
    }
    res.json(await listMissionSummaries(pagination.limit));
  } catch (error: unknown) {
    sendInternalError(res, error);
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
      return sendNotFound(res, 'Mission not found');
    }

    res.json(result.recovery);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionsRouter.get('/:id/artifacts', async (req: Request, res: Response) => {
  try {
    const result = await listMissionArtifactsForApi(req.params.id as string);
    if (result.status === 'mission_not_found') {
      return sendNotFound(res, 'Mission not found');
    }

    res.json(result.artifacts);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const mission = await getMissionDetail(req.params.id as string);
    if (!mission) {
      return sendNotFound(res, 'Mission not found');
    }
    res.json(mission);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionsRouter.get('/:id/events', async (req: Request, res: Response) => {
  try {
    res.json(await listMissionEventsForApi(req.params.id as string));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionsRouter.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    res.json(await listMissionRunsForApi(req.params.id as string));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionsRouter.get('/:id/runs/:runId/evidence', async (req: Request, res: Response) => {
  try {
    const result = await getMissionEvidenceForApi(req.params.id as string, req.params.runId as string);
    if (result.status === 'mission_not_found') {
      return sendNotFound(res, 'Mission not found');
    }
    if (result.status === 'evidence_not_found') {
      return sendNotFound(res, 'Mission evidence not found');
    }

    res.json(result.evidence);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionsRouter.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const missionId = req.params.id as string;
    const parsed = missionRetryPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid mission retry payload');
    }
    const headerIdempotencyKey = req.header('Idempotency-Key')?.trim();
    const idempotencyKey = headerIdempotencyKey || parsed.data.idempotencyKey;
    const retryInput: Parameters<typeof retryMissionForApi>[1] = {
      ...(parsed.data.depth ? { depth: parsed.data.depth } : {}),
      ...(parsed.data.source ? { source: parsed.data.source } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
    const result = await retryMissionForApi(missionId, retryInput);
    if (result.status === 'mission_not_found') {
      return sendNotFound(res, 'Mission not found');
    }
    if (result.status === 'conflict') {
      return sendConflict(res, 'Task already in queue or running');
    }

    res.status(202).json(result.response);
  } catch (error: unknown) {
    sendInternalError(res, error);
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
      return sendConflict(res, 'Task already in queue or running');
    }

    const latestRun = await getLatestMissionRun(mission.id);
    res.status(202).json({
      success: true,
      message: 'Mission queued',
      missionId: mission.id,
      runId: latestRun?.id,
    });
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});
