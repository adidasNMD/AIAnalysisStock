import { describe, expect, it, vi } from 'vitest';
import type { EdgarFiling } from '../tools/edgar-monitor';
import type { DynamicTicker } from '../utils/dynamic-watchlist';
import type {
  HeatTransferGraph,
  NewCodeRadarCandidate,
  OpportunityRecord,
} from '../workflows/types';
import type { OpportunityOperationsDependencies } from '../server/services/opportunity-operations-service';
import type { PriceHistorySeries } from '../utils/price-history-cache';

function makeTicker(symbol: string): DynamicTicker {
  return {
    symbol,
    name: symbol,
    discoveredAt: '2026-04-30T00:00:00.000Z',
    discoverySource: 'test',
    trendName: 'AI Infra',
    chainLevel: 'sector_leader',
    multibaggerScore: 80,
    reasoning: 'test',
    status: 'watching',
    priceAtDiscovery: 10,
    alerts: {},
    promotionHistory: [],
  };
}

function makeOpportunity(id = 'opp-1'): OpportunityRecord {
  return {
    id,
    type: 'relay_chain',
    stage: 'tracking',
    status: 'watching',
    title: 'AI Infra Relay',
    query: 'AI Infra',
    relatedTickers: ['MU'],
    relayTickers: ['SNDK'],
    scores: {},
    catalystCalendar: [],
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
  };
}

function makeFiling(companyName = 'Figma'): EdgarFiling {
  return {
    companyName,
    formType: 'S-1',
    filedAt: '2026-04-30',
    accessionNumber: '000-test',
    url: 'https://example.test/filing',
    description: 'test filing',
  };
}

describe('opportunity operations service', () => {
  it('builds heat-transfer graphs from active tickers and linked opportunities', async () => {
    const { getOpportunityHeatTransferGraphsForApi } = await import('../server/services/opportunity-operations-service');
    const tickers = [makeTicker('CRWV')];
    const opportunities = [makeOpportunity()];
    const graphs = [{
      id: 'graph-ai-infra',
      theme: 'AI Infra',
      leaderTicker: 'CRWV',
      bottleneckTickers: [],
      laggardTickers: [],
      junkTickers: [],
      breadthScore: 50,
      relayScore: 75,
      temperature: 'warming',
      validationStatus: 'forming',
      validationSummary: 'forming',
      edgeCount: 0,
      edges: [],
      transmissionSummary: 'warming',
      linkedOpportunityId: 'opp-1',
    }] satisfies HeatTransferGraph[];
    const deps: Partial<OpportunityOperationsDependencies> = {
      getActiveTickers: vi.fn(() => tickers) as OpportunityOperationsDependencies['getActiveTickers'],
      listOpportunities: vi.fn(async () => opportunities) as OpportunityOperationsDependencies['listOpportunities'],
      buildHeatTransferGraphs: vi.fn(() => graphs) as OpportunityOperationsDependencies['buildHeatTransferGraphs'],
    };

    const result = await getOpportunityHeatTransferGraphsForApi(123, deps);

    expect(deps.listOpportunities).toHaveBeenCalledWith(123);
    expect(deps.buildHeatTransferGraphs).toHaveBeenCalledWith(tickers, opportunities);
    expect(result).toEqual(graphs);
  });

  it('syncs heat-transfer graph opportunities with active tickers', async () => {
    const { syncOpportunityHeatTransferGraphsForApi } = await import('../server/services/opportunity-operations-service');
    const tickers = [makeTicker('CRWV')];
    const opportunities = [makeOpportunity('opp-synced')];
    const deps: Partial<OpportunityOperationsDependencies> = {
      getActiveTickers: vi.fn(() => tickers) as OpportunityOperationsDependencies['getActiveTickers'],
      syncHeatTransferGraphOpportunities: (
        vi.fn(async () => opportunities) as OpportunityOperationsDependencies['syncHeatTransferGraphOpportunities']
      ),
    };

    const result = await syncOpportunityHeatTransferGraphsForApi(deps);

    expect(deps.syncHeatTransferGraphOpportunities).toHaveBeenCalledWith(tickers);
    expect(result).toEqual({
      success: true,
      syncedCount: 1,
      opportunities,
    });
  });

  it('refreshes New Code Radar from watched EDGAR companies', async () => {
    const { refreshNewCodeRadarForApi } = await import('../server/services/opportunity-operations-service');
    const filings = [makeFiling('Figma')];
    const opportunities = [makeOpportunity('opp-ipo')];
    const candidates = [{
      key: 'figma',
      companyName: 'Figma',
      title: 'Figma New Code Radar',
      query: 'Figma',
      status: 'filing',
      summary: 'S-1 filed',
      latestFilingType: 'S-1',
      latestFiledAt: '2026-04-30',
      filingCount: 1,
      catalystCalendar: [],
    }] satisfies NewCodeRadarCandidate[];
    const deps: Partial<OpportunityOperationsDependencies> = {
      loadEdgarWatchCompanies: vi.fn(() => ['Figma']) as OpportunityOperationsDependencies['loadEdgarWatchCompanies'],
      watchIPO: vi.fn(async () => filings) as OpportunityOperationsDependencies['watchIPO'],
      syncNewCodeRadarOpportunities: (
        vi.fn(async () => opportunities) as OpportunityOperationsDependencies['syncNewCodeRadarOpportunities']
      ),
      buildNewCodeRadarCandidates: (
        vi.fn(() => candidates) as OpportunityOperationsDependencies['buildNewCodeRadarCandidates']
      ),
    };

    const result = await refreshNewCodeRadarForApi(deps);

    expect(deps.watchIPO).toHaveBeenCalledWith(['Figma']);
    expect(deps.syncNewCodeRadarOpportunities).toHaveBeenCalledWith(filings);
    expect(deps.buildNewCodeRadarCandidates).toHaveBeenCalledWith(filings, opportunities);
    expect(result).toEqual({
      success: true,
      companyCount: 1,
      filingCount: 1,
      syncedCount: 1,
      candidates,
      opportunities,
    });
  });

  it('diagnoses missing and stale price history cache coverage', async () => {
    const { getOpportunityPriceHistoryDiagnosticsForApi } = await import('../server/services/opportunity-operations-service');
    const records: PriceHistorySeries[] = [{
      symbol: 'AAOI',
      source: 'fixture',
      updatedAt: '2026-05-08T00:00:00.000Z',
      points: [
        { at: '2026-05-01T00:00:00.000Z', close: 100 },
        { at: '2026-05-02T00:00:00.000Z', close: 110 },
      ],
    }, {
      symbol: 'ORPHAN',
      source: 'fixture',
      updatedAt: '2026-05-10T00:00:00.000Z',
      points: [{ at: '2026-05-09T00:00:00.000Z', close: 20 }],
    }];
    const opportunity = {
      ...makeOpportunity('opp-price'),
      primaryTicker: 'AAOI',
      relatedTickers: ['MU'],
      relayTickers: [],
    };
    const deps: Partial<OpportunityOperationsDependencies> = {
      now: vi.fn(() => '2026-05-10T12:00:00.000Z') as OpportunityOperationsDependencies['now'],
      getActiveTickers: vi.fn(() => [makeTicker('CRWV')]) as OpportunityOperationsDependencies['getActiveTickers'],
      listOpportunities: vi.fn(async () => [opportunity]) as OpportunityOperationsDependencies['listOpportunities'],
      loadPriceHistoryCache: vi.fn(() => records) as OpportunityOperationsDependencies['loadPriceHistoryCache'],
    };

    const diagnostics = await getOpportunityPriceHistoryDiagnosticsForApi({ staleAfterHours: 24 }, deps);

    expect(diagnostics.metrics).toMatchObject({
      tracked: 3,
      cached: 2,
      fresh: 0,
      stale: 1,
      missing: 2,
      orphan: 1,
      totalPoints: 3,
      coveragePct: 33.3,
    });
    expect(diagnostics.series).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'AAOI', status: 'stale', pointCount: 2 }),
      expect.objectContaining({ symbol: 'CRWV', status: 'missing', pointCount: 0 }),
      expect.objectContaining({ symbol: 'MU', status: 'missing', pointCount: 0 }),
      expect.objectContaining({ symbol: 'ORPHAN', status: 'orphan', pointCount: 1 }),
    ]));
  });

  it('refreshes stale price history symbols while skipping fresh cache entries', async () => {
    const { refreshOpportunityPriceHistoryForApi } = await import('../server/services/opportunity-operations-service');
    let savedRecords: PriceHistorySeries[] = [];
    const records: PriceHistorySeries[] = [{
      symbol: 'AAOI',
      source: 'fixture',
      updatedAt: '2026-05-10T00:00:00.000Z',
      points: [{ at: '2026-05-09T00:00:00.000Z', close: 100 }],
    }, {
      symbol: 'SNDK',
      source: 'fixture',
      updatedAt: '2026-05-08T00:00:00.000Z',
      points: [{ at: '2026-05-01T00:00:00.000Z', close: 50 }],
    }];
    const fetchHistoricalPriceSeries = vi.fn(async (symbol: string) => (
      symbol === 'SNDK'
        ? [
          { at: '2026-05-02T00:00:00.000Z', close: 55, source: 'openbb:yfinance' },
          { at: '2026-05-03T00:00:00.000Z', close: 60, source: 'openbb:yfinance' },
        ]
        : []
    )) as OpportunityOperationsDependencies['fetchHistoricalPriceSeries'];
    const savePriceHistoryCache = vi.fn((nextRecords: PriceHistorySeries[], _filePath?: string, updatedAt?: string) => {
      savedRecords = nextRecords;
      return {
        filePath: 'data/price-history.json',
        seriesCount: nextRecords.length,
        totalPoints: nextRecords.reduce((sum, record) => sum + record.points.length, 0),
        updatedAt: updatedAt || '2026-05-10T12:00:00.000Z',
      };
    }) as OpportunityOperationsDependencies['savePriceHistoryCache'];
    const deps: Partial<OpportunityOperationsDependencies> = {
      now: vi.fn(() => '2026-05-10T12:00:00.000Z') as OpportunityOperationsDependencies['now'],
      loadPriceHistoryCache: vi.fn(() => records) as OpportunityOperationsDependencies['loadPriceHistoryCache'],
      fetchHistoricalPriceSeries,
      savePriceHistoryCache,
    };

    const result = await refreshOpportunityPriceHistoryForApi({
      symbols: ['AAOI', 'SNDK', 'BAD'],
      staleAfterHours: 24,
      limit: 10,
    }, deps);

    expect(fetchHistoricalPriceSeries).toHaveBeenCalledTimes(2);
    expect(fetchHistoricalPriceSeries).toHaveBeenCalledWith('SNDK', { limit: 10 });
    expect(fetchHistoricalPriceSeries).toHaveBeenCalledWith('BAD', { limit: 10 });
    expect(savePriceHistoryCache).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      requestedSymbols: ['AAOI', 'BAD', 'SNDK'],
      refreshed: 1,
      skippedFresh: 1,
      failed: 1,
    });
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'AAOI', status: 'skipped_fresh', cachedPoints: 1 }),
      expect.objectContaining({ symbol: 'SNDK', status: 'refreshed', fetchedPoints: 2, cachedPoints: 3 }),
      expect.objectContaining({ symbol: 'BAD', status: 'failed' }),
    ]));
    expect(savedRecords.find(record => record.symbol === 'SNDK')?.points).toHaveLength(3);
  });
});
