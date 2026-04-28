import { BellRing, CalendarClock } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import {
  buildOpportunityCatalystReminders,
  summarizeCatalystReminders,
  type CatalystReminder,
} from './catalyst-reminders';
import { catalystConfidenceLabel, typeMeta } from './model';

type CatalystReminderStripProps = {
  reminders?: CatalystReminder[];
  opportunity?: OpportunitySummary;
  now: number;
  compact?: boolean;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary) => void;
};

function urgencyLabel(urgency: CatalystReminder['urgency']) {
  if (urgency === 'overdue') return 'OVERDUE';
  if (urgency === 'today') return 'TODAY';
  if (urgency === 'soon') return 'SOON';
  return 'WATCH';
}

export function CatalystReminderStrip({
  reminders,
  opportunity,
  now,
  compact = false,
  onOpenOpportunity,
  onLaunchOpportunityAnalysis,
}: CatalystReminderStripProps) {
  const visibleReminders = reminders || (opportunity ? buildOpportunityCatalystReminders(opportunity, now) : []);
  if (visibleReminders.length === 0) return null;

  const summary = summarizeCatalystReminders(visibleReminders);
  const items = compact ? visibleReminders.slice(0, 3) : visibleReminders;

  return (
    <section className={`catalyst-reminder-strip ${compact ? 'compact' : 'glass-panel'}`}>
      <div className="catalyst-reminder-header">
        <div>
          <h3><BellRing size={16} /> Catalyst reminders</h3>
          <p>{summary.headline} · {visibleReminders.length} visible windows</p>
        </div>
        <div className="catalyst-reminder-counts">
          <span>{summary.overdue} overdue</span>
          <span>{summary.today} today</span>
          <span>{summary.soon} soon</span>
        </div>
      </div>
      <div className="catalyst-reminder-list">
        {items.map((reminder) => {
          const meta = typeMeta(reminder.opportunity.type);
          return (
            <article key={reminder.id} className={`catalyst-reminder-card ${reminder.urgency}`}>
              <div className="catalyst-reminder-top">
                <span className={`diff-chip ${reminder.urgency === 'watch' ? 'stable' : 'changed'}`}>
                  {urgencyLabel(reminder.urgency)}
                </span>
                <span className="timeline-chip muted"><CalendarClock size={12} /> {reminder.dueLabel}</span>
                {catalystConfidenceLabel(reminder.catalyst.confidence) && (
                  <span className="timeline-chip muted">{catalystConfidenceLabel(reminder.catalyst.confidence)}</span>
                )}
              </div>
              <div className="catalyst-reminder-title">{reminder.catalyst.label}</div>
              <div className="catalyst-reminder-detail">{reminder.detail}</div>
              <div className="catalyst-reminder-meta">
                <span>{meta.label}</span>
                {reminder.dueAt && <span>{reminder.dueAt}</span>}
                {reminder.opportunity.primaryTicker && <span>{reminder.opportunity.primaryTicker}</span>}
              </div>
              {!compact && (
                <div className="catalyst-reminder-actions">
                  <button type="button" className="secondary-btn tiny" onClick={() => onOpenOpportunity(reminder.opportunity)}>
                    打开机会
                  </button>
                  <button type="button" className="secondary-btn tiny" onClick={() => onLaunchOpportunityAnalysis(reminder.opportunity)}>
                    发起验证
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
