import { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarClock } from 'lucide-react';
import {
  recordCatalystReminderPreference,
  type CatalystReminderPreferenceAudit,
  type OpportunitySummary,
} from '../../api';
import {
  buildOpportunityCatalystReminders,
  summarizeCatalystReminders,
  type CatalystReminder,
} from './catalyst-reminders';
import {
  CATALYST_REMINDER_PREFERENCES_EVENT,
  notifyCatalystReminderPreferencesChanged,
  preferenceForCatalystReminder,
  readCatalystReminderPreferences,
  readCatalystReminderSubscriptions,
  splitCatalystRemindersByPreference,
  subscriptionForCatalystReminder,
  writeCatalystReminderPreferences,
  writeCatalystReminderSubscriptions,
  type CatalystReminderPreferenceIntent,
  type CatalystReminderPreferenceMap,
  type CatalystReminderSubscriptionMap,
} from './catalyst-reminder-preferences';
import { catalystConfidenceLabel, typeMeta } from './model';
import { preloadOpportunityDetailDrawer } from './detail-drawer-loader';

type CatalystReminderStripProps = {
  reminders?: CatalystReminder[];
  opportunity?: OpportunitySummary;
  now: number;
  compact?: boolean;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary) => void;
  onPreferenceRecorded?: (audit: CatalystReminderPreferenceAudit) => void;
};

function urgencyLabel(urgency: CatalystReminder['urgency']) {
  if (urgency === 'missed') return 'MISSED';
  if (urgency === 'overdue') return 'OVERDUE';
  if (urgency === 'today') return 'TODAY';
  if (urgency === 'soon') return 'SOON';
  if (urgency === 'missing_date') return 'MISSING DATE';
  if (urgency === 'observed') return 'OBSERVED';
  return 'WATCH';
}

function urgencyChipTone(urgency: CatalystReminder['urgency']) {
  if (urgency === 'observed' || urgency === 'watch') return 'stable';
  if (urgency === 'missing_date') return 'neutral';
  return 'changed';
}

function snoozeUntilTomorrow(now: number) {
  return new Date(now + 24 * 60 * 60 * 1000).toISOString();
}

function preferenceLabel(intent: CatalystReminderPreferenceIntent) {
  if (intent === 'acknowledge') return '已处理';
  if (intent === 'snooze') return '稍后';
  if (intent === 'subscribe') return '已订阅';
  if (intent === 'unsubscribe') return '已取消订阅';
  return '已恢复';
}

export function CatalystReminderStrip({
  reminders,
  opportunity,
  now,
  compact = false,
  onOpenOpportunity,
  onLaunchOpportunityAnalysis,
  onPreferenceRecorded,
}: CatalystReminderStripProps) {
  const [preferences, setPreferences] = useState<CatalystReminderPreferenceMap>(() => readCatalystReminderPreferences());
  const [subscriptions, setSubscriptions] = useState<CatalystReminderSubscriptionMap>(() => readCatalystReminderSubscriptions());
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ status: 'synced' | 'syncing' | 'failed'; message: string } | null>(null);

  useEffect(() => {
    const reloadPreferences = () => {
      setPreferences(readCatalystReminderPreferences());
      setSubscriptions(readCatalystReminderSubscriptions());
    };
    window.addEventListener(CATALYST_REMINDER_PREFERENCES_EVENT, reloadPreferences);
    window.addEventListener('storage', reloadPreferences);
    return () => {
      window.removeEventListener(CATALYST_REMINDER_PREFERENCES_EVENT, reloadPreferences);
      window.removeEventListener('storage', reloadPreferences);
    };
  }, []);

  const allReminders = useMemo(
    () => reminders || (opportunity ? buildOpportunityCatalystReminders(opportunity, now) : []),
    [now, opportunity, reminders],
  );
  const partitionedReminders = useMemo(
    () => splitCatalystRemindersByPreference(allReminders, preferences, now),
    [allReminders, now, preferences],
  );
  if (allReminders.length === 0) return null;

  const summary = summarizeCatalystReminders(partitionedReminders.visible);
  const visibleReminders = showSuppressed
    ? [...partitionedReminders.visible, ...partitionedReminders.suppressed]
    : partitionedReminders.visible;
  const items = compact ? visibleReminders.slice(0, 3) : visibleReminders;

  const persistLocalPreferences = (next: CatalystReminderPreferenceMap) => {
    setPreferences(next);
    writeCatalystReminderPreferences(next);
    window.queueMicrotask(() => notifyCatalystReminderPreferencesChanged());
  };

  const persistLocalSubscriptions = (next: CatalystReminderSubscriptionMap) => {
    setSubscriptions(next);
    writeCatalystReminderSubscriptions(next);
    window.queueMicrotask(() => notifyCatalystReminderPreferencesChanged());
  };

  const recordPreference = async (reminder: CatalystReminder, intent: CatalystReminderPreferenceIntent) => {
    const snoozedUntil = intent === 'snooze' ? snoozeUntilTomorrow(now) : undefined;
    const subscriptionLeadDays = intent === 'subscribe' ? 3 : undefined;
    const note = intent === 'snooze'
      ? 'Snoozed from Catalyst reminders for 24h'
      : intent === 'acknowledge'
        ? 'Acknowledged from Catalyst reminders'
        : intent === 'subscribe'
          ? 'Subscribed to Catalyst reminder with 3d lead'
          : intent === 'unsubscribe'
            ? 'Unsubscribed from Catalyst reminder'
            : 'Reopened from Catalyst reminders';
    const key = `${reminder.id}:${intent}`;
    const previousPreference = preferences[reminder.id];
    const previousSubscription = subscriptions[reminder.id];
    setPendingKey(key);
    setFeedback({ status: 'syncing', message: `${preferenceLabel(intent)}同步中` });
    if (intent === 'acknowledge' || intent === 'snooze') {
      setShowSuppressed(true);
    }

    if (intent === 'subscribe' || intent === 'unsubscribe') {
      const nextSubscriptions = { ...readCatalystReminderSubscriptions() };
      if (intent === 'unsubscribe') {
        delete nextSubscriptions[reminder.id];
      } else {
        nextSubscriptions[reminder.id] = subscriptionForCatalystReminder(reminder, now, subscriptionLeadDays, note);
      }
      persistLocalSubscriptions(nextSubscriptions);
    } else {
      const nextPreferences = { ...readCatalystReminderPreferences() };
      if (intent === 'reopen') {
        delete nextPreferences[reminder.id];
      } else {
        nextPreferences[reminder.id] = preferenceForCatalystReminder(reminder, intent, now, snoozedUntil, note);
      }
      persistLocalPreferences(nextPreferences);
    }

    try {
      const audit = await recordCatalystReminderPreference(reminder.opportunity.id, {
        reminderId: reminder.id,
        catalystLabel: reminder.catalyst.label,
        ...(reminder.dueAt ? { catalystDueAt: reminder.dueAt } : {}),
        catalystStatus: reminder.catalyst.status,
        urgency: reminder.urgency,
        actionKind: reminder.action,
        preference: intent,
        ...(snoozedUntil ? { snoozedUntil } : {}),
        ...(subscriptionLeadDays !== undefined ? { subscriptionLeadDays } : {}),
        note,
      });
      onPreferenceRecorded?.(audit);
      setFeedback({ status: 'synced', message: `${preferenceLabel(intent)}已进入事件流` });
    } catch (error) {
      if (intent === 'subscribe' || intent === 'unsubscribe') {
        const restoredSubscriptions = { ...readCatalystReminderSubscriptions() };
        if (previousSubscription) {
          restoredSubscriptions[reminder.id] = previousSubscription;
        } else {
          delete restoredSubscriptions[reminder.id];
        }
        persistLocalSubscriptions(restoredSubscriptions);
      } else {
        const restoredPreferences = { ...readCatalystReminderPreferences() };
        if (previousPreference) {
          restoredPreferences[reminder.id] = previousPreference;
        } else {
          delete restoredPreferences[reminder.id];
        }
        persistLocalPreferences(restoredPreferences);
      }
      setFeedback({
        status: 'failed',
        message: error instanceof Error ? error.message : '提醒偏好同步失败',
      });
    } finally {
      setPendingKey(null);
    }
  };

  const suppressedCount = partitionedReminders.suppressed.length;

  return (
    <section className={`catalyst-reminder-strip ${compact ? 'compact' : 'glass-panel'}`}>
      <div className="catalyst-reminder-header">
        <div>
          <h3><BellRing size={16} /> Catalyst reminders</h3>
          <p>
            {summary.headline} · {partitionedReminders.visible.length} active windows
            {suppressedCount > 0 ? ` · ${suppressedCount} handled` : ''}
          </p>
        </div>
        <div className="catalyst-reminder-counts">
          <span>{summary.missed} missed</span>
          <span>{summary.overdue} overdue</span>
          <span>{summary.today} today</span>
          <span>{summary.soon} soon</span>
          <span>{summary.missingDate} missing</span>
          {suppressedCount > 0 && (
            <button
              type="button"
              className="secondary-btn tiny"
              data-catalyst-reminder-toggle-suppressed
              onClick={() => setShowSuppressed((current) => !current)}
            >
              {showSuppressed ? '隐藏已处理' : '显示已处理'}
            </button>
          )}
        </div>
      </div>
      {feedback && (
        <div
          className={`catalyst-reminder-feedback ${feedback.status}`}
          data-catalyst-preference-status={feedback.status}
        >
          {feedback.message}
        </div>
      )}
      <div className="catalyst-reminder-list">
        {items.length === 0 && (
          <div className="catalyst-reminder-empty" data-catalyst-reminder-empty>
            当前提醒都已处理；需要复盘时可以显示已处理项。
          </div>
        )}
        {items.map((reminder) => {
          const meta = typeMeta(reminder.opportunity.type);
          const isSuppressed = Boolean(preferences[reminder.id]) && partitionedReminders.suppressed.some((item) => item.id === reminder.id);
          const subscription = subscriptions[reminder.id];
          return (
            <article
              key={reminder.id}
              className={`catalyst-reminder-card ${reminder.urgency} ${isSuppressed ? 'suppressed' : ''}`}
              data-catalyst-reminder={reminder.opportunity.id}
              data-catalyst-reminder-id={reminder.id}
              data-catalyst-urgency={reminder.urgency}
              data-catalyst-action={reminder.action}
              data-catalyst-preference={isSuppressed ? preferences[reminder.id]?.action : 'active'}
              data-catalyst-subscription={subscription ? 'subscribed' : 'none'}
              data-opportunity-id={reminder.opportunity.id}
            >
              <div className="catalyst-reminder-top">
                <span className={`diff-chip ${urgencyChipTone(reminder.urgency)}`}>
                  {urgencyLabel(reminder.urgency)}
                </span>
                <span className="timeline-chip muted"><CalendarClock size={12} /> {reminder.dueLabel}</span>
                {catalystConfidenceLabel(reminder.catalyst.confidence) && (
                  <span className="timeline-chip muted">{catalystConfidenceLabel(reminder.catalyst.confidence)}</span>
                )}
              </div>
              <div className="catalyst-reminder-title">{reminder.catalyst.label}</div>
              <div className="catalyst-reminder-detail">{reminder.detail}</div>
              <div className="catalyst-reminder-next">
                <strong>{reminder.actionLabel}</strong>
                <span>{reminder.actionDetail}</span>
              </div>
              <div className="catalyst-reminder-meta">
                <span>{meta.label}</span>
                {reminder.dueAt && <span>{reminder.dueAt}</span>}
                {reminder.opportunity.primaryTicker && <span>{reminder.opportunity.primaryTicker}</span>}
                {subscription && <span>{subscription.leadDays}d lead</span>}
              </div>
              <div className="catalyst-reminder-actions">
                {!compact && (
                  <>
                    <button
                      type="button"
                      className="secondary-btn tiny"
                      data-opportunity-action="details"
                      onFocus={preloadOpportunityDetailDrawer}
                      onMouseEnter={preloadOpportunityDetailDrawer}
                      onClick={() => onOpenOpportunity(reminder.opportunity)}
                    >
                      打开机会
                    </button>
                    <button type="button" className="secondary-btn tiny" onClick={() => onLaunchOpportunityAnalysis(reminder.opportunity)}>
                      发起验证
                    </button>
                  </>
                )}
                {isSuppressed ? (
                  <button
                    type="button"
                    className="secondary-btn tiny"
                    data-catalyst-reminder-reopen={reminder.id}
                    disabled={pendingKey === `${reminder.id}:reopen`}
                    onClick={() => void recordPreference(reminder, 'reopen')}
                  >
                    恢复
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="secondary-btn tiny"
                      data-catalyst-reminder-acknowledge={reminder.id}
                      disabled={pendingKey === `${reminder.id}:acknowledge`}
                      onClick={() => void recordPreference(reminder, 'acknowledge')}
                    >
                      已处理
                    </button>
                    <button
                      type="button"
                      className="secondary-btn tiny"
                      data-catalyst-reminder-snooze={reminder.id}
                      disabled={pendingKey === `${reminder.id}:snooze`}
                      onClick={() => void recordPreference(reminder, 'snooze')}
                    >
                      稍后
                    </button>
                  </>
                )}
                {subscription ? (
                  <button
                    type="button"
                    className="secondary-btn tiny"
                    data-catalyst-reminder-unsubscribe={reminder.id}
                    disabled={pendingKey === `${reminder.id}:unsubscribe`}
                    onClick={() => void recordPreference(reminder, 'unsubscribe')}
                  >
                    取消订阅
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-btn tiny"
                    data-catalyst-reminder-subscribe={reminder.id}
                    disabled={pendingKey === `${reminder.id}:subscribe`}
                    onClick={() => void recordPreference(reminder, 'subscribe')}
                  >
                    订阅
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
