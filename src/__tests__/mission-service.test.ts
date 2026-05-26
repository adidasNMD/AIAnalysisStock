import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MissionEvidenceRecord,
  MissionRunRecord,
  UnifiedMission,
} from '../workflows/types';
import type { MissionEventRecord } from '../workflows/mission-events';

const mocks = vi.hoisted(() => ({
  buildLatestMissionDiff: vi.fn(),
  getLatestMissionRun: vi.fn(),
  getMission: vi.fn(),
  getMissionEvidence: vi.fn(),
  getMissionEvidenceFromIndex: vi.fn(),
  getMissionFromCanonicalIndex: vi.fn(),
  getMissionFromIndex: vi.fn(),
  listMissionArtifactRefs: vi.fn(),
  listMissionEvents: vi.fn(),
  listMissionEventsFromIndex: vi.fn(),
  listMissionRuns: vi.fn(),
  listMissions: vi.fn(),
  listMissionsFromCanonicalIndex: vi.fn(),
  listMissionsFromIndex: vi.fn(),
  retryMissionRun: vi.fn(),
}));

vi.mock('../workflows', () => ({
  buildLatestMissionDiff: mocks.buildLatestMissionDiff,
  getLatestMissionRun: mocks.getLatestMissionRun,
  getMission: mocks.getMission,
  getMissionEvidence: mocks.getMissionEvidence,
  getMissionEvidenceFromIndex: mocks.getMissionEvidenceFromIndex,
  getMissionFromCanonicalIndex: mocks.getMissionFromCanonicalIndex,
  getMissionFromIndex: mocks.getMissionFromIndex,
  listMissionArtifactRefs: mocks.listMissionArtifactRefs,
  listMissionEvents: mocks.listMissionEvents,
  listMissionEventsFromIndex: mocks.listMissionEventsFromIndex,
  listMissionRuns: mocks.listMissionRuns,
  listMissions: mocks.listMissions,
  listMissionsFromCanonicalIndex: mocks.listMissionsFromCanonicalIndex,
  listMissionsFromIndex: mocks.listMissionsFromIndex,
  retryMissionRun: mocks.retryMissionRun,
}));

function makeMission(overrides: Partial<UnifiedMission> = {}): UnifiedMission {
  const base: UnifiedMission = {
    id: 'mission-service-1',
    traceId: 'trace-1',
    input: {
      mode: 'review',
      query: 'AI infrastructure review',
      tickers: ['NVDA'],
      depth: 'deep',
      source: 'opportunity_action',
      opportunityId: 'opp-1',
    },
    status: 'fully_enriched',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T01:00:00.000Z',
    openclawReport: 'report',
    openclawTickers: ['NVDA'],
    openclawDurationMs: 1200,
    taResults: [],
    taDurationMs: 0,
    openbbData: [],
    macroData: null,
    consensus: [],
    totalDurationMs: 1800,
  };

  return {
    ...base,
    ...overrides,
    input: {
      ...base.input,
      ...overrides.input,
    },
  };
}

function makeRun(overrides: Partial<MissionRunRecord> = {}): MissionRunRecord {
  return {
    id: 'run-service-1',
    missionId: 'mission-service-1',
    taskId: 'task-1',
    status: 'completed',
    stage: 'completed',
    attempt: 1,
    createdAt: '2026-04-28T00:00:00.000Z',
    completedAt: '2026-04-28T01:00:00.000Z',
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<MissionEvidenceRecord> = {}): MissionEvidenceRecord {
  const mission = makeMission();
  return {
    id: 'evidence-service-1',
    missionId: mission.id,
    runId: 'run-service-1',
    capturedAt: '2026-04-28T01:00:00.000Z',
    status: mission.status,
    completeness: 'full',
    input: mission.input,
    openclawReport: mission.openclawReport,
    openclawTickers: mission.openclawTickers,
    openclawDurationMs: mission.openclawDurationMs,
    taResults: mission.taResults,
    taDurationMs: mission.taDurationMs,
    openbbData: mission.openbbData,
    macroData: mission.macroData,
    consensus: mission.consensus,
    totalDurationMs: mission.totalDurationMs,
    ...overrides,
  };
}

describe('mission service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildLatestMissionDiff.mockReturnValue({ changed: true, highlights: ['coverage improved'] });
    mocks.getLatestMissionRun.mockResolvedValue(makeRun({ id: 'run-latest' }));
    mocks.getMission.mockReturnValue(null);
    mocks.getMissionEvidence.mockReturnValue(null);
    mocks.getMissionEvidenceFromIndex.mockResolvedValue(null);
    mocks.getMissionFromCanonicalIndex.mockResolvedValue(null);
    mocks.getMissionFromIndex.mockResolvedValue(null);
    mocks.listMissionArtifactRefs.mockResolvedValue([]);
    mocks.listMissionEvents.mockReturnValue([]);
    mocks.listMissionEventsFromIndex.mockResolvedValue([]);
    mocks.listMissionRuns.mockResolvedValue([]);
    mocks.listMissions.mockReturnValue([]);
    mocks.listMissionsFromCanonicalIndex.mockResolvedValue([]);
    mocks.listMissionsFromIndex.mockResolvedValue([]);
    mocks.retryMissionRun.mockResolvedValue(null);
  });

  it('lists summaries from the canonical Mission table before legacy indexes', async () => {
    const { listMissionSummaries } = await import('../server/services/mission-service');
    const mission = makeMission();
    const run = makeRun();
    mocks.listMissionsFromCanonicalIndex.mockResolvedValue([mission]);
    mocks.listMissionsFromIndex.mockResolvedValue([makeMission({ id: 'legacy-index-mission' })]);
    mocks.listMissions.mockReturnValue([makeMission({ id: 'legacy-file-mission' })]);
    mocks.listMissionRuns.mockResolvedValue([run]);

    const summaries = await listMissionSummaries(25);

    expect(mocks.listMissionsFromCanonicalIndex).toHaveBeenCalledWith(25);
    expect(mocks.listMissionsFromIndex).not.toHaveBeenCalled();
    expect(mocks.listMissions).not.toHaveBeenCalled();
    expect(summaries).toEqual([
      expect.objectContaining({
        id: 'mission-service-1',
        latestRun: run,
      }),
    ]);
  });

  it('adds the latest recovery audit event to Mission summaries', async () => {
    const { listMissionSummaries } = await import('../server/services/mission-service');
    const mission = makeMission({ status: 'failed' });
    const olderEvent: MissionEventRecord = {
      id: 'evt-recovery-old',
      missionId: mission.id,
      timestamp: '2026-04-28T00:05:00.000Z',
      type: 'queued',
      message: 'Queued a new retry',
      status: 'queued',
      meta: {
        operation: 'mission_retry',
        recoveryAction: 'queued_new_retry',
        reusedExistingRetry: false,
        depth: 'quick',
        costHint: {
          tier: 'low',
          label: '低成本',
          estimate: '约 1-3 分钟',
          detail: 'Quick retry',
        },
        runId: 'run-retry-1',
      },
    };
    const newerEvent: MissionEventRecord = {
      id: 'evt-recovery-new',
      missionId: mission.id,
      timestamp: '2026-04-28T00:10:00.000Z',
      type: 'queued',
      message: 'Reused an active retry',
      status: 'queued',
      meta: {
        operation: 'mission_retry',
        recoveryAction: 'reused_active_retry',
        reusedExistingRetry: true,
        depth: 'quick',
        costHint: {
          tier: 'low',
          label: '低成本',
          estimate: '约 1-3 分钟',
          detail: 'Reuses the active retry run',
        },
        taskId: 'task-retry-active',
        runId: 'run-retry-active',
        dedupeKey: 'mission-retry:v1:demo',
      },
    };
    mocks.listMissionsFromCanonicalIndex.mockResolvedValue([mission]);
    mocks.listMissionRuns.mockResolvedValue([makeRun({ status: 'failed', stage: 'failed' })]);
    mocks.listMissionEventsFromIndex.mockResolvedValue([olderEvent, newerEvent]);

    const summaries = await listMissionSummaries(25);

    expect(summaries[0]).toMatchObject({
      id: 'mission-service-1',
      latestRecoveryEvent: {
        id: 'evt-recovery-new',
        action: 'reused_active_retry',
        label: '复用恢复',
        reusedExistingRetry: true,
        depth: 'quick',
        costHint: {
          tier: 'low',
          estimate: '约 1-3 分钟',
        },
        taskId: 'task-retry-active',
        runId: 'run-retry-active',
        dedupeKey: 'mission-retry:v1:demo',
      },
    });
    expect(mocks.listMissionEvents).not.toHaveBeenCalled();
  });

  it('lists summaries from the SQLite index before falling back to file scans', async () => {
    const { listMissionSummaries } = await import('../server/services/mission-service');
    const mission = makeMission();
    const run = makeRun();
    mocks.listMissionsFromIndex.mockResolvedValue([mission]);
    mocks.listMissions.mockReturnValue([makeMission({ id: 'legacy-mission' })]);
    mocks.listMissionRuns.mockResolvedValue([run]);

    const summaries = await listMissionSummaries(25);

    expect(mocks.listMissionsFromCanonicalIndex).toHaveBeenCalledWith(25);
    expect(mocks.listMissionsFromIndex).toHaveBeenCalledWith(25);
    expect(mocks.listMissions).not.toHaveBeenCalled();
    expect(mocks.buildLatestMissionDiff).toHaveBeenCalledWith(mission, [run]);
    expect(summaries).toEqual([
      expect.objectContaining({
        id: 'mission-service-1',
        mode: 'review',
        query: 'AI infrastructure review',
        latestRun: run,
        latestDiff: { changed: true, highlights: ['coverage improved'] },
      }),
    ]);
  });

  it('returns opt-in paged Mission summaries with a next cursor', async () => {
    const { decodePageCursor } = await import('../server/route-helpers');
    const { listMissionSummariesPage } = await import('../server/services/mission-service');
    mocks.listMissionsFromCanonicalIndex.mockResolvedValue([
      makeMission({ id: 'mission-1' }),
      makeMission({ id: 'mission-2' }),
      makeMission({ id: 'mission-3' }),
    ]);

    const page = await listMissionSummariesPage({ limit: 1, offset: 1 });

    expect(mocks.listMissionsFromCanonicalIndex).toHaveBeenCalledWith(3);
    expect(page.items).toEqual([
      expect.objectContaining({ id: 'mission-2' }),
    ]);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(decodePageCursor(page.pageInfo.nextCursor)).toBe(2);
  });

  it('uses indexed mission events when present and legacy JSONL events as fallback', async () => {
    const { listMissionEventsForApi } = await import('../server/services/mission-service');
    mocks.listMissionEventsFromIndex.mockResolvedValueOnce([{ id: 'indexed-event' }]);

    await expect(listMissionEventsForApi('mission-service-1')).resolves.toEqual([{ id: 'indexed-event' }]);
    expect(mocks.listMissionEvents).not.toHaveBeenCalled();

    mocks.listMissionEventsFromIndex.mockResolvedValueOnce([]);
    mocks.listMissionEvents.mockReturnValueOnce([{ id: 'legacy-event' }]);

    await expect(listMissionEventsForApi('mission-service-1')).resolves.toEqual([{ id: 'legacy-event' }]);
  });

  it('returns Mission artifact refs through the indexed mission boundary', async () => {
    const { listMissionArtifactsForApi } = await import('../server/services/mission-service');
    const artifactRefs = [
      {
        id: 'mission:mission-service-1',
        missionId: 'mission-service-1',
        kind: 'mission',
        artifactPath: '/tmp/mission-service-1.json',
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T01:00:00.000Z',
      },
    ];
    mocks.getMissionFromIndex.mockResolvedValue(makeMission());
    mocks.listMissionArtifactRefs.mockResolvedValue(artifactRefs);

    await expect(listMissionArtifactsForApi('mission-service-1')).resolves.toEqual({
      status: 'found',
      artifacts: artifactRefs,
    });
    expect(mocks.listMissionArtifactRefs).toHaveBeenCalledWith('mission-service-1');

    mocks.getMissionFromIndex.mockResolvedValueOnce(null);
    await expect(listMissionArtifactsForApi('missing-mission')).resolves.toEqual({
      status: 'mission_not_found',
    });
  });

  it('guards evidence lookups by mission existence and mission ownership', async () => {
    const { getMissionEvidenceForApi } = await import('../server/services/mission-service');

    await expect(getMissionEvidenceForApi('missing-mission', 'run-service-1')).resolves.toEqual({
      status: 'mission_not_found',
    });

    mocks.getMissionFromIndex.mockResolvedValue(makeMission());
    mocks.getMissionEvidenceFromIndex.mockResolvedValueOnce(makeEvidence({ missionId: 'other-mission' }));
    await expect(getMissionEvidenceForApi('mission-service-1', 'run-service-1')).resolves.toEqual({
      status: 'evidence_not_found',
    });

    const evidence = makeEvidence();
    mocks.getMissionEvidenceFromIndex.mockResolvedValueOnce(evidence);
    await expect(getMissionEvidenceForApi('mission-service-1', 'run-service-1')).resolves.toEqual({
      status: 'found',
      evidence,
    });
    expect(mocks.getMissionEvidence).not.toHaveBeenCalled();
  });

  it('falls back to legacy file scanning when indexed evidence is missing', async () => {
    const { getMissionEvidenceForApi } = await import('../server/services/mission-service');
    const evidence = makeEvidence();
    mocks.getMissionFromIndex.mockResolvedValue(makeMission());
    mocks.getMissionEvidenceFromIndex.mockResolvedValue(null);
    mocks.getMissionEvidence.mockReturnValue(evidence);

    await expect(getMissionEvidenceForApi('mission-service-1', 'run-service-1')).resolves.toEqual({
      status: 'found',
      evidence,
    });
    expect(mocks.getMissionEvidenceFromIndex).toHaveBeenCalledWith('run-service-1');
    expect(mocks.getMissionEvidence).toHaveBeenCalledWith('run-service-1');
  });

  it('builds a failed mission recovery suggestion from latest run failure metadata', async () => {
    const { getMissionRecoveryForApi } = await import('../server/services/mission-service');
    const run = makeRun({
      status: 'failed',
      stage: 'failed',
      failureCode: 'execution_failed',
      failureMessage: 'OpenBB timed out',
    });
    mocks.getMissionFromIndex.mockResolvedValue(makeMission({ status: 'failed' }));
    mocks.listMissionRuns.mockResolvedValue([run]);

    const result = await getMissionRecoveryForApi('mission-service-1');

    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected recovery suggestion');
    expect(result.recovery).toMatchObject({
      missionId: 'mission-service-1',
      recoverable: true,
      latestRun: run,
      summary: {
        label: '任务失败待恢复',
        severity: 'critical',
      },
      reason: {
        status: 'failed',
        runStatus: 'failed',
        stage: 'failed',
        failureCode: 'execution_failed',
        failureMessage: 'OpenBB timed out',
      },
    });
    expect(result.recovery.summary.detail).toContain('Quick 重跑');
    expect(result.recovery.suggestedActions.map((action) => action.id)).toEqual([
      'retry_same',
      'retry_quick',
      'retry_deep',
      'review_recovery',
      'inspect_trace',
      'check_services',
    ]);
    expect(result.recovery.suggestedActions[1]?.costHint).toMatchObject({
      tier: 'low',
      estimate: '约 1-3 分钟',
    });
    expect(result.recovery.suggestedActions[2]?.costHint).toMatchObject({
      tier: 'high',
      estimate: '约 8-15 分钟',
    });
  });

  it('explains timeout failures with a targeted recovery hint', async () => {
    const { getMissionRecoveryForApi } = await import('../server/services/mission-service');
    const run = makeRun({
      status: 'failed',
      stage: 'failed',
      failureCode: 'timeout',
      failureMessage: 'Request timed out',
    });
    mocks.getMissionFromIndex.mockResolvedValue(makeMission({ status: 'failed' }));
    mocks.listMissionRuns.mockResolvedValue([run]);

    const result = await getMissionRecoveryForApi('mission-service-1');

    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected recovery suggestion');
    expect(result.recovery.summary.detail).toContain('超时');
    expect(result.recovery.reason.failureCode).toBe('timeout');
  });

  it('builds a canceled mission recovery suggestion with cancel context', async () => {
    const { getMissionRecoveryForApi } = await import('../server/services/mission-service');
    const run = makeRun({
      status: 'canceled',
      stage: 'canceled',
      failureCode: 'canceled',
      cancelRequestedAt: '2026-04-28T00:30:00.000Z',
    });
    mocks.getMissionFromIndex.mockResolvedValue(makeMission({ status: 'canceled' }));
    mocks.listMissionRuns.mockResolvedValue([run]);

    const result = await getMissionRecoveryForApi('mission-service-1');

    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected recovery suggestion');
    expect(result.recovery).toMatchObject({
      recoverable: true,
      summary: {
        label: '任务已取消',
        severity: 'warning',
      },
      reason: {
        status: 'canceled',
        runStatus: 'canceled',
        cancelRequestedAt: '2026-04-28T00:30:00.000Z',
      },
    });
    expect(result.recovery.suggestedActions.map((action) => action.id)).toEqual([
      'retry_same',
      'retry_quick',
      'review_recovery',
      'inspect_trace',
    ]);
  });

  it('surfaces degraded completed runs as recoverable review work', async () => {
    const { getMissionRecoveryForApi } = await import('../server/services/mission-service');
    const run = makeRun({
      status: 'completed',
      stage: 'completed',
      degradedFlags: ['main_only'],
    });
    mocks.getMissionFromIndex.mockResolvedValue(makeMission({ status: 'main_only' }));
    mocks.listMissionRuns.mockResolvedValue([run]);

    const result = await getMissionRecoveryForApi('mission-service-1');

    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected recovery suggestion');
    expect(result.recovery).toMatchObject({
      recoverable: true,
      summary: {
        label: '结果已降级',
        severity: 'warning',
      },
      reason: {
        status: 'main_only',
        runStatus: 'completed',
        degradedFlags: ['main_only'],
      },
    });
    expect(result.recovery.suggestedActions.map((action) => action.id)).toEqual([
      'review_recovery',
      'retry_deep',
      'inspect_trace',
    ]);
  });

  it('returns mission_not_found for recovery lookups when the mission is absent', async () => {
    const { getMissionRecoveryForApi } = await import('../server/services/mission-service');

    await expect(getMissionRecoveryForApi('missing-mission')).resolves.toEqual({
      status: 'mission_not_found',
    });
    expect(mocks.listMissionRuns).not.toHaveBeenCalled();
  });

  it('queues mission retries with the existing route response contract', async () => {
    const { retryMissionForApi } = await import('../server/services/mission-service');
    const mission = makeMission({ status: 'queued' });
    mocks.getMission.mockReturnValue(mission);
    mocks.getLatestMissionRun
      .mockResolvedValueOnce(makeRun({ id: 'run-failed', status: 'failed', stage: 'failed' }))
      .mockResolvedValueOnce(makeRun({ id: 'run-latest', status: 'queued', stage: 'queued' }));
    mocks.retryMissionRun.mockResolvedValue(mission);

    await expect(retryMissionForApi('mission-service-1', { depth: 'quick' })).resolves.toMatchObject({
      status: 'queued',
      response: {
        success: true,
        message: 'Mission retry queued',
        missionId: 'mission-service-1',
        runId: 'run-latest',
        recoveryAudit: {
          operation: 'mission_retry',
          action: 'queued_new_retry',
          reusedExistingRetry: false,
          depth: 'quick',
          costHint: {
            tier: 'low',
            estimate: '约 1-3 分钟',
          },
        },
      },
    });
    expect(mocks.retryMissionRun).toHaveBeenCalledWith('mission-service-1', {
      source: 'manual_retry',
      priority: 90,
      depth: 'quick',
    });
  });

  it('passes retry idempotency keys through to the mission submission layer', async () => {
    const { retryMissionForApi } = await import('../server/services/mission-service');
    const mission = makeMission({ status: 'queued' });
    mocks.getMission.mockReturnValue(mission);
    mocks.retryMissionRun.mockResolvedValue(mission);

    await expect(retryMissionForApi('mission-service-1', {
      depth: 'deep',
      idempotencyKey: 'client-retry-1',
    })).resolves.toMatchObject({
      status: 'queued',
      response: {
        missionId: 'mission-service-1',
      },
    });
    expect(mocks.retryMissionRun).toHaveBeenCalledWith('mission-service-1', {
      source: 'manual_retry',
      priority: 90,
      depth: 'deep',
      idempotencyKey: 'client-retry-1',
    });
  });

  it('marks retry responses as reused when no newer run was created', async () => {
    const { retryMissionForApi } = await import('../server/services/mission-service');
    const mission = makeMission({ status: 'queued' });
    const existingRun = makeRun({ id: 'run-existing', status: 'running', stage: 'dispatch' });
    mocks.getMission.mockReturnValue(mission);
    mocks.getLatestMissionRun.mockResolvedValue(existingRun);
    mocks.retryMissionRun.mockResolvedValue(mission);

    await expect(retryMissionForApi('mission-service-1', { depth: 'deep' })).resolves.toMatchObject({
      status: 'queued',
      response: {
        runId: 'run-existing',
        recoveryAudit: {
          action: 'reused_existing_retry',
          reusedExistingRetry: true,
          depth: 'deep',
          costHint: {
            tier: 'high',
          },
        },
      },
    });
  });
});
