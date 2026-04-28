import { describe, expect, it } from 'vitest';
import {
  createOpportunityPayloadSchema,
  updateOpportunityPayloadSchema,
} from '../server/validation';

function issuePaths(result: ReturnType<typeof createOpportunityPayloadSchema.safeParse>) {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('opportunity payload validation', () => {
  it('accepts a typed relay heat profile with bounded edges', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      type: 'relay_chain',
      title: 'AI Infra Relay',
      query: 'AI Infra relay chain',
      scores: {
        relayScore: 82,
        tradeabilityScore: 74,
      },
      heatProfile: {
        temperature: 'warming',
        bottleneckTickers: ['MU', 'AVGO'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 78,
        validationStatus: 'forming',
        edgeCount: 1,
        edges: [
          {
            from: 'CRWV',
            to: 'MU',
            weight: 72,
            kind: 'leader_to_bottleneck',
            reason: 'Leader confirmation is moving into memory bottlenecks.',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects malformed heat profiles before they reach persistence', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      type: 'relay_chain',
      title: 'Broken Relay',
      query: 'Broken relay',
      heatProfile: {
        temperature: 'boiling',
        validationStatus: 'validated',
        edges: [
          {
            from: 'CRWV',
            to: 'MU',
            weight: 120,
            kind: 'leader_to_bottleneck',
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(expect.arrayContaining([
      'heatProfile.temperature',
      'heatProfile.validationStatus',
      'heatProfile.edges.0.weight',
    ]));
  });

  it('accepts partial proxy profiles but rejects unknown profile keys', () => {
    const valid = createOpportunityPayloadSchema.safeParse({
      type: 'proxy_narrative',
      title: 'Policy Proxy',
      query: 'Policy proxy narrative',
      proxyProfile: {
        mappingTarget: 'AI policy theme',
        legitimacyScore: 77,
        ruleStatus: 'Named in filing review',
      },
    });

    const invalid = createOpportunityPayloadSchema.safeParse({
      type: 'proxy_narrative',
      title: 'Policy Proxy',
      query: 'Policy proxy narrative',
      proxyProfile: {
        legitimacyScore: 77,
        arbitraryNestedPayload: { unsafe: true },
      },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(issuePaths(invalid)).toContain('proxyProfile');
  });

  it('validates IPO profile evidence and retained stake ranges', () => {
    const valid = updateOpportunityPayloadSchema.safeParse({
      ipoProfile: {
        retainedStakePercent: 19.9,
        lockupDate: '2026-07-30',
        evidence: {
          retainedStakePercent: {
            source: 'S-1 filing',
            confidence: 'confirmed',
            observedAt: '2026-04-28T00:00:00.000Z',
          },
        },
      },
    });

    const invalid = updateOpportunityPayloadSchema.safeParse({
      ipoProfile: {
        retainedStakePercent: 150,
        evidence: {
          lockupDate: {
            source: 'Calendar scrape',
            confidence: 'certain',
          },
        },
      },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'ipoProfile.retainedStakePercent',
      'ipoProfile.evidence.lockupDate.confidence',
    ]));
  });

  it('rejects out-of-range top-level scores', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      title: 'Bad Score',
      query: 'Bad score',
      scores: {
        purityScore: 101,
      },
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('scores.purityScore');
  });

  it('rejects unknown top-level and catalyst fields', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      title: 'Unexpected Payload',
      query: 'Unexpected payload',
      unsafeField: true,
      catalystCalendar: [
        {
          label: 'Earnings',
          status: 'upcoming',
          arbitraryNestedPayload: { unsafe: true },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(expect.arrayContaining(['', 'catalystCalendar.0']));
  });

  it('requires title or query when creating opportunities', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      thesis: 'No title or query should fail before persistence.',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('title');
  });
});
