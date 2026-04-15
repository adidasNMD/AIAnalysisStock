import { describe, expect, it } from 'vitest';
import { buildOpportunityInbox } from '../workflows/opportunity-ranking';
import type { OpportunitySummaryRecord } from '../workflows/types';

function createOpportunity(overrides: Partial<OpportunitySummaryRecord> = {}): OpportunitySummaryRecord {
  return {
    id: 'opp_1',
    type: 'relay_chain',
    stage: 'tracking',
    status: 'watching',
    title: 'AI Infra Relay',
    query: 'AI Infra',
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
    heatProfile: {
      temperature: 'warming',
      bottleneckTickers: ['MU'],
      laggardTickers: ['SNDK'],
      junkTickers: [],
      breadthScore: 66,
      validationStatus: 'forming',
      validationSummary: 'AI Infra 传导正在形成。',
      edgeCount: 2,
      edges: [
        {
          id: 'leader_to_bottleneck:CRWV:MU',
          from: 'CRWV',
          to: 'MU',
          weight: 78,
          kind: 'leader_to_bottleneck',
          reason: 'CRWV 温度传给 MU。',
        },
        {
          id: 'bottleneck_to_laggard:MU:SNDK',
          from: 'MU',
          to: 'SNDK',
          weight: 74,
          kind: 'bottleneck_to_laggard',
          reason: 'MU 再传到 SNDK。',
        },
      ],
      leaderHealth: 'CRWV 提供当前温度计',
      transmissionNote: 'relay forming',
    },
    catalystCalendar: [],
    latestEventType: 'updated',
    latestEventMessage: 'updated',
    latestEventAt: '2026-04-15T00:00:00.000Z',
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildOpportunityInbox', () => {
  it('puts degraded opportunities at the top', () => {
    const inbox = buildOpportunityInbox([
      createOpportunity({
        id: 'degraded',
        status: 'degraded',
        latestEventType: 'leader_broken',
        latestEventMessage: 'Leader broke',
      }),
      createOpportunity({
        id: 'normal',
      }),
    ], 10, Date.parse('2026-04-15T00:00:00.000Z'));

    expect(inbox[0]?.id).toBe('degraded');
    expect(inbox[0]?.recommendedAction).toBe('review');
    expect(inbox[0]?.inboxReasons[0]?.code).toBe('degraded');
  });

  it('ranks near catalysts ahead of generic watch items', () => {
    const inbox = buildOpportunityInbox([
      createOpportunity({
        id: 'catalyst',
        type: 'ipo_spinout',
        stage: 'ready',
        catalystCalendar: [
          { label: '正式交易窗口确认', status: 'upcoming', dueAt: '2026-04-18' },
        ],
      }),
      createOpportunity({
        id: 'watch',
        relayTickers: [],
        relatedTickers: [],
        scores: {
          purityScore: 50,
          scarcityScore: 50,
          tradeabilityScore: 50,
          relayScore: 40,
          catalystScore: 40,
          policyScore: 40,
        },
        heatProfile: undefined,
      }),
    ], 10, Date.parse('2026-04-15T00:00:00.000Z'));

    expect(inbox[0]?.id).toBe('catalyst');
    expect(inbox[0]?.inboxReasons.map((reason) => reason.code)).toContain('catalyst_due');
  });

  it('marks opportunities without missions as analyze candidates', () => {
    const inbox = buildOpportunityInbox([
      createOpportunity({
        id: 'fresh',
        latestMission: undefined,
      }),
    ], 10, Date.parse('2026-04-15T00:00:00.000Z'));

    expect(inbox[0]?.recommendedAction).toBe('analyze');
    expect(inbox[0]?.inboxReasons.map((reason) => reason.code)).toContain('analysis_missing');
  });

  it('surfaces relay inflections as actionable reasons', () => {
    const inbox = buildOpportunityInbox([
      createOpportunity({
        id: 'relay_shift',
        heatInflection: {
          kind: 'confirmation',
          summary: '传导链从 forming 升级到 confirmed。',
          happenedAt: '2026-04-16T00:00:00.000Z',
          scoreDelta: 14,
          breadthDelta: 18,
          fromStatus: 'forming',
          toStatus: 'confirmed',
        },
      }),
    ], 10, Date.parse('2026-04-15T00:00:00.000Z'));

    expect(inbox[0]?.inboxReasons.map((reason) => reason.code)).toContain('relay_inflecting');
    expect(inbox[0]?.recommendedAction).toBe('analyze');
  });

  it('prioritizes recent review signals ahead of generic analyze candidates', () => {
    const inbox = buildOpportunityInbox([
      createOpportunity({
        id: 'review_now',
        recentActionTimeline: [
          {
            id: 'timeline_1',
            timestamp: '2026-04-15T08:00:00.000Z',
            kind: 'opportunity',
            category: 'thesis',
            source: 'system',
            decision: 'degrade',
            driver: 'heat',
            label: 'Leader broken',
            detail: 'Leader broke the relay chain',
            reasonSummary: 'Validation confirmed -> broken · Relay -14',
            tone: 'negative',
          },
        ],
      }),
      createOpportunity({
        id: 'analyze_later',
        latestMission: undefined,
      }),
    ], 10, Date.parse('2026-04-15T12:00:00.000Z'));

    expect(inbox[0]?.id).toBe('review_now');
    expect(inbox[0]?.recommendedAction).toBe('review');
    expect(inbox[0]?.inboxReasons.map((reason) => reason.code)).toContain('review_signal');
    expect(inbox[0]?.actionDecision).toBe('degrade');
    expect(inbox[0]?.actionDriver).toBe('heat');
  });

  it('surfaces latest action descriptor for today feed cards', () => {
    const inbox = buildOpportunityInbox([
      createOpportunity({
        id: 'act_now',
        recentActionTimeline: [
          {
            id: 'timeline_2',
            timestamp: '2026-04-15T09:30:00.000Z',
            kind: 'opportunity',
            category: 'signal',
            source: 'automation',
            decision: 'act',
            driver: 'calendar',
            label: 'Catalyst due',
            detail: 'Catalyst due soon',
            reasonSummary: '正式交易窗口确认 · 2026-04-18',
            tone: 'warning',
          },
        ],
      }),
    ], 10, Date.parse('2026-04-15T12:00:00.000Z'));

    expect(inbox[0]?.inboxReasons.map((reason) => reason.code)).toContain('action_signal');
    expect(inbox[0]?.actionLabel).toBe('Catalyst due');
    expect(inbox[0]?.actionDetail).toContain('正式交易窗口确认');
    expect(inbox[0]?.actionDecision).toBe('act');
    expect(inbox[0]?.actionDriver).toBe('calendar');
  });
});
