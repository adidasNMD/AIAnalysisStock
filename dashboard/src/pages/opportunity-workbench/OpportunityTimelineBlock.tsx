import type { OpportunityActionTimelineEntry } from '../../api';
import {
  timelineDecisionLabel,
  timelineDecisionTone,
  timelineDriverLabel,
  timelineSourceLabel,
} from './model';

type OpportunityTimelineBlockProps = {
  entries?: OpportunityActionTimelineEntry[];
  limit?: number;
};

export function OpportunityTimelineBlock({ entries = [], limit = 3 }: OpportunityTimelineBlockProps) {
  if (entries.length === 0) return null;
  const safeLimit = Math.max(1, limit);

  return (
    <div className="op-timeline-list">
      {entries.slice(0, safeLimit).map((entry) => (
        <div key={entry.id} className="op-timeline-entry">
          <div className="op-timeline-top">
            <div className="op-timeline-chips">
              <span className={`diff-chip ${timelineDecisionTone(entry.decision)}`}>
                {timelineDecisionLabel(entry.decision)}
              </span>
              <span className="timeline-chip">{timelineDriverLabel(entry.driver)}</span>
              <span className="timeline-chip muted">{timelineSourceLabel(entry.source)}</span>
            </div>
            <span className="stream-time">{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
          <div className="op-timeline-label">{entry.label}</div>
          <div className="op-timeline-detail">{entry.detail}</div>
          {entry.reasonSummary && (
            <div className="op-timeline-reason">
              {entry.reasonSummary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
