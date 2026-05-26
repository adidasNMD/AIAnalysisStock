import { describe, expect, it } from 'vitest';
import { buildOpportunityDiff } from '../workflows/opportunity-diff';
import type { OpportunityRecord, OpportunitySnapshotRecord } from '../workflows/types';

function createOpportunity(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: 'opp_1',
    type: 'relay_chain',
    stage: 'tracking',
    status: 'watching',
    title: 'AI Infra Relay',
    query: 'AI infra',
    relatedTickers: ['MU'],
    relayTickers: ['SNDK'],
    scores: {
      purityScore: 58,
      scarcityScore: 52,
      tradeabilityScore: 74,
      relayScore: 70,
      catalystScore: 64,
      policyScore: 38,
    },
    heatProfile: {
      temperature: 'warming',
      bottleneckTickers: ['MU'],
      laggardTickers: ['SNDK'],
      junkTickers: [],
      breadthScore: 54,
      validationStatus: 'forming',
      validationSummary: 'AI Infra 传导正在形成。',
      edgeCount: 1,
      edges: [
        {
          id: 'leader_to_bottleneck:CRWV:MU',
          from: 'CRWV',
          to: 'MU',
          weight: 78,
          kind: 'leader_to_bottleneck',
          reason: 'CRWV 热量先传到 MU。',
        },
      ],
      transmissionNote: 'Relay is forming.',
    },
    catalystCalendar: [],
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

function createSnapshot(id: string, payload: OpportunityRecord): OpportunitySnapshotRecord {
  return {
    id,
    opportunityId: payload.id,
    createdAt: payload.updatedAt,
    payload,
  };
}

describe('buildOpportunityDiff', () => {
  it('flags relay and ticker changes as thesis-level differences', () => {
    const baseline = createSnapshot('snap_1', createOpportunity());
    const current = createSnapshot('snap_2', createOpportunity({
      stage: 'ready',
      status: 'ready',
      leaderTicker: 'CRWV',
      relatedTickers: ['MU', 'AVGO'],
      relayTickers: ['SNDK', 'WOLF'],
      scores: {
        purityScore: 58,
        scarcityScore: 52,
        tradeabilityScore: 74,
        relayScore: 86,
        catalystScore: 64,
        policyScore: 38,
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU', 'AVGO'],
        laggardTickers: ['SNDK', 'WOLF'],
        junkTickers: [],
        breadthScore: 82,
        validationStatus: 'confirmed',
        validationSummary: 'AI Infra 传导已确认。',
        edgeCount: 3,
        edges: [
          {
            id: 'leader_to_bottleneck:CRWV:MU',
            from: 'CRWV',
            to: 'MU',
            weight: 83,
            kind: 'leader_to_bottleneck',
            reason: 'CRWV 热量传给 MU。',
          },
          {
            id: 'leader_to_bottleneck:CRWV:AVGO',
            from: 'CRWV',
            to: 'AVGO',
            weight: 81,
            kind: 'leader_to_bottleneck',
            reason: 'CRWV 热量传给 AVGO。',
          },
          {
            id: 'bottleneck_to_laggard:MU:SNDK',
            from: 'MU',
            to: 'SNDK',
            weight: 77,
            kind: 'bottleneck_to_laggard',
            reason: 'MU 再传导到 SNDK。',
          },
        ],
        leaderHealth: 'CRWV still making higher highs.',
        transmissionNote: 'Relay confirmed into second layer.',
      },
      updatedAt: '2026-04-16T00:00:00.000Z',
    }));

    const diff = buildOpportunityDiff(current, baseline);

    expect(diff.changed).toBe(true);
    expect(diff.changedCategories).toEqual(expect.arrayContaining(['stage', 'status', 'tickers', 'heat']));
    expect(diff.summary).toContain('Stage');
    expect(diff.highlights.join(' ')).toContain('relay score 70 -> 86');
    expect(diff.highlights.join(' ')).toContain('validation forming -> confirmed');
  });

  it('returns stable summary when thesis fields are unchanged', () => {
    const baseline = createSnapshot('snap_1', createOpportunity());
    const current = createSnapshot('snap_2', createOpportunity({
      updatedAt: '2026-04-16T00:00:00.000Z',
    }));

    const diff = buildOpportunityDiff(current, baseline);

    expect(diff.changed).toBe(false);
    expect(diff.changeCount).toBe(0);
    expect(diff.summary).toBe('No thesis-level change vs previous snapshot');
  });

  it('surfaces IPO calendar and overhang changes', () => {
    const baseline = createSnapshot('snap_1', createOpportunity({
      type: 'ipo_spinout',
      stage: 'radar',
      scores: {
        purityScore: 78,
        scarcityScore: 70,
        tradeabilityScore: 62,
        relayScore: 48,
        catalystScore: 80,
        policyScore: 40,
      },
      heatProfile: undefined,
      ipoProfile: {
        officialTradingDate: '2026-04-01',
        retainedStakePercent: 19.9,
        evidence: {
          officialTradingDate: {
            source: 'Exchange notice',
            confidence: 'confirmed',
          },
        },
      },
      supplyOverhang: 'Parent still holds 19.9%',
    }));
    const current = createSnapshot('snap_2', createOpportunity({
      type: 'ipo_spinout',
      stage: 'tracking',
      scores: {
        purityScore: 78,
        scarcityScore: 70,
        tradeabilityScore: 62,
        relayScore: 48,
        catalystScore: 80,
        policyScore: 40,
      },
      heatProfile: undefined,
      ipoProfile: {
        officialTradingDate: '2026-04-01',
        retainedStakePercent: 12.5,
        lockupDate: '2026-07-01',
        evidence: {
          officialTradingDate: {
            source: 'Exchange notice',
            confidence: 'confirmed',
          },
          lockupDate: {
            source: 'Final prospectus',
            confidence: 'inferred',
          },
        },
      },
      supplyOverhang: 'Retained stake reduced; lockup now the next supply event',
      updatedAt: '2026-04-16T00:00:00.000Z',
    }));

    const diff = buildOpportunityDiff(current, baseline);

    expect(diff.changedCategories).toContain('ipo');
    expect(diff.highlights.join(' ')).toContain('retained 19.9 -> 12.5');
    expect(diff.highlights.join(' ')).toContain('evidence +lockupDate:inferred:Final prospectus');
  });
});
