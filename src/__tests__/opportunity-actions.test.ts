import { describe, expect, it } from 'vitest';
import {
  buildOpportunityActionTimeline,
  buildOpportunitySuggestedMission,
  buildOpportunitySuggestedMissions,
} from '../workflows/opportunity-actions';
import type { MissionEventRecord } from '../workflows/mission-events';
import type { OpportunityEventRecord, OpportunitySummaryRecord } from '../workflows/types';

function createOpportunity(overrides: Partial<OpportunitySummaryRecord> = {}): OpportunitySummaryRecord {
  return {
    id: 'opp_actions_1',
    type: 'relay_chain',
    stage: 'tracking',
    status: 'watching',
    title: 'AI Infra Relay',
    query: 'AI Infra',
    leaderTicker: 'CRWV',
    relatedTickers: ['MU'],
    relayTickers: ['SNDK'],
    scores: {
      purityScore: 58,
      scarcityScore: 52,
      tradeabilityScore: 74,
      relayScore: 84,
      catalystScore: 64,
      policyScore: 38,
    },
    heatProfile: {
      temperature: 'warming',
      bottleneckTickers: ['MU'],
      laggardTickers: ['SNDK'],
      junkTickers: [],
      breadthScore: 72,
      validationStatus: 'forming',
      validationSummary: 'AI Infra 传导正在形成。',
      edgeCount: 2,
      edges: [],
    },
    catalystCalendar: [],
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildOpportunitySuggestedMission', () => {
  it('builds a multi-ticker relay analysis suggestion', () => {
    const suggestion = buildOpportunitySuggestedMission(createOpportunity({
      heatInflection: {
        kind: 'confirmation',
        summary: '传导链从 forming 升级到 confirmed。',
        happenedAt: '2026-04-16T00:00:00.000Z',
        scoreDelta: 12,
        breadthDelta: 15,
        fromStatus: 'forming',
        toStatus: 'confirmed',
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU', 'AVGO'],
        laggardTickers: ['SNDK', 'WOLF'],
        junkTickers: [],
        breadthScore: 84,
        validationStatus: 'confirmed',
        validationSummary: 'AI Infra 传导已确认。',
        edgeCount: 4,
        edges: [],
      },
      status: 'ready',
    }));

    expect(suggestion.mode).toBe('analyze');
    expect(suggestion.id).toBe('relay_chain_deep');
    expect(suggestion.depth).toBe('deep');
    expect(suggestion.tickers).toEqual(expect.arrayContaining(['CRWV', 'MU', 'AVGO', 'SNDK', 'WOLF']));
  });

  it('builds multiple mission templates for relay opportunities', () => {
    const suggestions = buildOpportunitySuggestedMissions(createOpportunity());

    expect(suggestions.length).toBeGreaterThan(1);
    expect(suggestions[0]?.id).toBe('relay_chain_map');
    expect(suggestions[1]?.id).toBe('relay_chain_deep');
  });

  it('prefers review template when opportunity is degraded', () => {
    const suggestion = buildOpportunitySuggestedMission(createOpportunity({
      status: 'degraded',
    }));

    expect(suggestion.id).toBe('relay_chain_review');
    expect(suggestion.mode).toBe('review');
  });
});

describe('buildOpportunityActionTimeline', () => {
  it('merges opportunity events and mission events into a reverse-chronological timeline', () => {
    const opportunityEvents: OpportunityEventRecord[] = [
      {
        id: 'oe_1',
        opportunityId: 'opp_actions_1',
        type: 'relay_triggered',
        message: 'Relay chain triggered into SNDK',
        timestamp: '2026-04-16T10:00:00.000Z',
        meta: {
          leaderTicker: 'CRWV',
          laggardTickers: ['SNDK'],
          breadthScore: 76,
          validationStatus: 'confirmed',
        },
      },
    ];
    const missionEvents: MissionEventRecord[] = [
      {
        id: 'me_1',
        missionId: 'mission_1',
        type: 'completed',
        message: 'Mission completed successfully',
        timestamp: '2026-04-16T11:00:00.000Z',
      },
    ];

    const timeline = buildOpportunityActionTimeline(opportunityEvents, missionEvents, 5);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.kind).toBe('mission');
    expect(timeline[0]?.label).toBe('Mission completed');
    expect(timeline[0]?.source).toBe('system');
    expect(timeline[0]?.category).toBe('execution');
    expect(timeline[0]?.decision).toBe('review');
    expect(timeline[0]?.driver).toBe('execution');
    expect(timeline[1]?.kind).toBe('opportunity');
    expect(timeline[1]?.category).toBe('signal');
    expect(timeline[1]?.decision).toBe('act');
    expect(timeline[1]?.driver).toBe('heat');
    expect(timeline[1]?.reasonSummary).toContain('Leader');
  });

  it('maps pre-trade confirmation events into manual review timeline entries', () => {
    const opportunityEvents: OpportunityEventRecord[] = [
      {
        id: 'oe_pretrade_1',
        opportunityId: 'opp_actions_1',
        type: 'pretrade_confirmed',
        message: 'Pre-trade check confirmed: Catalyst window for AI Infra Relay',
        timestamp: '2026-04-16T12:00:00.000Z',
        meta: {
          status: 'block',
          actionKind: 'fill_date',
          catalystUrgency: 'missing_date',
          evidence: 'Company IR calendar pending',
        },
      },
    ];

    const [entry] = buildOpportunityActionTimeline(opportunityEvents, [], 5);

    expect(entry).toMatchObject({
      kind: 'opportunity',
      category: 'execution',
      source: 'manual',
      decision: 'review',
      driver: 'manual',
      label: 'Pre-trade confirmed',
      tone: 'positive',
    });
    expect(entry?.reasonSummary).toContain('Status block');
    expect(entry?.reasonSummary).toContain('Company IR calendar pending');
  });

  it('maps catalyst reminder preference events into calendar timeline entries', () => {
    const opportunityEvents: OpportunityEventRecord[] = [
      {
        id: 'oe_reminder_1',
        opportunityId: 'opp_actions_1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder snoozed: Earnings for AI Infra Relay',
        timestamp: '2026-04-16T12:00:00.000Z',
        meta: {
          preference: 'snooze',
          catalystLabel: 'Earnings',
          urgency: 'soon',
          actionKind: 'prepare',
          snoozedUntil: '2026-04-17T12:00:00.000Z',
        },
      },
    ];

    const [entry] = buildOpportunityActionTimeline(opportunityEvents, [], 5);

    expect(entry).toMatchObject({
      kind: 'opportunity',
      category: 'calendar',
      source: 'manual',
      decision: 'review',
      driver: 'calendar',
      label: 'Catalyst reminder snoozed',
      tone: 'warning',
    });
    expect(entry?.reasonSummary).toContain('Catalyst Earnings');
    expect(entry?.reasonSummary).toContain('Until 2026-04-17T12:00:00.000Z');
  });

  it('maps catalyst reminder subscription events with lead days into calendar timeline entries', () => {
    const opportunityEvents: OpportunityEventRecord[] = [
      {
        id: 'oe_reminder_subscribe_1',
        opportunityId: 'opp_actions_1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder subscribed: Earnings for AI Infra Relay',
        timestamp: '2026-04-16T12:00:00.000Z',
        meta: {
          preference: 'subscribe',
          catalystLabel: 'Earnings',
          urgency: 'soon',
          actionKind: 'prepare',
          subscriptionLeadDays: 3,
        },
      },
    ];

    const [entry] = buildOpportunityActionTimeline(opportunityEvents, [], 5);

    expect(entry).toMatchObject({
      kind: 'opportunity',
      category: 'calendar',
      source: 'manual',
      decision: 'review',
      driver: 'calendar',
      label: 'Catalyst reminder subscribed',
      tone: 'positive',
    });
    expect(entry?.reasonSummary).toContain('Catalyst Earnings');
    expect(entry?.reasonSummary).toContain('Lead 3d');
  });
});
