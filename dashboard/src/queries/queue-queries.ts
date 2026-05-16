import {
  fetchQueue,
  type TaskQueueResponse,
} from '../api';
import { usePollingQuery } from './query-client';
import { getFailureCodeInfo } from '../utils/recovery';

export const DEFAULT_QUEUE_INTERVAL_MS = 3000;
export const DEFAULT_STALE_TASK_THRESHOLD_MS = 2 * 60 * 1000;

export function emptyQueueResponse(): TaskQueueResponse {
  return {
    summary: '',
    tasks: [],
  };
}

export function useQueueQuery(intervalMs = DEFAULT_QUEUE_INTERVAL_MS) {
  return usePollingQuery<TaskQueueResponse>({
    queryKey: `queue:${intervalMs}`,
    fetcher: fetchQueue,
    intervalMs,
    initialData: emptyQueueResponse(),
  });
}

export function isQueueTaskStale(
  task: TaskQueueResponse['tasks'][number],
  now: number,
  staleThresholdMs = DEFAULT_STALE_TASK_THRESHOLD_MS,
): boolean {
  return (
    task.status === 'running'
    && (!task.heartbeatAt || now - task.heartbeatAt > staleThresholdMs)
  );
}

export function recoverableQueueTasks(queue: TaskQueueResponse | null | undefined) {
  return (queue?.tasks || []).filter((task) => ['failed', 'canceled'].includes(task.status));
}

export type QueueRecoveryIssueTone = 'danger' | 'warning' | 'info';

export interface QueueRecoveryIssue {
  id: string;
  task: TaskQueueResponse['tasks'][number];
  kind: 'stale' | 'failed' | 'canceled';
  tone: QueueRecoveryIssueTone;
  label: string;
  detail: string;
  actionLabel: string;
  action: 'recover_stale' | 'recover_task';
  ageLabel?: string;
  failureLabel?: string;
}

function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export function buildQueueRecoveryIssues(
  queue: TaskQueueResponse | null | undefined,
  now: number,
  staleThresholdMs = DEFAULT_STALE_TASK_THRESHOLD_MS,
): QueueRecoveryIssue[] {
  const tasks = queue?.tasks || [];

  const staleIssues: QueueRecoveryIssue[] = tasks
    .filter((task) => isQueueTaskStale(task, now, staleThresholdMs))
    .map((task) => {
      const heartbeatAgeMs = task.heartbeatAt ? now - task.heartbeatAt : now - (task.startedAt || task.createdAt);
      const ageLabel = elapsedLabel(heartbeatAgeMs);
      return {
        id: `stale:${task.id}`,
        task,
        kind: 'stale',
        tone: 'danger',
        label: '运行心跳超时',
        detail: `任务仍标记运行中，但心跳已停 ${ageLabel}。优先恢复 stale 任务，避免队列被旧 lease 卡住。`,
        actionLabel: '恢复卡住任务',
        action: 'recover_stale',
        ageLabel,
      };
    });

  const terminalIssues: QueueRecoveryIssue[] = recoverableQueueTasks(queue)
    .map((task) => {
      const failureInfo = getFailureCodeInfo(task.failureCode);
      const isCanceled = task.status === 'canceled';
      return {
        id: `${task.status}:${task.id}`,
        task,
        kind: isCanceled ? 'canceled' : 'failed',
        tone: isCanceled ? 'info' : (failureInfo?.tone || 'warning'),
        label: isCanceled ? '任务已取消' : '任务失败待恢复',
        detail: failureInfo?.detail || (task.error ? `失败信息：${task.error}` : '可以恢复任务并重新进入队列。'),
        actionLabel: isCanceled ? '恢复任务' : '重新入队',
        action: 'recover_task',
        failureLabel: failureInfo?.label,
      };
    });

  return [...staleIssues, ...terminalIssues].sort((a, b) => {
    const priority = { stale: 0, failed: 1, canceled: 2 };
    const priorityDiff = priority[a.kind] - priority[b.kind];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.task.createdAt || 0) - (a.task.createdAt || 0);
  });
}
