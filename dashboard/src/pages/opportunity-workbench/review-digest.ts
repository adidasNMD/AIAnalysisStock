import type { OpportunitySummary } from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import { timelineDecisionLabel, timelineDriverLabel, timelineSourceLabel, typeSummaryLabel } from './model';

export type StrategyReviewTone = 'positive' | 'warning' | 'negative' | 'neutral';
export type StrategyReviewKind = 'signal' | 'thesis' | 'execution' | 'recovery' | 'status';

export type StrategyReviewEntry = {
  id: string;
  opportunity: OpportunitySummary;
  timestamp: string;
  kind: StrategyReviewKind;
  tone: StrategyReviewTone;
  label: string;
  detail: string;
  chips: string[];
  missionId?: string;
  priority: number;
};

export type StrategyReviewDigest = {
  entries: StrategyReviewEntry[];
  summary: {
    total: number;
    actions: number;
    reviews: number;
    risks: number;
    recoveries: number;
    thesisChanges: number;
    headline: string;
    detail: string;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

type EventRule = {
  kind: StrategyReviewKind;
  tone: StrategyReviewTone;
  label: string;
  chip: string;
};

const EVENT_RULES: Record<string, EventRule> = {
  mission_completed: {
    kind: 'execution',
    tone: 'positive',
    label: '任务完成，进入结果复盘',
    chip: 'MISSION DONE',
  },
  mission_failed: {
    kind: 'execution',
    tone: 'negative',
    label: '任务失败，需要恢复或复盘',
    chip: 'MISSION FAILED',
  },
  mission_canceled: {
    kind: 'execution',
    tone: 'warning',
    label: '任务取消，需要确认上下文',
    chip: 'MISSION CANCELED',
  },
  mission_queued: {
    kind: 'recovery',
    tone: 'neutral',
    label: '任务已排队，等待复盘结果',
    chip: 'MISSION QUEUED',
  },
  mission_linked: {
    kind: 'recovery',
    tone: 'neutral',
    label: '任务已关联机会卡',
    chip: 'MISSION LINKED',
  },
  signal_changed: {
    kind: 'signal',
    tone: 'warning',
    label: '信号变化，需要重新排序',
    chip: 'SIGNAL',
  },
  thesis_upgraded: {
    kind: 'thesis',
    tone: 'positive',
    label: 'Thesis 升级，记录有效驱动',
    chip: 'THESIS UP',
  },
  thesis_degraded: {
    kind: 'thesis',
    tone: 'negative',
    label: 'Thesis 降级，复盘失效条件',
    chip: 'THESIS DOWN',
  },
  leader_broken: {
    kind: 'signal',
    tone: 'negative',
    label: 'Leader 破坏，复盘传导链',
    chip: 'LEADER BROKEN',
  },
  relay_triggered: {
    kind: 'signal',
    tone: 'positive',
    label: 'Relay 触发，复盘行动窗口',
    chip: 'RELAY',
  },
  proxy_ignited: {
    kind: 'signal',
    tone: 'positive',
    label: 'Proxy 点火，复盘映射有效性',
    chip: 'PROXY',
  },
  catalyst_due: {
    kind: 'signal',
    tone: 'warning',
    label: '催化临近，检查交易前条件',
    chip: 'CATALYST',
  },
};

function parseTime(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function priorityFor(tone: StrategyReviewTone, kind: StrategyReviewKind) {
  const toneWeight = tone === 'negative'
    ? 90
    : tone === 'warning'
      ? 70
      : tone === 'positive'
        ? 55
        : 35;
  const kindWeight = kind === 'execution'
    ? 12
    : kind === 'thesis'
      ? 10
      : kind === 'signal'
        ? 8
        : kind === 'recovery'
          ? 5
          : 0;
  return toneWeight + kindWeight;
}

function kindFromTimeline(category: 'signal' | 'calendar' | 'execution' | 'thesis'): StrategyReviewKind {
  if (category === 'calendar') return 'signal';
  return category;
}

function metaString(meta: Record<string, unknown> | undefined, key: string) {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function missionIdFromEvent(event: OpportunityStreamEvent) {
  return metaString(event.meta, 'missionId') || metaString(event.meta, 'mission_id');
}

function addEntry(
  entries: StrategyReviewEntry[],
  entry: Omit<StrategyReviewEntry, 'priority'> & { priority?: number },
) {
  entries.push({
    ...entry,
    priority: entry.priority ?? priorityFor(entry.tone, entry.kind),
  });
}

function buildTimelineEntries(opportunity: OpportunitySummary, entries: StrategyReviewEntry[]) {
  for (const timelineEntry of opportunity.recentActionTimeline || []) {
    const kind = kindFromTimeline(timelineEntry.category);
    addEntry(entries, {
      id: `timeline:${opportunity.id}:${timelineEntry.id}`,
      opportunity,
      timestamp: timelineEntry.timestamp,
      kind,
      tone: timelineEntry.tone,
      label: timelineEntry.label,
      detail: timelineEntry.reasonSummary || timelineEntry.detail,
      chips: [
        timelineDecisionLabel(timelineEntry.decision),
        timelineDriverLabel(timelineEntry.driver),
        timelineSourceLabel(timelineEntry.source),
      ],
    });
  }
}

function buildGeneratedEntries(opportunity: OpportunitySummary, now: number, entries: StrategyReviewEntry[]) {
  if (opportunity.latestOpportunityDiff?.changed) {
    addEntry(entries, {
      id: `diff:${opportunity.id}:${opportunity.latestOpportunityDiff.currentSnapshotId}`,
      opportunity,
      timestamp: opportunity.updatedAt,
      kind: 'thesis',
      tone: 'warning',
      label: '机会卡发生结构变化',
      detail: opportunity.latestOpportunityDiff.summary,
      chips: ['THESIS', `${opportunity.latestOpportunityDiff.changeCount} CHANGES`],
    });
  }

  const mission = opportunity.latestMission;
  if (mission?.status === 'failed' || mission?.status === 'canceled') {
    addEntry(entries, {
      id: `mission:${opportunity.id}:${mission.id}:${mission.status}`,
      opportunity,
      timestamp: mission.updatedAt || opportunity.updatedAt,
      kind: 'execution',
      tone: mission.status === 'failed' ? 'negative' : 'warning',
      label: mission.status === 'failed' ? '最新任务失败' : '最新任务已取消',
      detail: opportunity.latestEventMessage || mission.query || opportunity.query,
      chips: ['EXECUTION', mission.status.toUpperCase()],
      missionId: mission.id,
    });
  }

  const updatedAtMs = parseTime(opportunity.updatedAt);
  if (
    (opportunity.status === 'ready' || opportunity.status === 'active')
    && updatedAtMs > 0
    && updatedAtMs < now - 3 * DAY_MS
  ) {
    addEntry(entries, {
      id: `stale:${opportunity.id}`,
      opportunity,
      timestamp: opportunity.updatedAt,
      kind: 'status',
      tone: 'warning',
      label: '高优先级机会超过 3 天未更新',
      detail: opportunity.whyNowSummary || opportunity.summary || opportunity.thesis || '需要确认排序、催化和交易前检查是否仍成立。',
      chips: ['STALE', opportunity.status.toUpperCase()],
      missionId: opportunity.latestMission?.id,
      priority: priorityFor('warning', 'status') - 8,
    });
  }
}

function buildStreamEntries(
  opportunitiesById: Map<string, OpportunitySummary>,
  events: OpportunityStreamEvent[],
  entries: StrategyReviewEntry[],
) {
  for (const event of events) {
    const rule = EVENT_RULES[event.type];
    const opportunity = opportunitiesById.get(event.opportunityId);
    if (!rule || !opportunity) continue;
    addEntry(entries, {
      id: `event:${event.id}`,
      opportunity,
      timestamp: event.timestamp,
      kind: rule.kind,
      tone: rule.tone,
      label: rule.label,
      detail: event.message,
      chips: [rule.chip, typeSummaryLabel(opportunity.type)],
      missionId: missionIdFromEvent(event) || opportunity.latestMission?.id,
    });
  }
}

function dedupeEntries(entries: StrategyReviewEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = [
      entry.opportunity.id,
      entry.kind,
      entry.tone,
      entry.label,
      entry.timestamp,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(entries: StrategyReviewEntry[]): StrategyReviewDigest['summary'] {
  const actions = entries.filter((entry) => entry.tone === 'positive').length;
  const reviews = entries.filter((entry) => entry.tone === 'warning' || entry.kind === 'thesis').length;
  const risks = entries.filter((entry) => entry.tone === 'negative').length;
  const recoveries = entries.filter((entry) => entry.kind === 'recovery').length;
  const thesisChanges = entries.filter((entry) => entry.kind === 'thesis').length;

  const headline = risks > 0
    ? `${risks} 个风险复盘`
    : actions > 0
      ? `${actions} 个行动复盘`
      : reviews > 0
        ? `${reviews} 个待确认变化`
        : '复盘队列稳定';

  const detail = entries.length > 0
    ? `行动 ${actions} / 复核 ${reviews} / 风险 ${risks} / 恢复 ${recoveries}`
    : '当前没有新的执行、信号或 thesis 变化需要复盘。';

  return {
    total: entries.length,
    actions,
    reviews,
    risks,
    recoveries,
    thesisChanges,
    headline,
    detail,
  };
}

export function buildStrategyReviewDigest(
  opportunities: OpportunitySummary[],
  events: OpportunityStreamEvent[] = [],
  now = Date.now(),
  limit = 8,
): StrategyReviewDigest {
  const opportunitiesById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const entries: StrategyReviewEntry[] = [];

  for (const opportunity of opportunities) {
    buildTimelineEntries(opportunity, entries);
    buildGeneratedEntries(opportunity, now, entries);
  }
  buildStreamEntries(opportunitiesById, events, entries);

  const sortedEntries = dedupeEntries(entries)
    .sort((a, b) => {
      const priorityDelta = b.priority - a.priority;
      if (priorityDelta !== 0) return priorityDelta;
      return parseTime(b.timestamp) - parseTime(a.timestamp);
    })
    .slice(0, limit);

  return {
    entries: sortedEntries,
    summary: buildSummary(sortedEntries),
  };
}
