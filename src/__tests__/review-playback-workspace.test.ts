import { describe, expect, it } from 'vitest';

import type { OpportunityReviewPlaybackPerformanceSummary } from '../../dashboard/src/api';
import { buildReviewPlaybackBacktestWorkspace } from '../../dashboard/src/pages/review-playback-workspace';

function makePerformance(
  overrides: Partial<OpportunityReviewPlaybackPerformanceSummary> = {},
): OpportunityReviewPlaybackPerformanceSummary {
  return {
    status: 'multi_opportunity',
    headline: 'Backtest ready',
    detail: '',
    nextStep: '',
    opportunityCount: 2,
    triggeredCatalysts: 1,
    pretradeBlockHit: false,
    pretradeBlockers: 0,
    riskEvents: 0,
    dataQuality: 'price_confirmed',
    notes: [],
    trades: [],
    position: {
      closedLegs: 1,
      partialLegs: 0,
      openLegs: 0,
      sizedLegs: 1,
      notes: [],
      exitAttributions: [],
      executionQuality: [],
      planRepairSuggestions: [],
      sizingRules: [],
    },
    riskBacktest: {
      verdict: 'favorable',
      label: 'Favorable',
      detail: '',
      sampleSize: 1,
      closedLegs: 1,
      pricedLegs: 1,
      oversizedLegs: 0,
      planRepairLegs: 0,
      executionIssueLegs: 0,
      notes: [],
      winRatePct: 100,
      avgReturnPct: 12,
    },
    strategyBacktest: {
      status: 'ready',
      headline: 'Ready',
      detail: '',
      filterLabel: 'Strategy Relay chain',
      totalStrategies: 1,
      coveredStrategies: 1,
      opportunityCount: 1,
      pricedLegs: 1,
      closedLegs: 1,
      notes: [],
      groups: [],
      bestGroup: {
        key: 'relay_chain',
        label: 'Relay chain',
        verdict: 'favorable',
        verdictLabel: 'Favorable',
        opportunityCount: 1,
        sampleSize: 1,
        closedLegs: 1,
        pricedLegs: 1,
        oversizedLegs: 0,
        planRepairLegs: 0,
        executionIssueLegs: 0,
        avgReturnPct: 12,
      },
    },
    ...overrides,
  };
}

describe('review playback backtest workspace', () => {
  it('marks favorable confirmed samples as ready to replay', () => {
    const workspace = buildReviewPlaybackBacktestWorkspace(makePerformance());

    expect(workspace).toEqual(expect.objectContaining({
      grade: 'ready',
      decision: 'Promote candidate',
      readinessScore: 98,
    }));
    expect(workspace.facts).toEqual(expect.arrayContaining([
      { label: 'Best family', value: 'Relay chain' },
      { label: 'Avg return', value: '+12%' },
    ]));
  });

  it('marks unfavorable or incomplete playbooks as repair first', () => {
    const workspace = buildReviewPlaybackBacktestWorkspace(makePerformance({
      pretradeBlockHit: true,
      pretradeBlockers: 2,
      riskBacktest: {
        ...makePerformance().riskBacktest,
        verdict: 'unfavorable',
        label: 'Unfavorable',
        oversizedLegs: 1,
        planRepairLegs: 1,
        executionIssueLegs: 1,
        avgReturnPct: -9,
      },
    }));

    expect(workspace.grade).toBe('repair');
    expect(workspace.decision).toBe('Do not scale');
    expect(workspace.alerts).toEqual(expect.arrayContaining([
      '2 pre-trade blockers still hit this slice.',
      '1 legs need plan repair metadata.',
    ]));
  });

  it('requires priced samples before making a backtest decision', () => {
    const workspace = buildReviewPlaybackBacktestWorkspace(makePerformance({
      dataQuality: 'event_only',
      riskBacktest: {
        ...makePerformance().riskBacktest,
        verdict: 'no_trades',
        label: 'No trades',
        sampleSize: 0,
        closedLegs: 0,
        pricedLegs: 0,
      },
    }));

    expect(workspace).toEqual(expect.objectContaining({
      grade: 'empty',
      readinessScore: 0,
      decision: 'Collect evidence',
    }));
  });
});
