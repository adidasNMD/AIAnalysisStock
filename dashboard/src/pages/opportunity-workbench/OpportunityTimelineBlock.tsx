import { Sparkles } from 'lucide-react';
import type { OpportunityActionTimelineEntry } from '../../api';
import {
  timelineDecisionLabel,
  timelineDecisionTone,
  timelineDriverLabel,
  timelineSourceLabel,
} from './model';

type OpportunityTimelineBlockProps = {
  entries?: OpportunityActionTimelineEntry[];
};

export function OpportunityTimelineBlock({ entries = [] }: OpportunityTimelineBlockProps) {
  if (entries.length === 0) return null;

  return (
    <div className="op-timeline-list">
      {entries.slice(0, 3).map((entry) => (
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
              <Sparkles size={12} />
              {entry.reasonSummary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
