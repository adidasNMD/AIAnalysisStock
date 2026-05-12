import { describe, expect, it } from 'vitest';

import type { DynamicTicker } from '../../dashboard/src/api';
import {
  buildWatchlistGroups,
  buildWatchlistPriceMove,
  buildWatchlistStats,
  buildWatchlistVisibleGroups,
  filterWatchlistTickers,
  sortWatchlistTickers,
  watchlistChainLevelLabel,
  watchlistStatusLabel,
} from '../../dashboard/src/pages/watchlist-state';

function makeTicker(overrides: Partial<DynamicTicker> = {}): DynamicTicker {
  return {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    discoveredAt: '2026-05-06T09:00:00.000Z',
    trendName: 'AI infrastructure',
    chainLevel: 'sector_leader',
    multibaggerScore: 90,
    discoverySource: 'TrendRadar',
    reasoning: 'Leader signal remains strong.',
    status: 'focused',
    ...overrides,
  };
}

describe('watchlist state helpers', () => {
  it('filters across ticker fields', () => {
    const tickers = [
      makeTicker({ symbol: 'NVDA', name: 'NVIDIA', trendName: 'AI infrastructure' }),
      makeTicker({ symbol: 'VRT', name: 'Vertiv', trendName: 'Power cooling', status: 'watching' }),
      makeTicker({ symbol: 'ANET', name: 'Arista', discoverySource: 'Heat Transfer Graph', status: 'discovered' }),
    ];

    expect(filterWatchlistTickers(tickers, 'power').map((ticker) => ticker.symbol)).toEqual(['VRT']);
    expect(filterWatchlistTickers(tickers, 'heat transfer').map((ticker) => ticker.symbol)).toEqual(['ANET']);
    expect(filterWatchlistTickers(tickers, '').map((ticker) => ticker.symbol)).toEqual(['NVDA', 'VRT', 'ANET']);
  });

  it('sorts by score, discovery time, then symbol', () => {
    const sorted = sortWatchlistTickers([
      makeTicker({ symbol: 'BBB', multibaggerScore: 50, discoveredAt: '2026-05-05T09:00:00.000Z' }),
      makeTicker({ symbol: 'AAA', multibaggerScore: 50, discoveredAt: '2026-05-06T09:00:00.000Z' }),
      makeTicker({ symbol: 'CCC', multibaggerScore: 90, discoveredAt: '2026-05-04T09:00:00.000Z' }),
    ]);

    expect(sorted.map((ticker) => ticker.symbol)).toEqual(['CCC', 'AAA', 'BBB']);
  });

  it('builds status stats and ordered groups', () => {
    const tickers = [
      makeTicker({ symbol: 'NVDA', status: 'focused', multibaggerScore: 90 }),
      makeTicker({ symbol: 'VRT', status: 'watching', multibaggerScore: 70 }),
      makeTicker({ symbol: 'ANET', status: 'discovered', multibaggerScore: 50 }),
      makeTicker({ symbol: 'OLD', status: 'expired', multibaggerScore: 10 }),
    ];

    expect(buildWatchlistStats(tickers)).toEqual({
      total: 4,
      focused: 1,
      watching: 1,
      discovered: 1,
      expired: 1,
      averageScore: 55,
      topScore: 90,
    });

    expect(buildWatchlistGroups(tickers).map((group) => group.status)).toEqual(['focused', 'watching', 'discovered', 'expired']);
  });

  it('formats labels and price movement', () => {
    expect(watchlistStatusLabel('focused')).toBe('重点关注');
    expect(watchlistChainLevelLabel('bottleneck')).toBe('瓶颈环节');
    expect(buildWatchlistPriceMove(makeTicker({ priceAtDiscovery: 100, currentPrice: 112 }))).toEqual({
      label: '+12.0%',
      tone: 'positive',
    });
    expect(buildWatchlistPriceMove(makeTicker({ priceAtDiscovery: 100, currentPrice: 94 }))).toEqual({
      label: '-6.0%',
      tone: 'negative',
    });
    expect(buildWatchlistPriceMove(makeTicker())).toBeNull();
  });

  it('limits large groups until they are expanded', () => {
    const focused = Array.from({ length: 12 }, (_, index) => makeTicker({
      symbol: `F${index}`,
      status: 'focused',
      multibaggerScore: 90 - index,
    }));
    const watching = Array.from({ length: 3 }, (_, index) => makeTicker({
      symbol: `W${index}`,
      status: 'watching',
      multibaggerScore: 70 - index,
    }));
    const groups = buildWatchlistGroups([...focused, ...watching]);
    const collapsed = buildWatchlistVisibleGroups(groups, [], 5);
    const expanded = buildWatchlistVisibleGroups(groups, ['focused'], 5);

    expect(collapsed[0]).toMatchObject({
      status: 'focused',
      hiddenCount: 7,
      isExpanded: false,
    });
    expect(collapsed[0].visibleItems).toHaveLength(5);
    expect(collapsed[1].visibleItems).toHaveLength(3);

    expect(expanded[0]).toMatchObject({
      status: 'focused',
      hiddenCount: 0,
      isExpanded: true,
    });
    expect(expanded[0].visibleItems).toHaveLength(12);
  });
});
