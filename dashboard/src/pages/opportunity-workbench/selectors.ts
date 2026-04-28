import type {
  CreateOpportunityInput,
  OpportunityBoardHealthSummary,
  OpportunityBoardType,
  OpportunityInboxItem,
  OpportunitySummary,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import {
  driverSummaryLabel,
  typeSummaryLabel,
  type BoardPriorityMode,
  type DraftState,
  type InboxLane,
  type LaneActionPreview,
  type OpportunityPrimaryAction,
} from './model';
import { formatLiveAge, laneForInboxItem, laneForStreamEvent, liveSignalLabel } from './live';

export function fallbackBoardHealthSummary(
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

export function metricToneClass(tone: 'neutral' | 'positive' | 'warning' | 'negative') {
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

export function filterBoardItems(
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

export function boardSortSummary(
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

export function sortBoardItems(
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

export function buildBoardPriorityReason(
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

export function buildBoardPrimaryAction(
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

export function buildInboxPrimaryAction(item: OpportunityInboxItem): OpportunityPrimaryAction {
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

export function buildLaneActionPreview(
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

export function buildLaneInsight(
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

export function parseTickers(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildIpoProfile(draft: DraftState): CreateOpportunityInput['ipoProfile'] | undefined {
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

export function buildMissionInput(opportunity: OpportunitySummary | DraftState) {
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
