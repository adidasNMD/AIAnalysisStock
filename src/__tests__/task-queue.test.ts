import { afterEach, describe, expect, it, vi } from 'vitest';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createDbMock(pendingTasks: any[] = []) {
  const tasks = new Map<string, any>(pendingTasks.map((task) => [task.id, { ...task }]));

  return {
    get: vi.fn(),
    all: vi.fn().mockImplementation(async () => Array.from(tasks.values()).filter((task) => task.status === 'pending')),
    run: vi.fn().mockImplementation(async (_sql: string, ...params: any[]) => {
      const id = params[0] && typeof params[0] === 'string' ? params[0] : undefined;
      if (id && _sql.includes('INSERT INTO tasks')) {
        tasks.set(id, {
          id,
          missionId: params[1],
          runId: params[2],
          query: params[3],
          depth: params[4],
          priority: params[5],
          source: params[6],
          status: params[7],
          progress: params[8],
          statePayload: params[9],
          createdAt: params[10],
          startedAt: params[11],
          completedAt: params[12],
          error: params[13],
        });
      } else if (id && _sql.includes('UPDATE tasks SET runId =')) {
        const task = tasks.get(params[1]);
        tasks.set(params[1], { ...task, runId: params[0] });
      } else if (id && _sql.includes('UPDATE tasks SET status =')) {
        tasks.set(id, { ...tasks.get(id), status: 'canceled' });
      } else if (id && _sql.includes('UPDATE tasks SET progress =')) {
        const task = tasks.get(id);
        tasks.set(id, { ...task, progress: params[0] });
      } else if (id && _sql.includes('UPDATE tasks SET statePayload =')) {
        const task = tasks.get(id);
        tasks.set(id, { ...task, statePayload: params[0] });
      } else if (id && _sql.includes('UPDATE tasks SET')) {
        const task = tasks.get(id);
        tasks.set(id, { ...task, status: task?.status === 'running' || task?.status === 'pending' ? task.status : task?.status });
      }
      return { changes: 1 };
    }),
    exec: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.TASK_QUEUE_CONCURRENCY;
});

async function loadQueue() {
  const { TaskQueue } = await import('../utils/task-queue.js');

  return { TaskQueue };
}

describe('TaskQueue concurrency', () => {
  it('defaults to concurrency 3', () => {
    return loadQueue().then(({ TaskQueue }) => {
      const queue = new TaskQueue();

      expect((queue as any).concurrency).toBe(3);
    });
  });

  it('uses TASK_QUEUE_CONCURRENCY env override', () => {
    process.env.TASK_QUEUE_CONCURRENCY = '1';

    return loadQueue().then(({ TaskQueue }) => {
      const queue = new TaskQueue();

      expect((queue as any).concurrency).toBe(1);
    });
  });

  it('returns early when at concurrency limit', async () => {
    const { TaskQueue } = await loadQueue();
    const db = createDbMock([
      {
        id: 'task-1',
        query: 'q1',
        depth: 'shallow',
        priority: 0,
        source: 'test',
        status: 'pending',
        createdAt: Date.now(),
      },
    ]);
    getDbMock.mockResolvedValue(db as any);

    const queue = new TaskQueue();
    queue.onProcess(vi.fn().mockResolvedValue(undefined));
    (queue as any).runningCount = (queue as any).concurrency;

    await queue.processNext();

    expect(db.all).not.toHaveBeenCalled();
  });

  it('decrements runningCount after task completion', async () => {
    const { TaskQueue } = await loadQueue();
    const db = createDbMock([
      {
        id: 'task-1',
        query: 'q1',
        depth: 'shallow',
        priority: 0,
        source: 'test',
        status: 'pending',
        createdAt: Date.now(),
      },
    ]);
    getDbMock.mockResolvedValue(db as any);

    const queue = new TaskQueue();
    queue.onProcess(vi.fn().mockResolvedValue(undefined));

    await queue.processNext();

    expect((queue as any).runningCount).toBe(0);
    expect(db.run).toHaveBeenCalled();
  });
});
