import { describe, expect, it } from 'vitest';
import { buildOpportunityBoardHealthMap } from '../workflows/opportunity-board-health';
import type { OpportunitySummaryRecord } from '../workflows/types';

function createOpportunity(overrides: Partial<OpportunitySummaryRecord> = {}): OpportunitySummaryRecord {
  return {
    id: 'opp_board_1',
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
      edges: [],
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

describe('buildOpportunityBoardHealthMap', () => {
  it('summarizes relay chain validation states', () => {
    const boardHealth = buildOpportunityBoardHealthMap([
      createOpportunity({
        id: 'relay_confirmed',
        heatProfile: {
          temperature: 'hot',
          bottleneckTickers: ['MU'],
          laggardTickers: ['SNDK'],
          junkTickers: [],
          breadthScore: 84,
          validationStatus: 'confirmed',
          validationSummary: '传导已确认。',
          edgeCount: 2,
          edges: [],
        },
      }),
      createOpportunity({
        id: 'relay_fragile',
        heatProfile: {
          temperature: 'warming',
          bottleneckTickers: ['MU'],
          laggardTickers: ['SNDK'],
          junkTickers: [],
          breadthScore: 60,
          validationStatus: 'fragile',
          validationSummary: '传导偏脆弱。',
          edgeCount: 2,
          edges: [],
        },
      }),
    ]);

    expect(boardHealth.relay_chain.headline).toContain('Confirmed 1');
    expect(boardHealth.relay_chain.metrics.find((metric) => metric.key === 'confirmed')?.value).toBe(1);
    expect(boardHealth.relay_chain.metrics.find((metric) => metric.key === 'fragile')?.value).toBe(1);
    expect(boardHealth.relay_chain.metrics.find((metric) => metric.key === 'confirmed')?.opportunityIds).toEqual(['relay_confirmed']);
  });

  it('counts proxy ignition and retreat using backend opportunity signals', () => {
    const boardHealth = buildOpportunityBoardHealthMap([
      createOpportunity({
        id: 'proxy_ignited',
        type: 'proxy_narrative',
        proxyProfile: {
          legitimacyScore: 78,
          legibilityScore: 72,
          tradeabilityScore: 66,
          ruleStatus: 'commercialized',
        },
        scores: {
          purityScore: 80,
          scarcityScore: 74,
          tradeabilityScore: 68,
          relayScore: 22,
          catalystScore: 58,
          policyScore: 82,
        },
      }),
      createOpportunity({
        id: 'proxy_retreat',
        type: 'proxy_narrative',
        status: 'degraded',
        latestEventType: 'thesis_degraded',
        proxyProfile: {
          legitimacyScore: 60,
          legibilityScore: 65,
          tradeabilityScore: 54,
        },
      }),
    ]);

    expect(boardHealth.proxy_narrative.metrics.find((metric) => metric.key === 'ignited')?.value).toBe(1);
    expect(boardHealth.proxy_narrative.metrics.find((metric) => metric.key === 'retreat')?.value).toBe(1);
    expect(boardHealth.proxy_narrative.metrics.find((metric) => metric.key === 'rule_named')?.value).toBe(1);
    expect(boardHealth.proxy_narrative.metrics.find((metric) => metric.key === 'retreat')?.opportunityIds).toEqual(['proxy_retreat']);
  });

  it('tracks new-code trading windows and supply overhang', () => {
    const boardHealth = buildOpportunityBoardHealthMap([
      createOpportunity({
        id: 'ipo_ready',
        type: 'ipo_spinout',
        stage: 'ready',
        catalystCalendar: [
          {
            label: '正式交易窗口确认',
            status: 'upcoming',
            dueAt: '2026-04-18',
          },
        ],
        ipoProfile: {
          retainedStakePercent: 19.9,
          lockupDate: '2026-08-18',
        },
      }),
      createOpportunity({
        id: 'ipo_pending',
        type: 'ipo_spinout',
        stage: 'tracking',
        ipoProfile: {},
      }),
    ]);

    expect(boardHealth.ipo_spinout.metrics.find((metric) => metric.key === 'window_open')?.value).toBe(1);
    expect(boardHealth.ipo_spinout.metrics.find((metric) => metric.key === 'overhang')?.value).toBe(1);
    expect(boardHealth.ipo_spinout.metrics.find((metric) => metric.key === 'first_earnings_pending')?.value).toBe(2);
    expect(boardHealth.ipo_spinout.metrics.find((metric) => metric.key === 'window_open')?.opportunityIds).toEqual(['ipo_ready']);
  });
});
