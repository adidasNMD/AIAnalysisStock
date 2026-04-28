import type { OpportunityCatalystItem, OpportunitySummary } from '../../api';

export type CatalystReminderUrgency = 'overdue' | 'today' | 'soon' | 'watch';

export type CatalystReminder = {
  id: string;
  opportunity: OpportunitySummary;
  catalyst: OpportunityCatalystItem;
  urgency: CatalystReminderUrgency;
  dueAt?: string;
  dueLabel: string;
  detail: string;
  sortScore: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayDelta(dueAt: string | undefined, now: number): number | null {
  if (!dueAt) return null;
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return null;
  return Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / DAY_MS);
}

function urgencyFromDelta(delta: number | null, status: OpportunityCatalystItem['status']): CatalystReminderUrgency {
  if (status === 'active') return 'today';
  if (delta === null) return 'watch';
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 7) return 'soon';
  return 'watch';
}

function dueLabel(delta: number | null, status: OpportunityCatalystItem['status']) {
  if (status === 'active') return 'active now';
  if (delta === null) return 'date missing';
  if (delta < 0) return `${Math.abs(delta)}d overdue`;
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  return `in ${delta}d`;
}

function sortScore(urgency: CatalystReminderUrgency, delta: number | null) {
  const urgencyScore = {
    overdue: 400,
    today: 300,
    soon: 200,
    watch: 100,
  } satisfies Record<CatalystReminderUrgency, number>;
  const deltaScore = delta === null ? 0 : Math.max(0, 60 - Math.abs(delta));
  return urgencyScore[urgency] + deltaScore;
}

function reminderDetail(
  opportunity: OpportunitySummary,
  catalyst: OpportunityCatalystItem,
  urgency: CatalystReminderUrgency,
) {
  const source = catalyst.source ? ` · ${catalyst.source}` : '';
  const confidence = catalyst.confidence ? ` · ${catalyst.confidence}` : '';
  const note = catalyst.note ? ` · ${catalyst.note}` : '';
  const prefix = urgency === 'overdue'
    ? '窗口已过，需要更新日历或复核是否错过。'
    : urgency === 'today'
      ? '今天需要处理催化动作。'
      : urgency === 'soon'
        ? '催化窗口接近，适合提前准备。'
        : '仍在观察窗口，先保持日历可见。';

  return `${prefix} ${opportunity.title}${source}${confidence}${note}`;
}

function normalizeCatalysts(opportunity: OpportunitySummary): OpportunityCatalystItem[] {
  const activeItems = opportunity.catalystCalendar
    .filter((item) => item.status === 'upcoming' || item.status === 'active');

  if (activeItems.length > 0) return activeItems;
  if (!opportunity.nextCatalystAt) return [];

  return [{
    label: 'Next catalyst',
    dueAt: opportunity.nextCatalystAt,
    status: 'upcoming',
    confidence: 'placeholder',
  }];
}

export function buildOpportunityCatalystReminders(
  opportunity: OpportunitySummary,
  now: number,
): CatalystReminder[] {
  return normalizeCatalysts(opportunity).map((catalyst, index) => {
    const delta = dayDelta(catalyst.dueAt, now);
    const urgency = urgencyFromDelta(delta, catalyst.status);
    const id = `${opportunity.id}:${catalyst.label}:${catalyst.dueAt || catalyst.status}:${index}`;

    return {
      id,
      opportunity,
      catalyst,
      urgency,
      ...(catalyst.dueAt ? { dueAt: catalyst.dueAt } : {}),
      dueLabel: dueLabel(delta, catalyst.status),
      detail: reminderDetail(opportunity, catalyst, urgency),
      sortScore: sortScore(urgency, delta),
    };
  });
}

export function buildCatalystReminders(
  opportunities: OpportunitySummary[],
  now: number,
  limit = 8,
): CatalystReminder[] {
  return opportunities
    .flatMap((opportunity) => buildOpportunityCatalystReminders(opportunity, now))
    .sort((a, b) => {
      if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
      return (a.dueAt || '').localeCompare(b.dueAt || '');
    })
    .slice(0, limit);
}

export function summarizeCatalystReminders(reminders: CatalystReminder[]) {
  const overdue = reminders.filter((item) => item.urgency === 'overdue').length;
  const today = reminders.filter((item) => item.urgency === 'today').length;
  const soon = reminders.filter((item) => item.urgency === 'soon').length;
  const watch = reminders.filter((item) => item.urgency === 'watch').length;
  const headline = overdue > 0
    ? `${overdue} overdue`
    : today > 0
      ? `${today} today`
      : soon > 0
        ? `${soon} soon`
        : `${watch} watch`;

  return { overdue, today, soon, watch, headline };
}
