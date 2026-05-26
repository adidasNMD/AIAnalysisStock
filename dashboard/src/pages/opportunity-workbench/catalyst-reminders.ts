import type { OpportunityCatalystItem, OpportunitySummary } from '../../api';

export type CatalystReminderUrgency = 'missed' | 'overdue' | 'today' | 'soon' | 'missing_date' | 'observed' | 'watch';
export type CatalystReminderAction =
  | 'review_missed'
  | 'verify_today'
  | 'prepare'
  | 'fill_date'
  | 'review_observed'
  | 'watch';

export type CatalystReminder = {
  id: string;
  opportunity: OpportunitySummary;
  catalyst: OpportunityCatalystItem;
  urgency: CatalystReminderUrgency;
  action: CatalystReminderAction;
  actionLabel: string;
  actionDetail: string;
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
  if (status === 'missed') return 'missed';
  if (status === 'observed') return 'observed';
  if (status === 'active') return 'today';
  if (delta === null) return 'missing_date';
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 7) return 'soon';
  return 'watch';
}

function dueLabel(delta: number | null, status: OpportunityCatalystItem['status']) {
  if (status === 'missed') return 'missed';
  if (status === 'observed') return 'observed';
  if (status === 'active') return 'active now';
  if (delta === null) return 'date missing';
  if (delta < 0) return `${Math.abs(delta)}d overdue`;
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  return `in ${delta}d`;
}

function sortScore(urgency: CatalystReminderUrgency, delta: number | null) {
  const urgencyScore = {
    missed: 450,
    overdue: 400,
    today: 300,
    soon: 200,
    missing_date: 160,
    observed: 155,
    watch: 100,
  } satisfies Record<CatalystReminderUrgency, number>;
  const shouldUseDeltaScore = urgency === 'overdue' || urgency === 'today' || urgency === 'soon' || urgency === 'watch';
  const deltaScore = shouldUseDeltaScore && delta !== null ? Math.max(0, 60 - Math.abs(delta)) : 0;
  return urgencyScore[urgency] + deltaScore;
}

function reminderAction(urgency: CatalystReminderUrgency): {
  action: CatalystReminderAction;
  actionLabel: string;
  actionDetail: string;
} {
  switch (urgency) {
    case 'missed':
      return {
        action: 'review_missed',
        actionLabel: '复核错过',
        actionDetail: '确认窗口是否真的错过，并决定归档、重开或改写 thesis。',
      };
    case 'overdue':
      return {
        action: 'review_missed',
        actionLabel: '更新日历',
        actionDetail: '窗口已过，先补最新事实，再决定是否继续跟踪。',
      };
    case 'today':
      return {
        action: 'verify_today',
        actionLabel: '今天验证',
        actionDetail: '当天窗口需要跑验证任务或更新机会状态。',
      };
    case 'soon':
      return {
        action: 'prepare',
        actionLabel: '提前准备',
        actionDetail: '提前准备验证问题、交易检查清单和候选任务。',
      };
    case 'missing_date':
      return {
        action: 'fill_date',
        actionLabel: '补日期',
        actionDetail: '缺少可解析日期，先补来源或把该催化降级为观察项。',
      };
    case 'observed':
      return {
        action: 'review_observed',
        actionLabel: '复盘观察',
        actionDetail: '已观察到事件，适合复盘影响并更新 thesis。',
      };
    default:
      return {
        action: 'watch',
        actionLabel: '保持观察',
        actionDetail: '窗口还远，保持日历可见并等待更近的验证点。',
      };
  }
}

function reminderDetail(
  opportunity: OpportunitySummary,
  catalyst: OpportunityCatalystItem,
  urgency: CatalystReminderUrgency,
) {
  const source = catalyst.source ? ` · ${catalyst.source}` : '';
  const confidence = catalyst.confidence ? ` · ${catalyst.confidence}` : '';
  const note = catalyst.note ? ` · ${catalyst.note}` : '';
  const prefix = urgency === 'missed'
    ? '催化已标记 missed，需要复核影响。'
    : urgency === 'overdue'
      ? '窗口已过，需要更新日历或复核是否错过。'
      : urgency === 'today'
        ? '今天需要处理催化动作。'
        : urgency === 'soon'
          ? '催化窗口接近，适合提前准备。'
          : urgency === 'missing_date'
            ? '催化缺少日期，先补来源和时间。'
            : urgency === 'observed'
              ? '催化已观察到，适合复盘和更新 thesis。'
              : '仍在观察窗口，先保持日历可见。';

  return `${prefix} ${opportunity.title}${source}${confidence}${note}`;
}

function normalizeCatalysts(opportunity: OpportunitySummary): OpportunityCatalystItem[] {
  const activeItems = opportunity.catalystCalendar
    .filter((item) => (
      item.status === 'upcoming'
      || item.status === 'active'
      || item.status === 'observed'
      || item.status === 'missed'
    ));

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
  return normalizeCatalysts(opportunity)
    .map((catalyst, index) => {
      const delta = dayDelta(catalyst.dueAt, now);
      const urgency = urgencyFromDelta(delta, catalyst.status);
      const action = reminderAction(urgency);
      const id = `${opportunity.id}:${catalyst.label}:${catalyst.dueAt || catalyst.status}:${index}`;

      return {
        id,
        opportunity,
        catalyst,
        urgency,
        ...action,
        ...(catalyst.dueAt ? { dueAt: catalyst.dueAt } : {}),
        dueLabel: dueLabel(delta, catalyst.status),
        detail: reminderDetail(opportunity, catalyst, urgency),
        sortScore: sortScore(urgency, delta),
      };
    })
    .sort((a, b) => {
      if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
      return (a.dueAt || '').localeCompare(b.dueAt || '');
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
  const missed = reminders.filter((item) => item.urgency === 'missed').length;
  const overdue = reminders.filter((item) => item.urgency === 'overdue').length;
  const today = reminders.filter((item) => item.urgency === 'today').length;
  const soon = reminders.filter((item) => item.urgency === 'soon').length;
  const missingDate = reminders.filter((item) => item.urgency === 'missing_date').length;
  const observed = reminders.filter((item) => item.urgency === 'observed').length;
  const watch = reminders.filter((item) => item.urgency === 'watch').length;
  const headline = missed > 0
    ? `${missed} missed`
    : overdue > 0
      ? `${overdue} overdue`
      : today > 0
        ? `${today} today`
        : soon > 0
          ? `${soon} soon`
          : missingDate > 0
            ? `${missingDate} missing date`
            : observed > 0
              ? `${observed} observed`
              : `${watch} watch`;

  return { missed, overdue, today, soon, missingDate, observed, watch, headline };
}
