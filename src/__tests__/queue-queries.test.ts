import { describe, expect, it } from 'vitest';
import type { TaskQueueResponse } from '../../dashboard/src/api';
import {
  emptyQueueResponse,
  isQueueTaskStale,
  recoverableQueueTasks,
} from '../../dashboard/src/queries/queue-queries';

function task(
  overrides: Partial<TaskQueueResponse['tasks'][number]>,
): TaskQueueResponse['tasks'][number] {
  return {
    id: 'task-1',
    query: 'AI infra',
    depth: 'deep',
    status: 'pending',
    source: 'test',
    createdAt: 1,
    ...overrides,
  };
}

describe('queue query helpers', () => {
  it('provides an empty queue fallback shape for initial renders', () => {
    expect(emptyQueueResponse()).toEqual({
      summary: '',
      tasks: [],
    });
  });

  it('marks running tasks stale when heartbeat is missing or too old', () => {
    expect(isQueueTaskStale(task({ status: 'running' }), 10_000, 1_000)).toBe(true);
    expect(isQueueTaskStale(task({ status: 'running', heartbeatAt: 8_000 }), 10_000, 1_000)).toBe(true);
    expect(isQueueTaskStale(task({ status: 'running', heartbeatAt: 9_500 }), 10_000, 1_000)).toBe(false);
    expect(isQueueTaskStale(task({ status: 'pending' }), 10_000, 1_000)).toBe(false);
  });

  it('keeps failed and canceled tasks as recoverable', () => {
    const queue: TaskQueueResponse = {
      summary: '',
      tasks: [
        task({ id: 'failed', status: 'failed' }),
        task({ id: 'canceled', status: 'canceled' }),
        task({ id: 'running', status: 'running' }),
      ],
    };

    expect(recoverableQueueTasks(queue).map((item) => item.id)).toEqual(['failed', 'canceled']);
  });
});
