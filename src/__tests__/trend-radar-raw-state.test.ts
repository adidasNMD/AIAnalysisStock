import { describe, expect, it } from 'vitest';

import {
  RAW_TREND_PAGE_SIZE,
  buildRawTrendPageInfo,
  buildRawTrendPlatformTabs,
  buildRawTrendStats,
  clampRawTrendPage,
  filterRawTrendItems,
  paginateRawTrendItems,
  type RawTrendItem,
} from '../../dashboard/src/pages/trend-radar-raw-state';

function makeRawItem(overrides: Partial<RawTrendItem> = {}): RawTrendItem {
  return {
    id: 1,
    title: 'AI infrastructure demand expands',
    url: 'https://example.com/ai',
    first_crawl_time: '2026-05-06 08:00:00',
    last_crawl_time: '2026-05-06 09:00:00',
    platform_name: 'Newswire',
    source_type: 'rss',
    matched: 1,
    matched_tag: 'AI infrastructure',
    ...overrides,
  };
}

describe('trend radar raw state helpers', () => {
  it('builds source platform tabs sorted by count then name', () => {
    const tabs = buildRawTrendPlatformTabs([
      makeRawItem({ id: 1, platform_name: 'Weibo Hot' }),
      makeRawItem({ id: 2, platform_name: 'SEC RSS' }),
      makeRawItem({ id: 3, platform_name: 'SEC RSS' }),
      makeRawItem({ id: 4, platform_name: 'Reddit AI' }),
      makeRawItem({ id: 5, platform_name: 'Reddit AI' }),
    ]);

    expect(tabs).toEqual([
      ['Reddit AI', 2],
      ['SEC RSS', 2],
      ['Weibo Hot', 1],
    ]);
  });

  it('summarizes status and source type counts', () => {
    const stats = buildRawTrendStats([
      makeRawItem({ id: 1, matched: 1, source_type: 'rss' }),
      makeRawItem({ id: 2, matched: 0, source_type: 'hotlist' }),
      makeRawItem({ id: 3, matched: -1, source_type: 'rss' }),
    ]);

    expect(stats).toEqual({
      total: 3,
      accepted: 1,
      rejected: 1,
      unprocessed: 1,
      rss: 2,
      hotlist: 1,
    });
  });

  it('filters by status, source, platform, and text search', () => {
    const items = [
      makeRawItem({ id: 1, title: 'AI supplier earnings', platform_name: 'Newswire', matched: 1, matched_tag: 'AI' }),
      makeRawItem({ id: 2, title: 'Sports headline', platform_name: 'Weibo Hot', matched: 0, source_type: 'hotlist', matched_tag: 'Noise' }),
      makeRawItem({ id: 3, title: 'Unprocessed power headline', platform_name: 'Reddit AI', matched: -1, matched_tag: null }),
    ];

    expect(filterRawTrendItems(items, { filterType: 'accepted', activePlatform: 'all' }).map((item) => item.id)).toEqual([1]);
    expect(filterRawTrendItems(items, { filterType: 'hotlist', activePlatform: 'all' }).map((item) => item.id)).toEqual([2]);
    expect(filterRawTrendItems(items, { filterType: 'all', activePlatform: 'Reddit AI' }).map((item) => item.id)).toEqual([3]);
    expect(filterRawTrendItems(items, { filterType: 'all', activePlatform: 'all', searchQuery: 'power' }).map((item) => item.id)).toEqual([3]);
    expect(filterRawTrendItems(items, { filterType: 'rejected', activePlatform: 'Weibo Hot', searchQuery: 'noise' }).map((item) => item.id)).toEqual([2]);
  });

  it('clamps pages and returns empty ranges for empty data', () => {
    expect(clampRawTrendPage(-2, 300, RAW_TREND_PAGE_SIZE)).toBe(0);
    expect(clampRawTrendPage(99, 81, RAW_TREND_PAGE_SIZE)).toBe(1);
    expect(clampRawTrendPage(Number.NaN, 81, RAW_TREND_PAGE_SIZE)).toBe(0);
    expect(buildRawTrendPageInfo(0, 5, RAW_TREND_PAGE_SIZE)).toEqual({
      currentPage: 0,
      totalPages: 0,
      visibleStart: 0,
      visibleEnd: 0,
    });
  });

  it('paginates with stable visible ranges', () => {
    const items = Array.from({ length: 185 }, (_, index) => makeRawItem({ id: index + 1 }));
    const secondPage = paginateRawTrendItems(items, 1, RAW_TREND_PAGE_SIZE);
    const pageInfo = buildRawTrendPageInfo(items.length, 2, RAW_TREND_PAGE_SIZE);

    expect(secondPage).toHaveLength(RAW_TREND_PAGE_SIZE);
    expect(secondPage[0].id).toBe(RAW_TREND_PAGE_SIZE + 1);
    expect(pageInfo).toEqual({
      currentPage: 2,
      totalPages: 3,
      visibleStart: 161,
      visibleEnd: 185,
    });
  });
});
