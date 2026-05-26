import { describe, expect, it } from 'vitest';

import {
  buildTrendRadarPlatformGroups,
  buildTrendRadarSummary,
  buildTrendRadarTopItems,
  type TrendRadarItem,
} from '../../dashboard/src/pages/trend-radar-hub-state';

function makeTrendItem(overrides: Partial<TrendRadarItem> = {}): TrendRadarItem {
  return {
    id: 1,
    title: 'AI infrastructure demand expands',
    url: 'https://example.com',
    rank: 1,
    first_crawl_time: '2026-05-06 09:00:00',
    last_crawl_time: '2026-05-06 10:00:00',
    crawl_count: 10,
    platform_name: 'Newswire',
    ...overrides,
  };
}

describe('trend radar hub state helpers', () => {
  it('summarizes signal, platform, and crawl counts', () => {
    const summary = buildTrendRadarSummary([
      makeTrendItem({ id: 1, platform_name: 'Newswire', crawl_count: 8 }),
      makeTrendItem({ id: 2, platform_name: 'Reddit', crawl_count: 12 }),
      makeTrendItem({ id: 3, platform_name: 'Newswire', crawl_count: 3 }),
    ]);

    expect(summary).toEqual({
      totalItems: 3,
      platformCount: 2,
      totalCrawlCount: 23,
      topCrawlCount: 12,
    });
  });

  it('sorts top items by rank first and crawl count second', () => {
    const top = buildTrendRadarTopItems([
      makeTrendItem({ id: 1, title: 'B', rank: 3, crawl_count: 100 }),
      makeTrendItem({ id: 2, title: 'A', rank: 1, crawl_count: 2 }),
      makeTrendItem({ id: 3, title: 'C', rank: 1, crawl_count: 9 }),
    ]);

    expect(top.map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it('groups platforms once and limits per-platform items', () => {
    const groups = buildTrendRadarPlatformGroups([
      makeTrendItem({ id: 1, platform_name: 'SEC', rank: 2, crawl_count: 4 }),
      makeTrendItem({ id: 2, platform_name: 'SEC', rank: 1, crawl_count: 8 }),
      makeTrendItem({ id: 3, platform_name: 'Reddit', rank: 1, crawl_count: 10 }),
      makeTrendItem({ id: 4, platform_name: 'SEC', rank: 3, crawl_count: 2 }),
    ], 2);

    expect(groups[0]).toMatchObject({
      platformName: 'SEC',
      count: 3,
      totalCrawlCount: 14,
    });
    expect(groups[0].topItems.map((item) => item.id)).toEqual([2, 1]);
    expect(groups[1].platformName).toBe('Reddit');
  });
});
