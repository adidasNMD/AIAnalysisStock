import type { MissionEventRecord } from './mission-events';
import type {
  OpportunityActionTimelineEntry,
  OpportunityEventRecord,
  OpportunitySummaryRecord,
  OpportunitySuggestedMission,
} from './types';

function uniqueTickers(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toUpperCase())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export function buildOpportunitySuggestedMission(
  opportunity: OpportunitySummaryRecord,
): OpportunitySuggestedMission {
  const templates = buildOpportunitySuggestedMissions(opportunity);
  const findTemplate = (...ids: string[]) => templates.find((template) => ids.includes(template.id));

  const shouldReview = opportunity.status === 'degraded'
    || opportunity.latestMission?.status === 'failed'
    || opportunity.latestMission?.status === 'canceled';
  if (shouldReview) {
    return findTemplate('relay_chain_review', 'proxy_review', 'radar_review') || templates[0]!;
  }

  const isHeatReady = opportunity.type === 'relay_chain' && (
    opportunity.status === 'ready'
    || opportunity.status === 'active'
    || opportunity.stage === 'ready'
    || opportunity.heatInflection?.kind === 'confirmation'
    || opportunity.heatInflection?.kind === 'acceleration'
    || opportunity.heatProfile?.validationStatus === 'confirmed'
  );
  if (isHeatReady) {
    return findTemplate('relay_chain_deep') || templates[0]!;
  }

  const isRadarReady = opportunity.type === 'ipo_spinout' && (
    opportunity.status === 'ready'
    || opportunity.stage === 'ready'
    || opportunity.catalystCalendar.some((item) => item.status === 'upcoming' && item.confidence === 'confirmed')
  );
  if (isRadarReady) {
    return findTemplate('radar_deep_validation') || templates[0]!;
  }

  const isProxyReady = opportunity.type === 'proxy_narrative' && (
    opportunity.status === 'ready'
    || opportunity.status === 'active'
    || (opportunity.proxyProfile?.legitimacyScore || 0) >= 70
  );
  if (isProxyReady) {
    return findTemplate('proxy_deep') || templates[0]!;
  }

  return templates[0]!;
}

function missionTemplate(
  id: string,
  label: string,
  payload: Omit<OpportunitySuggestedMission, 'id' | 'label'>,
): OpportunitySuggestedMission {
  return {
    id,
    label,
    ...payload,
  };
}

export function buildOpportunitySuggestedMissions(
  opportunity: OpportunitySummaryRecord,
): OpportunitySuggestedMission[] {
  if (opportunity.type === 'ipo_spinout') {
    const primary = opportunity.primaryTicker;
    const query = primary || opportunity.query;
    return [
      missionTemplate('radar_overview', 'Radar Overview', {
        mode: primary ? 'analyze' : 'explore',
        query,
        ...(primary ? { tickers: [primary] } : {}),
        depth: 'standard',
        source: 'opportunity_template:radar_overview',
        whenToUse: '先把交易窗口、供给和独立验证日历梳理清楚。',
        rationale: primary
          ? '围绕新代码本体先做一轮标准分析，确认交易窗口和供给结构。'
          : '先用 explore 梳理新代码的交易窗口、供给 overhang 和独立验证日历。',
      }),
      missionTemplate('radar_deep_validation', 'Deep Validation', {
        mode: primary ? 'analyze' : 'explore',
        query,
        ...(primary ? { tickers: [primary] } : {}),
        depth: 'deep',
        source: 'opportunity_template:radar_deep_validation',
        whenToUse: '交易窗口已近或已 ready，准备确认是否升级成可交易纯标的。',
        rationale: '围绕交易窗口、供给 overhang 和再定义催化做一轮深分析。',
      }),
      missionTemplate('radar_review', 'Review Rerun', {
        mode: 'review',
        query,
        ...(primary ? { tickers: [primary] } : {}),
        depth: 'standard',
        source: 'opportunity_template:radar_review',
        whenToUse: '已有 mission 但日历字段或 thesis 发生变化。',
        rationale: '针对日历、供给和独立验证变化补一轮 review。',
      }),
    ];
  }

  if (opportunity.type === 'relay_chain') {
    const leader = opportunity.leaderTicker || opportunity.primaryTicker;
    const bottlenecks = opportunity.heatProfile?.bottleneckTickers || opportunity.relatedTickers;
    const laggards = opportunity.heatProfile?.laggardTickers || opportunity.relayTickers;
    const tickers = uniqueTickers([
      leader,
      ...bottlenecks.slice(0, 2),
      ...laggards.slice(0, 2),
    ]);
    const query = leader || opportunity.query;
    return [
      missionTemplate('relay_chain_map', 'Chain Map', {
        mode: tickers.length > 0 ? 'analyze' : 'explore',
        query,
        ...(tickers.length > 0 ? { tickers } : {}),
        depth: 'standard',
        source: 'opportunity_template:relay_chain_map',
        whenToUse: '先确认 leader、瓶颈和二三层洼地是否站得住。',
        rationale: '按 leader -> bottleneck -> laggard 一次性验证传导链，而不是只看单个代码。',
      }),
      missionTemplate('relay_chain_deep', 'Deep Relay Check', {
        mode: tickers.length > 0 ? 'analyze' : 'explore',
        query,
        ...(tickers.length > 0 ? { tickers } : {}),
        depth: 'deep',
        source: 'opportunity_template:relay_chain_deep',
        whenToUse: '传导链出现 confirmation / acceleration / ready 时。',
        rationale: '围绕热量链拐点做深分析，确认当前最该表达的是哪一层。',
      }),
      missionTemplate('relay_chain_review', 'Relay Review', {
        mode: 'review',
        query,
        ...(tickers.length > 0 ? { tickers } : {}),
        depth: 'standard',
        source: 'opportunity_template:relay_chain_review',
        whenToUse: 'validation 走弱、leader broken 或 thesis degraded 时。',
        rationale: '针对 leader、breadth 和 validation 破坏点补一轮 review。',
      }),
    ];
  }

  if (opportunity.type === 'proxy_narrative') {
    const proxy = opportunity.proxyTicker || opportunity.primaryTicker;
    const query = proxy || opportunity.query;
    return [
      missionTemplate('proxy_scan', 'Proxy Scan', {
        mode: proxy ? 'analyze' : 'explore',
        query,
        ...(proxy ? { tickers: [proxy] } : {}),
        depth: 'standard',
        source: 'opportunity_template:proxy_scan',
        whenToUse: '先确认规则状态、纯度和可讲性是否站得住。',
        rationale: '确认代理变量的规则状态、纯度、稀缺性和市场是否真的把它当公共符号来买。',
      }),
      missionTemplate('proxy_deep', 'Deep Proxy Check', {
        mode: proxy ? 'analyze' : 'explore',
        query,
        ...(proxy ? { tickers: [proxy] } : {}),
        depth: 'deep',
        source: 'opportunity_template:proxy_deep',
        whenToUse: '代理变量已经点火，准备确认是否值得提高参与强度。',
        rationale: '围绕规则状态、成交扩散和 mission 结果做深分析。',
      }),
      missionTemplate('proxy_review', 'Proxy Review', {
        mode: 'review',
        query,
        ...(proxy ? { tickers: [proxy] } : {}),
        depth: 'standard',
        source: 'opportunity_template:proxy_review',
        whenToUse: '规则状态或流动性发生变化时。',
        rationale: '针对代理变量的规则变化和流动性变化补一轮 review。',
      }),
    ];
  }

  return [
    missionTemplate('opportunity_explore', 'Explore', {
      mode: 'explore',
      query: opportunity.query,
      depth: 'standard',
      source: 'opportunity_template:explore',
      whenToUse: '先把对象结构化，再决定是否进入深分析。',
      rationale: '先把机会对象转换成一轮结构化探索，再决定是否进入深分析。',
    }),
  ];
}

function opportunityEventTone(event: OpportunityEventRecord): OpportunityActionTimelineEntry['tone'] {
  if (['leader_broken', 'mission_failed', 'thesis_degraded'].includes(event.type)) return 'negative';
  if (['thesis_upgraded', 'relay_triggered', 'proxy_ignited'].includes(event.type)) return 'positive';
  if (['catalyst_due', 'signal_changed'].includes(event.type)) return 'warning';
  return 'neutral';
}

function signedDelta(value?: number): string | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) return undefined;
  return value > 0 ? `+${value}` : `${value}`;
}

function stringifyMeta(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
  return undefined;
}

function opportunityEventLabel(event: OpportunityEventRecord): string {
  switch (event.type) {
    case 'created':
      return 'Opportunity created';
    case 'updated':
      return 'Opportunity updated';
    case 'mission_linked':
      return 'Mission linked';
    case 'mission_queued':
      return 'Mission queued';
    case 'mission_completed':
      return 'Mission completed';
    case 'mission_failed':
      return 'Mission failed';
    case 'mission_canceled':
      return 'Mission canceled';
    case 'signal_changed':
      return 'Signal changed';
    case 'thesis_upgraded':
      return 'Thesis upgraded';
    case 'thesis_degraded':
      return 'Thesis degraded';
    case 'leader_broken':
      return 'Leader broken';
    case 'relay_triggered':
      return 'Relay triggered';
    case 'proxy_ignited':
      return 'Proxy ignited';
    case 'catalyst_due':
      return 'Catalyst due';
    default:
      return 'Opportunity updated';
  }
}

function opportunityEventCategory(event: OpportunityEventRecord): OpportunityActionTimelineEntry['category'] {
  if (['catalyst_due'].includes(event.type)) return 'calendar';
  if (['thesis_upgraded', 'thesis_degraded'].includes(event.type)) return 'thesis';
  if (['relay_triggered', 'proxy_ignited', 'signal_changed', 'leader_broken'].includes(event.type)) return 'signal';
  return 'execution';
}

function opportunityEventSource(event: OpportunityEventRecord): OpportunityActionTimelineEntry['source'] {
  if (event.message.toLowerCase().includes('auto-')) return 'automation';
  if (event.type === 'created' || event.type === 'updated') return 'manual';
  return 'system';
}

function opportunityEventDriver(event: OpportunityEventRecord): OpportunityActionTimelineEntry['driver'] {
  if (event.type === 'catalyst_due') return 'calendar';
  if (['mission_linked', 'mission_queued', 'mission_completed', 'mission_failed', 'mission_canceled'].includes(event.type)) {
    return 'execution';
  }
  if (
    ['relay_triggered', 'leader_broken'].includes(event.type)
    || typeof event.meta?.relayDelta === 'number'
    || typeof event.meta?.breadthDelta === 'number'
    || typeof event.meta?.nextValidationStatus === 'string'
  ) {
    return 'heat';
  }
  if (
    event.type === 'proxy_ignited'
    || typeof event.meta?.nextRuleStatus === 'string'
    || typeof event.meta?.ruleStatus === 'string'
  ) {
    return 'rule';
  }
  if (event.type === 'created' || event.type === 'updated') return 'manual';
  return 'system';
}

function opportunityEventDecision(event: OpportunityEventRecord): OpportunityActionTimelineEntry['decision'] {
  switch (event.type) {
    case 'thesis_upgraded':
      return 'upgrade';
    case 'thesis_degraded':
    case 'leader_broken':
      return 'degrade';
    case 'relay_triggered':
    case 'proxy_ignited':
    case 'catalyst_due':
    case 'mission_linked':
    case 'mission_queued':
      return 'act';
    case 'mission_completed':
    case 'mission_failed':
    case 'mission_canceled':
      return 'review';
    default:
      return 'monitor';
  }
}

function opportunityEventReason(event: OpportunityEventRecord): string | undefined {
  switch (event.type) {
    case 'thesis_upgraded':
    case 'thesis_degraded': {
      const previousValidation = stringifyMeta(event.meta?.previousValidationStatus);
      const nextValidation = stringifyMeta(event.meta?.nextValidationStatus);
      const relayDelta = signedDelta(typeof event.meta?.relayDelta === 'number' ? event.meta.relayDelta : undefined);
      const breadthDelta = signedDelta(typeof event.meta?.breadthDelta === 'number' ? event.meta.breadthDelta : undefined);
      const summary = stringifyMeta(event.meta?.validationSummary);
      const parts = [
        summary,
        previousValidation || nextValidation ? `Validation ${previousValidation || 'n/a'} -> ${nextValidation || 'n/a'}` : undefined,
        relayDelta ? `Relay ${relayDelta}` : undefined,
        breadthDelta ? `Breadth ${breadthDelta}` : undefined,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : undefined;
    }
    case 'relay_triggered': {
      const leader = stringifyMeta(event.meta?.leaderTicker);
      const laggards = Array.isArray(event.meta?.laggardTickers)
        ? event.meta?.laggardTickers.filter((value): value is string => typeof value === 'string' && Boolean(value))
        : [];
      const breadthScore = stringifyMeta(event.meta?.breadthScore);
      const status = stringifyMeta(event.meta?.validationStatus);
      const parts = [
        leader ? `Leader ${leader}` : undefined,
        laggards.length > 0 ? `Laggard ${laggards.join(', ')}` : undefined,
        breadthScore ? `Breadth ${breadthScore}` : undefined,
        status ? `Validation ${status}` : undefined,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : undefined;
    }
    case 'leader_broken':
      return stringifyMeta(event.meta?.leaderHealth) || stringifyMeta(event.meta?.validationSummary);
    case 'proxy_ignited': {
      const ruleStatus = stringifyMeta(event.meta?.ruleStatus);
      const mappingTarget = stringifyMeta(event.meta?.mappingTarget);
      const purity = stringifyMeta(event.meta?.purityScore);
      const scarcity = stringifyMeta(event.meta?.scarcityScore);
      const parts = [
        mappingTarget ? `Target ${mappingTarget}` : undefined,
        ruleStatus ? `Rule ${ruleStatus}` : undefined,
        purity ? `Purity ${purity}` : undefined,
        scarcity ? `Scarcity ${scarcity}` : undefined,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : undefined;
    }
    case 'signal_changed': {
      const previousRuleStatus = stringifyMeta(event.meta?.previousRuleStatus);
      const nextRuleStatus = stringifyMeta(event.meta?.nextRuleStatus);
      const previousValidation = stringifyMeta(event.meta?.previousValidationStatus);
      const nextValidation = stringifyMeta(event.meta?.nextValidationStatus);
      const previousTemperature = stringifyMeta(event.meta?.previousTemperature);
      const nextTemperature = stringifyMeta(event.meta?.nextTemperature);
      return (
        (previousRuleStatus || nextRuleStatus)
          ? `Rule ${previousRuleStatus || 'n/a'} -> ${nextRuleStatus || 'n/a'}`
          : (previousValidation || nextValidation)
            ? `Validation ${previousValidation || 'n/a'} -> ${nextValidation || 'n/a'}`
            : (previousTemperature || nextTemperature)
              ? `Heat ${previousTemperature || 'n/a'} -> ${nextTemperature || 'n/a'}`
              : undefined
      );
    }
    case 'catalyst_due':
      return stringifyMeta(event.meta?.nextCatalystAt);
    case 'mission_completed':
    case 'mission_failed':
    case 'mission_canceled':
    case 'mission_queued':
    case 'mission_linked':
      return stringifyMeta(event.meta?.missionId);
    default:
      return undefined;
  }
}

function missionEventTone(event: MissionEventRecord): OpportunityActionTimelineEntry['tone'] {
  if (['failed', 'canceled'].includes(event.type)) return 'negative';
  if (['completed'].includes(event.type)) return 'positive';
  if (['queued', 'started', 'stage'].includes(event.type)) return 'warning';
  return 'neutral';
}

function missionEventCategory(event: MissionEventRecord): OpportunityActionTimelineEntry['category'] {
  if (['failed', 'completed', 'canceled'].includes(event.type)) return 'execution';
  if (event.type === 'stage') return 'signal';
  return 'execution';
}

function missionEventSource(event: MissionEventRecord): OpportunityActionTimelineEntry['source'] {
  const source = String(event.meta?.source || '').toLowerCase();
  if (!source) return 'system';
  if (source.startsWith('manual') || source.startsWith('opportunity_template')) return 'manual';
  return 'automation';
}

function missionEventDecision(event: MissionEventRecord): OpportunityActionTimelineEntry['decision'] {
  switch (event.type) {
    case 'completed':
    case 'failed':
    case 'canceled':
      return 'review';
    case 'queued':
    case 'started':
    case 'stage':
      return 'act';
    default:
      return 'monitor';
  }
}

function missionEventReason(event: MissionEventRecord): string | undefined {
  if (event.type === 'stage' && event.phase) {
    return `Phase ${event.phase}`;
  }

  const source = stringifyMeta(event.meta?.source);
  const runId = stringifyMeta(event.meta?.runId);
  const failure = stringifyMeta(event.meta?.failureMessage);
  const parts = [
    source ? `Source ${source}` : undefined,
    runId ? `Run ${runId}` : undefined,
    failure,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function missionEventLabel(event: MissionEventRecord): string {
  switch (event.type) {
    case 'queued':
      return 'Mission queued';
    case 'started':
      return 'Mission started';
    case 'completed':
      return 'Mission completed';
    case 'failed':
      return 'Mission failed';
    case 'canceled':
      return 'Mission canceled';
    case 'stage':
      return `Mission ${event.phase || 'stage'}`;
    default:
      return 'Mission updated';
  }
}

export function buildOpportunityActionTimeline(
  opportunityEvents: OpportunityEventRecord[],
  missionEvents: MissionEventRecord[] = [],
  limit = 6,
): OpportunityActionTimelineEntry[] {
  const entries: OpportunityActionTimelineEntry[] = [
    ...opportunityEvents.map((event) => ({
      id: `opp_${event.id}`,
      timestamp: event.timestamp,
      kind: 'opportunity' as const,
      category: opportunityEventCategory(event),
      source: opportunityEventSource(event),
      decision: opportunityEventDecision(event),
      driver: opportunityEventDriver(event),
      label: opportunityEventLabel(event),
      detail: event.message,
      reasonSummary: opportunityEventReason(event),
      tone: opportunityEventTone(event),
    })),
    ...missionEvents.map((event) => ({
      id: `mission_${event.id}`,
      timestamp: event.timestamp,
      kind: 'mission' as const,
      category: missionEventCategory(event),
      source: missionEventSource(event),
      decision: missionEventDecision(event),
      driver: 'execution' as const,
      label: missionEventLabel(event),
      detail: event.message,
      reasonSummary: missionEventReason(event),
      tone: missionEventTone(event),
    })),
  ];

  return entries
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
