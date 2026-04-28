import { AlertTriangle, ArrowRight, CheckCircle2, History, RotateCcw } from 'lucide-react';
import type { StrategyReviewDigest, StrategyReviewEntry } from './review-digest';

type StrategyReviewPanelProps = {
  digest: StrategyReviewDigest;
  onOpenOpportunity: (opportunity: StrategyReviewEntry['opportunity']) => void;
  onOpenMission: (missionId: string) => void;
};

function toneIcon(entry: StrategyReviewEntry) {
  if (entry.tone === 'negative') return <AlertTriangle size={14} />;
  if (entry.tone === 'positive') return <CheckCircle2 size={14} />;
  return <RotateCcw size={14} />;
}

function formatReviewTime(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'UNKNOWN';
  return new Date(parsed).toLocaleString();
}

export function StrategyReviewPanel({
  digest,
  onOpenOpportunity,
  onOpenMission,
}: StrategyReviewPanelProps) {
  return (
    <section className="strategy-review glass-panel">
      <div className="strategy-review-head">
        <div>
          <h3><History size={17} /> 策略复盘</h3>
          <p>{digest.summary.headline}</p>
        </div>
        <div className="strategy-review-stats">
          <span>{digest.summary.actions} action</span>
          <span>{digest.summary.reviews} review</span>
          <span>{digest.summary.risks} risk</span>
          <span>{digest.summary.recoveries} recovery</span>
        </div>
      </div>

      <div className="strategy-review-summary">
        <span>{digest.summary.detail}</span>
        {digest.summary.thesisChanges > 0 && (
          <span>{digest.summary.thesisChanges} thesis shifts</span>
        )}
      </div>

      <div className="strategy-review-list">
        {digest.entries.length === 0 ? (
          <div className="strategy-review-empty">
            <CheckCircle2 size={16} />
            <span>当前复盘队列稳定。</span>
          </div>
        ) : digest.entries.map((entry) => {
          const missionId = entry.missionId;
          return (
            <article key={entry.id} className={`strategy-review-entry ${entry.tone}`}>
              <div className="strategy-review-entry-main">
                <div className="strategy-review-entry-top">
                  <span className={`strategy-review-icon ${entry.tone}`}>{toneIcon(entry)}</span>
                  <div>
                    <strong>{entry.opportunity.title}</strong>
                    <small>{formatReviewTime(entry.timestamp)}</small>
                  </div>
                </div>
                <div className="strategy-review-label">{entry.label}</div>
                <div className="strategy-review-detail">{entry.detail}</div>
                <div className="strategy-review-chips">
                  {entry.chips.slice(0, 4).map((chip) => (
                    <span key={`${entry.id}_${chip}`} className="timeline-chip muted">{chip}</span>
                  ))}
                </div>
              </div>
              <div className="strategy-review-actions">
                <button type="button" className="secondary-btn tiny" onClick={() => onOpenOpportunity(entry.opportunity)}>
                  详情 <ArrowRight size={12} />
                </button>
                {missionId && (
                  <button type="button" className="secondary-btn tiny" onClick={() => onOpenMission(missionId)}>
                    任务
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
