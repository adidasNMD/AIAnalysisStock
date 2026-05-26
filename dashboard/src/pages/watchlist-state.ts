import type { DynamicTicker } from '../api';

export interface WatchlistStatusGroup {
  status: DynamicTicker['status'];
  label: string;
  items: DynamicTicker[];
}

export interface WatchlistVisibleStatusGroup extends WatchlistStatusGroup {
  visibleItems: DynamicTicker[];
  hiddenCount: number;
  isExpanded: boolean;
}

export interface WatchlistStats {
  total: number;
  focused: number;
  watching: number;
  discovered: number;
  expired: number;
  averageScore: number;
  topScore: number;
}

export interface WatchlistPriceMove {
  label: string;
  tone: 'positive' | 'negative' | 'flat';
}

const statusLabels: Record<DynamicTicker['status'], string> = {
  focused: '重点关注',
  watching: '观察中',
  discovered: '待观察',
  expired: '已过期',
};

const chainLevelLabels: Record<DynamicTicker['chainLevel'], string> = {
  sector_leader: '板块龙头',
  bottleneck: '瓶颈环节',
  hidden_gem: '潜伏补涨',
};

const statusOrder: DynamicTicker['status'][] = ['focused', 'watching', 'discovered', 'expired'];

export const WATCHLIST_GROUP_PREVIEW_LIMIT = 9;

function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function tickerTime(ticker: DynamicTicker): number {
  const timestamp = ticker.discoveredAt ? Date.parse(ticker.discoveredAt) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function watchlistStatusLabel(status: DynamicTicker['status']): string {
  return statusLabels[status] || status;
}

export function watchlistChainLevelLabel(chainLevel: DynamicTicker['chainLevel']): string {
  return chainLevelLabels[chainLevel] || chainLevel;
}

export function sortWatchlistTickers(tickers: DynamicTicker[]): DynamicTicker[] {
  return [...tickers].sort((a, b) => {
    const scoreDelta = b.multibaggerScore - a.multibaggerScore;
    if (scoreDelta !== 0) return scoreDelta;

    const timeDelta = tickerTime(b) - tickerTime(a);
    if (timeDelta !== 0) return timeDelta;

    return a.symbol.localeCompare(b.symbol);
  });
}

export function filterWatchlistTickers(tickers: DynamicTicker[], searchQuery: string): DynamicTicker[] {
  const query = normalizeSearchText(searchQuery);
  if (!query) return tickers;

  return tickers.filter((ticker) => {
    const haystack = [
      ticker.symbol,
      ticker.name,
      ticker.trendName,
      ticker.chainLevel,
      ticker.discoverySource,
      ticker.reasoning,
      ticker.status,
    ].map(normalizeSearchText).join(' ');

    return haystack.includes(query);
  });
}

export function buildWatchlistStats(tickers: DynamicTicker[]): WatchlistStats {
  let totalScore = 0;
  let topScore = 0;
  const stats: WatchlistStats = {
    total: tickers.length,
    focused: 0,
    watching: 0,
    discovered: 0,
    expired: 0,
    averageScore: 0,
    topScore: 0,
  };

  for (const ticker of tickers) {
    stats[ticker.status] += 1;
    totalScore += ticker.multibaggerScore;
    topScore = Math.max(topScore, ticker.multibaggerScore);
  }

  stats.averageScore = tickers.length ? Math.round(totalScore / tickers.length) : 0;
  stats.topScore = topScore;
  return stats;
}

export function buildWatchlistGroups(tickers: DynamicTicker[]): WatchlistStatusGroup[] {
  return statusOrder
    .map((status) => ({
      status,
      label: watchlistStatusLabel(status),
      items: sortWatchlistTickers(tickers.filter((ticker) => ticker.status === status)),
    }))
    .filter((group) => group.items.length > 0);
}

export function buildWatchlistVisibleGroups(
  groups: WatchlistStatusGroup[],
  expandedStatuses: readonly DynamicTicker['status'][],
  previewLimit = WATCHLIST_GROUP_PREVIEW_LIMIT,
): WatchlistVisibleStatusGroup[] {
  const expanded = new Set(expandedStatuses);
  const safeLimit = Math.max(1, Math.floor(previewLimit));

  return groups.map((group) => {
    const isExpanded = expanded.has(group.status);
    const visibleItems = isExpanded ? group.items : group.items.slice(0, safeLimit);
    return {
      ...group,
      visibleItems,
      hiddenCount: Math.max(0, group.items.length - visibleItems.length),
      isExpanded,
    };
  });
}

export function buildWatchlistPriceMove(ticker: DynamicTicker): WatchlistPriceMove | null {
  if (typeof ticker.priceAtDiscovery !== 'number' || typeof ticker.currentPrice !== 'number' || ticker.priceAtDiscovery === 0) {
    return null;
  }

  const percent = ((ticker.currentPrice - ticker.priceAtDiscovery) / ticker.priceAtDiscovery) * 100;
  const tone: WatchlistPriceMove['tone'] = percent > 0.1 ? 'positive' : percent < -0.1 ? 'negative' : 'flat';
  const sign = percent > 0 ? '+' : '';
  return {
    label: `${sign}${percent.toFixed(1)}%`,
    tone,
  };
}
