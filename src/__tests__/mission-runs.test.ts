import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createMissionRunDbMock(seedRows: any[]) {
  const rows = new Map<string, any>(seedRows.map((row) => [row.id, { ...row }]));

  return {
    get: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT * FROM mission_runs WHERE id = ?')) {
        return rows.get(params[0]) || null;
      }
      if (sql.includes('SELECT MAX(attempt)')) {
        const missionId = params[0];
        const attempts = Array.from(rows.values())
          .filter((row) => row.missionId === missionId)
          .map((row) => row.attempt || 0);
        return { maxAttempt: attempts.length > 0 ? Math.max(...attempts) : null };
      }
      return null;
    }),
    all: vi.fn().mockResolvedValue([]),
    run: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('UPDATE mission_runs')) {
        const id = params[10];
        const row = rows.get(id);
        rows.set(id, {
          ...row,
          status: params[0],
          stage: params[1],
          workerLeaseId: params[2],
          startedAt: params[3],
          heartbeatAt: params[4],
          completedAt: params[5],
          failureMessage: params[6],
          cancelRequestedAt: params[7],
          failureCode: params[8],
          degradedFlags: params[9],
        });
      }
      return { changes: 1 };
    }),
    __rows: rows,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mission runs lifecycle fields', () => {
  it('records cancel request timestamp and failure code when canceling a run', async () => {
    const db = createMissionRunDbMock([
      {
        id: 'run-1',
        missionId: 'mission-1',
        taskId: 'task-1',
        status: 'running',
        stage: 'analyst',
        attempt: 1,
        workerLeaseId: 'worker:1',
        createdAt: '2026-04-26T00:00:00.000Z',
        startedAt: '2026-04-26T00:01:00.000Z',
        heartbeatAt: '2026-04-26T00:02:00.000Z',
        completedAt: null,
        failureMessage: null,
        cancelRequestedAt: null,
        failureCode: null,
        degradedFlags: null,
      },
    ]);
    getDbMock.mockResolvedValue(db as any);
    const { cancelMissionRun } = await import('../workflows/mission-runs');

    const canceled = await cancelMissionRun('run-1', 'Canceled by user');

    expect(canceled).toMatchObject({
      id: 'run-1',
      status: 'canceled',
      stage: 'canceled',
      failureMessage: 'Canceled by user',
      failureCode: 'canceled',
    });
    expect(canceled?.cancelRequestedAt).toEqual(expect.any(String));
  });

  it('records specific failure codes when failing a run', async () => {
    const db = createMissionRunDbMock([
      {
        id: 'run-1',
        missionId: 'mission-1',
        taskId: 'task-1',
        status: 'running',
        stage: 'analyst',
        attempt: 1,
        workerLeaseId: 'worker:1',
        createdAt: '2026-04-26T00:00:00.000Z',
        startedAt: '2026-04-26T00:01:00.000Z',
        heartbeatAt: '2026-04-26T00:02:00.000Z',
        completedAt: null,
        failureMessage: null,
        cancelRequestedAt: null,
        failureCode: null,
        degradedFlags: null,
      },
    ]);
    getDbMock.mockResolvedValue(db as any);
    const { failMissionRun } = await import('../workflows/mission-runs');

    const failed = await failMissionRun('run-1', 'LLM timeout', 'timeout');

    expect(failed).toMatchObject({
      id: 'run-1',
      status: 'failed',
      stage: 'failed',
      failureMessage: 'LLM timeout',
      failureCode: 'timeout',
    });
  });
});
