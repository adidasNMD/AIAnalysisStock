import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createDbMock() {
  const artifactRefs = new Map<string, any>();
  const events = new Map<string, any>();
  const evidenceRefs = new Map<string, any>();
  const missions = new Map<string, any>();
  const canonicalMissions = new Map<string, any>();
  const missionRuns = new Map<string, any>();

  return {
    __missions: missions,
    __canonicalMissions: canonicalMissions,
    __missionRuns: missionRuns,
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
      if (sql.includes('INSERT INTO missions (')) {
        canonicalMissions.set(params[0], {
          id: params[0],
          mode: params[1],
          query: params[2],
          tickers: params[3],
          depth: params[4],
          source: params[5],
          opportunityId: params[6],
          status: params[7],
          createdAt: params[8],
          updatedAt: params[9],
          inputPayload: params[10],
          inputHash: params[11],
          latestRunId: params[12],
          latestEventId: params[13],
          artifactPath: params[14],
          artifactSha256: params[15],
          artifactSizeBytes: params[16],
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
      if (sql.includes('INSERT INTO mission_artifacts')) {
        artifactRefs.set(params[0], {
          id: params[0],
          missionId: params[1],
          runId: params[2],
          kind: params[3],
          artifactPath: params[4],
          sha256: params[5],
          sizeBytes: params[6],
          contentType: params[7],
          createdAt: params[8],
          updatedAt: params[9],
          meta: params[10],
        });
      }
      if (sql.includes('UPDATE mission_artifacts')) {
        const existing = artifactRefs.get(params[4]);
        if (existing) {
          artifactRefs.set(params[4], {
            ...existing,
            sha256: params[0],
            sizeBytes: params[1],
            contentType: params[2],
            updatedAt: params[3],
          });
        }
      }
      if (
        sql.includes('UPDATE missions')
        && sql.includes('latestRunId')
        && sql.includes('latestEventId')
      ) {
        const existing = canonicalMissions.get(params[4]);
        if (existing) {
          canonicalMissions.set(params[4], {
            ...existing,
            latestRunId: params[0] || existing.latestRunId,
            latestEventId: params[1] || existing.latestEventId,
            updatedAt: existing.updatedAt < params[2] ? params[2] : existing.updatedAt,
          });
        }
      }
      if (sql.includes('UPDATE missions') && sql.includes('latestEventId')) {
        const existing = canonicalMissions.get(params[3]);
        if (existing) {
          canonicalMissions.set(params[3], {
            ...existing,
            latestEventId: params[0],
            updatedAt: existing.updatedAt < params[1] ? params[1] : existing.updatedAt,
          });
        }
      }
      if (sql.includes('DELETE FROM missions WHERE id = ?')) {
        canonicalMissions.delete(params[0]);
      }
      if (sql.includes('DELETE FROM missions_index WHERE id = ?')) {
        missions.delete(params[0]);
      }
      if (sql.includes('DELETE FROM mission_events WHERE missionId = ?')) {
        for (const [id, event] of events.entries()) {
          if (event.missionId === params[0]) events.delete(id);
        }
      }
      if (sql.includes('DELETE FROM mission_evidence_refs WHERE missionId = ?')) {
        for (const [id, ref] of evidenceRefs.entries()) {
          if (ref.missionId === params[0]) evidenceRefs.delete(id);
        }
      }
      if (sql.includes('DELETE FROM mission_artifacts WHERE missionId = ?')) {
        for (const [id, ref] of artifactRefs.entries()) {
          if (ref.missionId === params[0]) artifactRefs.delete(id);
        }
      }
      return { changes: 1 };
    }),
    get: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT id FROM missions WHERE id = ?')) {
        const row = canonicalMissions.get(params[0]);
        return row ? { id: row.id } : null;
      }
      if (sql.includes('SELECT * FROM missions WHERE id = ?')) {
        return canonicalMissions.get(params[0]) || null;
      }
      if (sql.includes('SELECT id, artifactPath FROM missions WHERE id = ?')) {
        return canonicalMissions.get(params[0]) || null;
      }
      if (sql.includes('SELECT * FROM missions_index WHERE id = ?')) {
        return missions.get(params[0]) || null;
      }
      if (sql.includes('SELECT * FROM mission_evidence_refs WHERE runId = ?')) {
        return evidenceRefs.get(params[0]) || null;
      }
      if (sql.includes('SELECT id, artifactPath FROM mission_evidence_refs WHERE runId = ?')) {
        return evidenceRefs.get(params[0]) || null;
      }
      if (sql.includes('FROM mission_runs') && sql.includes('WHERE missionId = ?')) {
        return Array.from(missionRuns.values())
          .filter((run) => run.missionId === params[0])
          .sort((a, b) => `${b.createdAt}:${b.id}`.localeCompare(`${a.createdAt}:${a.id}`))
          .map((run) => ({
            id: run.id,
            updatedAt: run.completedAt || run.heartbeatAt || run.startedAt || run.createdAt,
          }))[0] || null;
      }
      if (sql.includes('SELECT id, timestamp') && sql.includes('FROM mission_events')) {
        return Array.from(events.values())
          .filter((event) => event.missionId === params[0])
          .sort((a, b) => `${b.timestamp}:${b.id}`.localeCompare(`${a.timestamp}:${a.id}`))[0] || null;
      }
      if (sql.includes('SELECT * FROM mission_artifacts') && sql.includes('AND kind = ?')) {
        if (sql.includes('WHERE runId = ?')) {
          return Array.from(artifactRefs.values())
            .filter((ref) => ref.runId === params[0] && ref.kind === params[1])
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
        }
        return Array.from(artifactRefs.values())
          .filter((ref) => ref.missionId === params[0] && ref.kind === params[1])
          .filter((ref) => !params[2] || ref.runId === params[2])
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
      }
      return null;
    }),
    all: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT * FROM missions ORDER BY updatedAt DESC')) {
        return Array.from(canonicalMissions.values())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, params[0]);
      }
      if (sql.includes('SELECT * FROM missions_index')) {
        return Array.from(missions.values())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, params[0]);
      }
      if (sql.includes('SELECT * FROM mission_events')) {
        const rows = Array.from(events.values());
        if (sql.includes('WHERE missionId = ?')) {
          return rows
            .filter((event) => event.missionId === params[0])
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        }
        return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      if (sql.includes('SELECT * FROM mission_evidence_refs')) {
        return Array.from(evidenceRefs.values())
          .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      }
      if (sql.includes('SELECT * FROM mission_artifacts')) {
        const refs = Array.from(artifactRefs.values());
        if (sql.includes('WHERE id IN')) {
          const ids = new Set(params);
          return refs
            .filter((ref) => ids.has(ref.id))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        }
        if (sql.includes('WHERE missionId = ?')) {
          return refs
            .filter((ref) => ref.missionId === params[0])
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        }
        return refs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }
      return [];
    }),
    __artifactRefs: artifactRefs,
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
    const {
      getMissionFromCanonicalIndex,
      listMissionArtifactRefs,
      listMissionsFromCanonicalIndex,
      upsertMissionIndex,
    } = await import('../workflows/mission-index');

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
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO missions'),
      'mission-1',
      'review',
      'AI infrastructure review',
      '["NVDA"]',
      'deep',
      'opportunity_action',
      'opp-1',
      'queued',
      '2026-04-26T00:00:00.000Z',
      '2026-04-26T00:01:00.000Z',
      expect.stringContaining('"tickers":["NVDA"]'),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      null,
      null,
      '/tmp/mission-1.json',
      null,
      null,
    );
    await expect(getMissionFromCanonicalIndex('mission-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'mission-1',
        status: 'queued',
        input: expect.objectContaining({
          mode: 'review',
          query: 'AI infrastructure review',
          tickers: ['NVDA'],
          opportunityId: 'opp-1',
        }),
      }),
    );
    await expect(listMissionsFromCanonicalIndex(10)).resolves.toHaveLength(1);
    await expect(listMissionArtifactRefs('mission-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'mission:mission-1',
        missionId: 'mission-1',
        kind: 'mission',
        artifactPath: '/tmp/mission-1.json',
        contentType: 'application/json',
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:01:00.000Z',
        meta: expect.objectContaining({
          status: 'queued',
          mode: 'review',
          opportunityId: 'opp-1',
        }),
      }),
    ]);
  });

  it('backfills canonical mission rows from the legacy mission index and links latest refs', async () => {
    const db = createDbMock();
    db.__missions.set('mission-legacy', {
      id: 'mission-legacy',
      status: 'main_only',
      mode: 'review',
      query: 'Legacy AI review',
      source: 'manual',
      depth: 'standard',
      opportunityId: 'opp-legacy',
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:05:00.000Z',
      inputPayload: JSON.stringify({
        mode: 'review',
        query: 'Legacy AI review',
        tickers: ['NVDA', 'AMD'],
        depth: 'standard',
        source: 'manual',
        opportunityId: 'opp-legacy',
      }),
      artifactPath: '/tmp/missing-mission-legacy.json',
    });
    db.__missionRuns.set('run-legacy', {
      id: 'run-legacy',
      missionId: 'mission-legacy',
      createdAt: '2026-04-24T00:06:00.000Z',
      heartbeatAt: '2026-04-24T00:08:00.000Z',
      completedAt: null,
      startedAt: null,
    });
    db.__events.set('event-legacy', {
      id: 'event-legacy',
      missionId: 'mission-legacy',
      timestamp: '2026-04-24T00:09:00.000Z',
      type: 'status',
      status: 'main_only',
      phase: 'synthesis',
      message: 'Mission completed with degraded enrichment',
      meta: null,
      artifactPath: '/tmp/mission-legacy.events.jsonl',
    });
    getDbMock.mockResolvedValue(db as any);
    const {
      backfillCanonicalMissions,
      getMissionFromCanonicalIndex,
    } = await import('../workflows/mission-index');

    const result = await backfillCanonicalMissions();

    expect(result).toEqual(expect.objectContaining({
      missionsScanned: 1,
      inserted: 1,
      refreshed: 0,
      latestRunsLinked: 1,
      latestEventsLinked: 1,
      filesMissing: 1,
    }));
    expect(db.__canonicalMissions.get('mission-legacy')).toEqual(expect.objectContaining({
      latestRunId: 'run-legacy',
      latestEventId: 'event-legacy',
      updatedAt: '2026-04-24T00:09:00.000Z',
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    await expect(getMissionFromCanonicalIndex('mission-legacy')).resolves.toEqual(
      expect.objectContaining({
        id: 'mission-legacy',
        status: 'main_only',
        input: expect.objectContaining({
          query: 'Legacy AI review',
          tickers: ['NVDA', 'AMD'],
          opportunityId: 'opp-legacy',
        }),
      }),
    );
  });

  it('reports canonical Mission coverage gaps and stale rows', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      getMissionCanonicalCoverageDiagnostics,
      upsertMissionIndex,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-canonical-health-test-'));
    const okPath = path.join(tempDir, 'mission-ok.json');
    const stalePath = path.join(tempDir, 'mission-stale.json');
    const missingCanonicalPath = path.join(tempDir, 'mission-missing-canonical.json');
    fs.writeFileSync(okPath, JSON.stringify({ id: 'mission-ok' }), 'utf-8');
    fs.writeFileSync(stalePath, JSON.stringify({ id: 'mission-stale' }), 'utf-8');
    fs.writeFileSync(missingCanonicalPath, JSON.stringify({ id: 'mission-missing-canonical' }), 'utf-8');

    try {
      await upsertMissionIndex({
        id: 'mission-ok',
        traceId: 'mission-ok',
        input: { mode: 'review', query: 'Canonical ok' },
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
      }, okPath);
      db.__missions.set('mission-missing-canonical', {
        id: 'mission-missing-canonical',
        status: 'queued',
        mode: 'review',
        query: 'Missing canonical',
        source: 'manual',
        depth: 'quick',
        opportunityId: null,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:02:00.000Z',
        inputPayload: JSON.stringify({ mode: 'review', query: 'Missing canonical' }),
        artifactPath: missingCanonicalPath,
      });
      db.__missions.set('mission-stale', {
        id: 'mission-stale',
        status: 'queued',
        mode: 'review',
        query: 'Stale canonical',
        source: 'manual',
        depth: 'quick',
        opportunityId: null,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:03:00.000Z',
        inputPayload: JSON.stringify({ mode: 'review', query: 'Stale canonical' }),
        artifactPath: stalePath,
      });
      db.__canonicalMissions.set('mission-stale', {
        id: 'mission-stale',
        mode: 'review',
        query: 'Stale canonical',
        tickers: '[]',
        depth: 'quick',
        source: 'manual',
        opportunityId: null,
        status: 'queued',
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:01:00.000Z',
        inputPayload: JSON.stringify({ mode: 'review', query: 'Stale canonical' }),
        inputHash: 'hash',
        latestRunId: null,
        latestEventId: null,
        artifactPath: stalePath,
        artifactSha256: null,
        artifactSizeBytes: null,
      });

      await expect(getMissionCanonicalCoverageDiagnostics()).resolves.toMatchObject({
        status: 'degraded',
        indexTotal: 3,
        canonicalTotal: 2,
        covered: 2,
        missingCanonical: 1,
        staleCanonical: 1,
        integrityMissing: 1,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'missing_canonical',
            missionId: 'mission-missing-canonical',
          }),
          expect.objectContaining({
            code: 'stale_canonical',
            missionId: 'mission-stale',
          }),
          expect.objectContaining({
            code: 'integrity_missing',
            missionId: 'mission-stale',
          }),
        ]),
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('round-trips mission event index rows and updates the event log artifact ref', async () => {
    const db = createDbMock();
    db.__canonicalMissions.set('mission-1', {
      id: 'mission-1',
      mode: 'review',
      query: 'AI infrastructure review',
      tickers: '["NVDA"]',
      depth: 'deep',
      source: 'opportunity_action',
      opportunityId: 'opp-1',
      status: 'queued',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
      inputPayload: JSON.stringify({
        mode: 'review',
        query: 'AI infrastructure review',
        tickers: ['NVDA'],
      }),
      inputHash: 'hash',
      latestRunId: null,
      latestEventId: null,
      artifactPath: null,
      artifactSha256: null,
      artifactSizeBytes: null,
    });
    getDbMock.mockResolvedValue(db as any);
    const {
      appendMissionEventIndex,
      getLatestMissionArtifactRef,
      listMissionEventsFromIndex,
    } = await import('../workflows/mission-index');

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
    await expect(getLatestMissionArtifactRef('mission-1', 'event_log')).resolves.toEqual(
      expect.objectContaining({
        id: 'event_log:mission-1',
        missionId: 'mission-1',
        kind: 'event_log',
        artifactPath: '/tmp/mission-1.events.jsonl',
        contentType: 'application/x-ndjson',
        updatedAt: '2026-04-26T00:00:00.000Z',
        meta: expect.objectContaining({
          latestEventId: 'event-1',
          latestEventType: 'stage',
        }),
      }),
    );
    expect(db.__canonicalMissions.get('mission-1')).toEqual(
      expect.objectContaining({
        latestEventId: 'event-1',
        updatedAt: '2026-04-26T00:00:00.000Z',
      }),
    );
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
      getLatestMissionArtifactRef,
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
      await expect(getLatestMissionArtifactRef('mission-1', 'evidence', 'run-1')).resolves.toEqual(
        expect.objectContaining({
          id: 'evidence:evidence_run-1',
          missionId: 'mission-1',
          runId: 'run-1',
          kind: 'evidence',
          artifactPath,
          contentType: 'application/json',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          sizeBytes: expect.any(Number),
          meta: expect.objectContaining({
            status: 'fully_enriched',
            completeness: 'full',
          }),
        }),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports missing and mismatched Mission artifact health issues', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      getMissionArtifactHealthDiagnostics,
      upsertMissionArtifactRef,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-artifact-health-test-'));
    const artifactPath = path.join(tempDir, 'mission-1.json');
    fs.writeFileSync(artifactPath, JSON.stringify({ id: 'mission-1' }), 'utf-8');

    try {
      await upsertMissionArtifactRef({
        id: 'mission:mission-1',
        missionId: 'mission-1',
        kind: 'mission',
        artifactPath,
        sha256: '0'.repeat(64),
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
      });
      await upsertMissionArtifactRef({
        id: 'evidence:evidence-1',
        missionId: 'mission-1',
        runId: 'run-1',
        kind: 'evidence',
        artifactPath: path.join(tempDir, 'missing.evidence.json'),
        createdAt: '2026-04-26T00:01:00.000Z',
        updatedAt: '2026-04-26T00:01:00.000Z',
      });

      await expect(getMissionArtifactHealthDiagnostics()).resolves.toMatchObject({
        status: 'degraded',
        total: 2,
        present: 1,
        missing: 1,
        checksumMismatch: 1,
        byKind: {
          mission: {
            total: 1,
            present: 1,
            issues: 1,
          },
          evidence: {
            total: 1,
            present: 0,
            issues: 1,
          },
        },
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'checksum_mismatch',
            artifactId: 'mission:mission-1',
            missionId: 'mission-1',
            actualSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
          expect.objectContaining({
            code: 'missing',
            artifactId: 'evidence:evidence-1',
            runId: 'run-1',
          }),
        ]),
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds a dry-run Mission artifact repair plan', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      getMissionArtifactRepairPlan,
      upsertMissionArtifactRef,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-artifact-repair-test-'));
    const missingMetaPath = path.join(tempDir, 'missing-meta.json');
    const mismatchPath = path.join(tempDir, 'mismatch.json');
    fs.writeFileSync(missingMetaPath, JSON.stringify({ id: 'missing-meta' }), 'utf-8');
    fs.writeFileSync(mismatchPath, JSON.stringify({ id: 'mismatch' }), 'utf-8');

    try {
      db.__artifactRefs.set('mission:missing-meta', {
        id: 'mission:missing-meta',
        missionId: 'missing-meta',
        runId: null,
        kind: 'mission',
        artifactPath: missingMetaPath,
        sha256: null,
        sizeBytes: null,
        contentType: null,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
        meta: null,
      });
      await upsertMissionArtifactRef({
        id: 'mission:mismatch',
        missionId: 'mismatch',
        kind: 'mission',
        artifactPath: mismatchPath,
        sha256: '0'.repeat(64),
        sizeBytes: 1,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
      });
      await upsertMissionArtifactRef({
        id: 'evidence:missing',
        missionId: 'missing-mission',
        runId: 'run-missing',
        kind: 'evidence',
        artifactPath: path.join(tempDir, 'missing.json'),
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
      });

      await expect(getMissionArtifactRepairPlan()).resolves.toMatchObject({
        status: 'blocked',
        totalArtifacts: 3,
        totalActions: 3,
        automaticActions: 1,
        manualReviewActions: 1,
        blockedActions: 1,
        sampledActions: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'mission:missing-meta',
            issueCode: 'integrity_missing',
            action: 'refresh_integrity',
            safety: 'automatic',
          }),
          expect.objectContaining({
            artifactId: 'mission:mismatch',
            issueCode: 'checksum_mismatch',
            action: 'verify_and_overwrite_integrity',
            safety: 'manual_review',
          }),
          expect.objectContaining({
            artifactId: 'evidence:missing',
            issueCode: 'missing',
            action: 'restore_artifact',
            safety: 'blocked',
          }),
        ]),
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('repairs automatic Mission artifact integrity while skipping manual review actions by default', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      listMissionArtifactRefs,
      repairMissionArtifacts,
      upsertMissionArtifactRef,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-artifact-repair-run-test-'));
    const missingMetaPath = path.join(tempDir, 'missing-meta.json');
    const mismatchPath = path.join(tempDir, 'mismatch.json');
    fs.writeFileSync(missingMetaPath, JSON.stringify({ id: 'missing-meta' }), 'utf-8');
    fs.writeFileSync(mismatchPath, JSON.stringify({ id: 'mismatch' }), 'utf-8');

    try {
      db.__artifactRefs.set('mission:missing-meta', {
        id: 'mission:missing-meta',
        missionId: 'missing-meta',
        runId: null,
        kind: 'mission',
        artifactPath: missingMetaPath,
        sha256: null,
        sizeBytes: null,
        contentType: null,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
        meta: null,
      });
      await upsertMissionArtifactRef({
        id: 'mission:mismatch',
        missionId: 'mismatch',
        kind: 'mission',
        artifactPath: mismatchPath,
        sha256: '0'.repeat(64),
        sizeBytes: 1,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
      });

      await expect(repairMissionArtifacts({
        artifactIds: ['mission:missing-meta', 'mission:mismatch', 'mission:not-found'],
      })).resolves.toMatchObject({
        requestedArtifactIds: ['mission:missing-meta', 'mission:mismatch', 'mission:not-found'],
        notFoundArtifactIds: ['mission:not-found'],
        totalArtifacts: 2,
        totalActions: 2,
        eligibleActions: 1,
        applied: 1,
        skippedManualReview: 1,
        blocked: 0,
        updatedArtifactIds: ['mission:missing-meta'],
        skippedActions: [
          expect.objectContaining({
            artifactId: 'mission:mismatch',
            safety: 'manual_review',
          }),
        ],
      });
      await expect(listMissionArtifactRefs('missing-meta')).resolves.toEqual([
        expect.objectContaining({
          id: 'mission:missing-meta',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          sizeBytes: expect.any(Number),
          contentType: 'application/json',
        }),
      ]);
      await expect(listMissionArtifactRefs('mismatch')).resolves.toEqual([
        expect.objectContaining({
          id: 'mission:mismatch',
          sha256: '0'.repeat(64),
          sizeBytes: 1,
        }),
      ]);

      await expect(repairMissionArtifacts({
        artifactIds: ['mission:mismatch'],
        includeManualReview: true,
      })).resolves.toMatchObject({
        totalArtifacts: 1,
        totalActions: 1,
        eligibleActions: 1,
        applied: 1,
        skippedManualReview: 0,
        updatedArtifactIds: ['mission:mismatch'],
      });
      await expect(listMissionArtifactRefs('mismatch')).resolves.toEqual([
        expect.objectContaining({
          id: 'mission:mismatch',
          sha256: expect.not.stringMatching(/^0{64}$/),
          sizeBytes: expect.any(Number),
        }),
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('backfills Mission artifact refs from legacy index, events, and evidence refs', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      backfillMissionArtifactRefs,
      listMissionArtifactRefs,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-artifact-backfill-test-'));
    const missionPath = path.join(tempDir, 'mission-legacy.json');
    const eventLogPath = path.join(tempDir, 'mission-legacy.events.jsonl');
    const evidencePath = path.join(tempDir, 'missing.evidence.json');
    fs.writeFileSync(missionPath, JSON.stringify({ id: 'mission-legacy' }), 'utf-8');
    fs.writeFileSync(eventLogPath, '{"type":"stage"}\n', 'utf-8');
    db.__missions.set('mission-legacy', {
      id: 'mission-legacy',
      status: 'fully_enriched',
      mode: 'review',
      query: 'Legacy mission',
      source: 'manual',
      depth: 'deep',
      opportunityId: 'opp-legacy',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:10:00.000Z',
      inputPayload: JSON.stringify({ mode: 'review', query: 'Legacy mission' }),
      artifactPath: missionPath,
    });
    db.__events.set('event-legacy', {
      id: 'event-legacy',
      missionId: 'mission-legacy',
      timestamp: '2026-04-25T00:05:00.000Z',
      type: 'stage',
      status: 'main_running',
      phase: 'scout',
      message: 'Legacy event',
      meta: null,
      artifactPath: eventLogPath,
    });
    db.__evidenceRefs.set('run-legacy', {
      id: 'evidence-legacy',
      missionId: 'mission-legacy',
      runId: 'run-legacy',
      capturedAt: '2026-04-25T00:12:00.000Z',
      status: 'fully_enriched',
      completeness: 'full',
      artifactPath: evidencePath,
    });

    try {
      await expect(backfillMissionArtifactRefs()).resolves.toMatchObject({
        missionsScanned: 1,
        missionArtifactsUpserted: 1,
        eventRowsScanned: 1,
        eventLogArtifactsUpserted: 1,
        evidenceRefsScanned: 1,
        evidenceArtifactsUpserted: 1,
        totalArtifactsUpserted: 3,
        filesPresent: 2,
        filesMissing: 1,
      });

      await expect(listMissionArtifactRefs('mission-legacy')).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'mission:mission-legacy',
          kind: 'mission',
          artifactPath: missionPath,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          id: 'event_log:mission-legacy',
          kind: 'event_log',
          artifactPath: eventLogPath,
          meta: expect.objectContaining({
            eventCount: 1,
            latestEventId: 'event-legacy',
          }),
        }),
        expect.objectContaining({
          id: 'evidence:evidence-legacy',
          runId: 'run-legacy',
          kind: 'evidence',
          artifactPath: evidencePath,
        }),
      ]));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('refreshes missing artifact integrity without overwriting mismatches by default', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const {
      listMissionArtifactRefs,
      refreshMissionArtifactIntegrity,
    } = await import('../workflows/mission-index');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-artifact-refresh-test-'));
    const missingMetaPath = path.join(tempDir, 'missing-meta.json');
    const mismatchPath = path.join(tempDir, 'mismatch.json');
    fs.writeFileSync(missingMetaPath, JSON.stringify({ id: 'missing-meta' }), 'utf-8');
    fs.writeFileSync(mismatchPath, JSON.stringify({ id: 'mismatch' }), 'utf-8');
    db.__artifactRefs.set('mission:missing-meta', {
      id: 'mission:missing-meta',
      missionId: 'missing-meta',
      runId: null,
      kind: 'mission',
      artifactPath: missingMetaPath,
      sha256: null,
      sizeBytes: null,
      contentType: null,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
      meta: null,
    });
    db.__artifactRefs.set('mission:mismatch', {
      id: 'mission:mismatch',
      missionId: 'mismatch',
      runId: null,
      kind: 'mission',
      artifactPath: mismatchPath,
      sha256: '0'.repeat(64),
      sizeBytes: 1,
      contentType: 'application/json',
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
      meta: null,
    });

    try {
      await expect(refreshMissionArtifactIntegrity()).resolves.toMatchObject({
        total: 2,
        filesPresent: 2,
        integrityMissing: 1,
        checksumMismatches: 1,
        sizeMismatches: 1,
        refreshed: 1,
        skippedMismatches: 1,
        refreshedArtifactIds: ['mission:missing-meta'],
      });
      await expect(listMissionArtifactRefs('missing-meta')).resolves.toEqual([
        expect.objectContaining({
          id: 'mission:missing-meta',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          sizeBytes: expect.any(Number),
          contentType: 'application/json',
        }),
      ]);
      await expect(listMissionArtifactRefs('mismatch')).resolves.toEqual([
        expect.objectContaining({
          id: 'mission:mismatch',
          sha256: '0'.repeat(64),
          sizeBytes: 1,
        }),
      ]);

      await expect(refreshMissionArtifactIntegrity({ overwriteMismatches: true })).resolves.toMatchObject({
        total: 2,
        refreshed: 1,
        skippedMismatches: 0,
        refreshedArtifactIds: ['mission:mismatch'],
      });
      await expect(listMissionArtifactRefs('mismatch')).resolves.toEqual([
        expect.objectContaining({
          id: 'mission:mismatch',
          sha256: expect.not.stringMatching(/^0{64}$/),
          sizeBytes: expect.any(Number),
        }),
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
