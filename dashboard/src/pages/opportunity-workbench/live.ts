import type {
  OpportunityBoardType,
  OpportunityInboxItem,
  OpportunitySuggestedMission,
  OpportunitySummary,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import type {
  BoardLiveSignal,
  BoardPriorityView,
  InboxLane,
  LaneLiveSignal,
  LanePriorityView,
  LiveRankBadge,
  WorkbenchPulse,
} from './model';

export function buildExtraTemplates(
  opportunity: Pick<OpportunitySummary, 'suggestedMission' | 'suggestedMissions'>,
  primaryTemplateId?: string | null,
  limit = 2,
) {
  const seen = new Set<string>();
  const ordered = [
    opportunity.suggestedMission,
    ...(opportunity.suggestedMissions || []),
  ].filter((template): template is OpportunitySuggestedMission => Boolean(template));

  return ordered.filter((template) => {
    if (template.id === primaryTemplateId) return false;
    if (seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  }).slice(0, limit);
}

export function laneForInboxItem(item: OpportunityInboxItem): InboxLane {
  if (
    item.recommendedAction === 'review'
    || item.actionDecision === 'degrade'
    || item.actionDecision === 'review'
  ) {
    return 'review';
  }
  if (
    item.recommendedAction === 'analyze'
    || item.actionDecision === 'act'
    || item.actionDecision === 'upgrade'
  ) {
    return 'act';
  }
  return 'monitor';
}

export function inboxLaneMeta(lane: InboxLane) {
  switch (lane) {
    case 'act':
      return {
        label: 'Act Now',
        description: '催化、传导或代理变量点火后，优先推进的机会。',
        empty: '当前没有需要立刻推进的新动作',
      };
    case 'review':
      return {
        label: 'Review Now',
        description: '退化、破坏或结果变化后，优先复核的机会。',
        empty: '当前没有需要立刻复核的机会',
      };
    case 'monitor':
      return {
        label: 'Monitor',
        description: '还在观察窗口内，但暂时不需要立刻动作的机会。',
        empty: '当前没有等待观察的机会',
      };
    default:
      return {
        label: 'Lane',
        description: '',
        empty: '暂无项目',
      };
  }
}

export function laneForStreamEvent(event: OpportunityStreamEvent): InboxLane | null {
  switch (event.type) {
    case 'thesis_degraded':
    case 'leader_broken':
    case 'mission_failed':
    case 'mission_canceled':
    case 'mission_completed':
      return 'review';
    case 'relay_triggered':
    case 'proxy_ignited':
    case 'catalyst_due':
    case 'thesis_upgraded':
    case 'mission_linked':
    case 'mission_queued':
      return 'act';
    case 'signal_changed':
    case 'created':
    case 'updated':
      return 'monitor';
    default:
      return null;
  }
}

export function liveSignalLabel(event: OpportunityStreamEvent): string {
  switch (event.type) {
    case 'thesis_degraded':
      return 'Thesis degraded';
    case 'leader_broken':
      return 'Leader broken';
    case 'mission_failed':
      return 'Mission failed';
    case 'mission_canceled':
      return 'Mission canceled';
    case 'mission_completed':
      return 'Mission completed';
    case 'relay_triggered':
      return 'Relay triggered';
    case 'proxy_ignited':
      return 'Proxy ignited';
    case 'catalyst_due':
      return 'Catalyst due';
    case 'thesis_upgraded':
      return 'Thesis upgraded';
    case 'mission_linked':
      return 'Mission linked';
    case 'mission_queued':
      return 'Mission queued';
    case 'signal_changed':
      return 'Signal changed';
    case 'created':
      return 'Opportunity created';
    case 'updated':
      return 'Opportunity updated';
    default:
      return event.type.replace(/_/g, ' ');
  }
}

export function formatLiveAge(timestamp: string, now: number): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return '刚刚';
  const deltaSec = Math.max(0, Math.round((now - parsed) / 1000));
  if (deltaSec < 60) return '刚刚';
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))} 分钟前`;
  return `${Math.max(1, Math.round(deltaSec / 3600))} 小时前`;
}

function buildLiveSignalState(ageMs: number) {
  if (ageMs <= 2 * 60 * 1000) {
    return {
      state: 'fresh' as const,
      stateLabel: 'LIVE' as const,
      stateSummary: '刚刚发生跳变，正在影响这一栏的判断。',
    };
  }

  return {
    state: 'recent' as const,
    stateLabel: 'RECENT' as const,
    stateSummary: '最近发生过跳变，余温仍在影响这一栏的判断。',
  };
}

function pulseActionLabel(lane?: InboxLane | null) {
  switch (lane) {
    case 'act':
      return '先看 Act Now';
    case 'review':
      return '先看 Review Now';
    case 'monitor':
      return '先看 Monitor';
    default:
      return null;
  }
}

export function buildWorkbenchPulse(
  laneSignals: Record<InboxLane, LaneLiveSignal | null>,
  boardSignals: Record<OpportunityBoardType, BoardLiveSignal | null>,
): WorkbenchPulse {
  const laneEntries = [
    { label: 'Act Now', signal: laneSignals.act },
    { label: 'Review Now', signal: laneSignals.review },
    { label: 'Monitor', signal: laneSignals.monitor },
  ].filter((entry): entry is { label: string; signal: LaneLiveSignal } => Boolean(entry.signal));
  const boardEntries = [
    { label: 'New Codes', signal: boardSignals.ipo_spinout },
    { label: 'Heat Transfer', signal: boardSignals.relay_chain },
    { label: 'Proxy Desk', signal: boardSignals.proxy_narrative },
  ].filter((entry): entry is { label: string; signal: BoardLiveSignal } => Boolean(entry.signal));

  const freshLane = laneEntries.find((entry) => entry.signal.state === 'fresh');
  const freshBoard = boardEntries.find((entry) => entry.signal.state === 'fresh');
  const recentLane = laneEntries.find((entry) => entry.signal.state === 'recent');
  const recentBoard = boardEntries.find((entry) => entry.signal.state === 'recent');
  const liveCount = [...laneEntries, ...boardEntries].filter((entry) => entry.signal.state === 'fresh').length;
  const recentCount = [...laneEntries, ...boardEntries].filter((entry) => entry.signal.state === 'recent').length;

  if (freshLane || freshBoard) {
    const primary = freshLane || freshBoard;
    const secondary = (freshLane && freshBoard && freshLane.label !== freshBoard.label)
      ? freshBoard
      : recentLane || recentBoard;
    return {
      label: 'LIVE',
      summary: secondary
        ? `${primary?.label} 正被 ${primary?.signal.label} 驱动，${secondary.label} 也在跟随变化。`
        : `${primary?.label} 正被 ${primary?.signal.label} 驱动，当前是刚跳变窗口。`,
      chips: [
        `${liveCount} LIVE`,
        primary?.label || 'Pulse',
        secondary?.label || 'Now',
      ],
      targetLane: primary?.signal.lane,
      actionLabel: pulseActionLabel(primary?.signal.lane),
    };
  }

  if (recentLane || recentBoard) {
    const primary = recentLane || recentBoard;
    const secondary = (recentLane && recentBoard && recentLane.label !== recentBoard.label)
      ? recentBoard
      : null;
    return {
      label: 'RECENT',
      summary: secondary
        ? `${primary?.label} 仍受 ${primary?.signal.label} 余温影响，${secondary.label} 也还在消化最近变化。`
        : `${primary?.label} 仍受 ${primary?.signal.label} 余温影响，当前是 RECENT 驱动。`,
      chips: [
        `${recentCount} RECENT`,
        primary?.label || 'Pulse',
        secondary?.label || 'Drift',
      ],
      targetLane: primary?.signal.lane,
      actionLabel: pulseActionLabel(primary?.signal.lane),
    };
  }

  return {
    label: 'STEADY',
    summary: '当前没有新的结构化跳变，系统按常规优先级和 why-now 信号运行。',
    chips: ['No live shift', 'Score-led', 'Steady flow'],
    targetLane: null,
    actionLabel: null,
  };
}

export function buildLaneLiveSignal(
  lane: InboxLane,
  events: OpportunityStreamEvent[],
  now: number,
): LaneLiveSignal | null {
  const match = events.find((event) => {
    if (laneForStreamEvent(event) !== lane) return false;
    const parsed = Date.parse(event.timestamp);
    if (Number.isNaN(parsed)) return false;
    return now - parsed <= 15 * 60 * 1000;
  });

  if (!match) return null;

  const ageMs = now - Date.parse(match.timestamp);
  const signalState = buildLiveSignalState(ageMs);
  return {
    label: liveSignalLabel(match),
    detail: match.message,
    ageLabel: formatLiveAge(match.timestamp, now),
    lane,
    ...signalState,
  };
}

export function buildBoardLiveSignal(
  type: OpportunitySummary['type'],
  events: OpportunityStreamEvent[],
  opportunitiesById: Map<string, OpportunitySummary>,
  now: number,
): BoardLiveSignal | null {
  const match = events.find((event) => {
    const opportunity = opportunitiesById.get(event.opportunityId);
    if (!opportunity || opportunity.type !== type) return false;
    const parsed = Date.parse(event.timestamp);
    if (Number.isNaN(parsed)) return false;
    return now - parsed <= 20 * 60 * 1000;
  });

  if (!match) return null;

  const opportunity = opportunitiesById.get(match.opportunityId);
  if (!opportunity) return null;

  const ageMs = now - Date.parse(match.timestamp);
  const signalState = buildLiveSignalState(ageMs);
  return {
    label: liveSignalLabel(match),
    detail: match.message,
    targetTitle: opportunity.title,
    ageLabel: formatLiveAge(match.timestamp, now),
    lane: laneForStreamEvent(match),
    ...signalState,
  };
}

function laneEventPriorityBase(event: OpportunityStreamEvent) {
  switch (event.type) {
    case 'leader_broken':
      return 120;
    case 'thesis_degraded':
      return 112;
    case 'proxy_ignited':
    case 'relay_triggered':
      return 108;
    case 'catalyst_due':
    case 'thesis_upgraded':
      return 100;
    case 'mission_failed':
    case 'mission_canceled':
      return 94;
    case 'mission_completed':
      return 82;
    case 'mission_queued':
    case 'mission_linked':
      return 72;
    case 'signal_changed':
      return 56;
    case 'updated':
      return 44;
    case 'created':
      return 36;
    default:
      return 24;
  }
}

export function buildLanePriorityView(
  lane: InboxLane,
  items: OpportunityInboxItem[],
  events: OpportunityStreamEvent[],
  now: number,
): LanePriorityView {
  const recentEvents = new Map<string, OpportunityStreamEvent>();

  events.forEach((event) => {
    if (laneForStreamEvent(event) !== lane) return;
    const parsed = Date.parse(event.timestamp);
    if (Number.isNaN(parsed)) return;
    if (now - parsed > 10 * 60 * 1000) return;

    const current = recentEvents.get(event.opportunityId);
    if (!current || parsed > Date.parse(current.timestamp)) {
      recentEvents.set(event.opportunityId, event);
    }
  });

  const sorted = [...items].sort((a, b) => {
    const aEvent = recentEvents.get(a.id);
    const bEvent = recentEvents.get(b.id);
    const aEventTime = aEvent ? Date.parse(aEvent.timestamp) : 0;
    const bEventTime = bEvent ? Date.parse(bEvent.timestamp) : 0;
    const aLiveScore = aEvent
      ? laneEventPriorityBase(aEvent) + Math.max(0, 600 - Math.round((now - aEventTime) / 1000))
      : 0;
    const bLiveScore = bEvent
      ? laneEventPriorityBase(bEvent) + Math.max(0, 600 - Math.round((now - bEventTime) / 1000))
      : 0;

    if (bLiveScore !== aLiveScore) return bLiveScore - aLiveScore;
    if (b.inboxScore !== a.inboxScore) return b.inboxScore - a.inboxScore;
    return (b.actionTimestamp || b.updatedAt || '').localeCompare(a.actionTimestamp || a.updatedAt || '');
  });

  return { items: sorted, recentEvents };
}

export function buildBoardPriorityView(
  items: OpportunitySummary[],
  events: OpportunityStreamEvent[],
  now: number,
): BoardPriorityView {
  const itemIds = new Set(items.map((item) => item.id));
  const recentEvents = new Map<string, OpportunityStreamEvent>();

  events.forEach((event) => {
    if (!itemIds.has(event.opportunityId)) return;
    const parsed = Date.parse(event.timestamp);
    if (Number.isNaN(parsed)) return;
    if (now - parsed > 10 * 60 * 1000) return;

    const current = recentEvents.get(event.opportunityId);
    if (!current || parsed > Date.parse(current.timestamp)) {
      recentEvents.set(event.opportunityId, event);
    }
  });

  const originalIndex = new Map(items.map((item, index) => [item.id, index]));
  const sorted = [...items].sort((a, b) => {
    const aEvent = recentEvents.get(a.id);
    const bEvent = recentEvents.get(b.id);
    const aEventTime = aEvent ? Date.parse(aEvent.timestamp) : 0;
    const bEventTime = bEvent ? Date.parse(bEvent.timestamp) : 0;
    const aLiveScore = aEvent
      ? laneEventPriorityBase(aEvent) + Math.max(0, 600 - Math.round((now - aEventTime) / 1000))
      : 0;
    const bLiveScore = bEvent
      ? laneEventPriorityBase(bEvent) + Math.max(0, 600 - Math.round((now - bEventTime) / 1000))
      : 0;

    if (bLiveScore !== aLiveScore) return bLiveScore - aLiveScore;
    return (originalIndex.get(a.id) || 0) - (originalIndex.get(b.id) || 0);
  });

  return { items: sorted, recentEvents };
}

export function buildLiveRankBadge(
  event: OpportunityStreamEvent | null | undefined,
  rank: number,
  now: number,
): LiveRankBadge | null {
  if (!event || rank < 0 || rank > 2) return null;
  const parsed = Date.parse(event.timestamp);
  if (Number.isNaN(parsed)) return null;
  const ageMs = now - parsed;
  if (ageMs > 5 * 60 * 1000) return null;

  return {
    label: ageMs <= 45 * 1000 ? `LIVE RANK ${rank + 1}` : 'RECENTLY MOVED',
    detail: ageMs <= 45 * 1000
      ? liveSignalLabel(event)
      : `${liveSignalLabel(event)} · 刚刚把它推到前排`,
    state: ageMs <= 45 * 1000 ? 'fresh' : 'recent',
  };
}

export function shouldRefreshInboxItem(event: OpportunityStreamEvent): boolean {
  return [
    'thesis_upgraded',
    'thesis_degraded',
    'leader_broken',
    'relay_triggered',
    'proxy_ignited',
    'catalyst_due',
    'mission_failed',
    'mission_canceled',
    'mission_completed',
    'mission_queued',
  ].includes(event.type);
}

export function mergeInboxItem(
  current: OpportunityInboxItem[],
  nextItem: OpportunityInboxItem | null,
  limit: number,
): OpportunityInboxItem[] {
  if (!nextItem) return current;

  const withoutCurrent = current.filter((item) => item.id !== nextItem.id);
  const merged = [...withoutCurrent, nextItem].sort((a, b) => {
    if (b.inboxScore !== a.inboxScore) return b.inboxScore - a.inboxScore;
    return (b.actionTimestamp || b.updatedAt || '').localeCompare(a.actionTimestamp || a.updatedAt || '');
  });

  return merged.slice(0, limit);
}

export function shouldRefreshOpportunitySummary(event: OpportunityStreamEvent): boolean {
  return Boolean(event.opportunityId);
}

export function mergeOpportunitySummary(
  current: OpportunitySummary[],
  nextItem: OpportunitySummary | null,
  limit: number,
): OpportunitySummary[] {
  if (!nextItem) return current;

  const withoutCurrent = current.filter((item) => item.id !== nextItem.id);
  const merged = [...withoutCurrent, nextItem].sort((a, b) => {
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  return merged.slice(0, limit);
}
