import type { OpportunitySummary } from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import { scoreLabel, statusTone, type LiveRankBadge } from './model';
import { formatLiveAge, liveSignalLabel } from './live';

type PriorityReason = {
  label: string;
  tone: 'stable' | 'changed';
  detail: string;
};

type OpportunityCardHeaderProps = {
  opportunity: OpportunitySummary;
  liveNow: number;
  livePriorityEvent?: OpportunityStreamEvent | null;
  liveRankBadge?: LiveRankBadge | null;
  priorityReason?: PriorityReason | null;
};

export function OpportunityCardHeader({
  opportunity,
  liveNow,
  livePriorityEvent,
  liveRankBadge,
  priorityReason,
}: OpportunityCardHeaderProps) {
  return (
    <>
      <div className="op-card-top">
        <span className={`consensus-badge ${statusTone(opportunity.status)}`}>
          {opportunity.stage} / {opportunity.status}
        </span>
        <div className="today-card-rank">
          {liveRankBadge && (
            <span className={`live-rank-badge ${liveRankBadge.state}`} title={liveRankBadge.detail}>
              {liveRankBadge.label}
            </span>
          )}
          <span className="today-run">{scoreLabel(opportunity)}</span>
        </div>
      </div>
      <h4>{opportunity.title}</h4>
      {livePriorityEvent && (
        <div className="today-live-priority">
          <div className="today-live-priority-top">
            <span className="live-dot-small" />
            <span className="today-live-priority-label">{liveSignalLabel(livePriorityEvent)}</span>
            <span className="today-live-priority-age">{formatLiveAge(livePriorityEvent.timestamp, liveNow)}</span>
          </div>
          <div className="today-live-priority-detail">{livePriorityEvent.message}</div>
        </div>
      )}
      {priorityReason && (
        <div className="today-diff">
          <span className={`diff-chip ${priorityReason.tone}`}>{priorityReason.label}</span>
          <span className="today-diff-summary">{priorityReason.detail}</span>
        </div>
      )}
      {opportunity.whyNowSummary && (
        <div className="today-diff">
          <span className="diff-chip stable">WHY NOW</span>
          <span className="today-diff-summary">{opportunity.whyNowSummary}</span>
        </div>
      )}
      <p className="op-card-thesis">{opportunity.thesis || opportunity.summary || '等待补充 thesis'}</p>
    </>
  );
}
