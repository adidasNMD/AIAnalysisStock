import {
  fetchQueue,
  type TaskQueueResponse,
} from '../api';
import { usePollingQuery } from './query-client';

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
