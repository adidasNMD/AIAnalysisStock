import { BellRing, History } from 'lucide-react';
import type { OpportunityEvent, OpportunitySummary } from '../../api';
import { buildCatalystReminderAuditTrail } from './catalyst-reminder-audit';

type CatalystReminderAuditTrailBlockProps = {
  opportunity: OpportunitySummary;
  localEvents?: OpportunityEvent[];
};

function formatAuditTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'UNKNOWN';
  return new Date(parsed).toLocaleString();
}

export function CatalystReminderAuditTrailBlock({
  opportunity,
  localEvents = [],
}: CatalystReminderAuditTrailBlockProps) {
  const trail = buildCatalystReminderAuditTrail(opportunity, localEvents);
  if (trail.total === 0) return null;

  return (
    <section
      className="pretrade-audit-trail catalyst-audit-trail"
      data-catalyst-audit-trail={opportunity.id}
      data-catalyst-audit-count={trail.total}
      data-catalyst-audit-subscribed={trail.subscribed}
    >
      <div className="pretrade-audit-head">
        <div>
          <span className="pretrade-kicker"><BellRing size={13} /> Reminder audit</span>
          <strong>{trail.label}</strong>
        </div>
        {trail.latestAt && (
          <span className="timeline-chip muted"><History size={12} /> {formatAuditTime(trail.latestAt)}</span>
        )}
      </div>
      <p>{trail.detail}</p>
      <div className="pretrade-audit-list">
        {trail.entries.map((entry) => (
          <article
            key={`${opportunity.id}_${entry.id}`}
            className={`pretrade-audit-entry catalyst-${entry.preference}`}
            data-catalyst-audit-entry={entry.id}
            data-catalyst-audit-preference={entry.preference}
            data-catalyst-audit-source={entry.source}
          >
            <div>
              <strong>{entry.label}</strong>
              <small>{formatAuditTime(entry.timestamp)}</small>
            </div>
            <span>{entry.detail}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
