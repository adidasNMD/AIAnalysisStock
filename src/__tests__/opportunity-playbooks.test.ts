import { describe, expect, it } from 'vitest';
import {
  buildOpportunityPlaybook,
  buildWhyNowSummary,
} from '../workflows/opportunity-playbooks';
import type { OpportunitySummaryRecord } from '../workflows/types';

function createOpportunity(overrides: Partial<OpportunitySummaryRecord> = {}): OpportunitySummaryRecord {
  return {
    id: 'opp_playbook_1',
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
      breadthScore: 68,
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

describe('buildOpportunityPlaybook', () => {
  it('builds a relay playbook with checklist and next step', () => {
    const playbook = buildOpportunityPlaybook(createOpportunity({
      heatInflection: {
        kind: 'confirmation',
        summary: '传导链从 forming 升级到 confirmed。',
        happenedAt: '2026-04-16T00:00:00.000Z',
        scoreDelta: 12,
        breadthDelta: 14,
        fromStatus: 'forming',
        toStatus: 'confirmed',
      },
    }));

    expect(playbook.title).toBe('Heat Transfer Playbook');
    expect(playbook.objective).toContain('龙头温度');
    expect(playbook.checklist.length).toBeGreaterThan(2);
    expect(playbook.whyNow).toContain('confirmed');
  });

  it('builds an ipo playbook that highlights missing independent validation', () => {
    const playbook = buildOpportunityPlaybook(createOpportunity({
      type: 'ipo_spinout',
      stage: 'radar',
      status: 'watching',
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
        evidence: {
          officialTradingDate: {
            source: 'EDGAR 424B4',
            confidence: 'inferred',
            note: 'Trading window inferred from final prospectus.',
          },
        },
      },
      catalystCalendar: [
        {
          label: '正式交易窗口确认',
          status: 'upcoming',
          source: 'EDGAR 424B4/424B1',
          confidence: 'inferred',
        },
      ],
    }));

    expect(playbook.title).toBe('New Code Radar Playbook');
    expect(playbook.checklist.some((item) => item.label === '首份独立验证' && item.status === 'missing')).toBe(true);
  });
});

describe('buildWhyNowSummary', () => {
  it('returns a concise why-now summary from the playbook', () => {
    const whyNow = buildWhyNowSummary(createOpportunity({
      summary: '龙头继续走强，二层瓶颈开始被市场点名。',
    }));

    expect(whyNow).toContain('龙头继续走强');
  });
});
