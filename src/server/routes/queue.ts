import { Router, Request, Response } from 'express';
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
import {
  sendBadRequest,
  sendConflict,
  sendInternalError,
  sendNotFound,
} from '../route-helpers';

export const queueRouter = Router();

queueRouter.get('/queue', async (_req: Request, res: Response) => {
  try {
    const summary = await taskQueue.getStatusSummary();
    const tasks = await taskQueue.getAll();
    res.json({
      summary,
      tasks: tasks.sort((a, b) => b.createdAt - a.createdAt),
    });
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

queueRouter.post('/queue/recover-stale', async (req: Request, res: Response) => {
  try {
    return res.json(await recoverStaleQueueTasksForApi(req.body));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

queueRouter.post('/queue/:id/recover', async (req: Request, res: Response) => {
  try {
    const result = await recoverQueueTaskForApi(req.params.id as string);
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Task not found');
    }
    if (result.status === 'conflict') {
      return sendConflict(res, result.error);
    }
    return res.status(202).json(result.response);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

queueRouter.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { query, depth, source = 'manual', opportunityId, idempotencyKey: bodyIdempotencyKey } = req.body;
    if (!query) return sendBadRequest(res, 'Query is required');
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
      return sendConflict(res, 'Task already in queue or running');
    }

    const latestRun = await getLatestMissionRun(mission.id);
    return res.status(202).json({
      success: true,
      message: 'Mission queued successfully',
      missionId: mission.id,
      runId: latestRun?.id,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

queueRouter.delete('/queue/:id', async (req: Request, res: Response) => {
  try {
    const task = await taskQueue.cancelTask(req.params.id as string);
    if (!task) {
      return sendNotFound(res, 'Task not found');
    }
    if (task.status !== 'canceled') {
      return sendConflict(res, `Task is already ${task.status}`);
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
    return sendInternalError(res, error);
  }
});
