export interface RawTrendItem {
  id: number;
  title: string;
  url: string;
  first_crawl_time: string;
  last_crawl_time: string;
  platform_name: string;
  source_type: string;
  matched: number;
  matched_tag: string | null;
}

export type RawTrendFilterType = 'all' | 'accepted' | 'rejected' | 'unprocessed' | 'rss' | 'hotlist';

export interface RawTrendFilterState {
  filterType: RawTrendFilterType | string;
  activePlatform: string;
  searchQuery?: string;
}

export interface RawTrendStats {
  total: number;
  accepted: number;
  rejected: number;
  unprocessed: number;
  rss: number;
  hotlist: number;
}

export interface RawTrendPageInfo {
  currentPage: number;
  totalPages: number;
  visibleStart: number;
  visibleEnd: number;
}

export const RAW_TREND_PAGE_SIZE = 80;

function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function matchesSearch(item: RawTrendItem, searchQuery: string | undefined): boolean {
  const query = normalizeSearchText(searchQuery);
  if (!query) return true;

  const haystack = [
    item.title,
    item.url,
    item.platform_name,
    item.source_type,
    item.matched_tag,
  ].map(normalizeSearchText).join(' ');

  return haystack.includes(query);
}

function matchesFilterType(item: RawTrendItem, filterType: string): boolean {
  if (filterType === 'accepted') return item.matched === 1;
  if (filterType === 'rejected') return item.matched === 0;
  if (filterType === 'unprocessed') return item.matched === -1;
  if (filterType === 'rss') return item.source_type === 'rss';
  if (filterType === 'hotlist') return item.source_type === 'hotlist';
  return true;
}

export function buildRawTrendPlatformTabs(items: RawTrendItem[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const platform = item.platform_name || 'Unknown';
    counts.set(platform, (counts.get(platform) || 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function buildRawTrendStats(items: RawTrendItem[]): RawTrendStats {
  return items.reduce<RawTrendStats>((stats, item) => {
    stats.total += 1;
    if (item.matched === 1) stats.accepted += 1;
    if (item.matched === 0) stats.rejected += 1;
    if (item.matched === -1) stats.unprocessed += 1;
    if (item.source_type === 'rss') stats.rss += 1;
    if (item.source_type === 'hotlist') stats.hotlist += 1;
    return stats;
  }, {
    total: 0,
    accepted: 0,
    rejected: 0,
    unprocessed: 0,
    rss: 0,
    hotlist: 0,
  });
}

export function filterRawTrendItems(items: RawTrendItem[], state: RawTrendFilterState): RawTrendItem[] {
  return items.filter((item) => {
    if (!matchesFilterType(item, state.filterType)) return false;
    if (state.activePlatform !== 'all' && item.platform_name !== state.activePlatform) return false;
    return matchesSearch(item, state.searchQuery);
  });
}

export function clampRawTrendPage(page: number, itemCount: number, pageSize = RAW_TREND_PAGE_SIZE): number {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.ceil(Math.max(0, itemCount) / safePageSize);
  if (totalPages <= 0) return 0;

  const safePage = Number.isFinite(page) ? Math.floor(page) : 0;
  return Math.min(Math.max(safePage, 0), totalPages - 1);
}

export function buildRawTrendPageInfo(
  itemCount: number,
  requestedPage: number,
  pageSize = RAW_TREND_PAGE_SIZE,
): RawTrendPageInfo {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safeItemCount = Math.max(0, itemCount);
  const totalPages = Math.ceil(safeItemCount / safePageSize);
  const currentPage = clampRawTrendPage(requestedPage, safeItemCount, safePageSize);

  if (safeItemCount === 0) {
    return { currentPage, totalPages: 0, visibleStart: 0, visibleEnd: 0 };
  }

  return {
    currentPage,
    totalPages,
    visibleStart: currentPage * safePageSize + 1,
    visibleEnd: Math.min((currentPage + 1) * safePageSize, safeItemCount),
  };
}

export function paginateRawTrendItems(
  items: RawTrendItem[],
  requestedPage: number,
  pageSize = RAW_TREND_PAGE_SIZE,
): RawTrendItem[] {
  const pageInfo = buildRawTrendPageInfo(items.length, requestedPage, pageSize);
  const start = pageInfo.currentPage * Math.max(1, Math.floor(pageSize));
  return items.slice(start, start + Math.max(1, Math.floor(pageSize)));
}
