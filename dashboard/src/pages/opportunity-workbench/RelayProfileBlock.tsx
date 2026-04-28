import { ArrowRight, Cable, Flame, Layers3 } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import { heatInflectionLabel } from './model';

type RelayProfileBlockProps = {
  opportunity: OpportunitySummary;
};

export function RelayProfileBlock({ opportunity }: RelayProfileBlockProps) {
  if (opportunity.type !== 'relay_chain' || !opportunity.heatProfile) return null;

  return (
    <>
      <div className="today-meta">
        {opportunity.heatProfile.validationStatus && <span>{opportunity.heatProfile.validationStatus}</span>}
        {typeof opportunity.heatProfile.breadthScore === 'number' && <span>Breadth {opportunity.heatProfile.breadthScore}</span>}
        {typeof opportunity.heatProfile.edgeCount === 'number' && <span>Edges {opportunity.heatProfile.edgeCount}</span>}
      </div>
      <div className="relay-lane compact">
        <div className="relay-lane-block">
          <span className="relay-label">Leader</span>
          <div className="tc-tickers">
            {(opportunity.leaderTicker || opportunity.primaryTicker)
              ? <span className="ticker-pill">${opportunity.leaderTicker || opportunity.primaryTicker}</span>
              : <span className="ticker-more">待补</span>}
          </div>
        </div>
        <div className="relay-arrow">→</div>
        <div className="relay-lane-block">
          <span className="relay-label">Bottleneck</span>
          <div className="tc-tickers">
            {opportunity.heatProfile.bottleneckTickers.length > 0 ? opportunity.heatProfile.bottleneckTickers.slice(0, 3).map((ticker) => (
              <span key={ticker} className="ticker-pill">${ticker}</span>
            )) : <span className="ticker-more">待补</span>}
          </div>
        </div>
        <div className="relay-arrow">→</div>
        <div className="relay-lane-block">
          <span className="relay-label">Laggard</span>
          <div className="tc-tickers">
            {opportunity.heatProfile.laggardTickers.length > 0 ? opportunity.heatProfile.laggardTickers.slice(0, 3).map((ticker) => (
              <span key={ticker} className="ticker-pill">${ticker}</span>
            )) : <span className="ticker-more">待补</span>}
          </div>
        </div>
      </div>
      {opportunity.heatProfile.validationSummary && (
        <div className="op-card-detail">
          <div><Flame size={12} /> {opportunity.heatProfile.validationSummary}</div>
        </div>
      )}
      {opportunity.heatInflection && (
        <div className="today-diff">
          <span className={`diff-chip ${opportunity.heatInflection.kind === 'breakdown' || opportunity.heatInflection.kind === 'weakening' ? 'changed' : 'stable'}`}>
            {heatInflectionLabel(opportunity.heatInflection.kind)}
          </span>
          <span className="today-diff-summary">{opportunity.heatInflection.summary}</span>
        </div>
      )}
      {opportunity.heatProfile.leaderHealth && (
        <div className="op-card-detail">
          <div><Cable size={12} /> {opportunity.heatProfile.leaderHealth}</div>
        </div>
      )}
      {(opportunity.heatProfile.edges || []).length > 0 && (
        <div className="op-card-detail">
          {(opportunity.heatProfile.edges || []).slice(0, 2).map((edge) => (
            <div key={edge.id}><ArrowRight size={12} /> {edge.from} → {edge.to}: {edge.reason}</div>
          ))}
        </div>
      )}
      {(opportunity.recentHeatHistory || []).length > 1 && (
        <div className="op-card-detail">
          {(opportunity.recentHeatHistory || []).slice(-4).map((point) => (
            <div key={point.snapshotId}>
              <Layers3 size={12} />
              {new Date(point.createdAt).toLocaleDateString()} · {point.validationStatus || point.temperature || 'n/a'} · Relay {point.relayScore}
              {typeof point.breadthScore === 'number' ? ` · Breadth ${point.breadthScore}` : ''}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
