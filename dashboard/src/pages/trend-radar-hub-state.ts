import type { TrendRadarResult } from '../api';

export type TrendRadarItem = TrendRadarResult['items'][number];

export interface TrendRadarPlatformGroup {
  platformName: string;
  count: number;
  totalCrawlCount: number;
  topItems: TrendRadarItem[];
}

export interface TrendRadarSummary {
  totalItems: number;
  platformCount: number;
  totalCrawlCount: number;
  topCrawlCount: number;
}

export const TREND_RADAR_TOP_LIMIT = 20;
export const TREND_RADAR_PLATFORM_ITEM_LIMIT = 5;

function sortTrendItems(a: TrendRadarItem, b: TrendRadarItem): number {
  const rankDelta = (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER);
  if (rankDelta !== 0) return rankDelta;

  const crawlDelta = b.crawl_count - a.crawl_count;
  if (crawlDelta !== 0) return crawlDelta;

  return a.title.localeCompare(b.title);
}

export function buildTrendRadarSummary(items: TrendRadarItem[]): TrendRadarSummary {
  const platforms = new Set<string>();
  let totalCrawlCount = 0;
  let topCrawlCount = 0;

  for (const item of items) {
    platforms.add(item.platform_name || 'Unknown');
    totalCrawlCount += item.crawl_count || 0;
    topCrawlCount = Math.max(topCrawlCount, item.crawl_count || 0);
  }

  return {
    totalItems: items.length,
    platformCount: platforms.size,
    totalCrawlCount,
    topCrawlCount,
  };
}

export function buildTrendRadarTopItems(
  items: TrendRadarItem[],
  limit = TREND_RADAR_TOP_LIMIT,
): TrendRadarItem[] {
  return [...items].sort(sortTrendItems).slice(0, Math.max(0, limit));
}

export function buildTrendRadarPlatformGroups(
  items: TrendRadarItem[],
  perPlatformLimit = TREND_RADAR_PLATFORM_ITEM_LIMIT,
): TrendRadarPlatformGroup[] {
  const map = new Map<string, TrendRadarItem[]>();

  for (const item of items) {
    const platformName = item.platform_name || 'Unknown';
    const group = map.get(platformName) || [];
    group.push(item);
    map.set(platformName, group);
  }

  return Array.from(map.entries())
    .map(([platformName, groupItems]) => {
      const sorted = [...groupItems].sort(sortTrendItems);
      return {
        platformName,
        count: sorted.length,
        totalCrawlCount: sorted.reduce((sum, item) => sum + (item.crawl_count || 0), 0),
        topItems: sorted.slice(0, Math.max(0, perPlatformLimit)),
      };
    })
    .sort((a, b) => b.count - a.count || b.totalCrawlCount - a.totalCrawlCount || a.platformName.localeCompare(b.platformName));
}
