import { taskQueue, type QueueTask } from '../../utils/task-queue';
import {
  getLatestMissionRun,
  retryMissionRun,
  requeueMissionRunsForTasks,
} from '../../workflows';

export interface RecoverStaleQueueInput {
  staleThresholdMs?: unknown;
}

export interface MissionRecoveryCostHint {
  tier: 'low' | 'medium' | 'high';
  label: string;
  estimate: string;
  detail: string;
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
        recoveryAudit?: {
          operation: 'mission_retry';
          action: 'queued_new_retry' | 'reused_existing_retry';
          reusedExistingRetry: boolean;
          depth?: QueueTask['depth'];
          costHint?: MissionRecoveryCostHint;
          runId?: string;
          taskId?: string;
        };
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

function recoveryCostHintForDepth(depth: QueueTask['depth'] | undefined): MissionRecoveryCostHint {
  if (depth === 'quick') {
    return {
      tier: 'low',
      label: '低成本',
      estimate: '约 1-3 分钟',
      detail: '先验证数据源和核心链路是否恢复，适合失败后第一步。',
    };
  }

  if (depth === 'deep') {
    return {
      tier: 'high',
      label: '高成本',
      estimate: '约 8-15 分钟',
      detail: '重新补齐完整证据链，适合机会仍重要且 Quick 已确认链路正常时。',
    };
  }

  return {
    tier: 'medium',
    label: '中成本',
    estimate: '约 3-6 分钟',
    detail: '在速度和证据覆盖之间折中，适合复核失败原因。',
  };
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
    const latestRunBefore = await getLatestMissionRun(task.missionId);
    const mission = await retryMissionRun(task.missionId, {
      source: 'queue_recovery',
      priority: task.priority || 90,
      depth: task.depth,
    });
    if (!mission) {
      return { status: 'conflict', error: 'Task already in queue or running' };
    }

    const latestRun = await getLatestMissionRun(mission.id);
    const reusedExistingRetry = Boolean(latestRunBefore?.id && latestRun?.id === latestRunBefore.id);
    void taskQueue.processNext();
    return {
      status: 'queued',
      response: {
        success: true,
        message: 'Mission recovery queued',
        missionId: mission.id,
        ...(latestRun?.id ? { runId: latestRun.id } : {}),
        ...(latestRun?.taskId ? { taskId: latestRun.taskId } : {}),
        recoveryAudit: {
          operation: 'mission_retry',
          action: reusedExistingRetry ? 'reused_existing_retry' : 'queued_new_retry',
          reusedExistingRetry,
          depth: task.depth,
          costHint: recoveryCostHintForDepth(task.depth),
          ...(latestRun?.id ? { runId: latestRun.id } : {}),
          ...(latestRun?.taskId ? { taskId: latestRun.taskId } : {}),
        },
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
