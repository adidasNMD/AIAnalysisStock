import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import { buildPreTradeChecklist, type PreTradeChecklistItem } from './pretrade';

type PreTradeChecklistBlockProps = {
  opportunity: OpportunitySummary;
  compact?: boolean;
};

function itemIcon(item: PreTradeChecklistItem) {
  if (item.status === 'pass') return <CheckCircle2 size={13} />;
  if (item.status === 'block') return <AlertTriangle size={13} />;
  return <CircleDashed size={13} />;
}

export function PreTradeChecklistBlock({ opportunity, compact = false }: PreTradeChecklistBlockProps) {
  const checklist = buildPreTradeChecklist(opportunity);
  const visibleItems = compact
    ? checklist.items.filter((item) => item.status !== 'pass').slice(0, 3)
    : checklist.items;

  return (
    <section className={`pretrade-block ${checklist.readiness} ${compact ? 'compact' : ''}`}>
      <div className="pretrade-header">
        <div>
          <span className="pretrade-kicker"><ShieldCheck size={13} /> Pre-trade</span>
          <strong>{checklist.label} {checklist.score}</strong>
        </div>
        <div className="pretrade-counts">
          <span>{checklist.blockers} block</span>
          <span>{checklist.warnings} warn</span>
        </div>
      </div>
      {!compact && (
        <div className="pretrade-next">{checklist.nextAction}</div>
      )}
      <div className="pretrade-items">
        {visibleItems.length === 0 ? (
          <div className="pretrade-item pass">
            <CheckCircle2 size={13} />
            <div>
              <span>All checks</span>
              <small>当前没有阻塞项。</small>
            </div>
          </div>
        ) : visibleItems.map((item) => (
          <div key={`${opportunity.id}_${item.id}`} className={`pretrade-item ${item.status}`}>
            {itemIcon(item)}
            <div>
              <span>{item.label}</span>
              <small>{item.detail}</small>
              {!compact && item.action && <small className="pretrade-action">{item.action}</small>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
