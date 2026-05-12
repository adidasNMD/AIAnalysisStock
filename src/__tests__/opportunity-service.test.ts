import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityRecord } from '../workflows/types';

const mocks = vi.hoisted(() => ({
  appendOpportunityEvent: vi.fn(),
  buildLatestMissionDiff: vi.fn(),
  buildOpportunityActionTimeline: vi.fn(),
  buildOpportunityBoardHealthMap: vi.fn(),
  buildOpportunityInbox: vi.fn(),
  buildOpportunityPlaybook: vi.fn(),
  buildOpportunitySuggestedMission: vi.fn(),
  buildOpportunitySuggestedMissions: vi.fn(),
  buildWhyNowSummary: vi.fn(),
  createOpportunity: vi.fn(),
  detectOpportunityHeatInflection: vi.fn(),
  emitOpportunityDerivedEvents: vi.fn(),
  getLatestOpportunityDiff: vi.fn(),
  getLatestMissionArtifactRef: vi.fn(),
  getMission: vi.fn(),
  getMissionFromIndex: vi.fn(),
  getOpportunity: vi.fn(),
  getOpportunityHeatHistory: vi.fn(),
  listOpportunityFieldEvidence: vi.fn(),
  listOpportunityFieldRegistryAudit: vi.fn(),
  listOpportunityFieldRegistryOverrides: vi.fn(),
  listMissionEvents: vi.fn(),
  listMissionRuns: vi.fn(),
  listOpportunities: vi.fn(),
  listOpportunityEvents: vi.fn(),
  recordOpportunityFieldEvidence: vi.fn(),
  deleteOpportunityFieldRegistryOverride: vi.fn(),
  upsertOpportunityFieldRegistryOverride: vi.fn(),
  updateOpportunity: vi.fn(),
  updateOpportunityFieldEvidenceStatus: vi.fn(),
}));

vi.mock('../workflows', () => ({
  appendOpportunityEvent: mocks.appendOpportunityEvent,
  buildLatestMissionDiff: mocks.buildLatestMissionDiff,
  buildOpportunityActionTimeline: mocks.buildOpportunityActionTimeline,
  buildOpportunityBoardHealthMap: mocks.buildOpportunityBoardHealthMap,
  buildOpportunityInbox: mocks.buildOpportunityInbox,
  buildOpportunityPlaybook: mocks.buildOpportunityPlaybook,
  buildOpportunitySuggestedMission: mocks.buildOpportunitySuggestedMission,
  buildOpportunitySuggestedMissions: mocks.buildOpportunitySuggestedMissions,
  buildWhyNowSummary: mocks.buildWhyNowSummary,
  createOpportunity: mocks.createOpportunity,
  detectOpportunityHeatInflection: mocks.detectOpportunityHeatInflection,
  emitOpportunityDerivedEvents: mocks.emitOpportunityDerivedEvents,
  getLatestOpportunityDiff: mocks.getLatestOpportunityDiff,
  getLatestMissionArtifactRef: mocks.getLatestMissionArtifactRef,
  getMission: mocks.getMission,
  getMissionFromIndex: mocks.getMissionFromIndex,
  getOpportunity: mocks.getOpportunity,
  getOpportunityHeatHistory: mocks.getOpportunityHeatHistory,
  listOpportunityFieldEvidence: mocks.listOpportunityFieldEvidence,
  listOpportunityFieldRegistryAudit: mocks.listOpportunityFieldRegistryAudit,
  listOpportunityFieldRegistryOverrides: mocks.listOpportunityFieldRegistryOverrides,
  listMissionEvents: mocks.listMissionEvents,
  listMissionRuns: mocks.listMissionRuns,
  listOpportunities: mocks.listOpportunities,
  listOpportunityEvents: mocks.listOpportunityEvents,
  recordOpportunityFieldEvidence: mocks.recordOpportunityFieldEvidence,
  deleteOpportunityFieldRegistryOverride: mocks.deleteOpportunityFieldRegistryOverride,
  upsertOpportunityFieldRegistryOverride: mocks.upsertOpportunityFieldRegistryOverride,
  updateOpportunity: mocks.updateOpportunity,
  updateOpportunityFieldEvidenceStatus: mocks.updateOpportunityFieldEvidenceStatus,
}));

function makeOpportunity(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: 'opp-service-1',
    type: 'relay_chain',
    stage: 'tracking',
    status: 'watching',
    title: 'AI Infra Relay',
    query: 'AI infra relay',
    leaderTicker: 'CRWV',
    relatedTickers: ['MU'],
    relayTickers: ['SNDK'],
    scores: {
      purityScore: 58,
      scarcityScore: 52,
      tradeabilityScore: 74,
      relayScore: 82,
      catalystScore: 64,
      policyScore: 38,
    },
    catalystCalendar: [],
    latestMissionId: 'mission-indexed',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T01:00:00.000Z',
    ...overrides,
  };
}

describe('opportunity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMissionFromIndex.mockReturnValue({
      id: 'mission-indexed',
      input: {
        query: 'AI infra relay',
        source: 'opportunity_action',
      },
      status: 'fully_enriched',
      updatedAt: '2026-04-28T02:00:00.000Z',
    });
    mocks.getMission.mockReturnValue(null);
    mocks.listMissionRuns.mockResolvedValue([
      {
        id: 'run-1',
        missionId: 'mission-indexed',
        status: 'completed',
        stage: 'completed',
        attempt: 1,
        createdAt: '2026-04-28T01:00:00.000Z',
      },
    ]);
    mocks.buildLatestMissionDiff.mockReturnValue({ changed: false, highlights: [] });
    mocks.getLatestOpportunityDiff.mockResolvedValue({ changed: true, highlights: ['thesis changed'] });
    mocks.getLatestMissionArtifactRef.mockImplementation(async (missionId: string, kind: string, runId?: string) => ({
      id: `artifact-${kind}-${runId || missionId}`,
      missionId,
      ...(runId ? { runId } : {}),
      kind,
      artifactPath: `out/missions/${missionId}/${kind}.json`,
      createdAt: '2026-04-28T01:00:00.000Z',
      updatedAt: '2026-04-28T02:00:00.000Z',
    }));
    mocks.getOpportunityHeatHistory.mockResolvedValue([
      {
        snapshotId: 'snap-1',
        createdAt: '2026-04-28T01:00:00.000Z',
        relayScore: 70,
        bottleneckCount: 1,
        laggardCount: 1,
      },
      {
        snapshotId: 'snap-2',
        createdAt: '2026-04-28T02:00:00.000Z',
        relayScore: 82,
        bottleneckCount: 1,
        laggardCount: 1,
      },
    ]);
    mocks.detectOpportunityHeatInflection.mockReturnValue({ kind: 'acceleration', summary: 'Relay improved' });
    mocks.listOpportunityFieldEvidence.mockResolvedValue([]);
    mocks.listOpportunityFieldRegistryAudit.mockResolvedValue([]);
    mocks.listOpportunityFieldRegistryOverrides.mockResolvedValue([]);
    mocks.listOpportunityEvents.mockResolvedValue([{ id: 'oe-1', type: 'updated' }]);
    mocks.listMissionEvents.mockReturnValue([{ id: 'me-1', type: 'completed' }]);
    mocks.buildWhyNowSummary.mockReturnValue('Relay is warming');
    mocks.buildOpportunityPlaybook.mockReturnValue({ title: 'Prepare', checklist: [] });
    mocks.buildOpportunitySuggestedMission.mockReturnValue({ id: 'relay_chain_deep' });
    mocks.buildOpportunitySuggestedMissions.mockReturnValue([{ id: 'relay_chain_map' }]);
    mocks.buildOpportunityActionTimeline.mockReturnValue([{ id: 'timeline-1' }]);
    mocks.createOpportunity.mockResolvedValue(makeOpportunity({ latestMissionId: undefined }));
    mocks.updateOpportunity.mockResolvedValue(makeOpportunity({ latestMissionId: undefined }));
    mocks.appendOpportunityEvent.mockResolvedValue(undefined);
    mocks.recordOpportunityFieldEvidence.mockResolvedValue(undefined);
    mocks.upsertOpportunityFieldRegistryOverride.mockImplementation(async (input) => ({
      override: {
        field: input.field,
        ...(input.label ? { label: input.label } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.source ? { source: input.source } : {}),
        ...(input.confidence ? { confidence: input.confidence } : {}),
        ...(input.note ? { note: input.note } : {}),
        updatedAt: '2026-05-09T00:00:00.000Z',
      },
      audit: {
        id: 'audit-default',
        field: input.field,
        action: 'upsert',
        changedFields: [],
        updatedAt: '2026-05-09T00:00:00.000Z',
      },
    }));
    mocks.deleteOpportunityFieldRegistryOverride.mockResolvedValue({ deleted: true });
    mocks.updateOpportunityFieldEvidenceStatus.mockResolvedValue(null);
    mocks.emitOpportunityDerivedEvents.mockResolvedValue(undefined);
  });

  it('builds an enriched opportunity summary from the indexed latest mission', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');

    const summary = await buildOpportunitySummary(makeOpportunity());

    expect(mocks.getMissionFromIndex).toHaveBeenCalledWith('mission-indexed');
    expect(mocks.getMission).not.toHaveBeenCalled();
    expect(summary.latestMission?.id).toBe('mission-indexed');
    expect(summary.latestRun?.id).toBe('run-1');
    expect(summary.whyNowSummary).toBe('Relay is warming');
    expect(summary.recentActionTimeline?.[0]?.id).toBe('timeline-1');
  });

  it('adds source provenance from field evidence, catalysts, missions, and events', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');

    const summary = await buildOpportunitySummary(makeOpportunity({
      type: 'ipo_spinout',
      latestEventType: 'updated',
      latestEventMessage: 'IPO profile updated from source evidence',
      latestEventAt: '2026-04-28T03:00:00.000Z',
      ipoProfile: {
        officialTradingDate: '2026-05-01',
        retainedStakePercent: 80,
        evidence: {
          officialTradingDate: {
            source: '424B4 filing',
            confidence: 'confirmed',
            observedAt: '2026-04-27T00:00:00.000Z',
            note: 'Trading date appears in final prospectus',
          },
          retainedStakePercent: {
            source: 'S-1/A',
            confidence: 'inferred',
            observedAt: '2026-04-26T00:00:00.000Z',
          },
        },
      },
      catalystCalendar: [
        {
          label: 'First independent earnings',
          dueAt: '2026-08-10T20:00:00.000Z',
          status: 'upcoming',
          source: 'earnings_calendar',
          confidence: 'placeholder',
          note: 'Window is estimated until company confirms',
        },
      ],
    }));

    expect(summary.sourceProvenance).toMatchObject({
      total: 5,
      confirmed: 1,
      inferred: 1,
      placeholder: 1,
      unknown: 2,
      sources: expect.arrayContaining(['424B4 filing', 'S-1/A', 'earnings_calendar', 'opportunity_event', 'opportunity_action']),
      latestObservedAt: '2026-08-10T20:00:00.000Z',
    });
    expect(summary.sourceProvenance?.items[0]).toMatchObject({
      field: 'ipoProfile.officialTradingDate',
      source: '424B4 filing',
      confidence: 'confirmed',
      value: '2026-05-01',
    });
    expect(summary.fieldEvidence).toMatchObject({
      sources: expect.arrayContaining(['424B4 filing', 'opportunity_action', 'opportunity_scores']),
    });
    expect(summary.fieldEvidence?.fields).toBeGreaterThan(8);
    expect(summary.fieldEvidence?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'score',
        field: 'scores.relayScore',
        source: 'opportunity_scores',
        value: '82',
        artifact: expect.objectContaining({
          missionId: 'mission-indexed',
          runId: 'run-1',
          kind: 'evidence',
          href: '/missions/mission-indexed?run=run-1',
        }),
      }),
      expect.objectContaining({
        kind: 'source',
        field: 'ipoProfile.officialTradingDate',
        source: '424B4 filing',
        confidence: 'confirmed',
      }),
      expect.objectContaining({
        kind: 'mission',
        field: 'latestMission',
        source: 'opportunity_action',
        value: 'fully_enriched',
        artifact: expect.objectContaining({
          missionId: 'mission-indexed',
          kind: 'mission',
          href: '/missions/mission-indexed',
        }),
      }),
    ]));
  });

  it('applies field registry overrides when building source provenance and field evidence', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');
    mocks.listOpportunityFieldRegistryOverrides.mockResolvedValue([
      {
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        source: 'custom_score_registry',
        confidence: 'confirmed',
        updatedAt: '2026-05-09T00:00:00.000Z',
      },
      {
        field: 'latestMission',
        label: 'Latest execution mission',
        source: 'execution_registry',
        confidence: 'inferred',
        updatedAt: '2026-05-09T00:00:00.000Z',
      },
    ]);

    const summary = await buildOpportunitySummary(makeOpportunity());

    expect(summary.fieldEvidence?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        source: 'custom_score_registry',
        confidence: 'confirmed',
      }),
      expect.objectContaining({
        field: 'latestMission',
        label: 'Latest execution mission',
        source: 'opportunity_action',
        confidence: 'unknown',
      }),
    ]));
  });

  it('lists and mutates effective field registry overrides for the API', async () => {
    const {
      deleteOpportunityFieldRegistryForApi,
      listOpportunityFieldRegistryAuditForApi,
      listOpportunityFieldRegistryForApi,
      upsertOpportunityFieldRegistryForApi,
    } = await import('../server/services/opportunity-service');
    mocks.listOpportunityFieldRegistryOverrides.mockResolvedValue([
      {
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        source: 'custom_score_registry',
        confidence: 'confirmed',
        updatedAt: '2026-05-09T00:00:00.000Z',
      },
    ]);
    mocks.listOpportunityFieldRegistryAudit.mockResolvedValue([
      {
        id: 'audit-1',
        field: 'scores.relayScore',
        action: 'upsert',
        changedFields: ['label'],
        updatedAt: '2026-05-09T00:00:00.000Z',
        updatedBy: 'dashboard',
      },
    ]);
    mocks.upsertOpportunityFieldRegistryOverride.mockResolvedValue({
      override: {
        field: 'custom.executionGate',
        label: 'Execution gate',
        kind: 'record',
        source: 'manual_checklist',
        confidence: 'unknown',
        updatedAt: '2026-05-09T00:10:00.000Z',
      },
      audit: {
        id: 'audit-2',
        field: 'custom.executionGate',
        action: 'upsert',
        changedFields: ['label', 'kind', 'source', 'confidence'],
        updatedAt: '2026-05-09T00:10:00.000Z',
      },
    });
    mocks.deleteOpportunityFieldRegistryOverride.mockResolvedValue({
      deleted: true,
      audit: {
        id: 'audit-3',
        field: 'scores.relayScore',
        action: 'delete',
        changedFields: ['label', 'source', 'confidence'],
        updatedAt: '2026-05-09T00:11:00.000Z',
      },
    });

    const registry = await listOpportunityFieldRegistryForApi();

    expect(registry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        overriddenFields: ['label', 'source', 'confidence'],
      }),
    ]));

    await upsertOpportunityFieldRegistryForApi({
      field: 'custom.executionGate',
      label: 'Execution gate',
      kind: 'record',
      source: 'manual_checklist',
      confidence: 'unknown',
    });
    expect(mocks.upsertOpportunityFieldRegistryOverride).toHaveBeenCalledWith(expect.objectContaining({
      field: 'custom.executionGate',
      updatedBy: 'dashboard',
    }));

    await expect(listOpportunityFieldRegistryAuditForApi({ field: 'scores.relayScore', limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        field: 'scores.relayScore',
        action: 'upsert',
        changedFields: ['label'],
      }),
    ]);
    expect(mocks.listOpportunityFieldRegistryAudit).toHaveBeenCalledWith({
      field: 'scores.relayScore',
      limit: 5,
    });

    const reset = await deleteOpportunityFieldRegistryForApi('scores.relayScore');
    expect(reset.deleted).toBe(true);
    expect(mocks.deleteOpportunityFieldRegistryOverride).toHaveBeenCalledWith('scores.relayScore');
    expect(reset.audit).toEqual(expect.objectContaining({ action: 'delete' }));
  });

  it('exports, reports, and batch imports field registry overrides', async () => {
    const {
      exportOpportunityFieldRegistryForApi,
      getOpportunityFieldRegistryDiffReportForApi,
      importOpportunityFieldRegistryForApi,
    } = await import('../server/services/opportunity-service');
    mocks.listOpportunityFieldRegistryOverrides.mockResolvedValue([
      {
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        source: 'custom_score_registry',
        confidence: 'confirmed',
        updatedAt: '2026-05-09T00:00:00.000Z',
      },
    ]);
    mocks.listOpportunityFieldRegistryAudit.mockResolvedValue([
      {
        id: 'audit-1',
        field: 'scores.relayScore',
        action: 'upsert',
        changedFields: ['label', 'source', 'confidence'],
        updatedAt: '2026-05-09T00:00:00.000Z',
        updatedBy: 'dashboard',
      },
    ]);
    mocks.upsertOpportunityFieldRegistryOverride.mockResolvedValue({
      override: {
        field: 'custom.executionGate',
        label: 'Execution gate',
        kind: 'record',
        source: 'manual_checklist',
        confidence: 'unknown',
        updatedAt: '2026-05-09T00:10:00.000Z',
        updatedBy: 'dashboard-import',
      },
      audit: {
        id: 'audit-2',
        field: 'custom.executionGate',
        action: 'upsert',
        changedFields: ['label', 'kind', 'source', 'confidence'],
        updatedAt: '2026-05-09T00:10:00.000Z',
        updatedBy: 'dashboard-import',
      },
    });

    const report = await getOpportunityFieldRegistryDiffReportForApi();
    expect(report.overriddenFields).toBeGreaterThan(0);
    expect(report.changedFieldCounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'label' }),
    ]));

    const exported = await exportOpportunityFieldRegistryForApi();
    expect(exported.version).toBe(1);
    expect(exported.items).toEqual([
      expect.objectContaining({ field: 'scores.relayScore' }),
    ]);
    expect(exported.report.recentAudit[0]).toEqual(expect.objectContaining({ id: 'audit-1' }));

    const dryRun = await importOpportunityFieldRegistryForApi({
      dryRun: true,
      updatedBy: 'dashboard-import',
      items: [
        {
          field: 'scores.policyScore',
          label: 'Policy QA score',
          source: 'manual_registry',
          confidence: 'inferred',
        },
      ],
    });
    expect(dryRun.created).toBe(1);
    expect(mocks.upsertOpportunityFieldRegistryOverride).not.toHaveBeenCalled();

    const applied = await importOpportunityFieldRegistryForApi({
      dryRun: false,
      updatedBy: 'dashboard-import',
      items: [
        {
          field: 'custom.executionGate',
          label: 'Execution gate',
          kind: 'record',
          source: 'manual_checklist',
          confidence: 'unknown',
        },
        {
          field: 'custom.executionGate',
          label: 'Duplicate gate',
        },
      ],
    });

    expect(applied.created).toBe(1);
    expect(applied.failed).toBe(1);
    expect(applied.items[1]).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'Duplicate field in import payload',
    }));
    expect(mocks.upsertOpportunityFieldRegistryOverride).toHaveBeenCalledWith(expect.objectContaining({
      field: 'custom.executionGate',
      updatedBy: 'dashboard-import',
    }));
  });

  it('builds inbox items from opportunity summaries', async () => {
    const { listOpportunityInboxItems } = await import('../server/services/opportunity-service');
    mocks.listOpportunities.mockResolvedValue([
      makeOpportunity({ id: 'opp-service-1' }),
      makeOpportunity({ id: 'opp-service-2', latestMissionId: undefined }),
    ]);
    mocks.buildOpportunityInbox.mockReturnValue([{ id: 'opp-service-1', inboxScore: 88 }]);

    const items = await listOpportunityInboxItems(1, 2);

    expect(mocks.listOpportunities).toHaveBeenCalledWith(2);
    expect(mocks.buildOpportunityInbox).toHaveBeenCalledWith(expect.any(Array), 1);
    expect(items).toEqual([{ id: 'opp-service-1', inboxScore: 88 }]);
  });

  it('returns opt-in paged opportunity summaries with a next cursor', async () => {
    const { decodePageCursor } = await import('../server/route-helpers');
    const { listOpportunitySummariesPage } = await import('../server/services/opportunity-service');
    mocks.listOpportunities.mockResolvedValue([
      makeOpportunity({ id: 'opp-service-1', latestMissionId: undefined }),
      makeOpportunity({ id: 'opp-service-2', latestMissionId: undefined }),
      makeOpportunity({ id: 'opp-service-3', latestMissionId: undefined }),
    ]);

    const page = await listOpportunitySummariesPage({ limit: 1, offset: 1 });

    expect(mocks.listOpportunities).toHaveBeenCalledWith(3);
    expect(page.items).toEqual([
      expect.objectContaining({ id: 'opp-service-2' }),
    ]);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(decodePageCursor(page.pageInfo.nextCursor)).toBe(2);
  });

  it('creates opportunities from validated API payloads without route-level casts', async () => {
    const { createOpportunityPayloadSchema } = await import('../server/validation');
    const { createOpportunityForApi } = await import('../server/services/opportunity-service');
    const payload = createOpportunityPayloadSchema.parse({
      type: 'relay_chain',
      title: '  AI Infra Relay  ',
      query: '  AI infra relay  ',
      scores: {
        relayScore: 88,
      },
      heatProfile: {
        temperature: 'warming',
        bottleneckTickers: ['MU'],
      },
    });

    const result = await createOpportunityForApi(payload);

    expect(result.status).toBe('created');
    expect(mocks.createOpportunity).toHaveBeenCalledWith(expect.objectContaining({
      type: 'relay_chain',
      title: 'AI Infra Relay',
      query: 'AI infra relay',
      scores: { relayScore: 88 },
      heatProfile: {
        temperature: 'warming',
        bottleneckTickers: ['MU'],
      },
    }));
  });

  it('rejects mature relay opportunities without minimum relay-chain data', async () => {
    const { createOpportunityPayloadSchema } = await import('../server/validation');
    const { createOpportunityForApi } = await import('../server/services/opportunity-service');
    const payload = createOpportunityPayloadSchema.parse({
      type: 'relay_chain',
      title: 'Incomplete Ready Relay',
      query: 'Incomplete ready relay',
      stage: 'ready',
      status: 'ready',
    });

    const result = await createOpportunityForApi(payload);

    expect(result.status).toBe('invalid');
    expect(result.details).toEqual(expect.arrayContaining([
      { path: 'leaderTicker', message: expect.any(String) },
      { path: 'relatedTickers', message: expect.any(String) },
      { path: 'relayTickers', message: expect.any(String) },
    ]));
    expect(mocks.createOpportunity).not.toHaveBeenCalled();
  });

  it('rejects profiles that do not match the opportunity type', async () => {
    const { createOpportunityPayloadSchema } = await import('../server/validation');
    const { createOpportunityForApi } = await import('../server/services/opportunity-service');
    const payload = createOpportunityPayloadSchema.parse({
      type: 'relay_chain',
      title: 'Mixed Profile Relay',
      query: 'Mixed profile relay',
      proxyProfile: {
        mappingTarget: 'Policy theme',
        legitimacyScore: 80,
      },
    });

    const result = await createOpportunityForApi(payload);

    expect(result.status).toBe('invalid');
    expect(result.details).toEqual(expect.arrayContaining([
      { path: 'proxyProfile', message: 'relay_chain opportunities cannot use proxyProfile' },
    ]));
    expect(mocks.createOpportunity).not.toHaveBeenCalled();
  });

  it('updates opportunities, emits update events, and returns enriched summaries', async () => {
    const { updateOpportunityPayloadSchema } = await import('../server/validation');
    const { updateOpportunityForApi } = await import('../server/services/opportunity-service');
    const previous = makeOpportunity({
      status: 'watching',
      latestMissionId: undefined,
    });
    const updated = makeOpportunity({
      status: 'ready',
      latestMissionId: undefined,
    });
    mocks.getOpportunity
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(updated);
    mocks.updateOpportunity.mockResolvedValue(updated);
    const payload = updateOpportunityPayloadSchema.parse({
      status: 'ready',
      scores: {
        relayScore: 91,
      },
    });

    const result = await updateOpportunityForApi('opp-service-1', payload);

    expect(mocks.updateOpportunity).toHaveBeenCalledWith('opp-service-1', {
      status: 'ready',
      scores: { relayScore: 91 },
    });
    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith('opp-service-1', expect.objectContaining({
      type: 'updated',
      meta: {
        stage: 'tracking',
        status: 'ready',
      },
    }));
    expect(mocks.emitOpportunityDerivedEvents).toHaveBeenCalledWith(previous, updated);
    expect(result.status).toBe('updated');
    expect(result.summary.status).toBe('ready');
  });

  it('records manual pre-trade confirmations as opportunity events', async () => {
    const { preTradeConfirmationPayloadSchema } = await import('../server/validation');
    const { recordPreTradeConfirmationForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'pretrade-event-1',
      opportunityId: opportunity.id,
      type: 'pretrade_confirmed',
      message: 'Pre-trade check confirmed',
      timestamp: '2026-04-28T03:00:00.000Z',
    });
    const payload = preTradeConfirmationPayloadSchema.parse({
      itemId: 'catalyst_window',
      label: 'Catalyst window',
      status: 'block',
      completed: true,
      evidence: 'Company calendar pending',
      actionKind: 'fill_date',
      catalystUrgency: 'missing_date',
      readiness: 'blocked',
      score: 66,
    });

    const result = await recordPreTradeConfirmationForApi(opportunity.id, payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'pretrade_confirmed',
      message: expect.stringContaining('Catalyst window'),
      meta: {
        source: 'pretrade_checklist',
        itemId: 'catalyst_window',
        label: 'Catalyst window',
        status: 'block',
        completed: true,
        evidence: 'Company calendar pending',
        actionKind: 'fill_date',
        catalystUrgency: 'missing_date',
        readiness: 'blocked',
        score: 66,
      },
    }));
    expect(result.status).toBe('recorded');
    expect(result.event?.type).toBe('pretrade_confirmed');
    expect(result.summary?.id).toBe(opportunity.id);
  });

  it('records catalyst reminder preferences as audited opportunity events', async () => {
    const { catalystReminderPreferencePayloadSchema } = await import('../server/validation');
    const { recordCatalystReminderPreferenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'catalyst-reminder-event-1',
      opportunityId: opportunity.id,
      type: 'catalyst_reminder_updated',
      message: 'Catalyst reminder snoozed',
      timestamp: '2026-04-28T03:00:00.000Z',
    });
    const payload = catalystReminderPreferencePayloadSchema.parse({
      reminderId: 'opp-service-1:Earnings:2026-05-01:0',
      catalystLabel: 'Earnings',
      catalystDueAt: '2026-05-01T00:00:00.000Z',
      catalystStatus: 'upcoming',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'snooze',
      snoozedUntil: '2026-04-29T03:00:00.000Z',
      note: 'Snoozed from reminder strip',
    });

    const result = await recordCatalystReminderPreferenceForApi(opportunity.id, payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'catalyst_reminder_updated',
      message: expect.stringContaining('Earnings'),
      meta: {
        source: 'catalyst_reminder',
        reminderId: 'opp-service-1:Earnings:2026-05-01:0',
        catalystLabel: 'Earnings',
        catalystDueAt: '2026-05-01T00:00:00.000Z',
        catalystStatus: 'upcoming',
        urgency: 'soon',
        actionKind: 'prepare',
        preference: 'snooze',
        snoozedUntil: '2026-04-29T03:00:00.000Z',
        note: 'Snoozed from reminder strip',
      },
    }));
    expect(result.status).toBe('recorded');
    expect(result.event?.type).toBe('catalyst_reminder_updated');
    expect(result.summary?.id).toBe(opportunity.id);
  });

  it('records catalyst reminder subscriptions with lead days as audited opportunity events', async () => {
    const { catalystReminderPreferencePayloadSchema } = await import('../server/validation');
    const { recordCatalystReminderPreferenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'catalyst-reminder-subscribe-event-1',
      opportunityId: opportunity.id,
      type: 'catalyst_reminder_updated',
      message: 'Catalyst reminder subscribed',
      timestamp: '2026-04-28T03:00:00.000Z',
    });
    const payload = catalystReminderPreferencePayloadSchema.parse({
      reminderId: 'opp-service-1:Earnings:2026-05-01:0',
      catalystLabel: 'Earnings',
      catalystDueAt: '2026-05-01T00:00:00.000Z',
      catalystStatus: 'upcoming',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'subscribe',
      subscriptionLeadDays: 3,
      note: 'Subscribed from reminder strip',
    });

    const result = await recordCatalystReminderPreferenceForApi(opportunity.id, payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'catalyst_reminder_updated',
      message: expect.stringContaining('subscribed'),
      meta: {
        source: 'catalyst_reminder',
        reminderId: 'opp-service-1:Earnings:2026-05-01:0',
        catalystLabel: 'Earnings',
        catalystDueAt: '2026-05-01T00:00:00.000Z',
        catalystStatus: 'upcoming',
        urgency: 'soon',
        actionKind: 'prepare',
        preference: 'subscribe',
        subscriptionLeadDays: 3,
        note: 'Subscribed from reminder strip',
      },
    }));
    expect(result.status).toBe('recorded');
    expect(result.event?.type).toBe('catalyst_reminder_updated');
    expect(result.summary?.id).toBe(opportunity.id);
  });

  it('records manual field evidence as audited opportunity events', async () => {
    const { fieldEvidencePayloadSchema } = await import('../server/validation');
    const { recordFieldEvidenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'field-evidence-event-1',
      opportunityId: opportunity.id,
      type: 'field_evidence_recorded',
      message: 'Field evidence recorded',
      timestamp: '2026-04-28T03:00:00.000Z',
      meta: {},
    });
    const payload = fieldEvidencePayloadSchema.parse({
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Verified against latest evidence pack.',
    });

    const result = await recordFieldEvidenceForApi(opportunity.id, payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'field_evidence_recorded',
      message: expect.stringContaining('Relay score'),
      meta: expect.objectContaining({
        source: 'manual_review',
        field: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
        confidence: 'confirmed',
        note: 'Verified against latest evidence pack.',
      }),
    }));
    expect(mocks.recordOpportunityFieldEvidence).toHaveBeenCalledWith(expect.objectContaining({
      id: 'field-evidence-event-1',
      opportunityId: opportunity.id,
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Verified against latest evidence pack.',
      observedAt: '2026-04-28T03:00:00.000Z',
      recordedAt: '2026-04-28T03:00:00.000Z',
      createdEventId: 'field-evidence-event-1',
    }));
    expect(result.status).toBe('recorded');
    expect(result.event?.type).toBe('field_evidence_recorded');
    expect(result.summary?.id).toBe(opportunity.id);
  });

  it('fills manual field evidence labels and kind from the field registry', async () => {
    const { fieldEvidencePayloadSchema } = await import('../server/validation');
    const { recordFieldEvidenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'field-evidence-event-1',
      opportunityId: opportunity.id,
      type: 'field_evidence_recorded',
      message: 'Field evidence recorded',
      timestamp: '2026-04-28T03:00:00.000Z',
      meta: {},
    });
    const payload = fieldEvidencePayloadSchema.parse({
      field: 'scores.relayScore',
      note: 'Reviewed latest relay pack.',
    });

    const result = await recordFieldEvidenceForApi(opportunity.id, payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'field_evidence_recorded',
      message: expect.stringContaining('Relay score'),
      meta: expect.objectContaining({
        source: 'manual_field_evidence',
        field: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
        confidence: 'confirmed',
        note: 'Reviewed latest relay pack.',
      }),
    }));
    expect(mocks.recordOpportunityFieldEvidence).toHaveBeenCalledWith(expect.objectContaining({
      id: 'field-evidence-event-1',
      opportunityId: opportunity.id,
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_field_evidence',
      confidence: 'confirmed',
      note: 'Reviewed latest relay pack.',
    }));
    expect(result.status).toBe('recorded');
  });

  it('records field evidence batches with item-level idempotency', async () => {
    const { fieldEvidenceBatchPayloadSchema } = await import('../server/validation');
    const { recordFieldEvidenceBatchForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.listOpportunityEvents.mockResolvedValue([
      {
        id: 'field-evidence-existing',
        opportunityId: opportunity.id,
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-04-28T02:00:00.000Z',
        meta: {
          batchId: 'batch-1',
          clientId: 'draft-existing',
          field: 'scores.relayScore',
        },
      },
    ]);
    mocks.appendOpportunityEvent.mockResolvedValueOnce({
      id: 'field-evidence-event-2',
      opportunityId: opportunity.id,
      type: 'field_evidence_recorded',
      message: 'Field evidence recorded',
      timestamp: '2026-04-28T03:00:00.000Z',
      meta: {},
    });
    const payload = fieldEvidenceBatchPayloadSchema.parse({
      batchId: 'batch-1',
      items: [
        {
          clientId: 'draft-existing',
          field: 'scores.relayScore',
          note: 'Already recorded.',
        },
        {
          clientId: 'draft-new',
          field: 'policyStatus',
          source: 'manual_review',
          confidence: 'confirmed',
          value: 'approved',
          note: 'Policy reviewed.',
        },
      ],
    });

    const result = await recordFieldEvidenceBatchForApi(opportunity.id, payload);

    expect(result).toMatchObject({
      status: 'recorded',
      total: 2,
      recorded: 1,
      duplicates: 1,
      failed: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        clientId: 'draft-existing',
        status: 'duplicate',
        event: expect.objectContaining({ id: 'field-evidence-existing' }),
      }),
      expect.objectContaining({
        clientId: 'draft-new',
        status: 'recorded',
        event: expect.objectContaining({ id: 'field-evidence-event-2' }),
      }),
    ]);
    expect(mocks.appendOpportunityEvent).toHaveBeenCalledTimes(1);
    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'field_evidence_recorded',
      meta: expect.objectContaining({
        batchId: 'batch-1',
        clientId: 'draft-new',
        field: 'policyStatus',
        source: 'manual_review',
      }),
    }));
    expect(mocks.recordOpportunityFieldEvidence).toHaveBeenCalledTimes(1);
    expect(mocks.recordOpportunityFieldEvidence).toHaveBeenCalledWith(expect.objectContaining({
      id: 'field-evidence-event-2',
      field: 'policyStatus',
      value: 'approved',
      note: 'Policy reviewed.',
    }));
  });

  it('invalidates manual field evidence with an audit event', async () => {
    const { fieldEvidenceInvalidationPayloadSchema } = await import('../server/validation');
    const { invalidateFieldEvidenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.listOpportunityEvents.mockResolvedValue([
      {
        id: 'field-evidence-event-1',
        opportunityId: opportunity.id,
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-04-28T03:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          label: 'Relay score',
          kind: 'score',
          source: 'manual_review',
          confidence: 'confirmed',
        },
      },
    ]);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'field-evidence-invalidated-1',
      opportunityId: opportunity.id,
      type: 'field_evidence_invalidated',
      message: 'Field evidence invalidated',
      timestamp: '2026-04-28T03:05:00.000Z',
      meta: {},
    });
    const payload = fieldEvidenceInvalidationPayloadSchema.parse({
      reason: 'Manual review superseded this evidence.',
    });

    const result = await invalidateFieldEvidenceForApi(opportunity.id, 'field-evidence-event-1', payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'field_evidence_invalidated',
      message: expect.stringContaining('manual evidence'),
      meta: expect.objectContaining({
        evidenceId: 'field-evidence-event-1',
        reason: 'Manual review superseded this evidence.',
        field: 'scores.relayScore',
        source: 'manual_review',
      }),
    }));
    expect(mocks.updateOpportunityFieldEvidenceStatus).toHaveBeenCalledWith(
      opportunity.id,
      'field-evidence-event-1',
      'invalidated',
      'field-evidence-invalidated-1',
      '2026-04-28T03:05:00.000Z',
    );
    expect(result.status).toBe('invalidated');
    expect(result.event?.type).toBe('field_evidence_invalidated');
  });

  it('restores invalidated manual field evidence with an audit event', async () => {
    const { fieldEvidenceRestorationPayloadSchema } = await import('../server/validation');
    const { restoreFieldEvidenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.listOpportunityEvents.mockResolvedValue([
      {
        id: 'field-evidence-event-1',
        opportunityId: opportunity.id,
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-04-28T03:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          label: 'Relay score',
          kind: 'score',
          source: 'manual_review',
          confidence: 'confirmed',
        },
      },
      {
        id: 'field-evidence-invalidated-1',
        opportunityId: opportunity.id,
        type: 'field_evidence_invalidated',
        message: 'Field evidence invalidated',
        timestamp: '2026-04-28T03:05:00.000Z',
        meta: {
          evidenceId: 'field-evidence-event-1',
          reason: 'Superseded.',
        },
      },
    ]);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'field-evidence-restored-1',
      opportunityId: opportunity.id,
      type: 'field_evidence_restored',
      message: 'Field evidence restored',
      timestamp: '2026-04-28T03:10:00.000Z',
      meta: {},
    });
    const payload = fieldEvidenceRestorationPayloadSchema.parse({
      reason: 'Manual review restored this evidence.',
    });

    const result = await restoreFieldEvidenceForApi(opportunity.id, 'field-evidence-event-1', payload);

    expect(mocks.appendOpportunityEvent).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({
      type: 'field_evidence_restored',
      message: expect.stringContaining('manual evidence'),
      meta: expect.objectContaining({
        evidenceId: 'field-evidence-event-1',
        reason: 'Manual review restored this evidence.',
        field: 'scores.relayScore',
        source: 'manual_review',
      }),
    }));
    expect(mocks.updateOpportunityFieldEvidenceStatus).toHaveBeenCalledWith(
      opportunity.id,
      'field-evidence-event-1',
      'active',
      'field-evidence-restored-1',
      '2026-04-28T03:10:00.000Z',
    );
    expect(result.status).toBe('restored');
    expect(result.event?.type).toBe('field_evidence_restored');
  });

  it('updates field evidence status in bulk with item-level results', async () => {
    const { fieldEvidenceBulkStatusPayloadSchema } = await import('../server/validation');
    const { updateFieldEvidenceBulkStatusForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.listOpportunityEvents.mockResolvedValue([
      {
        id: 'field-evidence-event-1',
        opportunityId: opportunity.id,
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-04-28T03:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          label: 'Relay score',
          kind: 'score',
          source: 'manual_review',
          confidence: 'confirmed',
        },
      },
    ]);
    mocks.appendOpportunityEvent.mockResolvedValue({
      id: 'field-evidence-invalidated-1',
      opportunityId: opportunity.id,
      type: 'field_evidence_invalidated',
      message: 'Field evidence invalidated',
      timestamp: '2026-04-28T03:05:00.000Z',
      meta: {},
    });
    const payload = fieldEvidenceBulkStatusPayloadSchema.parse({
      action: 'invalidate',
      reason: 'Bulk review superseded selected evidence.',
      items: [
        {
          opportunityId: opportunity.id,
          evidenceId: 'field-evidence-event-1',
          field: 'scores.relayScore',
          source: 'manual_review',
        },
        {
          opportunityId: opportunity.id,
          evidenceId: 'missing-evidence',
          field: 'thesis',
          source: 'manual_review',
        },
      ],
    });

    const result = await updateFieldEvidenceBulkStatusForApi(payload);

    expect(result).toMatchObject({
      status: 'completed',
      action: 'invalidate',
      total: 2,
      invalidated: 1,
      restored: 0,
      notFound: 1,
      failed: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        evidenceId: 'field-evidence-event-1',
        status: 'invalidated',
        event: expect.objectContaining({ id: 'field-evidence-invalidated-1' }),
      }),
      expect.objectContaining({
        evidenceId: 'missing-evidence',
        status: 'not_found',
      }),
    ]);
    expect(mocks.updateOpportunityFieldEvidenceStatus).toHaveBeenCalledTimes(1);
  });

  it('surfaces manual field evidence events in the field evidence summary', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');
    mocks.listOpportunityEvents.mockImplementation(async (_opportunityId: string, _limit = 50, types = []) => (
      types.includes('field_evidence_recorded')
        ? [{
            id: 'field-evidence-event-1',
            opportunityId: 'opp-service-1',
            type: 'field_evidence_recorded',
            message: 'Field evidence recorded',
            timestamp: '2026-04-28T03:00:00.000Z',
            meta: {
              field: 'scores.relayScore',
              label: 'Relay score',
              kind: 'score',
              source: 'manual_review',
              confidence: 'confirmed',
              note: 'Verified against latest evidence pack.',
            },
          }]
        : []
    ));

    const summary = await buildOpportunitySummary(makeOpportunity());

    expect(summary.fieldEvidence?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'field-evidence-event-1',
        kind: 'score',
        field: 'scores.relayScore',
        source: 'manual_review',
        confidence: 'confirmed',
        note: 'Verified against latest evidence pack.',
      }),
    ]));
  });

  it('prefers canonical field evidence rows over legacy event reconstruction', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');
    mocks.listOpportunityFieldEvidence.mockResolvedValue([
      {
        id: 'field-evidence-event-1',
        opportunityId: 'opp-service-1',
        field: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
        source: 'canonical_review',
        confidence: 'confirmed',
        status: 'active',
        note: 'Canonical row wins.',
        observedAt: '2026-04-28T03:10:00.000Z',
        recordedAt: '2026-04-28T03:00:00.000Z',
        updatedAt: '2026-04-28T03:10:00.000Z',
        createdEventId: 'field-evidence-event-1',
      },
    ]);
    mocks.listOpportunityEvents.mockImplementation(async (_opportunityId: string, _limit = 50, types = []) => (
      types.includes('field_evidence_recorded')
        ? [{
            id: 'field-evidence-event-1',
            opportunityId: 'opp-service-1',
            type: 'field_evidence_recorded',
            message: 'Field evidence recorded',
            timestamp: '2026-04-28T03:00:00.000Z',
            meta: {
              field: 'scores.relayScore',
              label: 'Relay score',
              kind: 'score',
              source: 'legacy_event',
              confidence: 'confirmed',
              note: 'Legacy event fallback.',
            },
          }]
        : []
    ));

    const summary = await buildOpportunitySummary(makeOpportunity());

    expect(summary.fieldEvidence?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'field-evidence-event-1',
        source: 'canonical_review',
        note: 'Canonical row wins.',
        auditEventId: 'field-evidence-event-1',
      }),
    ]));
    expect(summary.fieldEvidence?.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'field-evidence-event-1',
        source: 'legacy_event',
      }),
    ]));
  });

  it('hides invalidated manual field evidence from the active summary', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');
    mocks.listOpportunityEvents.mockImplementation(async (_opportunityId: string, _limit = 50, types = []) => (
      types.includes('field_evidence_recorded')
        ? [
            {
              id: 'field-evidence-event-1',
              opportunityId: 'opp-service-1',
              type: 'field_evidence_recorded',
              message: 'Field evidence recorded',
              timestamp: '2026-04-28T03:00:00.000Z',
              meta: {
                field: 'scores.relayScore',
                label: 'Relay score',
                kind: 'score',
                source: 'manual_review',
                confidence: 'confirmed',
                note: 'Verified against latest evidence pack.',
              },
            },
            {
              id: 'field-evidence-invalidated-1',
              opportunityId: 'opp-service-1',
              type: 'field_evidence_invalidated',
              message: 'Field evidence invalidated',
              timestamp: '2026-04-28T03:05:00.000Z',
              meta: {
                evidenceId: 'field-evidence-event-1',
                reason: 'Superseded.',
              },
            },
          ]
        : []
    ));

    const summary = await buildOpportunitySummary(makeOpportunity());

    expect(summary.fieldEvidence?.invalidated).toBe(1);
    expect(summary.fieldEvidence?.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'field-evidence-event-1' }),
    ]));
  });

  it('surfaces restored manual field evidence in the active summary', async () => {
    const { buildOpportunitySummary } = await import('../server/services/opportunity-service');
    mocks.listOpportunityEvents.mockImplementation(async (_opportunityId: string, _limit = 50, types = []) => (
      types.includes('field_evidence_recorded')
        ? [
            {
              id: 'field-evidence-event-1',
              opportunityId: 'opp-service-1',
              type: 'field_evidence_recorded',
              message: 'Field evidence recorded',
              timestamp: '2026-04-28T03:00:00.000Z',
              meta: {
                field: 'scores.relayScore',
                label: 'Relay score',
                kind: 'score',
                source: 'manual_review',
                confidence: 'confirmed',
                note: 'Verified against latest evidence pack.',
              },
            },
            {
              id: 'field-evidence-invalidated-1',
              opportunityId: 'opp-service-1',
              type: 'field_evidence_invalidated',
              message: 'Field evidence invalidated',
              timestamp: '2026-04-28T03:05:00.000Z',
              meta: {
                evidenceId: 'field-evidence-event-1',
                reason: 'Superseded.',
              },
            },
            {
              id: 'field-evidence-restored-1',
              opportunityId: 'opp-service-1',
              type: 'field_evidence_restored',
              message: 'Field evidence restored',
              timestamp: '2026-04-28T03:10:00.000Z',
              meta: {
                evidenceId: 'field-evidence-event-1',
                reason: 'Manual review restored this evidence.',
              },
            },
          ]
        : []
    ));

    const summary = await buildOpportunitySummary(makeOpportunity());

    expect(summary.fieldEvidence?.invalidated).toBeUndefined();
    expect(summary.fieldEvidence?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'field-evidence-event-1',
        source: 'manual_review',
      }),
    ]));
  });


  it('does not invalidate missing manual field evidence', async () => {
    const { fieldEvidenceInvalidationPayloadSchema } = await import('../server/validation');
    const { invalidateFieldEvidenceForApi } = await import('../server/services/opportunity-service');
    const opportunity = makeOpportunity({ latestMissionId: undefined });
    mocks.getOpportunity.mockResolvedValue(opportunity);
    mocks.listOpportunityEvents.mockResolvedValue([]);
    const payload = fieldEvidenceInvalidationPayloadSchema.parse({
      reason: 'Could not verify source.',
    });

    const result = await invalidateFieldEvidenceForApi(opportunity.id, 'missing-evidence', payload);

    expect(result.status).toBe('evidence_not_found');
    expect(mocks.appendOpportunityEvent).not.toHaveBeenCalled();
  });

  it('does not record pre-trade confirmations for missing opportunities', async () => {
    const { preTradeConfirmationPayloadSchema } = await import('../server/validation');
    const { recordPreTradeConfirmationForApi } = await import('../server/services/opportunity-service');
    mocks.getOpportunity.mockResolvedValue(null);
    const payload = preTradeConfirmationPayloadSchema.parse({
      itemId: 'risk_reward',
      label: 'Risk/reward',
      status: 'warn',
      completed: false,
    });

    const result = await recordPreTradeConfirmationForApi('missing-opp', payload);

    expect(result.status).toBe('not_found');
    expect(mocks.appendOpportunityEvent).not.toHaveBeenCalled();
  });

  it('does not record catalyst reminder preferences for missing opportunities', async () => {
    const { catalystReminderPreferencePayloadSchema } = await import('../server/validation');
    const { recordCatalystReminderPreferenceForApi } = await import('../server/services/opportunity-service');
    mocks.getOpportunity.mockResolvedValue(null);
    const payload = catalystReminderPreferencePayloadSchema.parse({
      reminderId: 'missing:Earnings:2026-05-01:0',
      catalystLabel: 'Earnings',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'acknowledge',
    });

    const result = await recordCatalystReminderPreferenceForApi('missing-opp', payload);

    expect(result.status).toBe('not_found');
    expect(mocks.appendOpportunityEvent).not.toHaveBeenCalled();
  });

  it('requires a snooze date for catalyst reminder snooze preferences', async () => {
    const { catalystReminderPreferencePayloadSchema } = await import('../server/validation');

    const parsed = catalystReminderPreferencePayloadSchema.safeParse({
      reminderId: 'opp:Earnings:2026-05-01:0',
      catalystLabel: 'Earnings',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'snooze',
    });

    if (parsed.success) throw new Error('expected snooze payload validation to fail');
    expect(parsed.error.issues[0]?.path).toEqual(['snoozedUntil']);
  });

  it('requires lead days for catalyst reminder subscription preferences', async () => {
    const { catalystReminderPreferencePayloadSchema } = await import('../server/validation');

    const parsed = catalystReminderPreferencePayloadSchema.safeParse({
      reminderId: 'opp:Earnings:2026-05-01:0',
      catalystLabel: 'Earnings',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'subscribe',
    });

    if (parsed.success) throw new Error('expected subscription payload validation to fail');
    expect(parsed.error.issues[0]?.path).toEqual(['subscriptionLeadDays']);
  });

  it('rejects active status without active stage on update', async () => {
    const { updateOpportunityPayloadSchema } = await import('../server/validation');
    const { updateOpportunityForApi } = await import('../server/services/opportunity-service');
    mocks.getOpportunity.mockResolvedValueOnce(makeOpportunity({
      stage: 'tracking',
      status: 'watching',
      latestMissionId: undefined,
    }));
    const payload = updateOpportunityPayloadSchema.parse({
      status: 'active',
    });

    const result = await updateOpportunityForApi('opp-service-1', payload);

    expect(result.status).toBe('invalid');
    expect(result.details).toEqual(expect.arrayContaining([
      { path: 'stage', message: 'active status requires active stage' },
    ]));
    expect(mocks.updateOpportunity).not.toHaveBeenCalled();
  });

  it('rejects type-mismatched profile patches on update', async () => {
    const { updateOpportunityPayloadSchema } = await import('../server/validation');
    const { updateOpportunityForApi } = await import('../server/services/opportunity-service');
    mocks.getOpportunity.mockResolvedValueOnce(makeOpportunity({
      type: 'proxy_narrative',
      proxyTicker: 'XYZ',
      latestMissionId: undefined,
    }));
    const payload = updateOpportunityPayloadSchema.parse({
      heatProfile: {
        temperature: 'warming',
        bottleneckTickers: ['MU'],
      },
    });

    const result = await updateOpportunityForApi('opp-service-1', payload);

    expect(result.status).toBe('invalid');
    expect(result.details).toEqual(expect.arrayContaining([
      { path: 'heatProfile', message: 'proxy_narrative opportunities cannot use heatProfile' },
    ]));
    expect(mocks.updateOpportunity).not.toHaveBeenCalled();
  });
});
