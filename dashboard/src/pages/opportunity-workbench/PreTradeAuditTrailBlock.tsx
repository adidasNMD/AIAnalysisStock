import { History, ShieldCheck } from 'lucide-react';
import type { OpportunityEvent, OpportunitySummary } from '../../api';
import { buildPreTradeAuditTrail } from './pretrade-audit';

type PreTradeAuditTrailBlockProps = {
  opportunity: OpportunitySummary;
  localEvents?: OpportunityEvent[];
};

function formatAuditTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'UNKNOWN';
  return new Date(parsed).toLocaleString();
}

export function PreTradeAuditTrailBlock({
  opportunity,
  localEvents = [],
}: PreTradeAuditTrailBlockProps) {
  const trail = buildPreTradeAuditTrail(opportunity, localEvents);
  if (trail.total === 0) return null;

  return (
    <section
      className="pretrade-audit-trail"
      data-pretrade-audit-trail={opportunity.id}
      data-pretrade-audit-count={trail.total}
      data-pretrade-audit-confirmed={trail.confirmed}
      data-pretrade-audit-reopened={trail.reopened}
    >
      <div className="pretrade-audit-head">
        <div>
          <span className="pretrade-kicker"><ShieldCheck size={13} /> Audit</span>
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
            className={`pretrade-audit-entry ${entry.type === 'pretrade_confirmed' ? 'confirmed' : 'reopened'}`}
            data-pretrade-audit-entry={entry.id}
            data-pretrade-audit-type={entry.type}
            data-pretrade-audit-source={entry.source}
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
