import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Search, Star, TrendingUp } from 'lucide-react';
import { fetchDynamicWatchlist } from '../api';
import type { DynamicTicker } from '../api';
import { usePolling } from '../hooks/useAgentStream';
import {
  buildWatchlistGroups,
  buildWatchlistPriceMove,
  buildWatchlistStats,
  buildWatchlistVisibleGroups,
  filterWatchlistTickers,
  watchlistChainLevelLabel,
  watchlistStatusLabel,
} from './watchlist-state';
import './watchlist.css';

export function Watchlist() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStatuses, setExpandedStatuses] = useState<DynamicTicker['status'][]>([]);
  const { data: tickers } = usePolling<DynamicTicker[]>(() => fetchDynamicWatchlist(), 10000, []);
  const allTickers = useMemo(() => tickers || [], [tickers]);
  const filteredTickers = useMemo(() => filterWatchlistTickers(allTickers, searchQuery), [allTickers, searchQuery]);
  const groups = useMemo(() => buildWatchlistGroups(filteredTickers), [filteredTickers]);
  const visibleGroups = useMemo(() => buildWatchlistVisibleGroups(groups, expandedStatuses), [groups, expandedStatuses]);
  const stats = useMemo(() => buildWatchlistStats(allTickers), [allTickers]);

  const hasTickers = allTickers.length > 0;
  const hasFilteredTickers = filteredTickers.length > 0;

  const toggleGroup = (status: DynamicTicker['status']) => {
    setExpandedStatuses((current) => (
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status]
    ));
  };

  return (
    <div className="page watchlist">
      <div className="page-header">
        <h1><Eye size={24} /> 动态监控池</h1>
        <div className="header-count">{allTickers.length} 只标的</div>
      </div>

      <div className="wl-toolbar glass-panel">
        <label className="wl-search">
          <Search size={15} aria-hidden="true" />
          <input
            data-watchlist-search="true"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索代码、名称、趋势、来源"
            aria-label="搜索动态监控池"
          />
        </label>
        <div className="wl-summary-strip" aria-label="动态监控池统计">
          <span className="wl-summary-chip strong">全部 {stats.total}</span>
          <span className="wl-summary-chip focused">重点 {stats.focused}</span>
          <span className="wl-summary-chip watching">观察 {stats.watching}</span>
          <span className="wl-summary-chip discovered">待观察 {stats.discovered}</span>
          {stats.expired > 0 && <span className="wl-summary-chip expired">过期 {stats.expired}</span>}
          <span className="wl-summary-chip">均分 {stats.averageScore}</span>
          <span className="wl-summary-chip">最高 {stats.topScore}</span>
        </div>
      </div>

      {!hasTickers ? (
        <div className="empty-state">
          <Star size={48} />
          <p>监控池为空</p>
          <p className="hint">TrendRadar 扫描会自动发现新标的</p>
        </div>
      ) : !hasFilteredTickers ? (
        <div className="empty-state">
          <Search size={48} />
          <p>没有匹配的标的</p>
          <p className="hint">换一个代码、趋势或来源关键词试试</p>
        </div>
      ) : (
        <>
          {visibleGroups.map((group) => (
            <section className="wl-section" key={group.status} data-watchlist-status={group.status}>
              <div className="wl-section-header">
                <h3 className={`wl-section-title ${group.status}`}>
                  {group.status === 'focused' ? <Star size={14} /> : group.status === 'watching' ? <Eye size={14} /> : <TrendingUp size={14} />}
                  {group.label} ({group.items.length})
                </h3>
                {group.items.length > group.visibleItems.length && (
                  <span className="wl-section-meta">先看前 {group.visibleItems.length} 个</span>
                )}
              </div>
              <div className="wl-grid">
                {group.visibleItems.map((ticker) => <TickerCard key={ticker.symbol} ticker={ticker} />)}
              </div>
              {group.items.length > group.visibleItems.length || group.isExpanded ? (
                <button
                  className="wl-group-toggle"
                  type="button"
                  data-watchlist-group-toggle={group.status}
                  onClick={() => toggleGroup(group.status)}
                  aria-expanded={group.isExpanded}
                >
                  {group.isExpanded ? (
                    <>
                      <ChevronUp size={14} /> 收起 {group.label}
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} /> 展开剩余 {group.hiddenCount} 个
                    </>
                  )}
                </button>
              ) : null}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function TickerCard({ ticker: t }: { ticker: DynamicTicker }) {
  const priceMove = buildWatchlistPriceMove(t);

  return (
    <div className="wl-card glass-panel" data-watchlist-card-symbol={t.symbol}>
      <div className="wl-card-header">
        <span className="wl-symbol" title={t.symbol}>{t.symbol}</span>
        <span className={`wl-status ${t.status}`}>{watchlistStatusLabel(t.status)}</span>
      </div>
      <div className="wl-name" title={t.name}>{t.name}</div>
      <div className="wl-stats">
        <div className="wl-stat">
          <span className="wl-stat-label">Score</span>
          <span className="wl-stat-value">{t.multibaggerScore}</span>
        </div>
        <div className="wl-stat">
          <span className="wl-stat-label">Tier</span>
          <span className="wl-stat-value">{watchlistChainLevelLabel(t.chainLevel)}</span>
        </div>
        {priceMove && (
          <div className="wl-stat">
            <span className="wl-stat-label">Move</span>
            <span className={`wl-stat-value wl-move ${priceMove.tone}`}>{priceMove.label}</span>
          </div>
        )}
      </div>
      {t.trendName && <div className="wl-trend" title={t.trendName}>{t.trendName}</div>}
      {t.reasoning && <div className="wl-reasoning" title={t.reasoning}>{t.reasoning}</div>}
      <div className="wl-source" title={t.discoverySource}>来源: {t.discoverySource}</div>
    </div>
  );
}
