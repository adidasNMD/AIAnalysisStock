import type { OpportunityActionTimelineEntry, OpportunityEvent, OpportunitySummary } from '../../api';

export type CatalystReminderAuditTrailSource = 'event' | 'timeline';
export type CatalystReminderAuditPreference = 'acknowledge' | 'snooze' | 'reopen' | 'subscribe' | 'unsubscribe';

export type CatalystReminderAuditTrailItem = {
  id: string;
  timestamp: string;
  preference: CatalystReminderAuditPreference;
  label: string;
  detail: string;
  urgency?: string;
  source: CatalystReminderAuditTrailSource;
};

export type CatalystReminderAuditTrailSummary = {
  total: number;
  acknowledged: number;
  snoozed: number;
  subscribed: number;
  reopened: number;
  latestAt?: string;
  label: string;
  detail: string;
  entries: CatalystReminderAuditTrailItem[];
};

function compactText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizedEventId(id: string): string {
  return id.startsWith('opp_') ? id.slice(4) : id;
}

function isCatalystReminderPreference(value: unknown): value is CatalystReminderAuditPreference {
  return value === 'acknowledge'
    || value === 'snooze'
    || value === 'reopen'
    || value === 'subscribe'
    || value === 'unsubscribe';
}

function isCatalystReminderTimelineEntry(entry: OpportunityActionTimelineEntry): boolean {
  return entry.label.toLowerCase().startsWith('catalyst reminder');
}

function actionLabel(preference: CatalystReminderAuditPreference): string {
  if (preference === 'acknowledge') return 'acknowledged';
  if (preference === 'snooze') return 'snoozed';
  if (preference === 'subscribe') return 'subscribed';
  if (preference === 'unsubscribe') return 'unsubscribed';
  return 'reopened';
}

function trailItemFromEvent(event: OpportunityEvent): CatalystReminderAuditTrailItem | null {
  if (event.type !== 'catalyst_reminder_updated') return null;
  const preference = compactText(event.meta?.preference);
  if (!isCatalystReminderPreference(preference)) return null;

  const catalystLabel = compactText(event.meta?.catalystLabel) || 'Catalyst reminder';
  const urgency = compactText(event.meta?.urgency);
  const action = compactText(event.meta?.actionKind);
  const snoozedUntil = compactText(event.meta?.snoozedUntil);
  const leadDays = typeof event.meta?.subscriptionLeadDays === 'number'
    ? String(event.meta.subscriptionLeadDays)
    : compactText(event.meta?.subscriptionLeadDays);
  const note = compactText(event.meta?.note);
  const detailParts = [
    urgency ? `Urgency ${urgency}` : undefined,
    action ? `Action ${action}` : undefined,
    snoozedUntil ? `Until ${snoozedUntil}` : undefined,
    leadDays ? `Lead ${leadDays}d` : undefined,
    note,
  ].filter(Boolean);

  return {
    id: event.id,
    timestamp: event.timestamp,
    preference,
    label: `${catalystLabel} ${actionLabel(preference)}`,
    detail: detailParts.length > 0 ? detailParts.join(' · ') : event.message,
    ...(urgency ? { urgency } : {}),
    source: 'event',
  };
}

function trailItemFromTimeline(entry: OpportunityActionTimelineEntry): CatalystReminderAuditTrailItem | null {
  if (!isCatalystReminderTimelineEntry(entry)) return null;
  const lower = entry.label.toLowerCase();
  const preference: CatalystReminderAuditPreference = lower.includes('snoozed')
    ? 'snooze'
    : lower.includes('unsubscribed')
      ? 'unsubscribe'
      : lower.includes('subscribed')
        ? 'subscribe'
        : lower.includes('reopened')
          ? 'reopen'
          : 'acknowledge';

  return {
    id: normalizedEventId(entry.id),
    timestamp: entry.timestamp,
    preference,
    label: entry.label,
    detail: entry.reasonSummary || entry.detail,
    source: 'timeline',
  };
}

export function buildCatalystReminderAuditTrail(
  opportunity: OpportunitySummary,
  localEvents: OpportunityEvent[] = [],
): CatalystReminderAuditTrailSummary {
  const byId = new Map<string, CatalystReminderAuditTrailItem>();
  const addItem = (item: CatalystReminderAuditTrailItem | null) => {
    if (!item) return;
    const id = normalizedEventId(item.id);
    const existing = byId.get(id);
    if (!existing || (existing.source === 'timeline' && item.source === 'event')) {
      byId.set(id, { ...item, id });
    }
  };

  for (const event of localEvents) addItem(trailItemFromEvent(event));
  for (const entry of opportunity.recentActionTimeline || []) addItem(trailItemFromTimeline(entry));

  const entries = [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const acknowledged = entries.filter((entry) => entry.preference === 'acknowledge').length;
  const snoozed = entries.filter((entry) => entry.preference === 'snooze').length;
  const subscribed = entries.filter((entry) => entry.preference === 'subscribe').length;
  const reopened = entries.filter((entry) => entry.preference === 'reopen' || entry.preference === 'unsubscribe').length;
  const latestAt = entries[0]?.timestamp;

  return {
    total: entries.length,
    acknowledged,
    snoozed,
    subscribed,
    reopened,
    ...(latestAt ? { latestAt } : {}),
    label: entries.length > 0
      ? `${acknowledged} handled / ${snoozed} snoozed / ${subscribed} subscribed`
      : 'No reminder audit events',
    detail: entries.length > 0
      ? '催化提醒处理和订阅偏好已进入 Opportunity 事件流，可用于复盘。'
      : '还没有写入事件流的催化提醒偏好。',
    entries,
  };
}
