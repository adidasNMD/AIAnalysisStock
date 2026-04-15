import { describe, expect, it } from 'vitest';
import {
  buildOpportunityHeatHistoryFromSnapshots,
  detectOpportunityHeatInflection,
} from '../workflows/opportunity-history';
import type { OpportunityRecord, OpportunitySnapshotRecord } from '../workflows/types';

function createRelayOpportunity(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: 'opp_heat_1',
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
      relayScore: 72,
      catalystScore: 64,
      policyScore: 38,
    },
    heatProfile: {
      temperature: 'warming',
      bottleneckTickers: ['MU'],
      laggardTickers: ['SNDK'],
      junkTickers: [],
      breadthScore: 58,
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

function snapshot(id: string, createdAt: string, payload: OpportunityRecord): OpportunitySnapshotRecord {
  return {
    id,
    opportunityId: payload.id,
    createdAt,
    payload: {
      ...payload,
      updatedAt: createdAt,
    },
  };
}

describe('buildOpportunityHeatHistoryFromSnapshots', () => {
  it('returns a chronological relay history from opportunity snapshots', () => {
    const history = buildOpportunityHeatHistoryFromSnapshots([
      snapshot('snap_2', '2026-04-16T00:00:00.000Z', createRelayOpportunity({
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
          breadthScore: 81,
          validationStatus: 'confirmed',
          validationSummary: 'AI Infra 传导已确认。',
          edgeCount: 3,
          edges: [],
        },
      })),
      snapshot('snap_1', '2026-04-15T00:00:00.000Z', createRelayOpportunity()),
    ], 5);

    expect(history).toHaveLength(2);
    expect(history[0]?.snapshotId).toBe('snap_1');
    expect(history[1]?.snapshotId).toBe('snap_2');
    expect(history[1]?.validationStatus).toBe('confirmed');
    expect(history[1]?.breadthScore).toBe(81);
  });

  it('detects confirmation inflections from recent relay history', () => {
    const history = buildOpportunityHeatHistoryFromSnapshots([
      snapshot('snap_1', '2026-04-15T00:00:00.000Z', createRelayOpportunity()),
      snapshot('snap_2', '2026-04-16T00:00:00.000Z', createRelayOpportunity({
        scores: {
          purityScore: 58,
          scarcityScore: 52,
          tradeabilityScore: 74,
          relayScore: 88,
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
          edges: [],
        },
      })),
    ], 5);

    const inflection = detectOpportunityHeatInflection(history);

    expect(inflection?.kind).toBe('confirmation');
    expect(inflection?.summary).toContain('confirmed');
  });
});
