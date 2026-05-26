import type { CatalystReminder } from './catalyst-reminders';

export type CatalystReminderPreferenceAction = 'acknowledge' | 'snooze';
export type CatalystReminderSubscriptionIntent = 'subscribe' | 'unsubscribe';
export type CatalystReminderPreferenceIntent = CatalystReminderPreferenceAction | 'reopen' | CatalystReminderSubscriptionIntent;

export type CatalystReminderPreferenceRecord = {
  reminderId: string;
  opportunityId: string;
  catalystLabel: string;
  action: CatalystReminderPreferenceAction;
  updatedAt: string;
  snoozedUntil?: string;
  note?: string;
};

export type CatalystReminderPreferenceMap = Record<string, CatalystReminderPreferenceRecord>;

export type CatalystReminderSubscriptionRecord = {
  reminderId: string;
  opportunityId: string;
  catalystLabel: string;
  updatedAt: string;
  leadDays: number;
  note?: string;
};

export type CatalystReminderSubscriptionMap = Record<string, CatalystReminderSubscriptionRecord>;

export const CATALYST_REMINDER_PREFERENCES_KEY = 'ai-analysis-stock:catalyst-reminder-preferences:v1';
export const CATALYST_REMINDER_SUBSCRIPTIONS_KEY = 'ai-analysis-stock:catalyst-reminder-subscriptions:v1';
export const CATALYST_REMINDER_PREFERENCES_EVENT = 'catalyst-reminder-preferences-changed';

function getStorage(storage?: Storage | null): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function compactText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isPreferenceAction(value: unknown): value is CatalystReminderPreferenceAction {
  return value === 'acknowledge' || value === 'snooze';
}

function parsePreferenceRecord(value: unknown): CatalystReminderPreferenceRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CatalystReminderPreferenceRecord>;
  const reminderId = compactText(record.reminderId);
  const opportunityId = compactText(record.opportunityId);
  const catalystLabel = compactText(record.catalystLabel);
  const updatedAt = compactText(record.updatedAt);
  if (!reminderId || !opportunityId || !catalystLabel || !updatedAt || !isPreferenceAction(record.action)) {
    return null;
  }

  return {
    reminderId,
    opportunityId,
    catalystLabel,
    action: record.action,
    updatedAt,
    ...(compactText(record.snoozedUntil) ? { snoozedUntil: compactText(record.snoozedUntil) } : {}),
    ...(compactText(record.note) ? { note: compactText(record.note) } : {}),
  };
}

function parseSubscriptionRecord(value: unknown): CatalystReminderSubscriptionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CatalystReminderSubscriptionRecord>;
  const reminderId = compactText(record.reminderId);
  const opportunityId = compactText(record.opportunityId);
  const catalystLabel = compactText(record.catalystLabel);
  const updatedAt = compactText(record.updatedAt);
  const leadDays = typeof record.leadDays === 'number' && Number.isFinite(record.leadDays)
    ? Math.max(0, Math.min(30, Math.round(record.leadDays)))
    : undefined;
  if (!reminderId || !opportunityId || !catalystLabel || !updatedAt || leadDays === undefined) {
    return null;
  }

  return {
    reminderId,
    opportunityId,
    catalystLabel,
    updatedAt,
    leadDays,
    ...(compactText(record.note) ? { note: compactText(record.note) } : {}),
  };
}

export function readCatalystReminderPreferences(storage?: Storage | null): CatalystReminderPreferenceMap {
  const target = getStorage(storage);
  if (!target) return {};

  try {
    const raw = target.getItem(CATALYST_REMINDER_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([key, value]) => [key, parsePreferenceRecord(value)] as const)
      .filter((entry): entry is readonly [string, CatalystReminderPreferenceRecord] => Boolean(entry[1]));
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function writeCatalystReminderPreferences(
  preferences: CatalystReminderPreferenceMap,
  storage?: Storage | null,
) {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(CATALYST_REMINDER_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function readCatalystReminderSubscriptions(storage?: Storage | null): CatalystReminderSubscriptionMap {
  const target = getStorage(storage);
  if (!target) return {};

  try {
    const raw = target.getItem(CATALYST_REMINDER_SUBSCRIPTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([key, value]) => [key, parseSubscriptionRecord(value)] as const)
      .filter((entry): entry is readonly [string, CatalystReminderSubscriptionRecord] => Boolean(entry[1]));
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function writeCatalystReminderSubscriptions(
  subscriptions: CatalystReminderSubscriptionMap,
  storage?: Storage | null,
) {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(CATALYST_REMINDER_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
}

export function notifyCatalystReminderPreferencesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CATALYST_REMINDER_PREFERENCES_EVENT));
}

export function preferenceForCatalystReminder(
  reminder: CatalystReminder,
  action: CatalystReminderPreferenceAction,
  now: number,
  snoozedUntil?: string,
  note?: string,
): CatalystReminderPreferenceRecord {
  return {
    reminderId: reminder.id,
    opportunityId: reminder.opportunity.id,
    catalystLabel: reminder.catalyst.label,
    action,
    updatedAt: new Date(now).toISOString(),
    ...(snoozedUntil ? { snoozedUntil } : {}),
    ...(note ? { note } : {}),
  };
}

export function subscriptionForCatalystReminder(
  reminder: CatalystReminder,
  now: number,
  leadDays = 3,
  note?: string,
): CatalystReminderSubscriptionRecord {
  return {
    reminderId: reminder.id,
    opportunityId: reminder.opportunity.id,
    catalystLabel: reminder.catalyst.label,
    updatedAt: new Date(now).toISOString(),
    leadDays: Math.max(0, Math.min(30, Math.round(leadDays))),
    ...(note ? { note } : {}),
  };
}

export function isCatalystReminderSuppressed(
  reminder: CatalystReminder,
  preferences: CatalystReminderPreferenceMap,
  now: number,
): boolean {
  const preference = preferences[reminder.id];
  if (!preference) return false;
  if (preference.action === 'acknowledge') return true;
  if (!preference.snoozedUntil) return false;
  const snoozedUntil = Date.parse(preference.snoozedUntil);
  return Number.isFinite(snoozedUntil) && snoozedUntil > now;
}

export function splitCatalystRemindersByPreference(
  reminders: CatalystReminder[],
  preferences: CatalystReminderPreferenceMap,
  now: number,
): { visible: CatalystReminder[]; suppressed: CatalystReminder[] } {
  const visible: CatalystReminder[] = [];
  const suppressed: CatalystReminder[] = [];
  for (const reminder of reminders) {
    if (isCatalystReminderSuppressed(reminder, preferences, now)) {
      suppressed.push(reminder);
    } else {
      visible.push(reminder);
    }
  }
  return { visible, suppressed };
}
