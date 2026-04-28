import { Cable, Compass, Flame, Layers3 } from 'lucide-react';
import type {
  CreateOpportunityInput,
  OpportunityBoardType,
  OpportunityInboxItem,
  OpportunitySuggestedMission,
  OpportunitySummary,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';

export type DraftState = CreateOpportunityInput & {
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

export const DRAFT_STORAGE_KEY = 'opportunity-workbench-draft-v1';
export const BOARD_TYPES = ['ipo_spinout', 'relay_chain', 'proxy_narrative'] as const;
export const BOARD_FILTER_QUERY_KEYS: Record<OpportunityBoardType, string> = {
  ipo_spinout: 'ipoMetric',
  relay_chain: 'relayMetric',
  proxy_narrative: 'proxyMetric',
};

export function createDraftState(
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

export function readStoredDraft() {
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

export function sameBoardFilters(a: BoardFilterState, b: BoardFilterState) {
  return BOARD_TYPES.every((type) => (a[type] || null) === (b[type] || null));
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

export function typeMeta(type: OpportunitySummary['type']) {
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

export function statusTone(status: OpportunitySummary['status']) {
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

export function scoreLabel(opportunity: OpportunitySummary) {
  if (opportunity.type === 'ipo_spinout') return `Catalyst ${opportunity.scores.catalystScore}`;
  if (opportunity.type === 'relay_chain') return `Relay ${opportunity.scores.relayScore}`;
  if (opportunity.type === 'proxy_narrative') return `Purity ${opportunity.scores.purityScore}`;
  return `Trade ${opportunity.scores.tradeabilityScore}`;
}

export function catalystConfidenceLabel(confidence?: 'confirmed' | 'inferred' | 'placeholder') {
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

export function heatInflectionLabel(kind?: 'formation' | 'confirmation' | 'acceleration' | 'weakening' | 'breakdown' | 'rebuild') {
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

export function playbookStanceLabel(stance?: 'prepare' | 'act' | 'review') {
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

export function timelineDecisionLabel(decision?: 'upgrade' | 'degrade' | 'act' | 'review' | 'monitor') {
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

export function timelineDriverLabel(driver?: 'heat' | 'rule' | 'calendar' | 'execution' | 'manual' | 'system') {
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

export function driverSummaryLabel(driver?: 'heat' | 'rule' | 'calendar' | 'execution' | 'manual' | 'system') {
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

export function typeSummaryLabel(type?: OpportunitySummary['type']) {
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

export function timelineSourceLabel(source?: 'manual' | 'automation' | 'system') {
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

export function timelineDecisionTone(decision?: 'upgrade' | 'degrade' | 'act' | 'review' | 'monitor') {
  return decision === 'degrade' || decision === 'review' ? 'changed' : 'stable';
}

export type InboxLane = 'act' | 'review' | 'monitor';
export type LaneLiveSignal = {
  label: string;
  detail: string;
  ageLabel: string;
  state: 'fresh' | 'recent';
  stateLabel: 'LIVE' | 'RECENT';
  stateSummary: string;
  lane: InboxLane | null;
};
export type BoardLiveSignal = LaneLiveSignal & {
  targetTitle: string;
};
export type BoardFilterState = Partial<Record<OpportunityBoardType, string | null>>;
export type BoardPriorityMode = 'act' | 'review' | 'monitor';
export type OpportunityPrimaryAction = {
  label: string;
  template: OpportunitySuggestedMission | null;
  target: 'mission' | 'analysis';
};
export type LaneActionPreview = {
  opportunity: OpportunitySummary;
  action: OpportunityPrimaryAction;
  copy: string;
  targetTitle: string;
  ageLabel: string;
  fresh: boolean;
};
export type LanePriorityView = {
  items: OpportunityInboxItem[];
  recentEvents: Map<string, OpportunityStreamEvent>;
};
export type BoardPriorityView = {
  items: OpportunitySummary[];
  recentEvents: Map<string, OpportunityStreamEvent>;
};
export type LiveRankBadge = {
  label: string;
  detail: string;
  state: 'fresh' | 'recent';
};
export type WorkbenchPulse = {
  label: 'LIVE' | 'RECENT' | 'STEADY';
  summary: string;
  chips: string[];
  targetLane?: InboxLane | null | undefined;
  actionLabel?: string | null | undefined;
};
