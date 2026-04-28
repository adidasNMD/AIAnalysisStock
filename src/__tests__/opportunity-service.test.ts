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
  getMission: vi.fn(),
  getMissionFromIndex: vi.fn(),
  getOpportunity: vi.fn(),
  getOpportunityHeatHistory: vi.fn(),
  listMissionEvents: vi.fn(),
  listMissionRuns: vi.fn(),
  listOpportunities: vi.fn(),
  listOpportunityEvents: vi.fn(),
  updateOpportunity: vi.fn(),
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
  getMission: mocks.getMission,
  getMissionFromIndex: mocks.getMissionFromIndex,
  getOpportunity: mocks.getOpportunity,
  getOpportunityHeatHistory: mocks.getOpportunityHeatHistory,
  listMissionEvents: mocks.listMissionEvents,
  listMissionRuns: mocks.listMissionRuns,
  listOpportunities: mocks.listOpportunities,
  listOpportunityEvents: mocks.listOpportunityEvents,
  updateOpportunity: mocks.updateOpportunity,
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
