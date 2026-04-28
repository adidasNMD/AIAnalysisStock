import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createDbMock() {
  const events = new Map<string, any>();
  const evidenceRefs = new Map<string, any>();
  const missions = new Map<string, any>();

  return {
    __missions: missions,
    run: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('INSERT INTO missions_index')) {
        missions.set(params[0], {
          id: params[0],
          status: params[1],
          mode: params[2],
          query: params[3],
          source: params[4],
          depth: params[5],
          opportunityId: params[6],
          createdAt: params[7],
          updatedAt: params[8],
          inputPayload: params[9],
          artifactPath: params[10],
        });
      }
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
      if (sql.includes('INSERT INTO mission_evidence_refs')) {
        evidenceRefs.set(params[2], {
          id: params[0],
          missionId: params[1],
          runId: params[2],
          capturedAt: params[3],
          status: params[4],
          completeness: params[5],
          artifactPath: params[6],
        });
      }
      return { changes: 1 };
    }),
    get: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT * FROM missions_index WHERE id = ?')) {
        return missions.get(params[0]) || null;
      }
      if (sql.includes('SELECT * FROM mission_evidence_refs WHERE runId = ?')) {
        return evidenceRefs.get(params[0]) || null;
      }
      if (sql.includes('SELECT id, artifactPath FROM mission_evidence_refs WHERE runId = ?')) {
        return evidenceRefs.get(params[0]) || null;
      }
      return null;
    }),
    all: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT * FROM missions_index')) {
        return Array.from(missions.values())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, params[0]);
      }
      if (sql.includes('SELECT * FROM mission_events')) {
        return Array.from(events.values())
          .filter((event) => event.missionId === params[0])
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return [];
    }),
    __events: events,
    __evidenceRefs: evidenceRefs,
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

  it('lists indexed missions from SQLite without scanning mission directories', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const { upsertMissionIndex, listMissionsFromIndex } = await import('../workflows/mission-index');

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
    }, '/tmp/does-not-exist-mission-1.json');

    await expect(listMissionsFromIndex(10)).resolves.toMatchObject([
      {
        id: 'mission-1',
        status: 'queued',
        input: {
          mode: 'review',
          query: 'AI infrastructure review',
          tickers: ['NVDA'],
          opportunityId: 'opp-1',
        },
        openclawTickers: [],
        consensus: [],
      },
    ]);
  });

  it('loads full mission details through the indexed artifact path when present', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const { upsertMissionIndex, getMissionFromIndex } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-index-test-'));
    const artifactPath = path.join(tempDir, 'mission-1.json');
    const mission = {
      id: 'mission-1',
      traceId: 'mission-1',
      input: {
        mode: 'analyze',
        query: '$NVDA',
        tickers: ['NVDA'],
        depth: 'quick',
        source: 'test',
      },
      status: 'fully_enriched',
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:02:00.000Z',
      openclawReport: 'report',
      openclawTickers: ['NVDA'],
      openclawDurationMs: 1000,
      taResults: [],
      taDurationMs: 0,
      openbbData: [],
      macroData: null,
      consensus: [],
      totalDurationMs: 2000,
    };
    fs.writeFileSync(artifactPath, JSON.stringify(mission), 'utf-8');

    try {
      await upsertMissionIndex(mission as any, artifactPath);

      await expect(getMissionFromIndex('mission-1')).resolves.toMatchObject({
        id: 'mission-1',
        status: 'fully_enriched',
        openclawTickers: ['NVDA'],
        totalDurationMs: 2000,
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads mission evidence through the indexed artifact reference', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      getMissionEvidenceArtifactPath,
      getMissionEvidenceFromIndex,
      upsertMissionEvidenceRef,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-evidence-index-test-'));
    const artifactPath = path.join(tempDir, 'run-1.evidence.json');
    const evidence = {
      id: 'evidence_run-1',
      missionId: 'mission-1',
      runId: 'run-1',
      capturedAt: '2026-04-26T00:02:00.000Z',
      status: 'fully_enriched',
      completeness: 'full',
      input: {
        mode: 'analyze',
        query: '$NVDA',
      },
      openclawReport: 'report',
      openclawTickers: ['NVDA'],
      openclawDurationMs: 1000,
      taResults: [],
      taDurationMs: 0,
      openbbData: [],
      macroData: null,
      consensus: [],
      totalDurationMs: 2000,
    };
    fs.writeFileSync(artifactPath, JSON.stringify(evidence), 'utf-8');

    try {
      await upsertMissionEvidenceRef(evidence as any, artifactPath);

      await expect(getMissionEvidenceArtifactPath('run-1')).resolves.toBe(artifactPath);
      await expect(getMissionEvidenceFromIndex('run-1')).resolves.toMatchObject({
        id: 'evidence_run-1',
        missionId: 'mission-1',
        runId: 'run-1',
        openclawTickers: ['NVDA'],
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
