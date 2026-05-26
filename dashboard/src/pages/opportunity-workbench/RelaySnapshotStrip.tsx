import { Cable } from 'lucide-react';
import type { HeatTransferGraph } from '../../api';

type RelaySnapshotStripProps = {
  snapshots: HeatTransferGraph[];
  automationAction: 'radar' | 'graph' | null;
  onRunHeatGraphSync: () => void;
  onSeedRelayOpportunity: (snapshot: HeatTransferGraph) => void;
};

export function RelaySnapshotStrip({
  snapshots,
  automationAction,
  onRunHeatGraphSync,
  onSeedRelayOpportunity,
}: RelaySnapshotStripProps) {
  if (snapshots.length === 0) return null;

  return (
    <div className="relay-snapshot-strip glass-panel">
      <div className="op-board-header">
        <div>
          <h3><Cable size={16} /> Watchlist Heat Snapshot</h3>
          <p>后端自动把动态观察池组织成传导图，再同步成 relay opportunity。</p>
        </div>
        <div className="op-board-actions">
          <span className="header-count">{snapshots.length} graphs</span>
          <button type="button" className="secondary-btn" onClick={onRunHeatGraphSync} disabled={automationAction !== null}>
            {automationAction === 'graph' ? '同步中...' : '同步自动建图'}
          </button>
        </div>
      </div>
      <div className="relay-snapshot-list">
        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="relay-snapshot-card">
            <div className="today-card-top">
              <strong>{snapshot.theme}</strong>
              <div className="today-actions">
                <span className="today-run">Relay {snapshot.relayScore}</span>
                <button type="button" className="secondary-btn" onClick={() => onSeedRelayOpportunity(snapshot)}>
                  生成机会卡
                </button>
              </div>
            </div>
            <div className="today-diff">
              <span className={`diff-chip ${snapshot.temperature === 'hot' || snapshot.temperature === 'warming' ? 'changed' : 'stable'}`}>
                {snapshot.temperature.toUpperCase()}
              </span>
              <span className="today-diff-summary">{snapshot.validationSummary}</span>
            </div>
            <div className="today-meta">
              <span>Breadth {snapshot.breadthScore}</span>
              <span>Edges {snapshot.edgeCount}</span>
              <span>{snapshot.validationStatus}</span>
            </div>
            <div className="relay-lane">
              <div className="relay-lane-block">
                <span className="relay-label">Leader</span>
                <div className="tc-tickers">
                  {snapshot.leaderTicker ? <span className="ticker-pill">${snapshot.leaderTicker}</span> : <span className="ticker-more">待补</span>}
                </div>
              </div>
              <div className="relay-arrow">→</div>
              <div className="relay-lane-block">
                <span className="relay-label">Bottleneck</span>
                <div className="tc-tickers">
                  {snapshot.bottleneckTickers.length > 0 ? snapshot.bottleneckTickers.slice(0, 3).map((ticker) => (
                    <span key={ticker} className="ticker-pill">${ticker}</span>
                  )) : <span className="ticker-more">待补</span>}
                </div>
              </div>
              <div className="relay-arrow">→</div>
              <div className="relay-lane-block">
                <span className="relay-label">Laggard</span>
                <div className="tc-tickers">
                  {snapshot.laggardTickers.length > 0 ? snapshot.laggardTickers.slice(0, 3).map((ticker) => (
                    <span key={ticker} className="ticker-pill">${ticker}</span>
                  )) : <span className="ticker-more">待补</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
