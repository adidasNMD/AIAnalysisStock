import { afterEach, describe, expect, it, vi } from 'vitest';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createDbMock(pendingTasks: any[] = []) {
  const tasks = new Map<string, any>(pendingTasks.map((task) => [task.id, { ...task }]));

  return {
    __tasks: tasks,
    get: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT id, missionId, status FROM tasks WHERE idempotencyKey = ?')) {
        const [idempotencyKey, ...statuses] = params;
        return Array.from(tasks.values()).find(
          (task) => task.idempotencyKey === idempotencyKey && statuses.includes(task.status),
        );
      }
      if (sql.includes('SELECT id, missionId, status FROM tasks WHERE dedupeKey = ?')) {
        const [dedupeKey, ...statuses] = params;
        return Array.from(tasks.values()).find(
          (task) => task.dedupeKey === dedupeKey && statuses.includes(task.status),
        );
      }
      if (sql.includes('SELECT id, missionId, status FROM tasks WHERE query = ?')) {
        const [query, firstStatus, secondStatus] = params;
        return Array.from(tasks.values()).find(
          (task) => task.query === query && (task.status === firstStatus || task.status === secondStatus),
        );
      }
      if (sql.includes('SELECT * FROM tasks WHERE id = ?')) {
        return tasks.get(params[0]);
      }
      if (sql.includes('SELECT COUNT(*) as c FROM tasks WHERE status = ?')) {
        return { c: Array.from(tasks.values()).filter((task) => task.status === params[0]).length };
      }
      return undefined;
    }),
    all: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT id FROM tasks WHERE status = ?')) {
        return Array.from(tasks.values())
          .filter((task) => task.status === params[0])
          .map((task) => ({ id: task.id }));
      }
      return Array.from(tasks.values()).filter((task) => task.status === 'pending');
    }),
    run: vi.fn().mockImplementation(async (_sql: string, ...params: any[]) => {
      if (_sql.includes('INSERT INTO tasks')) {
        const id = params[0];
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
          inputPayload: params[10],
          dedupeKey: params[11],
          idempotencyKey: params[12],
          inputHash: params[13],
          leaseId: params[14],
          heartbeatAt: params[15],
          cancelRequestedAt: params[16],
          failureCode: params[17],
          degradedFlags: params[18],
          createdAt: params[19],
          startedAt: params[20],
          completedAt: params[21],
          error: params[22],
        });
      } else if (_sql.includes('UPDATE tasks SET runId =')) {
        const task = tasks.get(params[1]);
        tasks.set(params[1], { ...task, runId: params[0] });
      } else if (_sql.includes("UPDATE tasks SET status = 'canceled'")) {
        const id = params[2];
        const task = tasks.get(id);
        tasks.set(id, { ...task, status: 'canceled', cancelRequestedAt: params[0], failureCode: params[1] });
      } else if (_sql.includes("SET status = 'pending'") && _sql.includes("WHERE status = 'running'")) {
        let changes = 0;
        for (const [id, task] of tasks.entries()) {
          if (task.status !== 'running') continue;
          tasks.set(id, {
            ...task,
            status: 'pending',
            startedAt: null,
            leaseId: null,
            heartbeatAt: null,
          });
          changes += 1;
        }
        return { changes };
      } else if (_sql.includes('UPDATE tasks SET status =')) {
        const id = params[0];
        tasks.set(id, { ...tasks.get(id), status: 'canceled' });
      } else if (_sql.includes('UPDATE tasks SET progress =')) {
        const id = params[1];
        const task = tasks.get(id);
        tasks.set(id, { ...task, progress: params[0] });
      } else if (_sql.includes('UPDATE tasks SET statePayload =')) {
        const id = params[1];
        const task = tasks.get(id);
        tasks.set(id, { ...task, statePayload: params[0] });
      } else if (_sql.includes('UPDATE tasks SET leaseId =')) {
        const id = params[2];
        const task = tasks.get(id);
        tasks.set(id, { ...task, leaseId: params[0], heartbeatAt: params[1] });
      } else if (_sql.includes('UPDATE tasks SET heartbeatAt =')) {
        const id = params[1];
        const task = tasks.get(id);
        tasks.set(id, { ...task, heartbeatAt: params[0] });
      } else if (_sql.includes('UPDATE tasks SET')) {
        const id = params[0];
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

  it('persists the full mission input payload when enqueuing a mission task', async () => {
    const { TaskQueue } = await loadQueue();
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);

    const queue = new TaskQueue();
    const inputPayload = JSON.stringify({
      mode: 'review',
      query: 'Review AI supply chain',
      tickers: ['NVDA', 'TSM'],
      depth: 'deep',
      source: 'opportunity_action',
      opportunityId: 'opp-1',
    });

    const task = await queue.enqueue('Review AI supply chain', 'deep', 'opportunity_action', 90, {
      missionId: 'mission-1',
      inputPayload,
      dedupeKey: 'mission:v1:abc',
      idempotencyKey: 'request-1',
      inputHash: 'input-hash-1',
    });

    expect(task?.missionId).toBe('mission-1');
    expect(task?.inputPayload).toBe(inputPayload);
    expect(task?.dedupeKey).toBe('mission:v1:abc');
    expect(task?.idempotencyKey).toBe('request-1');
    expect(task?.inputHash).toBe('input-hash-1');
    expect((db as any).__tasks.get(task!.id).inputPayload).toBe(inputPayload);
    expect((db as any).__tasks.get(task!.id).dedupeKey).toBe('mission:v1:abc');
    expect((db as any).__tasks.get(task!.id).inputHash).toBe('input-hash-1');
  });

  it('dedupes pending tasks by dedupeKey instead of query when provided', async () => {
    const { TaskQueue } = await loadQueue();
    const db = createDbMock([
      {
        id: 'task-existing',
        query: 'Same query',
        depth: 'deep',
        priority: 0,
        source: 'test',
        status: 'pending',
        dedupeKey: 'mission:v1:existing',
        createdAt: Date.now(),
      },
    ]);
    getDbMock.mockResolvedValue(db as any);

    const queue = new TaskQueue();
    const sameQueryDifferentIdentity = await queue.enqueue('Same query', 'deep', 'test', 10, {
      dedupeKey: 'mission:v1:different',
    });
    const sameIdentity = await queue.enqueue('Another query shape', 'deep', 'test', 10, {
      dedupeKey: 'mission:v1:existing',
    });

    expect(sameQueryDifferentIdentity).not.toBeNull();
    expect(sameIdentity).toBeNull();
  });

  it('records cancel timestamp and failure code for pending or running tasks', async () => {
    const { TaskQueue } = await loadQueue();
    const db = createDbMock([
      {
        id: 'task-1',
        query: 'q1',
        depth: 'deep',
        priority: 0,
        source: 'test',
        status: 'running',
        createdAt: Date.now(),
      },
    ]);
    getDbMock.mockResolvedValue(db as any);

    const queue = new TaskQueue();
    const canceled = await queue.cancelTask('task-1');

    expect(canceled?.status).toBe('canceled');
    expect(canceled?.failureCode).toBe('canceled');
    expect(canceled?.cancelRequestedAt).toEqual(expect.any(Number));
    expect((db as any).__tasks.get('task-1').failureCode).toBe('canceled');
  });

  it('clears stale lease metadata when recovering interrupted running tasks', async () => {
    const { TaskQueue } = await loadQueue();
    const db = createDbMock([
      {
        id: 'task-1',
        query: 'q1',
        depth: 'deep',
        priority: 0,
        source: 'test',
        status: 'running',
        leaseId: 'worker:old',
        heartbeatAt: 123,
        startedAt: 100,
        createdAt: Date.now(),
      },
    ]);
    getDbMock.mockResolvedValue(db as any);

    const queue = new TaskQueue();
    const recovered = await queue.recover();
    const task = (db as any).__tasks.get('task-1');

    expect(recovered.recoveredRunningTaskIds).toEqual(['task-1']);
    expect(task.status).toBe('pending');
    expect(task.leaseId).toBeNull();
    expect(task.heartbeatAt).toBeNull();
    expect(task.startedAt).toBeNull();
  });
});
