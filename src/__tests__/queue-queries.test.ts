import { describe, expect, it } from 'vitest';
import type { TaskQueueResponse } from '../../dashboard/src/api';
import {
  buildQueueRecoveryIssues,
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

  it('builds prioritized recovery issues for stale, failed, and canceled tasks', () => {
    const queue: TaskQueueResponse = {
      summary: '',
      tasks: [
        task({
          id: 'canceled',
          status: 'canceled',
          createdAt: 2_000,
          failureCode: 'canceled',
        }),
        task({
          id: 'failed',
          status: 'failed',
          createdAt: 3_000,
          failureCode: 'upstream_unavailable',
        }),
        task({
          id: 'stale',
          status: 'running',
          createdAt: 1_000,
          startedAt: 2_000,
          heartbeatAt: 6_000,
        }),
      ],
    };

    const issues = buildQueueRecoveryIssues(queue, 10_000, 1_000);

    expect(issues.map((issue) => issue.id)).toEqual([
      'stale:stale',
      'failed:failed',
      'canceled:canceled',
    ]);
    expect(issues[0]).toMatchObject({
      kind: 'stale',
      tone: 'danger',
      action: 'recover_stale',
      actionLabel: '恢复卡住任务',
      ageLabel: '4s',
    });
    expect(issues[1]).toMatchObject({
      kind: 'failed',
      failureLabel: '上游不可用',
      tone: 'danger',
      action: 'recover_task',
    });
    expect(issues[2]).toMatchObject({
      kind: 'canceled',
      failureLabel: '已取消',
      tone: 'info',
    });
  });
});
