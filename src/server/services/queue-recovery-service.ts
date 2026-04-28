import { taskQueue, type QueueTask } from '../../utils/task-queue';
import {
  getLatestMissionRun,
  retryMissionRun,
  requeueMissionRunsForTasks,
} from '../../workflows';

export interface RecoverStaleQueueInput {
  staleThresholdMs?: unknown;
}

export interface RecoverStaleQueueResponse {
  success: true;
  message: string;
  totalRecovered: number;
  recoveredRunningTaskIds: string[];
  skippedActiveTaskIds: string[];
  staleThresholdMs: number;
  requeuedRuns: number;
}

export type RecoverQueueTaskResult =
  | { status: 'not_found' }
  | { status: 'conflict'; error: string }
  | {
      status: 'queued';
      response: {
        success: true;
        message: string;
        missionId?: string;
        runId?: string;
        taskId?: string;
      };
    };

function normalizedStaleThresholdMs(input: RecoverStaleQueueInput): number | undefined {
  const requestedThreshold = Number(input.staleThresholdMs);
  return Number.isFinite(requestedThreshold) && requestedThreshold > 0
    ? requestedThreshold
    : undefined;
}

function taskConflictError(task: QueueTask): string | null {
  if (task.status === 'pending' || task.status === 'running') {
    return `Task is already ${task.status}`;
  }
  if (task.status === 'done') {
    return 'Completed task does not need recovery';
  }
  return null;
}

export async function recoverStaleQueueTasksForApi(
  input: RecoverStaleQueueInput = {},
): Promise<RecoverStaleQueueResponse> {
  const result = await taskQueue.recoverStaleRunning(normalizedStaleThresholdMs(input));
  const requeuedRuns = await requeueMissionRunsForTasks(result.recoveredRunningTaskIds);
  if (result.totalRecovered > 0) {
    void taskQueue.processNext();
  }

  return {
    success: true,
    message: result.totalRecovered > 0 ? 'Stale tasks recovered' : 'No stale tasks to recover',
    ...result,
    requeuedRuns,
  };
}

export async function recoverQueueTaskForApi(id: string): Promise<RecoverQueueTaskResult> {
  const task = await taskQueue.getTask(id);
  if (!task) {
    return { status: 'not_found' };
  }

  const conflictError = taskConflictError(task);
  if (conflictError) {
    return { status: 'conflict', error: conflictError };
  }

  if (task.missionId) {
    const mission = await retryMissionRun(task.missionId, {
      source: 'queue_recovery',
      priority: task.priority || 90,
      depth: task.depth,
    });
    if (!mission) {
      return { status: 'conflict', error: 'Task already in queue or running' };
    }

    const latestRun = await getLatestMissionRun(mission.id);
    void taskQueue.processNext();
    return {
      status: 'queued',
      response: {
        success: true,
        message: 'Mission recovery queued',
        missionId: mission.id,
        ...(latestRun?.id ? { runId: latestRun.id } : {}),
        ...(latestRun?.taskId ? { taskId: latestRun.taskId } : {}),
      },
    };
  }

  const recoveredTask = await taskQueue.requeueTask(task.id);
  if (!recoveredTask || recoveredTask.status !== 'pending') {
    return { status: 'conflict', error: 'Task could not be recovered' };
  }

  void taskQueue.processNext();
  return {
    status: 'queued',
    response: {
      success: true,
      message: 'Task recovered',
      taskId: recoveredTask.id,
    },
  };
}
