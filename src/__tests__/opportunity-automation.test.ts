import { describe, expect, it } from 'vitest';
import { buildHeatTransferGraphs } from '../workflows/heat-transfer-graph';
import { buildNewCodeRadarCandidates } from '../workflows/opportunity-calendars';
import type { EdgarFiling } from '../tools/edgar-monitor';
import type { DynamicTicker } from '../utils/dynamic-watchlist';

describe('buildNewCodeRadarCandidates', () => {
  it('upgrades candidate status as filings progress from S-1 to 424B4', () => {
    const filings: EdgarFiling[] = [
      {
        companyName: 'CoreWeave',
        formType: 'S-1',
        filedAt: '2026-03-01',
        accessionNumber: '1',
        url: 'https://example.com/1',
        description: 'Initial filing',
      },
      {
        companyName: 'CoreWeave',
        formType: 'S-1/A',
        filedAt: '2026-03-15',
        accessionNumber: '2',
        url: 'https://example.com/2',
        description: 'Amendment',
      },
      {
        companyName: 'CoreWeave',
        formType: '424B4',
        filedAt: '2026-03-20',
        accessionNumber: '3',
        url: 'https://example.com/3',
        description: 'Final prospectus',
      },
    ];

    const candidates = buildNewCodeRadarCandidates(filings);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.status).toBe('trading_soon');
    expect(candidates[0]?.latestFilingType).toBe('424B4');
    expect(candidates[0]?.catalystCalendar[0]?.label).toBe('正式交易窗口确认');
    expect(candidates[0]?.catalystCalendar[0]?.confidence).toBe('inferred');
    expect(candidates[0]?.catalystCalendar[0]?.source).toBe('EDGAR 424B4/424B1');
    expect(candidates[0]?.ipoProfile?.greenshoeStatus).toContain('Final prospectus');
  });
});

describe('buildHeatTransferGraphs', () => {
  it('builds a graph from leader, bottleneck, and laggard watchlist roles', () => {
    const tickers: DynamicTicker[] = [
      {
        symbol: 'CRWV',
        name: 'CoreWeave',
        discoveredAt: '2026-04-01',
        discoverySource: 'TrendRadar:AI Infra',
        trendName: 'AI Infra',
        chainLevel: 'sector_leader',
        multibaggerScore: 88,
        reasoning: 'Leader',
        status: 'watching',
        priceAtDiscovery: 10,
        promotionHistory: [],
        alerts: {},
      },
      {
        symbol: 'MU',
        name: 'Micron',
        discoveredAt: '2026-04-01',
        discoverySource: 'TrendRadar:AI Infra',
        trendName: 'AI Infra',
        chainLevel: 'bottleneck',
        multibaggerScore: 74,
        reasoning: 'Memory bottleneck',
        status: 'watching',
        priceAtDiscovery: 10,
        promotionHistory: [],
        alerts: {},
      },
      {
        symbol: 'SNDK',
        name: 'Sandisk',
        discoveredAt: '2026-04-01',
        discoverySource: 'TrendRadar:AI Infra',
        trendName: 'AI Infra',
        chainLevel: 'hidden_gem',
        multibaggerScore: 81,
        reasoning: 'Laggard',
        status: 'watching',
        priceAtDiscovery: 10,
        promotionHistory: [],
        alerts: {},
      },
    ];

    const graphs = buildHeatTransferGraphs(tickers);

    expect(graphs).toHaveLength(1);
    expect(graphs[0]?.theme).toBe('AI Infra');
    expect(graphs[0]?.leaderTicker).toBe('CRWV');
    expect(graphs[0]?.bottleneckTickers).toEqual(['MU']);
    expect(graphs[0]?.laggardTickers).toEqual(['SNDK']);
    expect(graphs[0]?.relayScore).toBeGreaterThan(70);
    expect(graphs[0]?.breadthScore).toBeGreaterThan(40);
    expect(graphs[0]?.validationStatus).toBe('forming');
    expect(graphs[0]?.edges.length).toBeGreaterThan(0);
    expect(graphs[0]?.validationSummary).toContain('AI Infra');
  });
});
