import type {
  OpportunityCatalystItem,
  OpportunityInboxItem,
  OpportunityInboxReason,
  OpportunityActionTimelineEntry,
  OpportunitySummaryRecord,
} from './types';

function parseDate(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function daysUntil(value?: string, now = Date.now()): number | null {
  const timestamp = parseDate(value);
  if (timestamp === null) return null;
  return Math.round((startOfDay(timestamp) - startOfDay(now)) / (24 * 60 * 60 * 1000));
}

function findUpcomingCatalyst(opportunity: OpportunitySummaryRecord, now = Date.now()): OpportunityCatalystItem | null {
  const datedItems = opportunity.catalystCalendar
    .filter((item) => item.status === 'upcoming' && item.dueAt)
    .map((item) => ({
      item,
      dueAt: parseDate(item.dueAt),
    }))
    .filter((item): item is { item: OpportunityCatalystItem; dueAt: number } => item.dueAt !== null)
    .sort((a, b) => a.dueAt - b.dueAt);

  const next = datedItems.find(({ dueAt }) => dueAt >= startOfDay(now));
  return next?.item || null;
}

function buildCatalystReason(opportunity: OpportunitySummaryRecord, now = Date.now()): OpportunityInboxReason | null {
  const catalyst = findUpcomingCatalyst(opportunity, now);
  if (!catalyst) return null;
  const delta = daysUntil(catalyst.dueAt, now);
  if (delta === null || delta < 0) return null;
  const confidenceBoost = catalyst.confidence === 'confirmed'
    ? 4
    : catalyst.confidence === 'inferred'
      ? 0
      : -8;
  if (delta <= 7) {
    return {
      code: 'catalyst_due',
      label: '催化临近',
      detail: `${catalyst.label} · ${catalyst.dueAt}${catalyst.source ? ` · ${catalyst.source}` : ''}`,
      priority: 94 - delta + confidenceBoost,
    };
  }
  if (delta <= 21) {
    return {
      code: 'catalyst_due',
      label: '催化排队中',
      detail: `${catalyst.label} · ${catalyst.dueAt}${catalyst.source ? ` · ${catalyst.source}` : ''}`,
      priority: 68 - Math.min(10, delta) + Math.round(confidenceBoost / 2),
    };
  }
  return null;
}

function buildNewCodeReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  if (opportunity.type !== 'ipo_spinout') return null;
  const hasTradingWindow = opportunity.catalystCalendar.some((item) => item.label.includes('正式交易窗口确认'));
  if (opportunity.stage === 'ready' || hasTradingWindow) {
    return {
      code: 'new_code_window',
      label: '新代码窗口打开',
      detail: opportunity.policyStatus || 'Pricing / final prospectus has pushed this into the trading window.',
      priority: 88,
    };
  }
  return null;
}

function buildRelayReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  if (opportunity.type !== 'relay_chain') return null;
  const temperature = opportunity.heatProfile?.temperature;
  const validationStatus = opportunity.heatProfile?.validationStatus;
  const breadthScore = opportunity.heatProfile?.breadthScore || 0;
  if (
    (temperature === 'hot' || temperature === 'warming')
    && opportunity.scores.relayScore >= 78
    && validationStatus !== 'broken'
  ) {
    const priorityBase = validationStatus === 'confirmed' ? 92 : temperature === 'hot' ? 88 : 80;
    return {
      code: 'relay_ready',
      label: '传导链可操作',
      detail: opportunity.heatProfile?.validationSummary || opportunity.heatProfile?.leaderHealth || opportunity.summary || 'Leader to bottleneck to laggard chain is actionable.',
      priority: Math.min(98, priorityBase + Math.round(breadthScore / 12)),
    };
  }
  return null;
}

function buildRelayInflectionReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  if (opportunity.type !== 'relay_chain' || !opportunity.heatInflection) return null;

  const kind = opportunity.heatInflection.kind;
  if (!['formation', 'confirmation', 'acceleration', 'rebuild', 'weakening', 'breakdown'].includes(kind)) {
    return null;
  }

  const priority = kind === 'confirmation'
    ? 93
    : kind === 'breakdown'
      ? 95
      : kind === 'weakening'
        ? 86
        : kind === 'rebuild'
          ? 88
          : 82;

  return {
    code: 'relay_inflecting',
    label: kind === 'breakdown' || kind === 'weakening' ? '传导链转弱' : '传导链拐点',
    detail: opportunity.heatInflection.summary,
    priority,
  };
}

function buildProxyReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  if (opportunity.type !== 'proxy_narrative' || !opportunity.proxyProfile) return null;
  const ignited = opportunity.latestEventType === 'proxy_ignited'
    || (
      opportunity.scores.purityScore >= 75
      && opportunity.scores.scarcityScore >= 70
      && opportunity.proxyProfile.legitimacyScore >= 70
    );
  if (!ignited) return null;
  return {
    code: 'proxy_ignited',
    label: '代理变量点火',
    detail: opportunity.proxyProfile.ruleStatus || opportunity.proxyProfile.mappingTarget || opportunity.summary,
    priority: 82,
  };
}

function primaryActionEntry(opportunity: OpportunitySummaryRecord): OpportunityActionTimelineEntry | null {
  return (opportunity.recentActionTimeline || []).find((entry) => entry.decision !== 'monitor') || null;
}

function recencyBoost(timestamp?: string, now = Date.now()): number {
  const parsed = parseDate(timestamp);
  if (parsed === null) return 0;
  const ageMs = Math.max(0, now - parsed);
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours <= 24) return 6;
  if (ageHours <= 72) return 4;
  if (ageHours <= 7 * 24) return 2;
  return 0;
}

function actionPriority(entry: OpportunityActionTimelineEntry, now = Date.now()): number {
  const decisionBase = entry.decision === 'degrade'
    ? 96
    : entry.decision === 'review'
      ? 92
      : entry.decision === 'upgrade'
        ? 90
        : entry.decision === 'act'
          ? 84
          : 0;
  const driverBoost = entry.driver === 'heat'
    ? 5
    : entry.driver === 'calendar'
      ? 4
      : entry.driver === 'rule'
        ? 3
        : entry.driver === 'execution'
          ? 2
          : 0;
  return decisionBase + driverBoost + recencyBoost(entry.timestamp, now);
}

function buildActionReason(opportunity: OpportunitySummaryRecord, now = Date.now()): OpportunityInboxReason | null {
  const action = primaryActionEntry(opportunity);
  if (!action) return null;

  const isReview = action.decision === 'degrade' || action.decision === 'review';
  if (!['upgrade', 'degrade', 'act', 'review'].includes(action.decision)) {
    return null;
  }

  return {
    code: isReview ? 'review_signal' : 'action_signal',
    label: isReview ? '复核动作触发' : '行动信号触发',
    detail: [
      action.label,
      action.reasonSummary || action.detail,
    ].filter(Boolean).join(' · '),
    priority: actionPriority(action, now),
  };
}

function buildDiffReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  if (opportunity.latestOpportunityDiff?.changed) {
    return {
      code: 'thesis_changed',
      label: 'Thesis 已变化',
      detail: opportunity.latestOpportunityDiff.summary,
      priority: 72 + Math.min(10, opportunity.latestOpportunityDiff.changeCount * 2),
    };
  }
  if (opportunity.latestDiff?.changed) {
    return {
      code: 'mission_changed',
      label: '分析结果有变化',
      detail: opportunity.latestDiff.summary,
      priority: 60 + Math.min(8, opportunity.latestDiff.changeCount * 2),
    };
  }
  return null;
}

function buildDegradedReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  const degraded = opportunity.status === 'degraded'
    || opportunity.latestEventType === 'leader_broken'
    || opportunity.latestEventType === 'mission_failed'
    || opportunity.heatProfile?.validationStatus === 'broken'
    || opportunity.heatInflection?.kind === 'breakdown';
  if (!degraded) return null;
  return {
    code: 'degraded',
    label: '需要复核',
    detail: opportunity.latestEventMessage || opportunity.summary || 'Opportunity degraded and needs review.',
    priority: 96,
  };
}

function buildAnalysisMissingReason(opportunity: OpportunitySummaryRecord): OpportunityInboxReason | null {
  if (opportunity.latestMission) return null;
  return {
    code: 'analysis_missing',
    label: '还没跑分析',
    detail: 'This opportunity has no linked mission yet.',
    priority: 58,
  };
}

function buildActionDescriptor(opportunity: OpportunitySummaryRecord): Pick<
  OpportunityInboxItem,
  'actionLabel' | 'actionDetail' | 'actionDecision' | 'actionDriver' | 'actionTimestamp'
> {
  const action = primaryActionEntry(opportunity);
  if (!action) return {};
  return {
    actionLabel: action.label,
    actionDetail: action.reasonSummary || action.detail,
    actionDecision: action.decision,
    actionDriver: action.driver,
    actionTimestamp: action.timestamp,
  };
}

function dedupeReasons(reasons: OpportunityInboxReason[]): OpportunityInboxReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    if (seen.has(reason.code)) return false;
    seen.add(reason.code);
    return true;
  });
}

function summarizeReasons(reasons: OpportunityInboxReason[]): string {
  return reasons
    .slice(0, 2)
    .map((reason) => reason.detail ? `${reason.label}: ${reason.detail}` : reason.label)
    .join(' · ');
}

function recommendedActionForReasons(reasons: OpportunityInboxReason[]): OpportunityInboxItem['recommendedAction'] {
  if (reasons.some((reason) => ['degraded', 'review_signal', 'thesis_changed', 'mission_changed'].includes(reason.code))) {
    return 'review';
  }
  if (reasons.some((reason) => ['relay_inflecting'].includes(reason.code) && reason.label.includes('转弱'))) {
    return 'review';
  }
  if (reasons.some((reason) => ['action_signal', 'analysis_missing', 'catalyst_due', 'new_code_window', 'relay_ready', 'relay_inflecting', 'proxy_ignited'].includes(reason.code))) {
    return 'analyze';
  }
  return 'monitor';
}

function computeInboxScore(reasons: OpportunityInboxReason[]): number {
  const sorted = [...reasons].sort((a, b) => b.priority - a.priority);
  const [first, second, third] = sorted;
  return Math.round(
    (first?.priority || 0)
    + (second?.priority || 0) * 0.35
    + (third?.priority || 0) * 0.15,
  );
}

export function buildOpportunityInbox(
  opportunities: OpportunitySummaryRecord[],
  limit = 12,
  now = Date.now(),
): OpportunityInboxItem[] {
  return opportunities
    .map((opportunity) => {
      const reasons = dedupeReasons([
        buildActionReason(opportunity, now),
        buildDegradedReason(opportunity),
        buildCatalystReason(opportunity, now),
        buildNewCodeReason(opportunity),
        buildRelayReason(opportunity),
        buildRelayInflectionReason(opportunity),
        buildProxyReason(opportunity),
        buildDiffReason(opportunity),
        buildAnalysisMissingReason(opportunity),
      ].filter((reason): reason is OpportunityInboxReason => Boolean(reason)));

      const fallbackReasons = reasons.length > 0 ? reasons : [{
        code: 'watch',
        label: '继续观察',
        detail: opportunity.summary || opportunity.thesis || 'No urgent action detected.',
        priority: 24,
      } satisfies OpportunityInboxReason];

      const sortedReasons = fallbackReasons.sort((a, b) => b.priority - a.priority);
      const inboxScore = computeInboxScore(sortedReasons);

      return {
        ...opportunity,
        inboxScore,
        inboxSummary: summarizeReasons(sortedReasons),
        recommendedAction: recommendedActionForReasons(sortedReasons),
        inboxReasons: sortedReasons,
        ...buildActionDescriptor(opportunity),
      } satisfies OpportunityInboxItem;
    })
    .sort((a, b) => {
      if (b.inboxScore !== a.inboxScore) return b.inboxScore - a.inboxScore;
      if ((a.actionTimestamp || '') !== (b.actionTimestamp || '')) {
        return (b.actionTimestamp || '').localeCompare(a.actionTimestamp || '');
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, limit);
}
