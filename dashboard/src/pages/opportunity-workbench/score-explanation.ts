import type { OpportunitySummary } from '../../api';
import { buildPreTradeChecklist } from './pretrade';
import { isRecoverableMissionStatus } from './recovery';

export type ScoreExplanationTone = 'strong' | 'watch' | 'risk';

export type ScoreExplanationFactor = {
  id: string;
  label: string;
  tone: ScoreExplanationTone;
  detail: string;
  value?: string | number;
};

export type ScoreExplanation = {
  headline: string;
  summary: string;
  primaryLabel: string;
  primaryValue: number;
  primaryTone: ScoreExplanationTone;
  readinessLabel: string;
  factors: ScoreExplanationFactor[];
};

function scoreTone(value: number, strong = 75, watch = 55): ScoreExplanationTone {
  if (value >= strong) return 'strong';
  if (value >= watch) return 'watch';
  return 'risk';
}

function primaryMetric(opportunity: OpportunitySummary) {
  if (opportunity.type === 'ipo_spinout') {
    return {
      label: 'Catalyst',
      value: opportunity.scores.catalystScore,
      detail: '新代码/分拆机会主要由交易窗口、供给日历和独立验证驱动。',
    };
  }
  if (opportunity.type === 'relay_chain') {
    return {
      label: 'Relay',
      value: opportunity.scores.relayScore,
      detail: '传导链机会主要看 leader heat、瓶颈层和二三层扩散是否成立。',
    };
  }
  if (opportunity.type === 'proxy_narrative') {
    return {
      label: 'Purity',
      value: opportunity.scores.purityScore,
      detail: '代理变量机会主要看纯度、稀缺性、正名程度和可交易性。',
    };
  }
  return {
    label: 'Tradeability',
    value: opportunity.scores.tradeabilityScore,
    detail: '通用机会先看是否具备可执行交易对象。',
  };
}

function missionFactor(opportunity: OpportunitySummary): ScoreExplanationFactor {
  const mission = opportunity.latestMission;
  if (!mission) {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'risk',
      detail: '还没有关联 mission，排序和执行判断缺少底层证据。',
    };
  }
  if (isRecoverableMissionStatus(mission.status)) {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'risk',
      value: mission.status,
      detail: '最近 mission 失败或取消，需要先恢复/复核。',
    };
  }
  if (mission.status === 'fully_enriched') {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'strong',
      value: mission.status,
      detail: '任务完整跑通，OpenClaw/TA/OpenBB 证据链更完整。',
    };
  }
  if (mission.status === 'main_only') {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'watch',
      value: mission.status,
      detail: '只有主链路结果，仍缺 enriched 验证。',
    };
  }
  return {
    id: 'mission',
    label: 'Mission evidence',
    tone: 'watch',
    value: mission.status,
    detail: '任务还不是完整终态，排序会保守处理。',
  };
}

function preTradeFactor(opportunity: OpportunitySummary): ScoreExplanationFactor {
  const checklist = buildPreTradeChecklist(opportunity);
  return {
    id: 'pretrade',
    label: 'Pre-trade',
    tone: checklist.readiness === 'ready' ? 'strong' : checklist.readiness === 'watch' ? 'watch' : 'risk',
    value: checklist.score,
    detail: `${checklist.label}: ${checklist.blockers} block / ${checklist.warnings} warn。${checklist.nextAction}`,
  };
}

function movementFactors(opportunity: OpportunitySummary): ScoreExplanationFactor[] {
  const factors: ScoreExplanationFactor[] = [];

  if (opportunity.status === 'degraded') {
    factors.push({
      id: 'status_degraded',
      label: 'Status',
      tone: 'risk',
      value: 'degraded',
      detail: opportunity.latestEventMessage || '机会状态已降级，需要先复核 thesis。',
    });
  }

  if (opportunity.latestOpportunityDiff?.changed) {
    factors.push({
      id: 'thesis_diff',
      label: 'Thesis diff',
      tone: 'watch',
      value: opportunity.latestOpportunityDiff.changeCount,
      detail: opportunity.latestOpportunityDiff.summary,
    });
  }

  if (opportunity.heatInflection) {
    const kind = opportunity.heatInflection.kind;
    const tone: ScoreExplanationTone = ['confirmation', 'acceleration', 'rebuild'].includes(kind)
      ? 'strong'
      : ['weakening', 'breakdown'].includes(kind)
        ? 'risk'
        : 'watch';
    factors.push({
      id: 'heat_inflection',
      label: 'Heat inflection',
      tone,
      value: kind,
      detail: opportunity.heatInflection.summary,
    });
  }

  return factors;
}

function relayFactors(opportunity: OpportunitySummary): ScoreExplanationFactor[] {
  const heat = opportunity.heatProfile;
  const validation = heat?.validationStatus;
  const chainReady = Boolean((opportunity.leaderTicker || opportunity.primaryTicker) && heat?.bottleneckTickers.length && heat?.laggardTickers.length);

  return [
    {
      id: 'breadth',
      label: 'Breadth',
      tone: typeof heat?.breadthScore === 'number' ? scoreTone(heat.breadthScore, 75, 50) : 'watch',
      value: typeof heat?.breadthScore === 'number' ? heat.breadthScore : 'n/a',
      detail: heat?.validationSummary || 'Breadth 尚未形成清晰解释。',
    },
    {
      id: 'validation',
      label: 'Validation',
      tone: validation === 'confirmed' ? 'strong' : validation === 'broken' ? 'risk' : 'watch',
      value: validation || 'missing',
      detail: validation === 'confirmed'
        ? '传导链已确认，是排序靠前的重要原因。'
        : validation === 'broken'
          ? '传导链已破坏，优先进入复核。'
          : '传导还在形成或偏脆弱。',
    },
    {
      id: 'chain_completeness',
      label: 'Chain completeness',
      tone: chainReady ? 'strong' : opportunity.leaderTicker || heat?.bottleneckTickers.length ? 'watch' : 'risk',
      detail: `Leader ${opportunity.leaderTicker || opportunity.primaryTicker || 'missing'} / Bottleneck ${heat?.bottleneckTickers.length || 0} / Laggard ${heat?.laggardTickers.length || 0}`,
    },
  ];
}

function proxyFactors(opportunity: OpportunitySummary): ScoreExplanationFactor[] {
  const proxy = opportunity.proxyProfile;
  return [
    {
      id: 'scarcity',
      label: 'Scarcity',
      tone: scoreTone(opportunity.scores.scarcityScore),
      value: opportunity.scores.scarcityScore,
      detail: '稀缺性越高，越容易成为公共交易符号。',
    },
    {
      id: 'legitimacy',
      label: 'Legitimacy',
      tone: scoreTone(proxy?.legitimacyScore || 0, 70, 45),
      value: proxy?.legitimacyScore || 0,
      detail: proxy?.ruleStatus || '规则正名/身份合法性还需要确认。',
    },
    {
      id: 'legibility',
      label: 'Legibility',
      tone: scoreTone(proxy?.legibilityScore || 0, 70, 45),
      value: proxy?.legibilityScore || 0,
      detail: proxy?.mappingTarget || proxy?.identityNote || '一句话故事还不够清晰。',
    },
  ];
}

function ipoFactors(opportunity: OpportunitySummary): ScoreExplanationFactor[] {
  const ipo = opportunity.ipoProfile;
  const hasWindow = Boolean(ipo?.officialTradingDate || opportunity.catalystCalendar.some((item) => item.status === 'upcoming'));
  const hasOverhang = Boolean(ipo?.lockupDate || typeof ipo?.retainedStakePercent === 'number' || opportunity.supplyOverhang);

  return [
    {
      id: 'trading_window',
      label: 'Trading window',
      tone: hasWindow ? 'strong' : 'watch',
      detail: ipo?.officialTradingDate
        ? `Official trading date ${ipo.officialTradingDate}`
        : hasWindow
          ? 'Catalyst calendar 已包含 upcoming window。'
          : '交易窗口还不够明确。',
    },
    {
      id: 'overhang',
      label: 'Supply overhang',
      tone: hasOverhang ? 'strong' : 'watch',
      detail: ipo?.retainedStakePercent
        ? `Parent retained stake ${ipo.retainedStakePercent}%`
        : ipo?.lockupDate || opportunity.supplyOverhang || '还缺 retained stake / lockup / greenshoe。',
    },
    {
      id: 'independent_validation',
      label: 'Independent validation',
      tone: ipo?.firstIndependentEarningsAt ? 'strong' : 'watch',
      detail: ipo?.firstIndependentEarningsAt
        ? `First independent earnings ${ipo.firstIndependentEarningsAt}`
        : '首份独立财报或覆盖还没落地。',
    },
  ];
}

function typeFactors(opportunity: OpportunitySummary): ScoreExplanationFactor[] {
  if (opportunity.type === 'relay_chain') return relayFactors(opportunity);
  if (opportunity.type === 'proxy_narrative') return proxyFactors(opportunity);
  if (opportunity.type === 'ipo_spinout') return ipoFactors(opportunity);
  return [
    {
      id: 'core_shape',
      label: 'Core shape',
      tone: opportunity.thesis && (opportunity.primaryTicker || opportunity.leaderTicker || opportunity.proxyTicker) ? 'strong' : 'watch',
      detail: opportunity.thesis || '核心 thesis 或 ticker 还需要补齐。',
    },
  ];
}

export function buildScoreExplanation(opportunity: OpportunitySummary): ScoreExplanation {
  const primary = primaryMetric(opportunity);
  const primaryTone = scoreTone(primary.value);
  const factors: ScoreExplanationFactor[] = [
    {
      id: 'primary',
      label: primary.label,
      tone: primaryTone,
      value: primary.value,
      detail: primary.detail,
    },
    preTradeFactor(opportunity),
    missionFactor(opportunity),
    {
      id: 'tradeability',
      label: 'Tradeability',
      tone: scoreTone(opportunity.scores.tradeabilityScore, 70, 55),
      value: opportunity.scores.tradeabilityScore,
      detail: '用于约束是否能从研究推进到实际执行。',
    },
    ...typeFactors(opportunity),
    ...movementFactors(opportunity),
  ];
  const riskCount = factors.filter((factor) => factor.tone === 'risk').length;
  const strongCount = factors.filter((factor) => factor.tone === 'strong').length;
  const readiness = buildPreTradeChecklist(opportunity);

  return {
    headline: `${primary.label} ${primary.value}`,
    summary: riskCount > 0
      ? `${riskCount} 个风险因子压制评分，先处理 ${factors.find((factor) => factor.tone === 'risk')?.label || 'risk'}。`
      : `${strongCount} 个强因子支撑排序，pre-trade 当前为 ${readiness.label}。`,
    primaryLabel: primary.label,
    primaryValue: primary.value,
    primaryTone,
    readinessLabel: readiness.label,
    factors,
  };
}
