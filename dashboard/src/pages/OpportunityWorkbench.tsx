import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Cable, CalendarClock, Compass, Flame, Layers3, Radar, Sparkles } from 'lucide-react';
import {
  createMission,
  createOpportunity,
  fetchOpportunityBoardHealth,
  fetchOpportunityDetail,
  fetchOpportunityInboxItem,
  fetchOpportunityInbox,
  fetchOpportunityEvents,
  fetchOpportunities,
  fetchQueue,
  fetchHeatTransferGraphs,
  refreshNewCodeRadar,
  syncHeatTransferGraphs,
  type CreateOpportunityInput,
  type HeatTransferGraph,
  type OpportunityBoardHealthMap,
  type OpportunityBoardHealthSummary,
  type OpportunityBoardType,
  type OpportunitySuggestedMission,
  type OpportunityInboxItem,
  type OpportunitySummary,
} from '../api';
import { useOpportunityStream, usePolling, type OpportunityStreamEvent } from '../hooks/useAgentStream';

type DraftState = CreateOpportunityInput & {
  relatedTickersText: string;
  relayTickersText: string;
  officialTradingDate: string;
  spinoutDate: string;
  retainedStakePercentText: string;
  lockupDate: string;
  greenshoeStatus: string;
  firstIndependentEarningsAt: string;
  firstCoverageAt: string;
};

const TEMPLATE_PRESETS: Record<CreateOpportunityInput['type'], Partial<DraftState>> = {
  ipo_spinout: {
    type: 'ipo_spinout',
    title: '',
    query: '',
    thesis: '市场第一次拿到纯代码，重点跟踪交易日历与再定义催化。',
    stage: 'radar',
    status: 'watching',
    relatedTickersText: '',
    relayTickersText: '',
    officialTradingDate: '',
    spinoutDate: '',
    retainedStakePercentText: '',
    lockupDate: '',
    greenshoeStatus: '',
    firstIndependentEarningsAt: '',
    firstCoverageAt: '',
  },
  relay_chain: {
    type: 'relay_chain',
    title: '',
    query: '',
    thesis: '从龙头温度计出发，识别瓶颈和二三层洼地，验证热量传导是否成立。',
    stage: 'tracking',
    status: 'watching',
    relatedTickersText: '',
    relayTickersText: '',
    officialTradingDate: '',
    spinoutDate: '',
    retainedStakePercentText: '',
    lockupDate: '',
    greenshoeStatus: '',
    firstIndependentEarningsAt: '',
    firstCoverageAt: '',
  },
  proxy_narrative: {
    type: 'proxy_narrative',
    title: '',
    query: '',
    thesis: '寻找最纯、最稀缺、最容易被市场当成公共符号定价的代理变量。',
    stage: 'framing',
    status: 'watching',
    relatedTickersText: '',
    relayTickersText: '',
    officialTradingDate: '',
    spinoutDate: '',
    retainedStakePercentText: '',
    lockupDate: '',
    greenshoeStatus: '',
    firstIndependentEarningsAt: '',
    firstCoverageAt: '',
  },
  ad_hoc: {
    type: 'ad_hoc',
    title: '',
    query: '',
    thesis: '',
    stage: 'tracking',
    status: 'watching',
    relatedTickersText: '',
    relayTickersText: '',
    officialTradingDate: '',
    spinoutDate: '',
    retainedStakePercentText: '',
    lockupDate: '',
    greenshoeStatus: '',
    firstIndependentEarningsAt: '',
    firstCoverageAt: '',
  },
};

const DRAFT_STORAGE_KEY = 'opportunity-workbench-draft-v1';
const BOARD_TYPES = ['ipo_spinout', 'relay_chain', 'proxy_narrative'] as const;
const BOARD_FILTER_QUERY_KEYS: Record<OpportunityBoardType, string> = {
  ipo_spinout: 'ipoMetric',
  relay_chain: 'relayMetric',
  proxy_narrative: 'proxyMetric',
};

function createDraftState(
  type: DraftState['type'] = 'relay_chain',
  overrides: Partial<DraftState> = {},
): DraftState {
  return {
    title: '',
    query: '',
    thesis: '',
    stage: 'tracking',
    status: 'watching',
    primaryTicker: '',
    leaderTicker: '',
    proxyTicker: '',
    relatedTickersText: '',
    relayTickersText: '',
    nextCatalystAt: '',
    supplyOverhang: '',
    policyStatus: '',
    officialTradingDate: '',
    spinoutDate: '',
    retainedStakePercentText: '',
    lockupDate: '',
    greenshoeStatus: '',
    firstIndependentEarningsAt: '',
    firstCoverageAt: '',
    ...(TEMPLATE_PRESETS[type] as Partial<DraftState>),
    ...overrides,
    type: overrides.type || type,
  };
}

function readStoredDraft() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const type = parsed.type && parsed.type in TEMPLATE_PRESETS
      ? parsed.type
      : 'relay_chain';
    return createDraftState(type, parsed);
  } catch {
    return null;
  }
}

function sameBoardFilters(a: BoardFilterState, b: BoardFilterState) {
  return BOARD_TYPES.every((type) => (a[type] || null) === (b[type] || null));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function typeMeta(type: OpportunitySummary['type']) {
  switch (type) {
    case 'ipo_spinout':
      return { label: '3 / New Codes', icon: Compass, description: 'IPO / 分拆 / 新纯标的' };
    case 'relay_chain':
      return { label: '4 / Heat Transfer', icon: Cable, description: '龙头 -> 瓶颈 -> 洼地' };
    case 'proxy_narrative':
      return { label: '5 / Proxy Desk', icon: Flame, description: '政策 / 题材 / 映射代理' };
    default:
      return { label: 'Ad Hoc', icon: Layers3, description: '扩展机会卡' };
  }
}

function statusTone(status: OpportunitySummary['status']) {
  switch (status) {
    case 'ready':
      return 'agree';
    case 'active':
      return 'partial';
    case 'degraded':
      return 'disagree';
    default:
      return 'pending';
  }
}

function scoreLabel(opportunity: OpportunitySummary) {
  if (opportunity.type === 'ipo_spinout') return `Catalyst ${opportunity.scores.catalystScore}`;
  if (opportunity.type === 'relay_chain') return `Relay ${opportunity.scores.relayScore}`;
  if (opportunity.type === 'proxy_narrative') return `Purity ${opportunity.scores.purityScore}`;
  return `Trade ${opportunity.scores.tradeabilityScore}`;
}

function catalystConfidenceLabel(confidence?: 'confirmed' | 'inferred' | 'placeholder') {
  switch (confidence) {
    case 'confirmed':
      return 'CONFIRMED';
    case 'inferred':
      return 'INFERRED';
    case 'placeholder':
      return 'PLACEHOLDER';
    default:
      return null;
  }
}

function heatInflectionLabel(kind?: 'formation' | 'confirmation' | 'acceleration' | 'weakening' | 'breakdown' | 'rebuild') {
  switch (kind) {
    case 'confirmation':
      return 'CONFIRMING';
    case 'acceleration':
      return 'ACCELERATING';
    case 'weakening':
      return 'WEAKENING';
    case 'breakdown':
      return 'BREAKDOWN';
    case 'rebuild':
      return 'REBUILD';
    case 'formation':
      return 'FORMING';
    default:
      return null;
  }
}

function playbookStanceLabel(stance?: 'prepare' | 'act' | 'review') {
  switch (stance) {
    case 'act':
      return 'ACT';
    case 'review':
      return 'REVIEW';
    case 'prepare':
      return 'PREP';
    default:
      return null;
  }
}

function timelineDecisionLabel(decision?: 'upgrade' | 'degrade' | 'act' | 'review' | 'monitor') {
  switch (decision) {
    case 'upgrade':
      return 'UPGRADE';
    case 'degrade':
      return 'DEGRADE';
    case 'act':
      return 'ACT';
    case 'review':
      return 'REVIEW';
    case 'monitor':
      return 'MONITOR';
    default:
      return 'TIMELINE';
  }
}

function timelineDriverLabel(driver?: 'heat' | 'rule' | 'calendar' | 'execution' | 'manual' | 'system') {
  switch (driver) {
    case 'heat':
      return 'HEAT';
    case 'rule':
      return 'RULE';
    case 'calendar':
      return 'CALENDAR';
    case 'execution':
      return 'EXECUTION';
    case 'manual':
      return 'MANUAL';
    case 'system':
      return 'SYSTEM';
    default:
      return 'FLOW';
  }
}

function driverSummaryLabel(driver?: 'heat' | 'rule' | 'calendar' | 'execution' | 'manual' | 'system') {
  switch (driver) {
    case 'heat':
      return '热量传导';
    case 'rule':
      return '规则状态';
    case 'calendar':
      return '事件日历';
    case 'execution':
      return '执行结果';
    case 'manual':
      return '人工推进';
    case 'system':
      return '系统信号';
    default:
      return '综合信号';
  }
}

function typeSummaryLabel(type?: OpportunitySummary['type']) {
  switch (type) {
    case 'ipo_spinout':
      return 'New Codes';
    case 'relay_chain':
      return 'Heat Transfer';
    case 'proxy_narrative':
      return 'Proxy Desk';
    default:
      return 'Ad Hoc';
  }
}

function timelineSourceLabel(source?: 'manual' | 'automation' | 'system') {
  switch (source) {
    case 'manual':
      return 'MANUAL';
    case 'automation':
      return 'AUTO';
    case 'system':
      return 'SYSTEM';
    default:
      return 'FLOW';
  }
}

function timelineDecisionTone(decision?: 'upgrade' | 'degrade' | 'act' | 'review' | 'monitor') {
  return decision === 'degrade' || decision === 'review' ? 'changed' : 'stable';
}

type InboxLane = 'act' | 'review' | 'monitor';
type LaneLiveSignal = {
  label: string;
  detail: string;
  ageLabel: string;
  state: 'fresh' | 'recent';
  stateLabel: 'LIVE' | 'RECENT';
  stateSummary: string;
  lane: InboxLane | null;
};
type BoardLiveSignal = LaneLiveSignal & {
  targetTitle: string;
};
type BoardFilterState = Partial<Record<OpportunityBoardType, string | null>>;
type BoardPriorityMode = 'act' | 'review' | 'monitor';
type OpportunityPrimaryAction = {
  label: string;
  template: OpportunitySuggestedMission | null;
  target: 'mission' | 'analysis';
};
type LaneActionPreview = {
  opportunity: OpportunitySummary;
  action: OpportunityPrimaryAction;
  copy: string;
  targetTitle: string;
  ageLabel: string;
  fresh: boolean;
};
type LanePriorityView = {
  items: OpportunityInboxItem[];
  recentEvents: Map<string, OpportunityStreamEvent>;
};
type BoardPriorityView = {
  items: OpportunitySummary[];
  recentEvents: Map<string, OpportunityStreamEvent>;
};
type LiveRankBadge = {
  label: string;
  detail: string;
  state: 'fresh' | 'recent';
};
type WorkbenchPulse = {
  label: 'LIVE' | 'RECENT' | 'STEADY';
  summary: string;
  chips: string[];
  targetLane?: InboxLane | null;
  actionLabel?: string | null;
};

function buildExtraTemplates(
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

function laneForInboxItem(item: OpportunityInboxItem): InboxLane {
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

function inboxLaneMeta(lane: InboxLane) {
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

function laneForStreamEvent(event: OpportunityStreamEvent): InboxLane | null {
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

function liveSignalLabel(event: OpportunityStreamEvent): string {
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

function formatLiveAge(timestamp: string, now: number): string {
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

function buildWorkbenchPulse(
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

function buildLaneLiveSignal(
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

function buildBoardLiveSignal(
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

function fallbackBoardHealthSummary(
  type: OpportunityBoardType,
  items: OpportunitySummary[],
): OpportunityBoardHealthSummary {
  return {
    type,
    headline: `Cards ${items.length}`,
    summary: '板块健康摘要加载中。',
    metrics: [
      {
        key: 'cards',
        label: 'cards',
        value: items.length,
        tone: 'neutral',
        opportunityIds: items.map((item) => item.id),
      },
    ],
  };
}

function metricToneClass(tone: 'neutral' | 'positive' | 'warning' | 'negative') {
  switch (tone) {
    case 'positive':
      return 'positive';
    case 'warning':
      return 'warning';
    case 'negative':
      return 'negative';
    default:
      return 'neutral';
  }
}

function filterBoardItems(
  items: OpportunitySummary[],
  boardHealth: OpportunityBoardHealthSummary,
  activeMetricKey?: string | null,
) {
  const activeMetric = boardHealth.metrics.find((metric) => metric.key === activeMetricKey) || null;
  if (!activeMetric || activeMetric.opportunityIds.length === 0) {
    return {
      items,
      activeMetric: null,
    };
  }

  const idSet = new Set(activeMetric.opportunityIds);
  return {
    items: items.filter((item) => idSet.has(item.id)),
    activeMetric,
  };
}

function boardMetricPriorityMode(metricKey?: string | null): BoardPriorityMode {
  switch (metricKey) {
    case 'window_open':
    case 'confirmed':
    case 'ignited':
    case 'rule_named':
      return 'act';
    case 'overhang':
    case 'first_earnings_pending':
    case 'fragile':
    case 'broken':
    case 'retreat':
      return 'review';
    default:
      return 'monitor';
  }
}

function liveSignalSummaryPrefix(signal?: { state: 'fresh' | 'recent' } | null): string {
  if (!signal) return '';
  return signal.state === 'fresh'
    ? '当前由刚跳变信号驱动，'
    : '当前仍受最近跳变余温驱动，';
}

function liveSignalSortSuffix(signal?: { state: 'fresh' | 'recent' } | null): string {
  if (!signal) return '';
  return signal.state === 'fresh'
    ? ' · 当前为 LIVE 驱动'
    : ' · 当前为 RECENT 余温驱动';
}

function boardSortSummary(
  metricKey?: string | null,
  liveSignal?: { state: 'fresh' | 'recent' } | null,
): string {
  const mode = boardMetricPriorityMode(metricKey);
  if (mode === 'act') {
    return `排序: 动作信号 > thesis 变化 > 最近更新${liveSignalSortSuffix(liveSignal)}`;
  }
  if (mode === 'review') {
    return `排序: 复核信号 > thesis 变化 > 最近更新${liveSignalSortSuffix(liveSignal)}`;
  }
  return `排序: why now > thesis 变化 > 最近更新${liveSignalSortSuffix(liveSignal)}`;
}

function latestActionEntry(opportunity: OpportunitySummary) {
  return opportunity.recentActionTimeline?.[0];
}

function primaryOpportunityDecision(opportunity: OpportunitySummary) {
  return latestActionEntry(opportunity)?.decision
    || (opportunity.playbook?.stance === 'review'
      ? 'review'
      : opportunity.playbook?.stance === 'act'
        ? 'act'
        : opportunity.playbook?.stance === 'prepare'
          ? 'monitor'
          : undefined);
}

function hasUpcomingCatalyst(opportunity: OpportunitySummary) {
  return opportunity.catalystCalendar.some((item) => item.status === 'upcoming');
}

function nextUpcomingCatalyst(opportunity: OpportunitySummary) {
  return opportunity.catalystCalendar.find((item) => item.status === 'upcoming');
}

function boardActionScore(opportunity: OpportunitySummary, mode: BoardPriorityMode) {
  const decision = primaryOpportunityDecision(opportunity);
  let score = 0;
  if (mode === 'act') {
    if (decision === 'act') score += 90;
    if (decision === 'upgrade') score += 82;
    if (opportunity.playbook?.stance === 'act') score += 36;
    if (opportunity.latestEventType === 'catalyst_due' || opportunity.latestEventType === 'relay_triggered' || opportunity.latestEventType === 'proxy_ignited' || opportunity.latestEventType === 'thesis_upgraded') {
      score += 24;
    }
    if (hasUpcomingCatalyst(opportunity)) score += 18;
  } else if (mode === 'review') {
    if (decision === 'review') score += 90;
    if (decision === 'degrade') score += 82;
    if (opportunity.playbook?.stance === 'review') score += 36;
    if (opportunity.latestEventType === 'leader_broken' || opportunity.latestEventType === 'thesis_degraded' || opportunity.latestEventType === 'mission_failed' || opportunity.latestEventType === 'mission_canceled') {
      score += 24;
    }
  } else {
    if (opportunity.whyNowSummary) score += 20;
    if (opportunity.playbook?.stance === 'prepare') score += 16;
  }

  if (opportunity.latestOpportunityDiff?.changed) {
    score += 12 + Math.min(opportunity.latestOpportunityDiff.changeCount, 5) * 2;
  }

  if (opportunity.heatInflection) {
    if (opportunity.heatInflection.kind === 'confirmation' || opportunity.heatInflection.kind === 'acceleration' || opportunity.heatInflection.kind === 'rebuild') {
      score += mode === 'act' ? 16 : 6;
    }
    if (opportunity.heatInflection.kind === 'weakening' || opportunity.heatInflection.kind === 'breakdown') {
      score += mode === 'review' ? 16 : 4;
    }
  }

  return score;
}

function boardMetricSpecificScore(opportunity: OpportunitySummary, metricKey?: string | null) {
  switch (metricKey) {
    case 'window_open':
      return (hasUpcomingCatalyst(opportunity) ? 20 : 0)
        + (opportunity.stage === 'ready' || opportunity.status === 'ready' ? 16 : 0);
    case 'overhang':
      return (opportunity.ipoProfile?.retainedStakePercent ? opportunity.ipoProfile.retainedStakePercent : 0)
        + (opportunity.ipoProfile?.lockupDate ? 14 : 0);
    case 'first_earnings_pending':
      return opportunity.ipoProfile?.firstCoverageAt ? 12 : 18;
    case 'confirmed':
      return (opportunity.scores.relayScore || 0)
        + (opportunity.heatProfile?.breadthScore || 0);
    case 'fragile':
    case 'broken':
      return (opportunity.latestEventType === 'leader_broken' ? 28 : 0)
        + (opportunity.latestEventType === 'thesis_degraded' ? 20 : 0)
        + (opportunity.heatProfile?.breadthScore ? Math.max(0, 100 - opportunity.heatProfile.breadthScore) : 0);
    case 'ignited':
      return opportunity.scores.purityScore
        + opportunity.scores.scarcityScore
        + (opportunity.proxyProfile?.legitimacyScore || 0);
    case 'retreat':
      return (opportunity.status === 'degraded' ? 40 : 0)
        + (opportunity.latestEventType === 'thesis_degraded' ? 24 : 0)
        + (opportunity.latestEventType === 'mission_failed' ? 18 : 0);
    case 'rule_named':
      return (opportunity.proxyProfile?.legitimacyScore || 0)
        + (opportunity.scores.policyScore || 0);
    default:
      return 0;
  }
}

function sortBoardItems(
  items: OpportunitySummary[],
  metricKey?: string | null,
) {
  const mode = boardMetricPriorityMode(metricKey);
  return [...items].sort((a, b) => {
    const aScore = boardMetricSpecificScore(a, metricKey) + boardActionScore(a, mode);
    const bScore = boardMetricSpecificScore(b, metricKey) + boardActionScore(b, mode);
    if (bScore !== aScore) return bScore - aScore;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}

function buildBoardPriorityReason(
  opportunity: OpportunitySummary,
  metricKey?: string | null,
  rank = 0,
) {
  const action = latestActionEntry(opportunity);
  const catalyst = nextUpcomingCatalyst(opportunity);
  const topLabel = rank === 0 ? 'WHY FIRST' : rank === 1 ? 'NEXT UP' : `RANK ${rank + 1}`;

  if (metricKey === 'window_open') {
    return {
      label: topLabel,
      tone: 'stable' as const,
      detail: catalyst?.dueAt
        ? `${catalyst.label} 临近 ${catalyst.dueAt}，更适合先推进。`
        : '交易窗口已接近，优先看催化和承接。 ',
    };
  }

  if (metricKey === 'overhang') {
    return {
      label: 'REVIEW FIRST',
      tone: 'changed' as const,
      detail: opportunity.ipoProfile?.retainedStakePercent
        ? `父公司仍保留 ${opportunity.ipoProfile.retainedStakePercent}%，供给压力需要先复核。`
        : opportunity.ipoProfile?.lockupDate
          ? `锁定/解禁窗口 ${opportunity.ipoProfile.lockupDate} 临近，先复核供给压力。`
          : '供给 overhang 仍在，先复核日历和筹码。 ',
    };
  }

  if (metricKey === 'first_earnings_pending') {
    return {
      label: 'REVIEW FIRST',
      tone: 'changed' as const,
      detail: opportunity.ipoProfile?.firstCoverageAt
        ? `已有覆盖线索，但首份独立财报还没落地。`
        : '首份独立验证还缺位，先补 earnings / coverage。 ',
    };
  }

  if (metricKey === 'confirmed') {
    return {
      label: topLabel,
      tone: 'stable' as const,
      detail: `传导已${opportunity.heatProfile?.validationStatus || '确认'}，Relay ${opportunity.scores.relayScore}${typeof opportunity.heatProfile?.breadthScore === 'number' ? ` / Breadth ${opportunity.heatProfile.breadthScore}` : ''}。`,
    };
  }

  if (metricKey === 'fragile' || metricKey === 'broken') {
    return {
      label: 'REVIEW FIRST',
      tone: 'changed' as const,
      detail: action?.reasonSummary
        || opportunity.heatProfile?.validationSummary
        || opportunity.heatInflection?.summary
        || '传导链变脆弱了，先复核 leader health 和 breadth。 ',
    };
  }

  if (metricKey === 'ignited') {
    return {
      label: topLabel,
      tone: 'stable' as const,
      detail: `代理变量已点火，Purity ${opportunity.scores.purityScore} / Scarcity ${opportunity.scores.scarcityScore} / Legitimacy ${opportunity.proxyProfile?.legitimacyScore || 0}。`,
    };
  }

  if (metricKey === 'retreat') {
    return {
      label: 'REVIEW FIRST',
      tone: 'changed' as const,
      detail: action?.reasonSummary
        || action?.detail
        || '代理变量正在退潮，先复核降级原因和承接。 ',
    };
  }

  if (metricKey === 'rule_named') {
    return {
      label: topLabel,
      tone: 'stable' as const,
      detail: opportunity.proxyProfile?.ruleStatus
        ? `规则状态已更新为 ${opportunity.proxyProfile.ruleStatus}，更适合先看映射强度。`
        : opportunity.policyStatus
          ? `政策/规则状态为 ${opportunity.policyStatus}，先看交易身份变化。`
          : '规则正名已经成立，优先看它是否成为主代理符号。 ',
    };
  }

  if (action?.reasonSummary) {
    return {
      label: action.decision === 'review' || action.decision === 'degrade' ? 'REVIEW FIRST' : topLabel,
      tone: action.decision === 'review' || action.decision === 'degrade' ? 'changed' as const : 'stable' as const,
      detail: action.reasonSummary,
    };
  }

  if (opportunity.latestOpportunityDiff?.changed) {
    return {
      label: topLabel,
      tone: 'stable' as const,
      detail: opportunity.latestOpportunityDiff.summary,
    };
  }

  return {
    label: topLabel,
    tone: 'stable' as const,
    detail: opportunity.whyNowSummary || '当前它在这组里更值得先看。 ',
  };
}

function findSuggestedTemplate(opportunity: OpportunitySummary, preferredIds: string[]) {
  const templates = opportunity.suggestedMissions || [];
  return templates.find((template) => preferredIds.includes(template.id))
    || (opportunity.suggestedMission && preferredIds.includes(opportunity.suggestedMission.id) ? opportunity.suggestedMission : null)
    || null;
}

function buildBoardPrimaryAction(
  opportunity: OpportunitySummary,
  metricKey?: string | null,
): OpportunityPrimaryAction {
  switch (metricKey) {
    case 'window_open':
      return {
        label: '先看交易窗口',
        template: findSuggestedTemplate(opportunity, ['radar_deep_validation', 'radar_overview']),
        target: 'analysis',
      };
    case 'overhang':
      return {
        label: '先复核 overhang',
        template: findSuggestedTemplate(opportunity, ['radar_review', 'radar_overview']),
        target: 'analysis',
      };
    case 'first_earnings_pending':
      return {
        label: '先补独立验证',
        template: findSuggestedTemplate(opportunity, ['radar_review', 'radar_deep_validation']),
        target: 'analysis',
      };
    case 'confirmed':
      return {
        label: '先验 relay 确认',
        template: findSuggestedTemplate(opportunity, ['relay_chain_deep', 'relay_chain_map']),
        target: 'analysis',
      };
    case 'fragile':
      return {
        label: '先复核脆弱链',
        template: findSuggestedTemplate(opportunity, ['relay_chain_review', 'relay_chain_deep']),
        target: 'analysis',
      };
    case 'broken':
      return {
        label: '先复核 broken 链',
        template: findSuggestedTemplate(opportunity, ['relay_chain_review', 'relay_chain_map']),
        target: 'analysis',
      };
    case 'ignited':
      return {
        label: '先验代理点火',
        template: findSuggestedTemplate(opportunity, ['proxy_deep', 'proxy_scan']),
        target: 'analysis',
      };
    case 'retreat':
      return {
        label: '先复核代理退潮',
        template: findSuggestedTemplate(opportunity, ['proxy_review', 'proxy_scan']),
        target: 'analysis',
      };
    case 'rule_named':
      return {
        label: '先看规则映射',
        template: findSuggestedTemplate(opportunity, ['proxy_deep', 'proxy_scan']),
        target: 'analysis',
      };
    default:
      return {
        label: '发起分析',
        template: opportunity.suggestedMission || opportunity.suggestedMissions?.[0] || null,
        target: 'analysis',
      };
  }
}

function buildOpportunityPrimaryAction(
  opportunity: OpportunitySummary,
  lane: InboxLane,
): OpportunityPrimaryAction {
  if (lane === 'review') {
    if (opportunity.type === 'ipo_spinout') {
      return {
        label: '先复核窗口变化',
        template: findSuggestedTemplate(opportunity, ['radar_review', 'radar_overview']),
        target: opportunity.latestMission ? 'mission' : 'analysis',
      };
    }
    if (opportunity.type === 'relay_chain') {
      return {
        label: '先复核传导链',
        template: findSuggestedTemplate(opportunity, ['relay_chain_review', 'relay_chain_deep']),
        target: opportunity.latestMission ? 'mission' : 'analysis',
      };
    }
    if (opportunity.type === 'proxy_narrative') {
      return {
        label: '先复核代理退潮',
        template: findSuggestedTemplate(opportunity, ['proxy_review', 'proxy_scan']),
        target: opportunity.latestMission ? 'mission' : 'analysis',
      };
    }
    return {
      label: '先看变化',
      template: opportunity.suggestedMission || opportunity.suggestedMissions?.[0] || null,
      target: opportunity.latestMission ? 'mission' : 'analysis',
    };
  }

  if (lane === 'monitor') {
    if (opportunity.type === 'ipo_spinout') {
      return {
        label: opportunity.latestMission ? '继续盯交易窗口' : '继续看窗口',
        template: findSuggestedTemplate(opportunity, ['radar_overview', 'radar_deep_validation']),
        target: opportunity.latestMission ? 'mission' : 'analysis',
      };
    }
    if (opportunity.type === 'relay_chain') {
      return {
        label: opportunity.latestMission ? '继续盯传导链' : '继续看传导',
        template: findSuggestedTemplate(opportunity, ['relay_chain_map', 'relay_chain_deep']),
        target: opportunity.latestMission ? 'mission' : 'analysis',
      };
    }
    if (opportunity.type === 'proxy_narrative') {
      return {
        label: opportunity.latestMission ? '继续盯代理变量' : '继续看代理',
        template: findSuggestedTemplate(opportunity, ['proxy_scan', 'proxy_deep']),
        target: opportunity.latestMission ? 'mission' : 'analysis',
      };
    }
    return {
      label: opportunity.latestMission ? '查看现有任务' : '继续观察',
      template: opportunity.suggestedMission || opportunity.suggestedMissions?.[0] || null,
      target: opportunity.latestMission ? 'mission' : 'analysis',
    };
  }

  if (opportunity.type === 'ipo_spinout') {
    return {
      label: '先看交易窗口',
      template: findSuggestedTemplate(opportunity, ['radar_deep_validation', 'radar_overview']),
      target: 'analysis',
    };
  }
  if (opportunity.type === 'relay_chain') {
    return {
      label: '先验 relay 确认',
      template: findSuggestedTemplate(opportunity, ['relay_chain_deep', 'relay_chain_map']),
      target: 'analysis',
    };
  }
  if (opportunity.type === 'proxy_narrative') {
    return {
      label: '先验代理点火',
      template: findSuggestedTemplate(opportunity, ['proxy_deep', 'proxy_scan']),
      target: 'analysis',
    };
  }
  return {
    label: '发起分析',
    template: opportunity.suggestedMission || opportunity.suggestedMissions?.[0] || null,
    target: 'analysis',
  };
}

function buildInboxPrimaryAction(item: OpportunityInboxItem): OpportunityPrimaryAction {
  return buildOpportunityPrimaryAction(item, laneForInboxItem(item));
}

function metricKeyForEvent(event: OpportunityStreamEvent, opportunity: OpportunitySummary): string | null {
  switch (event.type) {
    case 'catalyst_due':
      return opportunity.type === 'ipo_spinout' ? 'window_open' : null;
    case 'relay_triggered':
      return 'confirmed';
    case 'proxy_ignited':
      return 'ignited';
    case 'leader_broken':
      return opportunity.type === 'proxy_narrative' ? 'retreat' : 'broken';
    case 'thesis_upgraded':
      if (opportunity.type === 'ipo_spinout') return 'window_open';
      if (opportunity.type === 'relay_chain') return 'confirmed';
      if (opportunity.type === 'proxy_narrative') return 'ignited';
      return null;
    case 'thesis_degraded':
    case 'mission_failed':
    case 'mission_canceled':
      if (opportunity.type === 'ipo_spinout') {
        return opportunity.supplyOverhang || opportunity.ipoProfile?.retainedStakePercent || opportunity.ipoProfile?.lockupDate
          ? 'overhang'
          : 'first_earnings_pending';
      }
      if (opportunity.type === 'relay_chain') return 'fragile';
      if (opportunity.type === 'proxy_narrative') return 'retreat';
      return null;
    default:
      return null;
  }
}

function buildLaneActionPreview(
  lane: InboxLane,
  events: OpportunityStreamEvent[],
  opportunitiesById: Map<string, OpportunitySummary>,
  now: number,
): LaneActionPreview | null {
  const match = events.find((event) => {
    if (laneForStreamEvent(event) !== lane) return false;
    const parsed = Date.parse(event.timestamp);
    if (Number.isNaN(parsed)) return false;
    return now - parsed <= 2 * 60 * 1000;
  });

  if (!match) return null;

  const opportunity = opportunitiesById.get(match.opportunityId);
  if (!opportunity) return null;

  const metricKey = metricKeyForEvent(match, opportunity);
  const boardAction = metricKey ? buildBoardPrimaryAction(opportunity, metricKey) : null;
  const action = boardAction
    ? {
        ...boardAction,
        target: lane === 'review' && opportunity.latestMission ? 'mission' as const : boardAction.target,
      }
    : buildOpportunityPrimaryAction(opportunity, lane);
  const ageMs = now - Date.parse(match.timestamp);

  return {
    opportunity,
    action,
    copy: `刚收到 ${liveSignalLabel(match)}，默认动作切到“${action.label}”。`,
    targetTitle: opportunity.title,
    ageLabel: formatLiveAge(match.timestamp, now),
    fresh: ageMs <= 30 * 1000,
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

function buildLanePriorityView(
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

function buildBoardPriorityView(
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

function buildLiveRankBadge(
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

function shouldRefreshInboxItem(event: OpportunityStreamEvent): boolean {
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

function mergeInboxItem(
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

function shouldRefreshOpportunitySummary(event: OpportunityStreamEvent): boolean {
  return Boolean(event.opportunityId);
}

function mergeOpportunitySummary(
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

function topCountLabel<T extends string>(items: T[]): { value?: T; count: number } {
  const counts = new Map<T, number>();
  items.forEach((item) => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });

  let bestValue: T | undefined;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });

  return { value: bestValue, count: bestCount };
}

function buildLaneInsight(
  items: OpportunityInboxItem[],
  lane: InboxLane,
  liveSignal?: { state: 'fresh' | 'recent' } | null,
) {
  if (items.length === 0) {
    return {
      summary: lane === 'review'
        ? '当前没有新的退化或复核触发。'
        : lane === 'act'
          ? '当前没有新的可执行推进信号。'
          : '当前没有新的观察窗口需要盯。',
      chips: [] as string[],
      actionSummary: null as string | null,
    };
  }

  const topItem = items[0]!;
  const primaryAction = buildInboxPrimaryAction(topItem);
  const driverStats = topCountLabel(
    items.map((item) => item.actionDriver || 'system'),
  );
  const typeStats = topCountLabel(
    items.map((item) => item.type),
  );

  const driverText = driverSummaryLabel(driverStats.value);
  const typeText = typeSummaryLabel(typeStats.value);
  const topTarget = topItem.actionLabel || topItem.title;
  const livePrefix = liveSignalSummaryPrefix(liveSignal);

  const summary = lane === 'review'
    ? `${livePrefix}当前以${driverText}驱动的复核为主，${typeText}占优，先看 ${topTarget}。`
    : lane === 'act'
      ? `${livePrefix}当前以${driverText}驱动的推进为主，${typeText}占优，优先处理 ${topTarget}。`
      : `${livePrefix}当前以${driverText}观察信号为主，${typeText}占优，继续盯 ${topTarget}。`;

  const chips = [
    `${driverText} x${driverStats.count}`,
    `${typeText} x${typeStats.count}`,
    `Top ${topItem.inboxScore}`,
  ];
  if (liveSignal) {
    chips.unshift(liveSignal.state === 'fresh' ? 'LIVE 驱动' : 'RECENT 余温');
  }

  const actionSummary = lane === 'review'
    ? `${livePrefix}默认动作是“${primaryAction.label}”，先处理 ${topItem.title}。`
    : lane === 'act'
      ? `${livePrefix}默认动作是“${primaryAction.label}”，优先推进 ${topItem.title}。`
      : `${livePrefix}默认动作是“${primaryAction.label}”，继续跟踪 ${topItem.title}。`;

  return { summary, chips, actionSummary };
}

function parseTickers(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildIpoProfile(draft: DraftState): CreateOpportunityInput['ipoProfile'] | undefined {
  if (draft.type !== 'ipo_spinout') return undefined;

  const retainedStakePercent = draft.retainedStakePercentText.trim();
  const parsedStake = retainedStakePercent ? Number(retainedStakePercent) : undefined;
  const profile = {
    ...(draft.officialTradingDate.trim() ? { officialTradingDate: draft.officialTradingDate.trim() } : {}),
    ...(draft.spinoutDate.trim() ? { spinoutDate: draft.spinoutDate.trim() } : {}),
    ...(!Number.isNaN(parsedStake as number) && parsedStake !== undefined ? { retainedStakePercent: parsedStake } : {}),
    ...(draft.lockupDate.trim() ? { lockupDate: draft.lockupDate.trim() } : {}),
    ...(draft.greenshoeStatus.trim() ? { greenshoeStatus: draft.greenshoeStatus.trim() } : {}),
    ...(draft.firstIndependentEarningsAt.trim() ? { firstIndependentEarningsAt: draft.firstIndependentEarningsAt.trim() } : {}),
    ...(draft.firstCoverageAt.trim() ? { firstCoverageAt: draft.firstCoverageAt.trim() } : {}),
  };

  return Object.keys(profile).length > 0 ? profile : undefined;
}

function buildMissionInput(opportunity: OpportunitySummary | DraftState) {
  if ('suggestedMission' in opportunity && opportunity.suggestedMission) {
    return opportunity.suggestedMission;
  }
  if ('suggestedMissions' in opportunity && opportunity.suggestedMissions && opportunity.suggestedMissions.length > 0) {
    return opportunity.suggestedMissions[0];
  }
  const primary = opportunity.primaryTicker || opportunity.leaderTicker || opportunity.proxyTicker;
  if (primary) {
    return {
      mode: 'analyze' as const,
      query: primary,
      tickers: [primary] as string[],
    };
  }

  return {
    mode: 'explore' as const,
    query: opportunity.query || opportunity.title,
    tickers: undefined,
    depth: 'deep' as const,
    source: 'manual',
  };
}

export function OpportunityWorkbench() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<DraftState>(() => readStoredDraft() || createDraftState('relay_chain'));
  const [submitting, setSubmitting] = useState<'save' | 'analyze' | null>(null);
  const [automationAction, setAutomationAction] = useState<'radar' | 'graph' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [liveInbox, setLiveInbox] = useState<OpportunityInboxItem[]>([]);
  const [liveOpportunities, setLiveOpportunities] = useState<OpportunitySummary[]>([]);
  const [liveBoardHealth, setLiveBoardHealth] = useState<OpportunityBoardHealthMap | null>(null);
  const [activeBoardFilters, setActiveBoardFilters] = useState<BoardFilterState>({});
  const [focusedLane, setFocusedLane] = useState<InboxLane | null>(null);
  const processedInboxEvents = useRef<Set<string>>(new Set());
  const processedOpportunityEvents = useRef<Set<string>>(new Set());
  const laneFocusTimeoutRef = useRef<number | null>(null);
  const laneRefs = useRef<Record<InboxLane, HTMLElement | null>>({
    act: null,
    review: null,
    monitor: null,
  });

  const { data: opportunities } = usePolling<OpportunitySummary[]>(() => fetchOpportunities(60), 5000, []);
  const { data: boardHealth } = usePolling<OpportunityBoardHealthMap | null>(() => fetchOpportunityBoardHealth(60), 5000, []);
  const { data: inbox } = usePolling<OpportunityInboxItem[]>(() => fetchOpportunityInbox(10), 5000, []);
  const { data: recentEvents } = usePolling(() => fetchOpportunityEvents(20), 8000, []);
  const { data: queue } = usePolling(() => fetchQueue(), 5000, []);
  const { data: heatGraphs } = usePolling<HeatTransferGraph[]>(() => fetchHeatTransferGraphs(), 10000, []);
  const { events: streamedEvents, isConnected } = useOpportunityStream(20);

  const syncBoardFilters = (nextFilters: BoardFilterState, replace = false) => {
    setActiveBoardFilters(nextFilters);
    const nextParams = new URLSearchParams(searchParams);
    BOARD_TYPES.forEach((type) => {
      const value = nextFilters[type];
      const queryKey = BOARD_FILTER_QUERY_KEYS[type];
      if (value) {
        nextParams.set(queryKey, value);
      } else {
        nextParams.delete(queryKey);
      }
    });
    setSearchParams(nextParams, { replace });
  };

  const focusLane = useCallback((lane?: InboxLane | null) => {
    if (!lane) return;
    setFocusedLane(lane);
    if (laneFocusTimeoutRef.current) {
      window.clearTimeout(laneFocusTimeoutRef.current);
    }
    laneFocusTimeoutRef.current = window.setTimeout(() => {
      setFocusedLane((current) => (current === lane ? null : current));
      laneFocusTimeoutRef.current = null;
    }, 2400);
    laneRefs.current[lane]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (laneFocusTimeoutRef.current) {
      window.clearTimeout(laneFocusTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (inbox) {
      setLiveInbox(inbox);
    }
  }, [inbox]);

  useEffect(() => {
    if (opportunities) {
      setLiveOpportunities(opportunities);
    }
  }, [opportunities]);

  useEffect(() => {
    if (boardHealth) {
      setLiveBoardHealth(boardHealth);
    }
  }, [boardHealth]);

  useEffect(() => {
    const nextFilters: BoardFilterState = {};
    let normalized = false;
    const nextParams = new URLSearchParams(searchParams);

    BOARD_TYPES.forEach((type) => {
      const value = searchParams.get(BOARD_FILTER_QUERY_KEYS[type]);
      if (!value) return;
      const exists = liveBoardHealth
        ? liveBoardHealth[type].metrics.some((metric) => metric.key === value && metric.opportunityIds.length > 0)
        : true;

      if (exists) {
        nextFilters[type] = value;
      } else {
        nextParams.delete(BOARD_FILTER_QUERY_KEYS[type]);
        normalized = true;
      }
    });

    setActiveBoardFilters((current) => (sameBoardFilters(current, nextFilters) ? current : nextFilters));

    if (normalized) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [liveBoardHealth, searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    const latestEvent = streamedEvents?.[0];
    if (!latestEvent || !shouldRefreshInboxItem(latestEvent)) return;
    if (processedInboxEvents.current.has(latestEvent.id)) return;

    processedInboxEvents.current.add(latestEvent.id);
    void fetchOpportunityInboxItem(latestEvent.opportunityId).then((item) => {
      if (!item) return;
      setLiveInbox((current) => mergeInboxItem(current, item, 10));
    });
  }, [streamedEvents]);

  useEffect(() => {
    const latestEvent = streamedEvents?.[0];
    if (!latestEvent || !shouldRefreshOpportunitySummary(latestEvent)) return;
    if (processedOpportunityEvents.current.has(latestEvent.id)) return;

    processedOpportunityEvents.current.add(latestEvent.id);
    void fetchOpportunityDetail(latestEvent.opportunityId).then((item) => {
      if (!item) return;
      setLiveOpportunities((current) => mergeOpportunitySummary(current, item, 60));
    });
    void fetchOpportunityBoardHealth(60).then((next) => {
      if (!next) return;
      setLiveBoardHealth(next);
    });
  }, [streamedEvents]);

  const eventFeed = useMemo(() => {
    const merged = [...(streamedEvents || []), ...((recentEvents || []) as typeof streamedEvents)];
    const seen = new Set<string>();
    return merged.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 14);
  }, [recentEvents, streamedEvents]);

  const groups = useMemo(() => ({
    ipo_spinout: (liveOpportunities || []).filter((item) => item.type === 'ipo_spinout'),
    relay_chain: (liveOpportunities || []).filter((item) => item.type === 'relay_chain'),
    proxy_narrative: (liveOpportunities || []).filter((item) => item.type === 'proxy_narrative'),
  }), [liveOpportunities]);

  const summary = useMemo(() => ({
    total: (liveOpportunities || []).length,
    ready: (liveOpportunities || []).filter((item) => item.status === 'ready').length,
    active: (liveOpportunities || []).filter((item) => item.status === 'active').length,
    degraded: (liveOpportunities || []).filter((item) => item.status === 'degraded').length,
  }), [liveOpportunities]);
  const opportunityMap = useMemo(() => new Map((liveOpportunities || []).map((item) => [item.id, item])), [liveOpportunities]);
  const coreStats = useMemo(() => ({
    running: queue?.tasks.filter((task) => task.status === 'running').length || 0,
    pending: queue?.tasks.filter((task) => task.status === 'pending').length || 0,
  }), [queue]);
  const relaySnapshots = useMemo(() => (heatGraphs || []).slice(0, 4), [heatGraphs]);
  const inboxLanes = useMemo(() => ({
    act: buildLanePriorityView(
      'act',
      (liveInbox || []).filter((item) => laneForInboxItem(item) === 'act'),
      streamedEvents || [],
      liveNow,
    ),
    review: buildLanePriorityView(
      'review',
      (liveInbox || []).filter((item) => laneForInboxItem(item) === 'review'),
      streamedEvents || [],
      liveNow,
    ),
    monitor: buildLanePriorityView(
      'monitor',
      (liveInbox || []).filter((item) => laneForInboxItem(item) === 'monitor'),
      streamedEvents || [],
      liveNow,
    ),
  }), [liveInbox, liveNow, streamedEvents]);
  const laneLiveSignals = useMemo(() => ({
    act: buildLaneLiveSignal('act', streamedEvents || [], liveNow),
    review: buildLaneLiveSignal('review', streamedEvents || [], liveNow),
    monitor: buildLaneLiveSignal('monitor', streamedEvents || [], liveNow),
  }), [liveNow, streamedEvents]);
  const laneInsights = useMemo(() => ({
    act: buildLaneInsight(inboxLanes.act.items, 'act', laneLiveSignals.act),
    review: buildLaneInsight(inboxLanes.review.items, 'review', laneLiveSignals.review),
    monitor: buildLaneInsight(inboxLanes.monitor.items, 'monitor', laneLiveSignals.monitor),
  }), [inboxLanes, laneLiveSignals]);
  const laneActionPreviews = useMemo(() => ({
    act: buildLaneActionPreview('act', streamedEvents || [], opportunityMap, liveNow),
    review: buildLaneActionPreview('review', streamedEvents || [], opportunityMap, liveNow),
    monitor: buildLaneActionPreview('monitor', streamedEvents || [], opportunityMap, liveNow),
  }), [liveNow, opportunityMap, streamedEvents]);
  const boardLiveSignals = useMemo(() => ({
    ipo_spinout: buildBoardLiveSignal('ipo_spinout', streamedEvents || [], opportunityMap, liveNow),
    relay_chain: buildBoardLiveSignal('relay_chain', streamedEvents || [], opportunityMap, liveNow),
    proxy_narrative: buildBoardLiveSignal('proxy_narrative', streamedEvents || [], opportunityMap, liveNow),
  }), [liveNow, opportunityMap, streamedEvents]);
  const workbenchPulse = useMemo(
    () => buildWorkbenchPulse(laneLiveSignals, boardLiveSignals),
    [boardLiveSignals, laneLiveSignals],
  );
  const boardHealthMap = useMemo(() => liveBoardHealth || {
    ipo_spinout: fallbackBoardHealthSummary('ipo_spinout', groups.ipo_spinout),
    relay_chain: fallbackBoardHealthSummary('relay_chain', groups.relay_chain),
    proxy_narrative: fallbackBoardHealthSummary('proxy_narrative', groups.proxy_narrative),
  }, [groups, liveBoardHealth]);

  const toggleBoardFilter = (type: OpportunityBoardType, metricKey: string, count: number) => {
    if (metricKey === 'cards' || count === 0) return;
    const nextFilters = {
      ...activeBoardFilters,
      [type]: activeBoardFilters[type] === metricKey ? null : metricKey,
    };
    syncBoardFilters(nextFilters);
  };

  const applyTemplate = (type: DraftState['type']) => {
    setDraft((current) => createDraftState(type, {
      title: current.title,
      query: current.query,
    }));
    setActionError(null);
  };

  const persistOpportunity = async (mode: 'save' | 'analyze') => {
    const draftTitle = (draft.title || '').trim();
    const draftQuery = (draft.query || '').trim();
    if (!draftTitle && !draftQuery) return;
    setSubmitting(mode);
    setActionError(null);

    try {
      const created = await createOpportunity({
        type: draft.type,
        title: draftTitle || draftQuery,
        query: draftQuery || draftTitle,
        thesis: draft.thesis?.trim() || undefined,
        stage: draft.stage,
        status: draft.status,
        primaryTicker: draft.primaryTicker?.trim() || undefined,
        leaderTicker: draft.leaderTicker?.trim() || undefined,
        proxyTicker: draft.proxyTicker?.trim() || undefined,
        relatedTickers: parseTickers(draft.relatedTickersText),
        relayTickers: parseTickers(draft.relayTickersText),
        nextCatalystAt: draft.nextCatalystAt?.trim() || undefined,
        supplyOverhang: draft.supplyOverhang?.trim() || undefined,
        policyStatus: draft.policyStatus?.trim() || undefined,
        ...(buildIpoProfile(draft) ? { ipoProfile: buildIpoProfile(draft) } : {}),
      });

      if (mode === 'analyze') {
        const missionInput = buildMissionInput({ ...draft, title: created.title, query: created.query });
        const mission = await createMission(
          missionInput.mode,
          missionInput.query,
          missionInput.tickers,
          missionInput.depth || 'deep',
          created.id,
          missionInput.source || 'manual',
        );
        navigate(`/missions/${mission.missionId}`);
      } else {
        setDraft(createDraftState(draft.type));
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '机会创建失败');
    }

    setSubmitting(null);
  };

  const launchOpportunityAnalysis = async (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => {
    setActionError(null);
    try {
      const missionInput = suggested || buildMissionInput(opportunity);
      const mission = await createMission(
        missionInput.mode,
        missionInput.query,
        missionInput.tickers,
        missionInput.depth || 'deep',
        opportunity.id,
        missionInput.source || 'manual',
      );
      navigate(`/missions/${mission.missionId}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '分析任务创建失败');
    }
  };

  const seedRelayOpportunity = async (snapshot: HeatTransferGraph) => {
    setActionError(null);
    try {
      await createOpportunity({
        type: 'relay_chain',
        title: `${snapshot.theme} 热量传导链`,
        query: snapshot.theme,
        thesis: snapshot.transmissionSummary,
        leaderTicker: snapshot.leaderTicker,
        relatedTickers: snapshot.bottleneckTickers,
        relayTickers: snapshot.laggardTickers,
        heatProfile: {
          temperature: snapshot.temperature,
          bottleneckTickers: snapshot.bottleneckTickers,
          laggardTickers: snapshot.laggardTickers,
          breadthScore: snapshot.breadthScore,
          validationStatus: snapshot.validationStatus,
          validationSummary: snapshot.validationSummary,
          edgeCount: snapshot.edgeCount,
          edges: snapshot.edges,
          transmissionNote: snapshot.transmissionSummary,
        },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '从观察池生成 relay 机会失败');
    }
  };

  const runRadarRefresh = async () => {
    setAutomationAction('radar');
    setActionError(null);
    try {
      await refreshNewCodeRadar();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '刷新 New Code Radar 失败');
    }
    setAutomationAction(null);
  };

  const runHeatGraphSync = async () => {
    setAutomationAction('graph');
    setActionError(null);
    try {
      await syncHeatTransferGraphs();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '同步 Heat Transfer Graph 失败');
    }
    setAutomationAction(null);
  };

  const executePrimaryAction = async (
    opportunity: OpportunitySummary,
    action: OpportunityPrimaryAction,
  ) => {
    if (action.target === 'mission' && opportunity.latestMission) {
      navigate(`/missions/${opportunity.latestMission.id}`);
      return;
    }

    await launchOpportunityAnalysis(opportunity, action.template || undefined);
  };
  const resolveLanePrimaryTarget = useCallback((lane: InboxLane) => {
    const lanePreview = laneActionPreviews[lane];
    const laneTopItem = inboxLanes[lane].items[0] || null;
    const opportunity = lanePreview?.opportunity || laneTopItem;
    const action = lanePreview?.action || (laneTopItem ? buildInboxPrimaryAction(laneTopItem) : null);

    if (!opportunity || !action) return null;
    return { opportunity, action };
  }, [inboxLanes, laneActionPreviews]);

  const pulsePrimaryTarget = useMemo(() => {
    const lane = workbenchPulse.targetLane;
    if (!lane) return null;
    return resolveLanePrimaryTarget(lane);
  }, [resolveLanePrimaryTarget, workbenchPulse.targetLane]);
  const pulseSecondaryTemplates = useMemo(() => {
    if (!pulsePrimaryTarget) return [];
    return buildExtraTemplates(
      pulsePrimaryTarget.opportunity,
      pulsePrimaryTarget.action.template?.id,
      2,
    );
  }, [pulsePrimaryTarget]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const lane = event.key === '1'
        ? 'act'
        : event.key === '2'
          ? 'review'
          : event.key === '3'
            ? 'monitor'
            : null;
      if (!lane) return;

      event.preventDefault();
      if (!event.shiftKey) {
        focusLane(lane);
        return;
      }

      const target = resolveLanePrimaryTarget(lane);
      if (!target) return;
      void executePrimaryAction(target.opportunity, target.action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executePrimaryAction, focusLane, resolveLanePrimaryTarget]);

  const handleInboxPrimaryAction = async (item: OpportunityInboxItem) => {
    const primaryAction = buildInboxPrimaryAction(item);
    await executePrimaryAction(item, primaryAction);
  };

  const renderInboxCard = (
    item: OpportunityInboxItem,
    livePriorityEvent?: OpportunityStreamEvent | null,
    liveRank?: number,
  ) => {
    const primaryAction = buildInboxPrimaryAction(item);
    const liveRankBadge = buildLiveRankBadge(livePriorityEvent, liveRank ?? -1, liveNow);
    const extraTemplates = buildExtraTemplates(item, primaryAction.template?.id, 2);
    return (
    <article
      key={item.id}
      className={`today-card ${liveRankBadge ? 'live-ranked' : ''} ${liveRankBadge?.state || ''}`}
    >
      <div className="today-card-top">
        <span className={`consensus-badge ${statusTone(item.status)}`}>
          {typeMeta(item.type).label}
        </span>
        <div className="today-card-rank">
          {liveRankBadge && (
            <span className={`live-rank-badge ${liveRankBadge.state}`} title={liveRankBadge.detail}>
              {liveRankBadge.label}
            </span>
          )}
          <span className="today-run">Score {item.inboxScore}</span>
        </div>
      </div>
      <div className="today-query">{item.title}</div>
      <div className="today-meta">
        <span>{item.stage} / {item.status}</span>
        {item.primaryTicker && <span>Primary {item.primaryTicker}</span>}
        {item.leaderTicker && <span>Leader {item.leaderTicker}</span>}
        {item.proxyTicker && <span>Proxy {item.proxyTicker}</span>}
      </div>
      <div className="today-diff">
        <span className={`diff-chip ${item.recommendedAction === 'review' ? 'changed' : 'stable'}`}>
          {item.recommendedAction.toUpperCase()}
        </span>
        <span className="today-diff-summary">{item.inboxSummary}</span>
      </div>
      {livePriorityEvent && (
        <div className="today-live-priority">
          <div className="today-live-priority-top">
            <span className="live-dot-small" />
            <span className="today-live-priority-label">{liveSignalLabel(livePriorityEvent)}</span>
            <span className="today-live-priority-age">{formatLiveAge(livePriorityEvent.timestamp, liveNow)}</span>
          </div>
          <div className="today-live-priority-detail">{livePriorityEvent.message}</div>
        </div>
      )}
      {item.actionLabel && (
        <div className="today-action-callout">
          <div className="op-timeline-chips">
            {item.actionDecision && (
              <span className={`diff-chip ${timelineDecisionTone(item.actionDecision)}`}>
                {timelineDecisionLabel(item.actionDecision)}
              </span>
            )}
            {item.actionDriver && (
              <span className="timeline-chip">{timelineDriverLabel(item.actionDriver)}</span>
            )}
            {item.actionTimestamp && (
              <span className="timeline-chip muted">{new Date(item.actionTimestamp).toLocaleString()}</span>
            )}
          </div>
          <div className="today-action-label">{item.actionLabel}</div>
          {item.actionDetail && <div className="today-action-detail">{item.actionDetail}</div>}
        </div>
      )}
      {item.playbook && (
        <div className="op-card-detail">
          <div><ArrowRight size={12} /> {item.playbook.nextStep}</div>
        </div>
      )}
      {item.suggestedMission && (
        <div className="today-meta">
          <span>{item.suggestedMission.mode}</span>
          <span>{item.suggestedMission.depth}</span>
          <span>{item.suggestedMission.query}</span>
        </div>
      )}
      {extraTemplates.length > 0 && (
        <div className="tc-tickers">
          {extraTemplates.map((template) => (
            <button
              key={`${item.id}_${template.id}`}
              type="button"
              className="secondary-btn"
              onClick={() => void launchOpportunityAnalysis(item, template)}
            >
              {template.label}
            </button>
          ))}
        </div>
      )}
      <div className="tc-tickers">
        {item.inboxReasons.slice(0, 3).map((reason) => (
          <span key={`${item.id}_${reason.code}`} className="ticker-pill">{reason.label}</span>
        ))}
      </div>
      <div className="today-actions" style={{ marginTop: 10 }}>
        <button type="button" className="secondary-btn" onClick={() => void handleInboxPrimaryAction(item)}>
          {primaryAction.label}
        </button>
        {item.latestMission && (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => navigate(`/missions/${item.latestMission!.id}`)}
            disabled={primaryAction.target === 'mission'}
          >
            查看任务
          </button>
        )}
      </div>
    </article>
  );
  };

  return (
    <div className="page opportunity-workbench">
      <div className="page-header">
        <h1><Radar size={24} /> 机会工作台</h1>
        <div className="header-status">
          <span className={`status-dot ${isConnected ? 'ok' : 'warn'}`} />
          {isConnected ? 'EVENTS LIVE' : 'EVENTS POLLING'}
        </div>
      </div>

      <div className="opportunity-summary-grid">
        <div className="op-summary-card glass-panel">
          <span>Total</span>
          <strong>{summary.total}</strong>
          <small>已建机会卡</small>
        </div>
        <div className="op-summary-card glass-panel">
          <span>Ready</span>
          <strong>{summary.ready}</strong>
          <small>可继续验证</small>
        </div>
        <div className="op-summary-card glass-panel">
          <span>Active</span>
          <strong>{summary.active}</strong>
          <small>正在跟踪</small>
        </div>
        <div className="op-summary-card glass-panel">
          <span>Core</span>
          <strong>{coreStats.running}R / {coreStats.pending}Q</strong>
          <small>
            <button type="button" className="inline-link-btn" onClick={() => navigate('/command-center')}>
              打开执行控制台 <ArrowRight size={12} />
            </button>
          </small>
        </div>
        <div className="op-summary-card pulse glass-panel">
          <span>Pulse</span>
          <strong>{workbenchPulse.label}</strong>
          <div className="op-summary-detail">{workbenchPulse.summary}</div>
        <div className="op-summary-chips">
          {workbenchPulse.chips.map((chip) => (
            <span key={chip} className="timeline-chip muted">{chip}</span>
          ))}
        </div>
          {pulsePrimaryTarget && (
            <div className="op-summary-target">
              <div className="op-summary-target-top">
                <span className="diff-chip stable">FOCUS</span>
                <span className="op-summary-target-title">{pulsePrimaryTarget.opportunity.title}</span>
              </div>
              <div className="op-summary-target-copy">
                当前默认动作是“{pulsePrimaryTarget.action.label}”，目标在 {typeMeta(pulsePrimaryTarget.opportunity.type).label}。
              </div>
            </div>
          )}
          {workbenchPulse.targetLane && workbenchPulse.actionLabel && (
            <div className="op-summary-actions">
              <button
                type="button"
                className="secondary-btn tiny"
                onClick={() => focusLane(workbenchPulse.targetLane)}
              >
                {workbenchPulse.actionLabel}
              </button>
              {pulsePrimaryTarget && (
                <button
                  type="button"
                  className="secondary-btn tiny"
                  onClick={() => void executePrimaryAction(pulsePrimaryTarget.opportunity, pulsePrimaryTarget.action)}
                >
                  直接执行: {pulsePrimaryTarget.action.label}
                </button>
              )}
              {pulsePrimaryTarget && pulseSecondaryTemplates.map((template) => (
                <button
                  key={`${pulsePrimaryTarget.opportunity.id}_${template.id}`}
                  type="button"
                  className="secondary-btn tiny"
                  onClick={() => void launchOpportunityAnalysis(pulsePrimaryTarget.opportunity, template)}
                >
                  备选: {template.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="today-summary glass-panel">
        <div className="today-header">
          <div>
            <h3>Action Inbox</h3>
            <p>先按行动泳道分层，再在每条泳道里按催化、传导、退化和 thesis 变化排序。</p>
            <div className="today-shortcuts">
              <span className="timeline-chip muted">1 / 2 / 3 跳到泳道</span>
              <span className="timeline-chip muted">Shift + 1 / 2 / 3 直接执行</span>
            </div>
          </div>
          <div className="today-kpis">
            <div className="today-kpi">
              <span>Items</span>
              <strong>{liveInbox.length || 0}</strong>
            </div>
            <div className="today-kpi">
              <span>Act</span>
              <strong>{inboxLanes.act.items.length}</strong>
            </div>
            <div className="today-kpi">
              <span>Review</span>
              <strong>{inboxLanes.review.items.length}</strong>
            </div>
            <div className="today-kpi">
              <span>Monitor</span>
              <strong>{inboxLanes.monitor.items.length}</strong>
            </div>
            <div className="today-kpi">
              <span>Top</span>
              <strong>{liveInbox[0]?.inboxScore || 0}</strong>
            </div>
            <div className="today-kpi">
              <span>Priority</span>
              <strong>{liveInbox[0]?.actionDecision ? timelineDecisionLabel(liveInbox[0].actionDecision) : 'WATCH'}</strong>
            </div>
          </div>
        </div>
        <div className="today-lanes">
          {(['act', 'review', 'monitor'] as const).map((lane) => {
            const meta = inboxLaneMeta(lane);
            const laneView = inboxLanes[lane];
            const items = laneView.items;
            const insight = laneInsights[lane];
            const liveSignal = laneLiveSignals[lane];
            const laneActionPreview = laneActionPreviews[lane];
            const lanePrimaryItem = items[0] || null;
            const lanePrimaryOpportunity = laneActionPreview?.opportunity || lanePrimaryItem;
            const lanePrimaryAction = laneActionPreview?.action || (lanePrimaryItem ? buildInboxPrimaryAction(lanePrimaryItem) : null);
            return (
              <section
                key={lane}
                className={`today-lane ${lane} ${focusedLane === lane ? 'focused' : ''}`}
                ref={(node) => {
                  laneRefs.current[lane] = node;
                }}
              >
                <div className="today-lane-header">
                  <div>
                    <h4>{meta.label}</h4>
                    <p>{meta.description}</p>
                    {liveSignal && (
                      <div className={`today-lane-live ${liveSignal.state}`}>
                        <div className="today-lane-live-top">
                          <span className="live-dot-small" />
                          <span className="today-lane-live-label">{liveSignal.label}</span>
                          <span className={`live-state-chip ${liveSignal.state}`}>{liveSignal.stateLabel}</span>
                          <span className="today-lane-live-age">{liveSignal.ageLabel}</span>
                        </div>
                        <div className="today-lane-live-detail">{liveSignal.detail}</div>
                        <div className="today-lane-live-note">{liveSignal.stateSummary}</div>
                      </div>
                    )}
                    <div className="today-lane-summary">{insight.summary}</div>
                    {insight.chips.length > 0 && (
                      <div className="today-lane-chips">
                        {insight.chips.map((chip) => (
                          <span key={`${lane}_${chip}`} className="timeline-chip muted">{chip}</span>
                        ))}
                      </div>
                    )}
                    {lanePrimaryOpportunity && lanePrimaryAction && (
                      <div className={`today-lane-action ${laneActionPreview?.fresh ? 'fresh' : ''}`}>
                        {(laneActionPreview?.copy || insight.actionSummary) && (
                          <div className="today-lane-action-copy">{laneActionPreview?.copy || insight.actionSummary}</div>
                        )}
                        <div className="today-lane-action-row">
                          <button
                            type="button"
                            className="secondary-btn tiny"
                            onClick={() => lanePrimaryOpportunity ? void executePrimaryAction(lanePrimaryOpportunity, lanePrimaryAction) : undefined}
                          >
                            {lanePrimaryAction.label}
                          </button>
                          <span className="timeline-chip muted">{laneActionPreview?.targetTitle || lanePrimaryOpportunity.title}</span>
                          {laneActionPreview?.fresh && (
                            <span className="timeline-chip">LIVE</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className={`today-lane-count ${lane}`}>{items.length}</span>
                </div>
                <div className="today-feed-list">
                  {items.length === 0 ? (
                    <div className="today-empty">{meta.empty}</div>
                  ) : (
                    items.map((item, index) => renderInboxCard(item, laneView.recentEvents.get(item.id), index))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="opportunity-top-grid">
        <div className="opportunity-create glass-panel">
          <div className="op-create-header">
            <div>
              <h3>创建机会卡</h3>
              <p>保留原有 Mission 执行流，在上层先定义交易机会对象。</p>
            </div>
            <div className="op-template-row">
              {(['ipo_spinout', 'relay_chain', 'proxy_narrative'] as const).map((type) => {
                const meta = typeMeta(type);
                const Icon = meta.icon;
                return (
                  <button key={type} type="button" className={`template-chip ${draft.type === type ? 'active' : ''}`} onClick={() => applyTemplate(type)}>
                    <Icon size={14} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="op-create-form">
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="机会标题，例如 CoreWeave 传导链 / Sandisk 再定义 / 港股 AI 代理变量"
            />
            <input
              value={draft.query}
              onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
              placeholder="用于触发分析的 query，可写主题、ticker 或问题"
            />
            <textarea
              value={draft.thesis}
              onChange={(event) => setDraft((current) => ({ ...current, thesis: event.target.value }))}
              placeholder="一句话 thesis：为什么这个机会值得跟踪"
              rows={3}
            />
            <div className="op-form-row">
              <input value={draft.primaryTicker || ''} onChange={(event) => setDraft((current) => ({ ...current, primaryTicker: event.target.value }))} placeholder="Primary" />
              <input value={draft.leaderTicker || ''} onChange={(event) => setDraft((current) => ({ ...current, leaderTicker: event.target.value }))} placeholder="Leader" />
              <input value={draft.proxyTicker || ''} onChange={(event) => setDraft((current) => ({ ...current, proxyTicker: event.target.value }))} placeholder="Proxy" />
            </div>
            <div className="op-form-row">
              <input value={draft.relatedTickersText} onChange={(event) => setDraft((current) => ({ ...current, relatedTickersText: event.target.value }))} placeholder="Related tickers, comma separated" />
              <input value={draft.relayTickersText} onChange={(event) => setDraft((current) => ({ ...current, relayTickersText: event.target.value }))} placeholder="Relay / laggard tickers, comma separated" />
            </div>
            <div className="op-form-row">
              <input value={draft.nextCatalystAt || ''} onChange={(event) => setDraft((current) => ({ ...current, nextCatalystAt: event.target.value }))} placeholder="Next catalyst date / note" />
              <input value={draft.supplyOverhang || ''} onChange={(event) => setDraft((current) => ({ ...current, supplyOverhang: event.target.value }))} placeholder="Supply overhang / retained stake / lockup" />
              <input value={draft.policyStatus || ''} onChange={(event) => setDraft((current) => ({ ...current, policyStatus: event.target.value }))} placeholder="Policy / rule status" />
            </div>
            {draft.type === 'ipo_spinout' && (
              <>
                <div className="op-form-row">
                  <input value={draft.officialTradingDate} onChange={(event) => setDraft((current) => ({ ...current, officialTradingDate: event.target.value }))} placeholder="Official trading date" />
                  <input value={draft.spinoutDate} onChange={(event) => setDraft((current) => ({ ...current, spinoutDate: event.target.value }))} placeholder="Spinout / separation date" />
                  <input value={draft.retainedStakePercentText} onChange={(event) => setDraft((current) => ({ ...current, retainedStakePercentText: event.target.value }))} placeholder="Retained stake %" />
                </div>
                <div className="op-form-row">
                  <input value={draft.lockupDate} onChange={(event) => setDraft((current) => ({ ...current, lockupDate: event.target.value }))} placeholder="Lockup / unlock date" />
                  <input value={draft.firstIndependentEarningsAt} onChange={(event) => setDraft((current) => ({ ...current, firstIndependentEarningsAt: event.target.value }))} placeholder="First independent earnings" />
                  <input value={draft.firstCoverageAt} onChange={(event) => setDraft((current) => ({ ...current, firstCoverageAt: event.target.value }))} placeholder="First sell-side coverage" />
                </div>
                <input value={draft.greenshoeStatus} onChange={(event) => setDraft((current) => ({ ...current, greenshoeStatus: event.target.value }))} placeholder="Greenshoe / stabilization note" />
              </>
            )}
            {actionError && <div className="mode-hint" style={{ color: 'var(--accent-crimson)' }}>{actionError}</div>}
            <div className="op-form-actions">
              <button type="button" className="secondary-btn" onClick={() => void persistOpportunity('save')} disabled={submitting !== null}>
                {submitting === 'save' ? '创建中...' : '仅创建机会卡'}
              </button>
              <button type="button" onClick={() => void persistOpportunity('analyze')} disabled={submitting !== null}>
                {submitting === 'analyze' ? '创建并分析中...' : '创建并发起分析'}
              </button>
            </div>
          </div>
        </div>

        <div className="opportunity-events glass-panel">
          <div className="stream-header">
            <span>STRUCTURED OPPORTUNITY FLOW</span>
            <span className={`live-dot ${isConnected ? 'connected' : ''}`}>
              {isConnected ? '● CONNECTED' : '○ POLLING'}
            </span>
          </div>
          <div className="op-event-list">
            {eventFeed.length === 0 ? (
              <div className="today-empty">还没有机会事件</div>
            ) : (
              eventFeed.map((event) => (
                <div key={event.id} className="op-event-item">
                  <div className="op-event-top">
                    <span className={`diff-chip ${event.type.includes('failed') || event.type.includes('degraded') || event.type.includes('broken') ? 'changed' : 'stable'}`}>
                      {event.type}
                    </span>
                    <span className="stream-time">{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="op-event-message">{event.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {relaySnapshots.length > 0 && (
        <div className="relay-snapshot-strip glass-panel">
          <div className="op-board-header">
            <div>
              <h3><Cable size={16} /> Watchlist Heat Snapshot</h3>
              <p>后端自动把动态观察池组织成传导图，再同步成 relay opportunity。</p>
            </div>
            <div className="op-board-actions">
              <span className="header-count">{relaySnapshots.length} graphs</span>
              <button type="button" className="secondary-btn" onClick={() => void runHeatGraphSync()} disabled={automationAction !== null}>
                {automationAction === 'graph' ? '同步中...' : '同步自动建图'}
              </button>
            </div>
          </div>
          <div className="relay-snapshot-list">
            {relaySnapshots.map((snapshot) => (
              <div key={snapshot.id} className="relay-snapshot-card">
                <div className="today-card-top">
                  <strong>{snapshot.theme}</strong>
                  <div className="today-actions">
                    <span className="today-run">Relay {snapshot.relayScore}</span>
                    <button type="button" className="secondary-btn" onClick={() => void seedRelayOpportunity(snapshot)}>
                      生成机会卡
                    </button>
                  </div>
                </div>
                <div className="today-diff">
                  <span className={`diff-chip ${snapshot.temperature === 'hot' || snapshot.temperature === 'warming' ? 'changed' : 'stable'}`}>
                    {snapshot.temperature.toUpperCase()}
                  </span>
                  <span className="today-diff-summary">{snapshot.validationSummary}</span>
                </div>
                <div className="today-meta">
                  <span>Breadth {snapshot.breadthScore}</span>
                  <span>Edges {snapshot.edgeCount}</span>
                  <span>{snapshot.validationStatus}</span>
                </div>
                <div className="relay-lane">
                  <div className="relay-lane-block">
                    <span className="relay-label">Leader</span>
                    <div className="tc-tickers">
                      {snapshot.leaderTicker ? <span className="ticker-pill">${snapshot.leaderTicker}</span> : <span className="ticker-more">待补</span>}
                    </div>
                  </div>
                  <div className="relay-arrow">→</div>
                  <div className="relay-lane-block">
                    <span className="relay-label">Bottleneck</span>
                    <div className="tc-tickers">
                      {snapshot.bottleneckTickers.length > 0 ? snapshot.bottleneckTickers.slice(0, 3).map((ticker) => (
                        <span key={ticker} className="ticker-pill">${ticker}</span>
                      )) : <span className="ticker-more">待补</span>}
                    </div>
                  </div>
                  <div className="relay-arrow">→</div>
                  <div className="relay-lane-block">
                    <span className="relay-label">Laggard</span>
                    <div className="tc-tickers">
                      {snapshot.laggardTickers.length > 0 ? snapshot.laggardTickers.slice(0, 3).map((ticker) => (
                        <span key={ticker} className="ticker-pill">${ticker}</span>
                      )) : <span className="ticker-more">待补</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="op-board-grid">
        {(['ipo_spinout', 'relay_chain', 'proxy_narrative'] as const).map((type) => {
          const meta = typeMeta(type);
          const Icon = meta.icon;
          const items = groups[type];
          const boardLiveSignal = boardLiveSignals[type];
          const boardHealth = boardHealthMap[type];
          const activeMetricKey = activeBoardFilters[type];
          const { items: filteredItems, activeMetric } = filterBoardItems(items, boardHealth, activeMetricKey);
          const visibleItems = activeMetric ? sortBoardItems(filteredItems, activeMetric.key) : filteredItems;
          const boardPriorityView = buildBoardPriorityView(visibleItems, streamedEvents || [], liveNow);
          return (
            <section key={type} className="op-board glass-panel">
              <div className="op-board-header">
                <div>
                  <h3><Icon size={16} /> {meta.label}</h3>
                  <p>{meta.description}</p>
                  <div className="op-board-health">
                    <div className="op-board-health-headline">{boardHealth.headline}</div>
                    <div className="op-board-health-summary">{boardHealth.summary}</div>
                    <div className="op-board-health-chips">
                      {boardHealth.metrics.map((metric) => (
                        <button
                          key={`${type}_${metric.key}`}
                          type="button"
                          className={`timeline-chip muted board-health-chip ${metricToneClass(metric.tone)} ${activeMetric?.key === metric.key ? 'active' : ''}`}
                          onClick={() => toggleBoardFilter(type, metric.key, metric.value)}
                          disabled={metric.key === 'cards' || metric.value === 0}
                        >
                          {metric.label} {metric.value}
                        </button>
                      ))}
                    </div>
                    {activeMetric && (
                      <div className="op-board-filter-bar">
                        <span className="timeline-chip board-health-chip active">
                          筛选中: {activeMetric.label} {activeMetric.value}
                        </span>
                        <span className="timeline-chip muted">{boardSortSummary(activeMetric.key, boardLiveSignal)}</span>
                        <button
                          type="button"
                          className="secondary-btn tiny"
                          onClick={() => setActiveBoardFilters((current) => ({ ...current, [type]: null }))}
                        >
                          清除
                        </button>
                      </div>
                    )}
                  </div>
                  {boardLiveSignal && (
                    <div className={`op-board-live ${boardLiveSignal.state}`}>
                      <div className="op-board-live-top">
                        <span className="live-dot-small" />
                        <span className="op-board-live-label">{boardLiveSignal.label}</span>
                        <span className="op-board-live-target">{boardLiveSignal.targetTitle}</span>
                        <span className={`live-state-chip ${boardLiveSignal.state}`}>{boardLiveSignal.stateLabel}</span>
                        <span className="op-board-live-age">{boardLiveSignal.ageLabel}</span>
                      </div>
                      <div className="op-board-live-detail">{boardLiveSignal.detail}</div>
                      <div className="op-board-live-note">{boardLiveSignal.stateSummary}</div>
                    </div>
                  )}
                </div>
                <div className="op-board-actions">
                  <span className="header-count">
                    {activeMetric ? `${boardPriorityView.items.length}/${items.length} cards` : `${items.length} cards`}
                  </span>
                  {type === 'ipo_spinout' && (
                    <button type="button" className="secondary-btn" onClick={() => void runRadarRefresh()} disabled={automationAction !== null}>
                      {automationAction === 'radar' ? '刷新中...' : '刷新 EDGAR Radar'}
                    </button>
                  )}
                </div>
              </div>
              <div className="op-board-list">
                {items.length === 0 ? (
                  <div className="today-empty">这个板块还没有机会卡</div>
                ) : boardPriorityView.items.length === 0 ? (
                  <div className="today-empty">当前筛选下没有机会卡</div>
                ) : (
                  boardPriorityView.items.map((opportunity, index) => {
                    const priorityReason = activeMetric ? buildBoardPriorityReason(opportunity, activeMetric.key, index) : null;
                    const primaryAction = buildBoardPrimaryAction(opportunity, activeMetric?.key);
                    const livePriorityEvent = boardPriorityView.recentEvents.get(opportunity.id);
                    const liveRankBadge = buildLiveRankBadge(livePriorityEvent, index, liveNow);
                    const extraTemplates = buildExtraTemplates(opportunity, primaryAction.template?.id, 2);
                    return (
                    <article
                      key={opportunity.id}
                      className={`op-card ${liveRankBadge ? 'live-ranked' : ''} ${liveRankBadge?.state || ''}`}
                    >
                      <div className="op-card-top">
                        <span className={`consensus-badge ${statusTone(opportunity.status)}`}>
                          {opportunity.stage} / {opportunity.status}
                        </span>
                        <div className="today-card-rank">
                          {liveRankBadge && (
                            <span className={`live-rank-badge ${liveRankBadge.state}`} title={liveRankBadge.detail}>
                              {liveRankBadge.label}
                            </span>
                          )}
                          <span className="today-run">{scoreLabel(opportunity)}</span>
                        </div>
                      </div>
                      <h4>{opportunity.title}</h4>
                      {livePriorityEvent && (
                        <div className="today-live-priority">
                          <div className="today-live-priority-top">
                            <span className="live-dot-small" />
                            <span className="today-live-priority-label">{liveSignalLabel(livePriorityEvent)}</span>
                            <span className="today-live-priority-age">{formatLiveAge(livePriorityEvent.timestamp, liveNow)}</span>
                          </div>
                          <div className="today-live-priority-detail">{livePriorityEvent.message}</div>
                        </div>
                      )}
                      {priorityReason && (
                        <div className="today-diff">
                          <span className={`diff-chip ${priorityReason.tone}`}>{priorityReason.label}</span>
                          <span className="today-diff-summary">{priorityReason.detail}</span>
                        </div>
                      )}
                      {opportunity.whyNowSummary && (
                        <div className="today-diff">
                          <span className="diff-chip stable">WHY NOW</span>
                          <span className="today-diff-summary">{opportunity.whyNowSummary}</span>
                        </div>
                      )}
                      <p className="op-card-thesis">{opportunity.thesis || opportunity.summary || '等待补充 thesis'}</p>
                      {opportunity.playbook && (
                        <>
                          <div className="today-diff">
                            <span className={`diff-chip ${opportunity.playbook.stance === 'review' ? 'changed' : 'stable'}`}>
                              {playbookStanceLabel(opportunity.playbook.stance)}
                            </span>
                            <span className="today-diff-summary">{opportunity.playbook.objective}</span>
                          </div>
                          <div className="op-card-detail">
                            {opportunity.playbook.checklist.slice(0, 3).map((item) => (
                              <div key={`${opportunity.id}_${item.label}`}>
                                <ArrowRight size={12} /> [{item.status}] {item.label}{item.note ? ` · ${item.note}` : ''}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {opportunity.suggestedMission && (
                        <div className="op-card-detail">
                          <div><ArrowRight size={12} /> Suggested mission: {opportunity.suggestedMission.mode} / {opportunity.suggestedMission.depth} / {opportunity.suggestedMission.query}</div>
                          <div><Sparkles size={12} /> {opportunity.suggestedMission.rationale}</div>
                        </div>
                      )}
                      {(opportunity.suggestedMissions || []).length > 0 && (
                        <div className="op-card-detail">
                          {(opportunity.suggestedMissions || []).slice(0, 3).map((template) => (
                            <div key={`${opportunity.id}_${template.id}`}>
                              <ArrowRight size={12} /> {template.label}: {template.mode} / {template.depth} / {template.query}
                              {template.whenToUse ? ` · ${template.whenToUse}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      {opportunity.latestOpportunityDiff && (
                        <div className="today-diff">
                          <span className={`diff-chip ${opportunity.latestOpportunityDiff.changed ? 'changed' : 'stable'}`}>
                            {opportunity.latestOpportunityDiff.changed ? `THESIS ${opportunity.latestOpportunityDiff.changeCount}` : 'THESIS STABLE'}
                          </span>
                          <span className="today-diff-summary">{opportunity.latestOpportunityDiff.summary}</span>
                        </div>
                      )}
                      <div className="today-meta">
                        {opportunity.primaryTicker && <span>Primary {opportunity.primaryTicker}</span>}
                        {opportunity.leaderTicker && <span>Leader {opportunity.leaderTicker}</span>}
                        {opportunity.proxyTicker && <span>Proxy {opportunity.proxyTicker}</span>}
                      </div>
                      {opportunity.type === 'relay_chain' && opportunity.heatProfile && (
                        <>
                          <div className="today-meta">
                            {opportunity.heatProfile.validationStatus && <span>{opportunity.heatProfile.validationStatus}</span>}
                            {typeof opportunity.heatProfile.breadthScore === 'number' && <span>Breadth {opportunity.heatProfile.breadthScore}</span>}
                            {typeof opportunity.heatProfile.edgeCount === 'number' && <span>Edges {opportunity.heatProfile.edgeCount}</span>}
                          </div>
                          <div className="relay-lane compact">
                            <div className="relay-lane-block">
                              <span className="relay-label">Leader</span>
                              <div className="tc-tickers">
                                {(opportunity.leaderTicker || opportunity.primaryTicker)
                                  ? <span className="ticker-pill">${opportunity.leaderTicker || opportunity.primaryTicker}</span>
                                  : <span className="ticker-more">待补</span>}
                              </div>
                            </div>
                            <div className="relay-arrow">→</div>
                            <div className="relay-lane-block">
                              <span className="relay-label">Bottleneck</span>
                              <div className="tc-tickers">
                                {opportunity.heatProfile.bottleneckTickers.length > 0 ? opportunity.heatProfile.bottleneckTickers.slice(0, 3).map((ticker) => (
                                  <span key={ticker} className="ticker-pill">${ticker}</span>
                                )) : <span className="ticker-more">待补</span>}
                              </div>
                            </div>
                            <div className="relay-arrow">→</div>
                            <div className="relay-lane-block">
                              <span className="relay-label">Laggard</span>
                              <div className="tc-tickers">
                                {opportunity.heatProfile.laggardTickers.length > 0 ? opportunity.heatProfile.laggardTickers.slice(0, 3).map((ticker) => (
                                  <span key={ticker} className="ticker-pill">${ticker}</span>
                                )) : <span className="ticker-more">待补</span>}
                              </div>
                            </div>
                          </div>
                          {opportunity.heatProfile.validationSummary && (
                            <div className="op-card-detail">
                              <div><Flame size={12} /> {opportunity.heatProfile.validationSummary}</div>
                            </div>
                          )}
                          {opportunity.heatInflection && (
                            <div className="today-diff">
                              <span className={`diff-chip ${opportunity.heatInflection.kind === 'breakdown' || opportunity.heatInflection.kind === 'weakening' ? 'changed' : 'stable'}`}>
                                {heatInflectionLabel(opportunity.heatInflection.kind)}
                              </span>
                              <span className="today-diff-summary">{opportunity.heatInflection.summary}</span>
                            </div>
                          )}
                          {opportunity.heatProfile.leaderHealth && (
                            <div className="op-card-detail">
                              <div><Cable size={12} /> {opportunity.heatProfile.leaderHealth}</div>
                            </div>
                          )}
                          {(opportunity.heatProfile.edges || []).length > 0 && (
                            <div className="op-card-detail">
                              {(opportunity.heatProfile.edges || []).slice(0, 2).map((edge) => (
                                <div key={edge.id}><ArrowRight size={12} /> {edge.from} → {edge.to}: {edge.reason}</div>
                              ))}
                            </div>
                          )}
                          {(opportunity.recentHeatHistory || []).length > 1 && (
                            <div className="op-card-detail">
                              {(opportunity.recentHeatHistory || []).slice(-4).map((point) => (
                                <div key={point.snapshotId}>
                                  <Layers3 size={12} />
                                  {new Date(point.createdAt).toLocaleDateString()} · {point.validationStatus || point.temperature || 'n/a'} · Relay {point.relayScore}
                                  {typeof point.breadthScore === 'number' ? ` · Breadth ${point.breadthScore}` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {opportunity.type === 'proxy_narrative' && opportunity.proxyProfile && (
                        <div className="proxy-score-grid">
                          <div className="proxy-score"><span>Purity</span><strong>{opportunity.scores.purityScore}</strong></div>
                          <div className="proxy-score"><span>Scarcity</span><strong>{opportunity.scores.scarcityScore}</strong></div>
                          <div className="proxy-score"><span>Legitimacy</span><strong>{opportunity.proxyProfile.legitimacyScore}</strong></div>
                          <div className="proxy-score"><span>Legibility</span><strong>{opportunity.proxyProfile.legibilityScore}</strong></div>
                          <div className="proxy-score"><span>Tradeability</span><strong>{opportunity.proxyProfile.tradeabilityScore}</strong></div>
                        </div>
                      )}
                      {opportunity.catalystCalendar.length > 0 && (
                        <div className="op-catalyst-list">
                          {opportunity.catalystCalendar.slice(0, 2).map((item) => (
                            <div key={`${item.label}_${item.dueAt || item.status}`} className="op-catalyst-item">
                              <span className={`diff-chip ${item.status === 'upcoming' ? 'changed' : 'stable'}`}>{item.status}</span>
                              <span className="today-diff-summary">
                                {item.label}{item.dueAt ? ` · ${item.dueAt}` : ''}{item.source ? ` · ${item.source}` : ''}
                              </span>
                              {catalystConfidenceLabel(item.confidence) && (
                                <span className="today-run">{catalystConfidenceLabel(item.confidence)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {opportunity.type === 'ipo_spinout' && opportunity.ipoProfile && (
                        <div className="op-card-detail">
                          {opportunity.ipoProfile.officialTradingDate && (
                            <div>
                              <CalendarClock size={12} /> Trading {opportunity.ipoProfile.officialTradingDate}
                              {opportunity.ipoProfile.evidence?.officialTradingDate ? ` · ${opportunity.ipoProfile.evidence.officialTradingDate.source} · ${opportunity.ipoProfile.evidence.officialTradingDate.confidence}` : ''}
                            </div>
                          )}
                          {opportunity.ipoProfile.spinoutDate && (
                            <div>
                              <Layers3 size={12} /> Spinout {opportunity.ipoProfile.spinoutDate}
                              {opportunity.ipoProfile.evidence?.spinoutDate ? ` · ${opportunity.ipoProfile.evidence.spinoutDate.source} · ${opportunity.ipoProfile.evidence.spinoutDate.confidence}` : ''}
                            </div>
                          )}
                          {typeof opportunity.ipoProfile.retainedStakePercent === 'number' && (
                            <div>
                              <Sparkles size={12} /> Retained stake {opportunity.ipoProfile.retainedStakePercent}%
                              {opportunity.ipoProfile.evidence?.retainedStakePercent ? ` · ${opportunity.ipoProfile.evidence.retainedStakePercent.source} · ${opportunity.ipoProfile.evidence.retainedStakePercent.confidence}` : ''}
                            </div>
                          )}
                          {opportunity.ipoProfile.lockupDate && (
                            <div>
                              <Compass size={12} /> Lockup {opportunity.ipoProfile.lockupDate}
                              {opportunity.ipoProfile.evidence?.lockupDate ? ` · ${opportunity.ipoProfile.evidence.lockupDate.source} · ${opportunity.ipoProfile.evidence.lockupDate.confidence}` : ''}
                            </div>
                          )}
                          {!opportunity.ipoProfile.officialTradingDate && opportunity.ipoProfile.evidence?.officialTradingDate && (
                            <div><CalendarClock size={12} /> Trading date pending · {opportunity.ipoProfile.evidence.officialTradingDate.source} · {opportunity.ipoProfile.evidence.officialTradingDate.confidence}</div>
                          )}
                        </div>
                      )}
                      {(opportunity.relatedTickers.length > 0 || opportunity.relayTickers.length > 0) && (
                        <div className="op-ticker-block">
                          {opportunity.relatedTickers.length > 0 && (
                            <div className="tc-tickers">
                              {opportunity.relatedTickers.slice(0, 4).map((ticker) => (
                                <span key={ticker} className="ticker-pill">${ticker}</span>
                              ))}
                            </div>
                          )}
                          {opportunity.relayTickers.length > 0 && (
                            <div className="tc-tickers">
                              {opportunity.relayTickers.slice(0, 4).map((ticker) => (
                                <span key={ticker} className="ticker-pill">${ticker}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(opportunity.nextCatalystAt || opportunity.policyStatus || opportunity.supplyOverhang) && (
                        <div className="op-card-detail">
                          {opportunity.nextCatalystAt && <div><CalendarClock size={12} /> {opportunity.nextCatalystAt}</div>}
                          {(opportunity.proxyProfile?.ruleStatus || opportunity.policyStatus) && <div><Sparkles size={12} /> {opportunity.proxyProfile?.ruleStatus || opportunity.policyStatus}</div>}
                          {opportunity.supplyOverhang && <div><Layers3 size={12} /> {opportunity.supplyOverhang}</div>}
                        </div>
                      )}
                      {opportunity.latestMission && (
                        <div className="op-card-mission">
                          <div className="stream-time">
                            Latest mission: {opportunity.latestMission.status} · {new Date(opportunity.latestMission.updatedAt).toLocaleString()}
                          </div>
                          {opportunity.latestDiff && (
                            <div className="today-diff">
                              <span className={`diff-chip ${opportunity.latestDiff.changed ? 'changed' : 'stable'}`}>
                                {opportunity.latestDiff.changed ? `CHANGED ${opportunity.latestDiff.changeCount}` : 'STABLE'}
                              </span>
                              <span className="today-diff-summary">{opportunity.latestDiff.summary}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {(opportunity.recentActionTimeline || []).length > 0 && (
                        <div className="op-timeline-list">
                          {(opportunity.recentActionTimeline || []).slice(0, 3).map((entry) => (
                            <div key={entry.id} className="op-timeline-entry">
                              <div className="op-timeline-top">
                                <div className="op-timeline-chips">
                                  <span className={`diff-chip ${timelineDecisionTone(entry.decision)}`}>
                                    {timelineDecisionLabel(entry.decision)}
                                  </span>
                                  <span className="timeline-chip">{timelineDriverLabel(entry.driver)}</span>
                                  <span className="timeline-chip muted">{timelineSourceLabel(entry.source)}</span>
                                </div>
                                <span className="stream-time">{new Date(entry.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="op-timeline-label">{entry.label}</div>
                              <div className="op-timeline-detail">{entry.detail}</div>
                              {entry.reasonSummary && (
                                <div className="op-timeline-reason">
                                  <Sparkles size={12} />
                                  {entry.reasonSummary}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {opportunity.playbook && (
                        <div className="op-card-detail">
                          <div><ArrowRight size={12} /> {opportunity.playbook.nextStep}</div>
                        </div>
                      )}
                      <div className="op-card-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => void launchOpportunityAnalysis(opportunity, primaryAction.template || undefined)}
                        >
                          {primaryAction.label}
                        </button>
                        {extraTemplates.map((template) => (
                          <button
                            key={`${opportunity.id}_action_${template.id}`}
                            type="button"
                            className="secondary-btn"
                            onClick={() => void launchOpportunityAnalysis(opportunity, template)}
                          >
                            {template.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => opportunity.latestMission ? navigate(`/missions/${opportunity.latestMission.id}`) : navigate('/command-center')}
                        >
                          {opportunity.latestMission ? '查看任务' : '去控制台'}
                        </button>
                      </div>
                    </article>
                  );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
