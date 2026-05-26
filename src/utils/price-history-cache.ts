import * as fs from 'fs';
import * as path from 'path';

export const PRICE_HISTORY_PATH = path.join(process.cwd(), 'data', 'price-history.json');

export interface PriceHistoryPoint {
  at: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  source?: string;
}

export interface PriceHistorySeries {
  symbol: string;
  points: PriceHistoryPoint[];
  source?: string;
  updatedAt?: string;
}

export interface PriceHistoryCacheWriteResult {
  filePath: string;
  seriesCount: number;
  totalPoints: number;
  updatedAt: string;
}

export interface PriceWindowPerformance {
  symbol: string;
  source: 'price_history_cache';
  entryAt: string;
  exitAt: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  maxDrawdownPct: number;
  peakReturnPct: number;
  lowPrice: number;
  highPrice: number;
  pointCount: number;
  asOf: string;
}

function timestampMs(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseFloat(value.replace(/[$,%]/g, '').trim())
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePoint(value: unknown): PriceHistoryPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const at = typeof raw.at === 'string'
    ? raw.at
    : typeof raw.date === 'string'
      ? raw.date
      : typeof raw.timestamp === 'string'
        ? raw.timestamp
        : undefined;
  const close = parseFiniteNumber(raw.close ?? raw.price ?? raw.adjClose);
  const atMs = timestampMs(at);
  if (!at || atMs === undefined || close === undefined || close <= 0) return null;
  const open = parseFiniteNumber(raw.open);
  const high = parseFiniteNumber(raw.high);
  const low = parseFiniteNumber(raw.low);
  const volume = parseFiniteNumber(raw.volume);
  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : undefined;

  return {
    at,
    close,
    ...(open !== undefined ? { open } : {}),
    ...(high !== undefined ? { high } : {}),
    ...(low !== undefined ? { low } : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(source ? { source } : {}),
  };
}

export function normalizePriceHistorySeries(
  symbol: string,
  rawPoints: unknown,
  metadata: Record<string, unknown> = {},
): PriceHistorySeries | null {
  if (!Array.isArray(rawPoints)) return null;
  const points = rawPoints
    .map(parsePoint)
    .filter((point): point is PriceHistoryPoint => Boolean(point))
    .sort((a, b) => (timestampMs(a.at) ?? 0) - (timestampMs(b.at) ?? 0));
  if (points.length === 0) return null;
  const source = typeof metadata.source === 'string' && metadata.source.trim() ? metadata.source.trim() : undefined;
  const updatedAt = typeof metadata.updatedAt === 'string' && metadata.updatedAt.trim() ? metadata.updatedAt.trim() : undefined;

  return {
    symbol: symbol.toUpperCase(),
    points,
    ...(source ? { source } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function normalizeCachePayload(payload: unknown): PriceHistorySeries[] {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const raw = item as Record<string, unknown>;
        const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim() : '';
        return symbol ? normalizePriceHistorySeries(symbol, raw.points, raw) : null;
      })
      .filter((item): item is PriceHistorySeries => Boolean(item));
  }

  const raw = payload as Record<string, unknown>;
  const rawSeries = raw.series && typeof raw.series === 'object' && !Array.isArray(raw.series)
    ? raw.series as Record<string, unknown>
    : raw;

  return Object.entries(rawSeries)
    .map(([symbol, value]) => {
      if (Array.isArray(value)) return normalizePriceHistorySeries(symbol, value);
      if (value && typeof value === 'object') {
        const series = value as Record<string, unknown>;
        return normalizePriceHistorySeries(symbol, series.points, series);
      }
      return null;
    })
    .filter((item): item is PriceHistorySeries => Boolean(item));
}

export function loadPriceHistoryCache(filePath = PRICE_HISTORY_PATH): PriceHistorySeries[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    return normalizeCachePayload(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function mergePriceHistorySeries(
  existing: PriceHistorySeries | undefined,
  incoming: PriceHistorySeries,
): PriceHistorySeries {
  const pointsByTimestamp = new Map<string, PriceHistoryPoint>();
  for (const point of existing?.points ?? []) {
    pointsByTimestamp.set(point.at, point);
  }
  for (const point of incoming.points) {
    pointsByTimestamp.set(point.at, point);
  }

  const points = [...pointsByTimestamp.values()]
    .sort((a, b) => (timestampMs(a.at) ?? 0) - (timestampMs(b.at) ?? 0));
  const source = incoming.source ?? existing?.source;
  const updatedAt = incoming.updatedAt ?? existing?.updatedAt;

  return {
    symbol: incoming.symbol.toUpperCase(),
    points,
    ...(source ? { source } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function upsertPriceHistorySeries(
  records: PriceHistorySeries[],
  incoming: PriceHistorySeries,
): PriceHistorySeries[] {
  const normalized = incoming.symbol.toUpperCase();
  const next = new Map(records.map(record => [record.symbol.toUpperCase(), record]));
  next.set(normalized, mergePriceHistorySeries(next.get(normalized), incoming));
  return [...next.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function serializePoint(point: PriceHistoryPoint): Record<string, unknown> {
  return {
    at: point.at,
    close: point.close,
    ...(point.open !== undefined ? { open: point.open } : {}),
    ...(point.high !== undefined ? { high: point.high } : {}),
    ...(point.low !== undefined ? { low: point.low } : {}),
    ...(point.volume !== undefined ? { volume: point.volume } : {}),
    ...(point.source ? { source: point.source } : {}),
  };
}

export function savePriceHistoryCache(
  records: PriceHistorySeries[],
  filePath = PRICE_HISTORY_PATH,
  updatedAt = new Date().toISOString(),
): PriceHistoryCacheWriteResult {
  const ordered = [...records].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const series = Object.fromEntries(ordered.map(record => [
    record.symbol.toUpperCase(),
    {
      symbol: record.symbol.toUpperCase(),
      ...(record.source ? { source: record.source } : {}),
      ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
      points: record.points.map(serializePoint),
    },
  ]));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({
    version: 1,
    updatedAt,
    series,
  }, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, filePath);

  return {
    filePath,
    seriesCount: ordered.length,
    totalPoints: ordered.reduce((sum, record) => sum + record.points.length, 0),
    updatedAt,
  };
}

function pointsInWindow(
  points: PriceHistoryPoint[],
  startAt: string,
  endAt: string,
): PriceHistoryPoint[] {
  const startMs = timestampMs(startAt);
  const endMs = timestampMs(endAt);
  if (startMs === undefined || endMs === undefined || endMs < startMs) return [];
  return points.filter((point) => {
    const pointMs = timestampMs(point.at);
    return pointMs !== undefined && pointMs >= startMs && pointMs <= endMs;
  });
}

export function calculatePriceWindowPerformance(
  symbol: string,
  points: PriceHistoryPoint[],
  startAt: string,
  endAt: string,
): PriceWindowPerformance | null {
  const windowPoints = pointsInWindow(points, startAt, endAt);
  if (windowPoints.length === 0) return null;
  const entry = windowPoints[0];
  const exit = windowPoints[windowPoints.length - 1];
  if (!entry || !exit || entry.close <= 0 || exit.close <= 0) return null;

  let peak = entry.close;
  let low = entry.close;
  let high = entry.close;
  let maxDrawdownPct = 0;
  let peakReturnPct = 0;

  for (const point of windowPoints) {
    high = Math.max(high, point.high ?? point.close);
    low = Math.min(low, point.low ?? point.close);
    if (point.close > peak) {
      peak = point.close;
    }
    const drawdown = peak > 0 ? ((point.close - peak) / peak) * 100 : 0;
    if (drawdown < maxDrawdownPct) {
      maxDrawdownPct = drawdown;
    }
    const pointReturn = ((point.close - entry.close) / entry.close) * 100;
    if (pointReturn > peakReturnPct) {
      peakReturnPct = pointReturn;
    }
  }

  return {
    symbol: symbol.toUpperCase(),
    source: 'price_history_cache',
    entryAt: entry.at,
    exitAt: exit.at,
    entryPrice: entry.close,
    exitPrice: exit.close,
    returnPct: roundOne(((exit.close - entry.close) / entry.close) * 100),
    maxDrawdownPct: roundOne(maxDrawdownPct),
    peakReturnPct: roundOne(peakReturnPct),
    lowPrice: low,
    highPrice: high,
    pointCount: windowPoints.length,
    asOf: exit.at,
  };
}

export function findPriceHistorySeries(
  records: PriceHistorySeries[],
  symbol: string,
): PriceHistorySeries | undefined {
  const normalized = symbol.toUpperCase();
  return records.find((record) => record.symbol.toUpperCase() === normalized);
}
