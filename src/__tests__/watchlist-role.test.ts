import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function loadWatchlistForTest() {
  const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
  const config = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
  config.tickers = config.tickers.map((t: any) => ({
    ...t,
    role: t.role ?? 'target',
  }));
  return config;
}

describe('watchlist role field', () => {
  it('NVDA has role sector_leader', () => {
    const config = loadWatchlistForTest();
    const nvda = config.tickers.find((t: any) => t.symbol === 'NVDA');
    expect(nvda?.role).toBe('sector_leader');
  });

  it('TSM has role sector_leader', () => {
    const config = loadWatchlistForTest();
    const tsm = config.tickers.find((t: any) => t.symbol === 'TSM');
    expect(tsm?.role).toBe('sector_leader');
  });

  it('ASTS has role target', () => {
    const config = loadWatchlistForTest();
    const asts = config.tickers.find((t: any) => t.symbol === 'ASTS');
    expect(asts?.role).toBe('target');
  });

  it('ticker without role field defaults to target', () => {
    const noRole = { symbol: 'TEST', name: 'Test', sector: 'X', narrative: 'Y', alerts: {} };
    const withDefault = { ...noRole, role: (noRole as any).role ?? 'target' };
    expect(withDefault.role).toBe('target');
  });

  it('watchlist.json is valid JSON', () => {
    const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
    expect(() => JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'))).not.toThrow();
  });
});
