import type {
  OpportunityBoardHealthMap,
  OpportunityBoardHealthMetricDetail,
  OpportunityBoardHealthMetric,
  OpportunityBoardType,
  OpportunityEventType,
  OpportunitySummaryRecord,
} from './types';

const BOARD_TYPES: OpportunityBoardType[] = ['ipo_spinout', 'relay_chain', 'proxy_narrative'];

function buildMetric(
  key: string,
  label: string,
  value: number,
  opportunityIds: string[],
  tone: OpportunityBoardHealthMetric['tone'] = 'neutral',
  explanation?: string,
  details?: OpportunityBoardHealthMetricDetail[],
): OpportunityBoardHealthMetric {
  return {
    key,
    label,
    value,
    tone,
    opportunityIds,
    ...(explanation ? { explanation } : {}),
    ...(details && details.length > 0 ? { details } : {}),
  };
}

function hasTradingWindow(opportunity: OpportunitySummaryRecord): boolean {
  return opportunity.stage === 'ready'
    || opportunity.status === 'ready'
    || opportunity.catalystCalendar.some((item) => item.label.includes('交易') && item.status === 'upcoming');
}

function hasSupplyOverhang(opportunity: OpportunitySummaryRecord): boolean {
  return Boolean(
    opportunity.supplyOverhang
    || typeof opportunity.ipoProfile?.retainedStakePercent === 'number'
    || opportunity.ipoProfile?.lockupDate,
  );
}

function isProxyIgnited(opportunity: OpportunitySummaryRecord): boolean {
  return Boolean(
    opportunity.latestEventType === 'proxy_ignited'
    || (
      opportunity.type === 'proxy_narrative'
      && opportunity.proxyProfile
      && opportunity.scores.purityScore >= 75
      && opportunity.scores.scarcityScore >= 70
      && opportunity.proxyProfile.legitimacyScore >= 70
    ),
  );
}

function isProxyRetreat(opportunity: OpportunitySummaryRecord): boolean {
  return Boolean(
    opportunity.status === 'degraded'
    || opportunity.latestEventType === 'thesis_degraded'
    || opportunity.latestEventType === 'mission_failed'
    || opportunity.latestEventType === 'mission_canceled',
  );
}

function latestEventEvidence(opportunity: OpportunitySummaryRecord, types: OpportunityEventType[]): {
  eventLabel?: string | undefined;
  evidence?: string | undefined;
} {
  const latestType = opportunity.latestEventType;
  if (!latestType || !types.includes(latestType)) return {};
  return {
    eventLabel: latestType,
    ...(opportunity.latestEventMessage ? { evidence: opportunity.latestEventMessage } : {}),
  };
}

function proxyIgnitionDetail(opportunity: OpportunitySummaryRecord): OpportunityBoardHealthMetricDetail {
  const evidence = latestEventEvidence(opportunity, ['proxy_ignited', 'thesis_upgraded', 'signal_changed']);
  const ruleReason = opportunity.latestEventType === 'proxy_ignited'
    ? '最新结构化事件为 proxy_ignited。'
    : `代理变量评分达标：Purity ${opportunity.scores.purityScore} / Scarcity ${opportunity.scores.scarcityScore} / Legitimacy ${opportunity.proxyProfile?.legitimacyScore || 0}。`;
  return {
    opportunityId: opportunity.id,
    title: opportunity.title,
    reason: ruleReason,
    ...evidence,
  };
}

function proxyRetreatDetail(opportunity: OpportunitySummaryRecord): OpportunityBoardHealthMetricDetail {
  const evidence = latestEventEvidence(opportunity, ['thesis_degraded', 'mission_failed', 'mission_canceled', 'leader_broken']);
  const reason = opportunity.status === 'degraded'
    ? '机会状态已降级为 degraded。'
    : opportunity.latestEventType
      ? `最新结构化事件为 ${opportunity.latestEventType}。`
      : '出现复核或承接转弱信号。';
  return {
    opportunityId: opportunity.id,
    title: opportunity.title,
    reason,
    ...evidence,
  };
}

function proxyRuleNamedDetail(opportunity: OpportunitySummaryRecord): OpportunityBoardHealthMetricDetail {
  return {
    opportunityId: opportunity.id,
    title: opportunity.title,
    reason: `规则/身份状态：${opportunity.proxyProfile?.ruleStatus || opportunity.policyStatus || '已记录'}`,
  };
}

function buildBoardHealthSummary(
  type: OpportunityBoardType,
  items: OpportunitySummaryRecord[],
) {
  if (type === 'ipo_spinout') {
    const windowOpenItems = items.filter(hasTradingWindow);
    const overhangItems = items.filter(hasSupplyOverhang);
    const firstEarningsPendingItems = items.filter((item) => !item.ipoProfile?.firstIndependentEarningsAt);
    const windowOpen = windowOpenItems.length;
    const overhang = overhangItems.length;
    const firstEarningsPending = firstEarningsPendingItems.length;
    return {
      type,
      headline: `窗口 ${windowOpen} / Overhang ${overhang}`,
      summary: `当前更该先盯交易窗口和供给日历；${windowOpen} 张卡已接近交易窗口，${overhang} 张还带明显供给压力。`,
      metrics: [
        buildMetric('window_open', '交易窗口', windowOpen, windowOpenItems.map((item) => item.id), windowOpen > 0 ? 'positive' : 'neutral', '统计 stage/status 已进入 ready，或日历里存在 upcoming 交易窗口的 New Code 机会。'),
        buildMetric('overhang', '供给压力', overhang, overhangItems.map((item) => item.id), overhang > 0 ? 'warning' : 'neutral', '统计 supplyOverhang、父公司 retained stake、lockup date 任一存在的机会。'),
        buildMetric(
          'first_earnings_pending',
          '待独立验证',
          firstEarningsPending,
          firstEarningsPendingItems.map((item) => item.id),
          firstEarningsPending > 0 ? 'warning' : 'neutral',
          '统计尚未记录首份独立财报时间的 New Code 机会。',
        ),
      ],
    };
  }

  if (type === 'relay_chain') {
    const confirmedItems = items.filter((item) => item.heatProfile?.validationStatus === 'confirmed');
    const fragileItems = items.filter((item) => item.heatProfile?.validationStatus === 'fragile');
    const brokenItems = items.filter((item) => item.heatProfile?.validationStatus === 'broken');
    const confirmed = confirmedItems.length;
    const fragile = fragileItems.length;
    const broken = brokenItems.length;
    return {
      type,
      headline: `Confirmed ${confirmed} / Fragile ${fragile}`,
      summary: `这个板块看的不是“有没有关系”，而是传导是否站得住；当前 ${confirmed} 条链已确认，${fragile + broken} 条偏脆弱。`,
      metrics: [
        buildMetric('confirmed', 'confirmed', confirmed, confirmedItems.map((item) => item.id), confirmed > 0 ? 'positive' : 'neutral', '统计 Heat Transfer Graph validationStatus = confirmed 的传导链。'),
        buildMetric('fragile', 'fragile', fragile, fragileItems.map((item) => item.id), fragile > 0 ? 'warning' : 'neutral', '统计 Heat Transfer Graph validationStatus = fragile 的传导链。'),
        buildMetric('broken', 'broken', broken, brokenItems.map((item) => item.id), broken > 0 ? 'negative' : 'neutral', '统计 Heat Transfer Graph validationStatus = broken 的传导链。'),
      ],
    };
  }

  const ignitedItems = items.filter(isProxyIgnited);
  const retreatItems = items.filter(isProxyRetreat);
  const ruleNamedItems = items.filter((item) => Boolean(item.proxyProfile?.ruleStatus));
  const ignited = ignitedItems.length;
  const retreat = retreatItems.length;
  const ruleNamed = ruleNamedItems.length;
  return {
    type,
    headline: `点火 ${ignited} / 退潮 ${retreat}`,
    summary: '这里的“点火”来自公开代理变量成立并被市场点亮；“退潮”是基于现有降级信号的板块聚合，不是单独的底层事件类型。',
    metrics: [
      buildMetric(
        'ignited',
        '点火',
        ignited,
        ignitedItems.map((item) => item.id),
        ignited > 0 ? 'positive' : 'neutral',
        '点火 = 最新 proxy_ignited 事件，或代理变量同时满足高纯度、高稀缺、规则正名/合法性评分达标。',
        ignitedItems.map(proxyIgnitionDetail),
      ),
      buildMetric(
        'retreat',
        '退潮',
        retreat,
        retreatItems.map((item) => item.id),
        retreat > 0 ? 'warning' : 'neutral',
        '退潮 = 机会状态 degraded，或最新事件为 thesis_degraded / mission_failed / mission_canceled。',
        retreatItems.map(proxyRetreatDetail),
      ),
      buildMetric(
        'rule_named',
        '规则正名',
        ruleNamed,
        ruleNamedItems.map((item) => item.id),
        ruleNamed > 0 ? 'positive' : 'neutral',
        '规则正名 = proxyProfile.ruleStatus 已记录，表示交易身份、监管状态或规则状态有明确描述。',
        ruleNamedItems.map(proxyRuleNamedDetail),
      ),
    ],
  };
}

export function buildOpportunityBoardHealthMap(
  opportunities: OpportunitySummaryRecord[],
): OpportunityBoardHealthMap {
  const grouped: Record<OpportunityBoardType, OpportunitySummaryRecord[]> = {
    ipo_spinout: [],
    relay_chain: [],
    proxy_narrative: [],
  };

  opportunities.forEach((opportunity) => {
    if (BOARD_TYPES.includes(opportunity.type as OpportunityBoardType)) {
      grouped[opportunity.type as OpportunityBoardType].push(opportunity);
    }
  });

  return {
    ipo_spinout: buildBoardHealthSummary('ipo_spinout', grouped.ipo_spinout),
    relay_chain: buildBoardHealthSummary('relay_chain', grouped.relay_chain),
    proxy_narrative: buildBoardHealthSummary('proxy_narrative', grouped.proxy_narrative),
  };
}
