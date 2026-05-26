import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  calculatePriceWindowPerformance,
  findPriceHistorySeries,
  loadPriceHistoryCache,
  normalizePriceHistorySeries,
  savePriceHistoryCache,
  upsertPriceHistorySeries,
} from '../utils/price-history-cache';

describe('price history cache', () => {
  it('loads object-shaped cache payloads and normalizes price points', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-history-cache-'));
    const filePath = path.join(dir, 'price-history.json');
    fs.writeFileSync(filePath, JSON.stringify({
      series: {
        aaoi: {
          source: 'fixture',
          updatedAt: '2026-05-05T00:00:00.000Z',
          points: [
            { date: '2026-05-01T00:00:00.000Z', close: '100' },
            { at: '2026-05-02T00:00:00.000Z', price: 115 },
            { timestamp: 'bad-date', close: 99 },
          ],
        },
      },
    }), 'utf-8');

    const records = loadPriceHistoryCache(filePath);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      symbol: 'AAOI',
      source: 'fixture',
      updatedAt: '2026-05-05T00:00:00.000Z',
      points: [
        { at: '2026-05-01T00:00:00.000Z', close: 100 },
        { at: '2026-05-02T00:00:00.000Z', close: 115 },
      ],
    });
    expect(findPriceHistorySeries(records, 'AAOI')?.symbol).toBe('AAOI');
  });

  it('calculates return, peak return, and max drawdown inside an entry/exit window', () => {
    const result = calculatePriceWindowPerformance('AAOI', [
      { at: '2026-04-30T00:00:00.000Z', close: 80 },
      { at: '2026-05-01T00:00:00.000Z', close: 100 },
      { at: '2026-05-02T00:00:00.000Z', close: 115 },
      { at: '2026-05-03T00:00:00.000Z', close: 90 },
      { at: '2026-05-05T00:00:00.000Z', close: 110 },
    ], '2026-05-01T00:00:00.000Z', '2026-05-05T00:00:00.000Z');

    expect(result).toMatchObject({
      symbol: 'AAOI',
      source: 'price_history_cache',
      entryPrice: 100,
      exitPrice: 110,
      returnPct: 10,
      peakReturnPct: 15,
      maxDrawdownPct: -21.7,
      pointCount: 4,
    });
  });

  it('merges refreshed series and saves a canonical cache payload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-history-save-'));
    const filePath = path.join(dir, 'price-history.json');
    const incoming = normalizePriceHistorySeries('aaoi', [
      { at: '2026-05-02T00:00:00.000Z', close: 115, source: 'openbb:yfinance' },
      { at: '2026-05-03T00:00:00.000Z', close: 120, source: 'openbb:yfinance' },
    ], {
      source: 'openbb:yfinance',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
    expect(incoming).not.toBeNull();

    const records = upsertPriceHistorySeries([{
      symbol: 'AAOI',
      source: 'fixture',
      updatedAt: '2026-05-01T00:00:00.000Z',
      points: [
        { at: '2026-05-01T00:00:00.000Z', close: 100 },
        { at: '2026-05-02T00:00:00.000Z', close: 110 },
      ],
    }], incoming!);
    const result = savePriceHistoryCache(records, filePath, '2026-05-10T00:00:00.000Z');

    expect(result).toMatchObject({
      seriesCount: 1,
      totalPoints: 3,
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
    expect(loadPriceHistoryCache(filePath)[0]).toMatchObject({
      symbol: 'AAOI',
      source: 'openbb:yfinance',
      updatedAt: '2026-05-10T00:00:00.000Z',
      points: [
        { at: '2026-05-01T00:00:00.000Z', close: 100 },
        { at: '2026-05-02T00:00:00.000Z', close: 115 },
        { at: '2026-05-03T00:00:00.000Z', close: 120 },
      ],
    });
  });
});
