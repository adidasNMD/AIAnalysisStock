import type {
  OpportunityBoardHealthMap,
  OpportunityBoardHealthMetric,
  OpportunityBoardType,
  OpportunitySummaryRecord,
} from './types';

const BOARD_TYPES: OpportunityBoardType[] = ['ipo_spinout', 'relay_chain', 'proxy_narrative'];

function buildMetric(
  key: string,
  label: string,
  value: number,
  opportunityIds: string[],
  tone: OpportunityBoardHealthMetric['tone'] = 'neutral',
): OpportunityBoardHealthMetric {
  return { key, label, value, tone, opportunityIds };
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
        buildMetric('window_open', '交易窗口', windowOpen, windowOpenItems.map((item) => item.id), windowOpen > 0 ? 'positive' : 'neutral'),
        buildMetric('overhang', '供给压力', overhang, overhangItems.map((item) => item.id), overhang > 0 ? 'warning' : 'neutral'),
        buildMetric(
          'first_earnings_pending',
          '待独立验证',
          firstEarningsPending,
          firstEarningsPendingItems.map((item) => item.id),
          firstEarningsPending > 0 ? 'warning' : 'neutral',
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
        buildMetric('confirmed', 'confirmed', confirmed, confirmedItems.map((item) => item.id), confirmed > 0 ? 'positive' : 'neutral'),
        buildMetric('fragile', 'fragile', fragile, fragileItems.map((item) => item.id), fragile > 0 ? 'warning' : 'neutral'),
        buildMetric('broken', 'broken', broken, brokenItems.map((item) => item.id), broken > 0 ? 'negative' : 'neutral'),
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
      buildMetric('ignited', '点火', ignited, ignitedItems.map((item) => item.id), ignited > 0 ? 'positive' : 'neutral'),
      buildMetric('retreat', '退潮', retreat, retreatItems.map((item) => item.id), retreat > 0 ? 'warning' : 'neutral'),
      buildMetric('rule_named', '规则正名', ruleNamed, ruleNamedItems.map((item) => item.id), ruleNamed > 0 ? 'positive' : 'neutral'),
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
