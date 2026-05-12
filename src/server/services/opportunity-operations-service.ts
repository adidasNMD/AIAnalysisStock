import * as fs from 'fs';
import * as path from 'path';
import { getActiveTickers } from '../../utils/dynamic-watchlist';
import { fetchHistoricalPriceSeries } from '../../utils/openbb-provider';
import {
  PRICE_HISTORY_PATH,
  findPriceHistorySeries,
  loadPriceHistoryCache,
  normalizePriceHistorySeries,
  savePriceHistoryCache,
  upsertPriceHistorySeries,
  type PriceHistoryCacheWriteResult,
  type PriceHistoryPoint,
  type PriceHistorySeries,
} from '../../utils/price-history-cache';
import { watchIPO } from '../../tools/edgar-monitor';
import {
  buildHeatTransferGraphs,
  buildNewCodeRadarCandidates,
  listOpportunities,
  syncHeatTransferGraphOpportunities,
  syncNewCodeRadarOpportunities,
} from '../../workflows';
import type { OpportunityRecord } from '../../workflows/types';

export interface OpportunityOperationsDependencies {
  getActiveTickers: typeof getActiveTickers;
  listOpportunities: typeof listOpportunities;
  buildHeatTransferGraphs: typeof buildHeatTransferGraphs;
  syncHeatTransferGraphOpportunities: typeof syncHeatTransferGraphOpportunities;
  loadEdgarWatchCompanies: typeof loadEdgarWatchCompanies;
  watchIPO: typeof watchIPO;
  syncNewCodeRadarOpportunities: typeof syncNewCodeRadarOpportunities;
  buildNewCodeRadarCandidates: typeof buildNewCodeRadarCandidates;
  fetchHistoricalPriceSeries: typeof fetchHistoricalPriceSeries;
  loadPriceHistoryCache: typeof loadPriceHistoryCache;
  savePriceHistoryCache: typeof savePriceHistoryCache;
  now: () => string;
}

const defaultDependencies: OpportunityOperationsDependencies = {
  getActiveTickers,
  listOpportunities,
  buildHeatTransferGraphs,
  syncHeatTransferGraphOpportunities,
  loadEdgarWatchCompanies,
  watchIPO,
  syncNewCodeRadarOpportunities,
  buildNewCodeRadarCandidates,
  fetchHistoricalPriceSeries,
  loadPriceHistoryCache,
  savePriceHistoryCache,
  now: () => new Date().toISOString(),
};

function withDependencies(
  overrides: Partial<OpportunityOperationsDependencies> = {},
): OpportunityOperationsDependencies {
  return { ...defaultDependencies, ...overrides };
}

export function loadEdgarWatchCompanies(): string[] {
  const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
  if (!fs.existsSync(watchlistPath)) return [];
  const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8')) as {
    tickers?: Array<{ name?: string; alerts?: { edgarWatch?: boolean } }>;
  };
  return (data.tickers || [])
    .filter((ticker) => ticker.alerts?.edgarWatch && ticker.name)
    .map((ticker) => ticker.name as string);
}

export async function getOpportunityHeatTransferGraphsForApi(
  limit = 500,
  dependencyOverrides: Partial<OpportunityOperationsDependencies> = {},
) {
  const deps = withDependencies(dependencyOverrides);
  const opportunities = await deps.listOpportunities(limit);
  return deps.buildHeatTransferGraphs(deps.getActiveTickers(), opportunities);
}

export async function syncOpportunityHeatTransferGraphsForApi(
  dependencyOverrides: Partial<OpportunityOperationsDependencies> = {},
) {
  const deps = withDependencies(dependencyOverrides);
  const synced = await deps.syncHeatTransferGraphOpportunities(deps.getActiveTickers());
  return {
    success: true,
    syncedCount: synced.length,
    opportunities: synced,
  };
}

export async function refreshNewCodeRadarForApi(
  dependencyOverrides: Partial<OpportunityOperationsDependencies> = {},
) {
  const deps = withDependencies(dependencyOverrides);
  const companies = deps.loadEdgarWatchCompanies();
  const filings = await deps.watchIPO(companies);
  const synced = await deps.syncNewCodeRadarOpportunities(filings);
  const candidates = deps.buildNewCodeRadarCandidates(filings, synced);
  return {
    success: true,
    companyCount: companies.length,
    filingCount: filings.length,
    syncedCount: synced.length,
    candidates,
    opportunities: synced,
  };
}

export interface OpportunityPriceHistorySeriesDiagnostics {
  symbol: string;
  status: 'fresh' | 'stale' | 'missing' | 'orphan';
  pointCount: number;
  updatedAt?: string;
  oldestPointAt?: string;
  newestPointAt?: string;
  source?: string;
  ageHours?: number;
}

export interface OpportunityPriceHistoryDiagnostics {
  generatedAt: string;
  cachePath: string;
  staleAfterHours: number;
  trackedSymbols: string[];
  cachedSymbols: string[];
  metrics: {
    tracked: number;
    cached: number;
    fresh: number;
    stale: number;
    missing: number;
    orphan: number;
    totalPoints: number;
    coveragePct: number;
  };
  series: OpportunityPriceHistorySeriesDiagnostics[];
}

export interface OpportunityPriceHistoryRefreshInput {
  symbols?: string[];
  limit?: number;
  force?: boolean;
  staleAfterHours?: number;
}

export interface OpportunityPriceHistoryRefreshItem {
  symbol: string;
  status: 'refreshed' | 'skipped_fresh' | 'failed';
  fetchedPoints: number;
  cachedPoints: number;
  updatedAt?: string;
  error?: string;
}

export interface OpportunityPriceHistoryRefreshResult {
  success: boolean;
  generatedAt: string;
  cachePath: string;
  requestedSymbols: string[];
  refreshed: number;
  skippedFresh: number;
  failed: number;
  write?: PriceHistoryCacheWriteResult;
  items: OpportunityPriceHistoryRefreshItem[];
  diagnostics: OpportunityPriceHistoryDiagnostics;
}

function normalizeTickerSymbol(value?: string): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9.-]{1,12}$/.test(normalized) ? normalized : null;
}

function uniqueSymbols(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const symbol = normalizeTickerSymbol(value);
    if (symbol) seen.add(symbol);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function opportunitySymbols(opportunity: OpportunityRecord): string[] {
  return uniqueSymbols([
    opportunity.primaryTicker,
    opportunity.leaderTicker,
    opportunity.proxyTicker,
    ...(opportunity.relatedTickers || []),
    ...(opportunity.relayTickers || []),
  ]);
}

function watchlistSymbols(tickers: ReturnType<typeof getActiveTickers>): string[] {
  return uniqueSymbols(tickers.map(ticker => ticker.symbol));
}

async function resolveTrackedPriceHistorySymbols(deps: OpportunityOperationsDependencies): Promise<string[]> {
  const [opportunities, tickers] = await Promise.all([
    deps.listOpportunities(500),
    Promise.resolve(deps.getActiveTickers()),
  ]);
  return uniqueSymbols([
    ...tickers.flatMap(ticker => watchlistSymbols([ticker])),
    ...opportunities.flatMap(opportunitySymbols),
  ]);
}

function pointTimestamp(point: PriceHistoryPoint | undefined): number | undefined {
  if (!point) return undefined;
  const parsed = Date.parse(point.at);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hoursSince(value: string | undefined, nowMs: number): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(((nowMs - parsed) / 3_600_000) * 10) / 10;
}

function buildSeriesDiagnostics(
  symbol: string,
  record: PriceHistorySeries | undefined,
  tracked: boolean,
  nowMs: number,
  staleAfterHours: number,
): OpportunityPriceHistorySeriesDiagnostics {
  if (!record) {
    return {
      symbol,
      status: 'missing',
      pointCount: 0,
    };
  }
  const points = [...record.points].sort((a, b) => (pointTimestamp(a) ?? 0) - (pointTimestamp(b) ?? 0));
  const oldestPointAt = points[0]?.at;
  const newestPointAt = points[points.length - 1]?.at;
  const ageHours = hoursSince(record.updatedAt, nowMs);
  const stale = ageHours === undefined || ageHours > staleAfterHours || points.length === 0;
  const status = tracked
    ? stale ? 'stale' : 'fresh'
    : 'orphan';

  return {
    symbol,
    status,
    pointCount: points.length,
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    ...(oldestPointAt ? { oldestPointAt } : {}),
    ...(newestPointAt ? { newestPointAt } : {}),
    ...(record.source ? { source: record.source } : {}),
    ...(ageHours !== undefined ? { ageHours } : {}),
  };
}

function buildPriceHistoryDiagnostics(
  records: PriceHistorySeries[],
  trackedSymbols: string[],
  generatedAt: string,
  staleAfterHours: number,
): OpportunityPriceHistoryDiagnostics {
  const nowMs = Date.parse(generatedAt);
  const recordSymbols = records.map(record => record.symbol.toUpperCase()).sort((a, b) => a.localeCompare(b));
  const tracked = new Set(trackedSymbols);
  const trackedSeries = trackedSymbols.map(symbol => (
    buildSeriesDiagnostics(symbol, findPriceHistorySeries(records, symbol), true, nowMs, staleAfterHours)
  ));
  const orphanSeries = recordSymbols
    .filter(symbol => !tracked.has(symbol))
    .map(symbol => buildSeriesDiagnostics(symbol, findPriceHistorySeries(records, symbol), false, nowMs, staleAfterHours));
  const series = [...trackedSeries, ...orphanSeries];
  const fresh = series.filter(item => item.status === 'fresh').length;
  const stale = series.filter(item => item.status === 'stale').length;
  const missing = series.filter(item => item.status === 'missing').length;
  const orphan = series.filter(item => item.status === 'orphan').length;
  const totalPoints = records.reduce((sum, record) => sum + record.points.length, 0);

  return {
    generatedAt,
    cachePath: PRICE_HISTORY_PATH,
    staleAfterHours,
    trackedSymbols,
    cachedSymbols: recordSymbols,
    metrics: {
      tracked: trackedSymbols.length,
      cached: recordSymbols.length,
      fresh,
      stale,
      missing,
      orphan,
      totalPoints,
      coveragePct: trackedSymbols.length > 0
        ? Math.round(((trackedSymbols.length - missing) / trackedSymbols.length) * 1000) / 10
        : 100,
    },
    series,
  };
}

export async function getOpportunityPriceHistoryDiagnosticsForApi(
  options: { staleAfterHours?: number } = {},
  dependencyOverrides: Partial<OpportunityOperationsDependencies> = {},
): Promise<OpportunityPriceHistoryDiagnostics> {
  const deps = withDependencies(dependencyOverrides);
  const generatedAt = deps.now();
  const staleAfterHours = Math.max(1, Math.min(options.staleAfterHours ?? 24, 24 * 30));
  const [trackedSymbols, records] = await Promise.all([
    resolveTrackedPriceHistorySymbols(deps),
    Promise.resolve(deps.loadPriceHistoryCache()),
  ]);
  return buildPriceHistoryDiagnostics(records, trackedSymbols, generatedAt, staleAfterHours);
}

export async function refreshOpportunityPriceHistoryForApi(
  input: OpportunityPriceHistoryRefreshInput = {},
  dependencyOverrides: Partial<OpportunityOperationsDependencies> = {},
): Promise<OpportunityPriceHistoryRefreshResult> {
  const deps = withDependencies(dependencyOverrides);
  const generatedAt = deps.now();
  const staleAfterHours = Math.max(1, Math.min(input.staleAfterHours ?? 24, 24 * 30));
  const limit = Math.max(5, Math.min(Math.floor(input.limit ?? 180), 1000));
  const trackedSymbols = input.symbols && input.symbols.length > 0
    ? uniqueSymbols(input.symbols)
    : await resolveTrackedPriceHistorySymbols(deps);
  let records = deps.loadPriceHistoryCache();
  const items: OpportunityPriceHistoryRefreshItem[] = [];
  let hasUpdates = false;

  for (const symbol of trackedSymbols) {
    const existing = findPriceHistorySeries(records, symbol);
    const existingStatus = buildSeriesDiagnostics(
      symbol,
      existing,
      true,
      Date.parse(generatedAt),
      staleAfterHours,
    );
    if (!input.force && existingStatus.status === 'fresh') {
      items.push({
        symbol,
        status: 'skipped_fresh',
        fetchedPoints: 0,
        cachedPoints: existingStatus.pointCount,
        ...(existingStatus.updatedAt ? { updatedAt: existingStatus.updatedAt } : {}),
      });
      continue;
    }

    try {
      const points = await deps.fetchHistoricalPriceSeries(symbol, { limit });
      const incoming = normalizePriceHistorySeries(symbol, points, {
        source: points[0]?.source || 'openbb',
        updatedAt: generatedAt,
      });
      if (!incoming || incoming.points.length === 0) {
        items.push({
          symbol,
          status: 'failed',
          fetchedPoints: 0,
          cachedPoints: existing?.points.length ?? 0,
          error: 'No historical price points returned',
        });
        continue;
      }
      records = upsertPriceHistorySeries(records, incoming);
      hasUpdates = true;
      items.push({
        symbol,
        status: 'refreshed',
        fetchedPoints: incoming.points.length,
        cachedPoints: findPriceHistorySeries(records, symbol)?.points.length ?? incoming.points.length,
        updatedAt: generatedAt,
      });
    } catch (error: unknown) {
      items.push({
        symbol,
        status: 'failed',
        fetchedPoints: 0,
        cachedPoints: existing?.points.length ?? 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const write = hasUpdates ? deps.savePriceHistoryCache(records, PRICE_HISTORY_PATH, generatedAt) : undefined;
  const diagnostics = buildPriceHistoryDiagnostics(records, trackedSymbols, generatedAt, staleAfterHours);

  return {
    success: items.every(item => item.status !== 'failed'),
    generatedAt,
    cachePath: PRICE_HISTORY_PATH,
    requestedSymbols: trackedSymbols,
    refreshed: items.filter(item => item.status === 'refreshed').length,
    skippedFresh: items.filter(item => item.status === 'skipped_fresh').length,
    failed: items.filter(item => item.status === 'failed').length,
    ...(write ? { write } : {}),
    items,
    diagnostics,
  };
}
