import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createDbMock() {
  const events = new Map<string, any>();

  return {
    run: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('INSERT INTO mission_events')) {
        events.set(params[0], {
          id: params[0],
          missionId: params[1],
          timestamp: params[2],
          type: params[3],
          status: params[4],
          phase: params[5],
          message: params[6],
          meta: params[7],
          artifactPath: params[8],
        });
      }
      return { changes: 1 };
    }),
    get: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT * FROM mission_events')) {
        return Array.from(events.values())
          .filter((event) => event.missionId === params[0])
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return [];
    }),
    __events: events,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mission index', () => {
  it('upserts mission index rows with original input payload and artifact reference', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const { upsertMissionIndex } = await import('../workflows/mission-index');

    await upsertMissionIndex({
      id: 'mission-1',
      traceId: 'mission-1',
      input: {
        mode: 'review',
        query: 'AI infrastructure review',
        tickers: ['NVDA'],
        depth: 'deep',
        source: 'opportunity_action',
        opportunityId: 'opp-1',
      },
      status: 'queued',
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:01:00.000Z',
      openclawReport: null,
      openclawTickers: [],
      openclawDurationMs: 0,
      taResults: [],
      taDurationMs: 0,
      openbbData: [],
      macroData: null,
      consensus: [],
      totalDurationMs: 0,
    }, '/tmp/mission-1.json');

    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO missions_index'),
      'mission-1',
      'queued',
      'review',
      'AI infrastructure review',
      'opportunity_action',
      'deep',
      'opp-1',
      '2026-04-26T00:00:00.000Z',
      '2026-04-26T00:01:00.000Z',
      expect.stringContaining('"tickers":["NVDA"]'),
      '/tmp/mission-1.json',
    );
  });

  it('round-trips mission event index rows as typed event records', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const { appendMissionEventIndex, listMissionEventsFromIndex } = await import('../workflows/mission-index');

    await appendMissionEventIndex({
      id: 'event-1',
      missionId: 'mission-1',
      timestamp: '2026-04-26T00:00:00.000Z',
      type: 'stage',
      status: 'main_running',
      phase: 'scout',
      message: 'Mission entered scout stage',
      meta: { runId: 'run-1' },
    }, '/tmp/mission-1.events.jsonl');

    await expect(listMissionEventsFromIndex('mission-1')).resolves.toEqual([
      {
        id: 'event-1',
        missionId: 'mission-1',
        timestamp: '2026-04-26T00:00:00.000Z',
        type: 'stage',
        status: 'main_running',
        phase: 'scout',
        message: 'Mission entered scout stage',
        meta: { runId: 'run-1' },
      },
    ]);
  });
});
