import { Eye, Star, TrendingUp } from 'lucide-react';
import { fetchDynamicWatchlist } from '../api';
import type { DynamicTicker } from '../api';
import { usePolling } from '../hooks/useAgentStream';

export function Watchlist() {
  const { data: tickers } = usePolling<DynamicTicker[]>(() => fetchDynamicWatchlist(), 10000, []);

  const focused = tickers?.filter(t => t.status === 'focused') || [];
  const watching = tickers?.filter(t => t.status === 'watching') || [];
  const aging = tickers?.filter(t => t.status === 'aging') || [];

  return (
    <div className="page watchlist">
      <div className="page-header">
        <h1><Eye size={24} /> 动态监控池</h1>
        <div className="header-count">{tickers?.length || 0} 只标的</div>
      </div>

      {(!tickers || tickers.length === 0) ? (
        <div className="empty-state">
          <Star size={48} />
          <p>监控池为空</p>
          <p className="hint">TrendRadar 扫描会自动发现新标的</p>
        </div>
      ) : (
        <>
          {focused.length > 0 && (
            <section className="wl-section">
              <h3 className="wl-section-title focused"><Star size={14} /> 重点关注 ({focused.length})</h3>
              <div className="wl-grid">
                {focused.map(t => <TickerCard key={t.symbol} ticker={t} />)}
              </div>
            </section>
          )}

          {watching.length > 0 && (
            <section className="wl-section">
              <h3 className="wl-section-title watching"><Eye size={14} /> 观察中 ({watching.length})</h3>
              <div className="wl-grid">
                {watching.map(t => <TickerCard key={t.symbol} ticker={t} />)}
              </div>
            </section>
          )}

          {aging.length > 0 && (
            <section className="wl-section">
              <h3 className="wl-section-title aging"><TrendingUp size={14} /> 老化 ({aging.length})</h3>
              <div className="wl-grid">
                {aging.map(t => <TickerCard key={t.symbol} ticker={t} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TickerCard({ ticker: t }: { ticker: DynamicTicker }) {
  return (
    <div className="wl-card glass-panel">
      <div className="wl-card-header">
        <span className="wl-symbol">{t.symbol}</span>
        <span className={`wl-status ${t.status}`}>{t.status.toUpperCase()}</span>
      </div>
      <div className="wl-name">{t.name}</div>
      <div className="wl-stats">
        <div className="wl-stat">
          <span className="wl-stat-label">Score</span>
          <span className="wl-stat-value">{t.multibaggerScore}</span>
        </div>
        <div className="wl-stat">
          <span className="wl-stat-label">Tier</span>
          <span className="wl-stat-value">{t.chainLevel}</span>
        </div>
      </div>
      <div className="wl-source">来源: {t.discoverySource}</div>
    </div>
  );
}
