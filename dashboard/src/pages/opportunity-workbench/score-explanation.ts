import type { OpportunitySummary } from '../../api';
import { buildPreTradeChecklist } from './pretrade';
import { isRecoverableMissionStatus } from './recovery-status';

export type ScoreExplanationTone = 'strong' | 'watch' | 'risk';
export type ScoreContributionDirection = 'positive' | 'negative' | 'neutral';

export type ScoreContribution = {
  direction: ScoreContributionDirection;
  weight: number;
};

export type ScoreEvidenceRef = {
  id: string;
  label: string;
  source?: string;
  confidence?: string;
  value?: string | number;
  note?: string;
};

export type ScoreExplanationFactor = {
  id: string;
  label: string;
  tone: ScoreExplanationTone;
  detail: string;
  value?: string | number;
  contribution?: ScoreContribution;
  evidence?: ScoreEvidenceRef[];
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

const FACTOR_CONTRIBUTION_WEIGHTS: Record<string, number> = {
  primary: 30,
  pretrade: 22,
  mission: 18,
  tradeability: 18,
  status_degraded: 24,
  thesis_diff: 10,
  heat_inflection: 14,
  breadth: 14,
  validation: 18,
  chain_completeness: 12,
  scarcity: 14,
  legitimacy: 14,
  legibility: 12,
  trading_window: 18,
  overhang: 12,
  independent_validation: 12,
  core_shape: 12,
};

function contributionDirection(tone: ScoreExplanationTone): ScoreContributionDirection {
  if (tone === 'strong') return 'positive';
  if (tone === 'risk') return 'negative';
  return 'neutral';
}

function contributionForFactor(factor: ScoreExplanationFactor): ScoreContribution {
  const direction = contributionDirection(factor.tone);
  const weight = FACTOR_CONTRIBUTION_WEIGHTS[factor.id] || 10;

  if (direction === 'positive') {
    return {
      direction,
      weight,
    };
  }

  if (direction === 'negative') {
    return {
      direction,
      weight,
    };
  }

  return {
    direction,
    weight,
  };
}

function attachContributions(factors: ScoreExplanationFactor[]): ScoreExplanationFactor[] {
  return factors.map((factor) => ({
    ...factor,
    contribution: factor.contribution || contributionForFactor(factor),
  }));
}

function compactEvidenceText(value?: string | number | null): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function metricEvidence(
  id: string,
  label: string,
  value?: string | number | null,
  note?: string,
): ScoreEvidenceRef[] {
  const compactValue = compactEvidenceText(value);
  const compactNote = compactEvidenceText(note);
  if (!compactValue && !compactNote) return [];
  return [{
    id,
    label,
    source: 'opportunity_profile',
    ...(compactValue ? { value: compactValue } : {}),
    ...(compactNote ? { note: compactNote } : {}),
  }];
}

function provenanceEvidence(
  opportunity: OpportunitySummary,
  predicate: (field: string, kind: string) => boolean,
  limit = 3,
): ScoreEvidenceRef[] {
  return (opportunity.sourceProvenance?.items || [])
    .filter((item) => predicate(item.field, item.kind))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      label: item.label,
      source: item.source,
      confidence: item.confidence,
      ...(item.value ? { value: item.value } : {}),
      ...(item.note ? { note: item.note } : {}),
    }));
}

function fieldEvidence(
  opportunity: OpportunitySummary,
  predicate: (field: string, kind: string) => boolean,
  limit = 3,
): ScoreEvidenceRef[] {
  return (opportunity.fieldEvidence?.items || [])
    .filter((item) => predicate(item.field, item.kind))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      label: item.label,
      source: item.source,
      confidence: item.confidence,
      ...(item.value ? { value: item.value } : {}),
      ...(item.note ? { note: item.note } : {}),
    }));
}

function evidenceForFields(
  opportunity: OpportunitySummary,
  fields: string[],
  fallback: ScoreEvidenceRef[] = [],
  limit = 3,
): ScoreEvidenceRef[] {
  const exact = new Set(fields);
  const fromFieldEvidence = fieldEvidence(opportunity, (field) => exact.has(field), limit);
  return fromFieldEvidence.length > 0 ? fromFieldEvidence : fallback.slice(0, limit);
}

function catalystEvidence(opportunity: OpportunitySummary, limit = 2): ScoreEvidenceRef[] {
  const provenance = fieldEvidence(
    opportunity,
    (field, kind) => kind === 'source' && field.startsWith('catalystCalendar'),
    limit,
  );
  if (provenance.length > 0) return provenance;

  return opportunity.catalystCalendar
    .filter((item) => item.source || item.confidence || item.dueAt)
    .slice(0, limit)
    .map((item, index) => ({
      id: `catalyst:${index}:${item.label}`,
      label: item.label,
      source: item.source || 'catalyst_calendar',
      confidence: item.confidence || 'unknown',
      value: [item.status, item.dueAt].filter(Boolean).join(' · '),
      ...(item.note ? { note: item.note } : {}),
    }));
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
  const evidence = fieldEvidence(opportunity, (_field, kind) => kind === 'mission', 1);
  const missionEvidence = evidence.length > 0
    ? evidence
    : provenanceEvidence(opportunity, (_field, kind) => kind === 'mission', 1);
  if (!mission) {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'risk',
      detail: '还没有关联 mission，排序和执行判断缺少底层证据。',
      evidence: missionEvidence,
    };
  }
  if (isRecoverableMissionStatus(mission.status)) {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'risk',
      value: mission.status,
      detail: '最近 mission 失败或取消，需要先恢复/复核。',
      evidence: missionEvidence,
    };
  }
  if (mission.status === 'fully_enriched') {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'strong',
      value: mission.status,
      detail: '任务完整跑通，OpenClaw/TA/OpenBB 证据链更完整。',
      evidence: missionEvidence,
    };
  }
  if (mission.status === 'main_only') {
    return {
      id: 'mission',
      label: 'Mission evidence',
      tone: 'watch',
      value: mission.status,
      detail: '只有主链路结果，仍缺 enriched 验证。',
      evidence: missionEvidence,
    };
  }
  return {
    id: 'mission',
    label: 'Mission evidence',
    tone: 'watch',
    value: mission.status,
    detail: '任务还不是完整终态，排序会保守处理。',
    evidence: missionEvidence,
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
    const eventEvidence = fieldEvidence(opportunity, (_field, kind) => kind === 'event', 1);
    factors.push({
      id: 'status_degraded',
      label: 'Status',
      tone: 'risk',
      value: 'degraded',
      detail: opportunity.latestEventMessage || '机会状态已降级，需要先复核 thesis。',
      evidence: eventEvidence.length > 0
        ? eventEvidence
        : provenanceEvidence(opportunity, (_field, kind) => kind === 'event', 1),
    });
  }

  if (opportunity.latestOpportunityDiff?.changed) {
    factors.push({
      id: 'thesis_diff',
      label: 'Thesis diff',
      tone: 'watch',
      value: opportunity.latestOpportunityDiff.changeCount,
      detail: opportunity.latestOpportunityDiff.summary,
      evidence: metricEvidence(
        'latest_opportunity_diff',
        'Latest diff',
        `${opportunity.latestOpportunityDiff.changeCount} changes`,
        opportunity.latestOpportunityDiff.highlights.slice(0, 2).join(' · '),
      ),
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
      evidence: metricEvidence(
        'heat_inflection',
        'Heat history',
        opportunity.heatInflection.scoreDelta,
        opportunity.heatInflection.happenedAt,
      ),
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
      evidence: evidenceForFields(
        opportunity,
        ['heatProfile.breadthScore', 'heatProfile.validationStatus'],
        metricEvidence('relay_breadth', 'Breadth score', heat?.breadthScore, heat?.validationSummary),
      ),
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
      evidence: evidenceForFields(
        opportunity,
        ['heatProfile.validationStatus', 'heatProfile.transmissionNote'],
        metricEvidence('relay_validation', 'Relay validation', validation, heat?.transmissionNote),
      ),
    },
    {
      id: 'chain_completeness',
      label: 'Chain completeness',
      tone: chainReady ? 'strong' : opportunity.leaderTicker || heat?.bottleneckTickers.length ? 'watch' : 'risk',
      detail: `Leader ${opportunity.leaderTicker || opportunity.primaryTicker || 'missing'} / Bottleneck ${heat?.bottleneckTickers.length || 0} / Laggard ${heat?.laggardTickers.length || 0}`,
      evidence: evidenceForFields(
        opportunity,
        ['leaderTicker', 'primaryTicker', 'heatProfile.bottleneckTickers', 'heatProfile.laggardTickers'],
        metricEvidence(
          'relay_chain_shape',
          'Chain shape',
          `${heat?.bottleneckTickers.length || 0}/${heat?.laggardTickers.length || 0}`,
          heat?.edges?.slice(0, 2).map((edge) => `${edge.from}->${edge.to}`).join(' · '),
        ),
      ),
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
      evidence: evidenceForFields(
        opportunity,
        ['scores.scarcityScore', 'proxyProfile.scarcityNote'],
        metricEvidence('proxy_scarcity', 'Scarcity score', opportunity.scores.scarcityScore, proxy?.scarcityNote),
      ),
    },
    {
      id: 'legitimacy',
      label: 'Legitimacy',
      tone: scoreTone(proxy?.legitimacyScore || 0, 70, 45),
      value: proxy?.legitimacyScore || 0,
      detail: proxy?.ruleStatus || '规则正名/身份合法性还需要确认。',
      evidence: evidenceForFields(
        opportunity,
        ['proxyProfile.legitimacyScore', 'proxyProfile.ruleStatus'],
        metricEvidence('proxy_legitimacy', 'Legitimacy profile', proxy?.legitimacyScore, proxy?.ruleStatus),
      ),
    },
    {
      id: 'legibility',
      label: 'Legibility',
      tone: scoreTone(proxy?.legibilityScore || 0, 70, 45),
      value: proxy?.legibilityScore || 0,
      detail: proxy?.mappingTarget || proxy?.identityNote || '一句话故事还不够清晰。',
      evidence: evidenceForFields(
        opportunity,
        ['proxyProfile.legibilityScore', 'proxyProfile.mappingTarget', 'proxyProfile.identityNote'],
        metricEvidence('proxy_legibility', 'Legibility profile', proxy?.legibilityScore, proxy?.mappingTarget || proxy?.identityNote),
      ),
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
      evidence: [
        ...evidenceForFields(
          opportunity,
          ['ipoProfile.officialTradingDate', 'ipoProfile.spinoutDate'],
          provenanceEvidence(opportunity, (field, kind) => (
            kind === 'ipo_field' && ['ipoProfile.officialTradingDate', 'ipoProfile.spinoutDate'].includes(field)
          ), 2),
          2,
        ),
        ...catalystEvidence(opportunity, 1),
      ].slice(0, 3),
    },
    {
      id: 'overhang',
      label: 'Supply overhang',
      tone: hasOverhang ? 'strong' : 'watch',
      detail: ipo?.retainedStakePercent
        ? `Parent retained stake ${ipo.retainedStakePercent}%`
        : ipo?.lockupDate || opportunity.supplyOverhang || '还缺 retained stake / lockup / greenshoe。',
      evidence: evidenceForFields(
        opportunity,
        ['ipoProfile.retainedStakePercent', 'ipoProfile.lockupDate', 'ipoProfile.greenshoeStatus'],
        provenanceEvidence(opportunity, (field, kind) => (
          kind === 'ipo_field' && ['ipoProfile.retainedStakePercent', 'ipoProfile.lockupDate', 'ipoProfile.greenshoeStatus'].includes(field)
        ), 3),
      ),
    },
    {
      id: 'independent_validation',
      label: 'Independent validation',
      tone: ipo?.firstIndependentEarningsAt ? 'strong' : 'watch',
      detail: ipo?.firstIndependentEarningsAt
        ? `First independent earnings ${ipo.firstIndependentEarningsAt}`
        : '首份独立财报或覆盖还没落地。',
      evidence: evidenceForFields(
        opportunity,
        ['ipoProfile.firstIndependentEarningsAt', 'ipoProfile.firstCoverageAt'],
        provenanceEvidence(opportunity, (field, kind) => (
          kind === 'ipo_field' && ['ipoProfile.firstIndependentEarningsAt', 'ipoProfile.firstCoverageAt'].includes(field)
        ), 2),
        2,
      ),
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
      evidence: evidenceForFields(
        opportunity,
        ['thesis', 'primaryTicker', 'leaderTicker', 'proxyTicker'],
        metricEvidence('core_shape', 'Core fields', opportunity.primaryTicker || opportunity.leaderTicker || opportunity.proxyTicker, opportunity.thesis),
      ),
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
      evidence: opportunity.type === 'ipo_spinout'
        ? catalystEvidence(opportunity, 2)
        : opportunity.type === 'relay_chain'
          ? evidenceForFields(
            opportunity,
            ['scores.relayScore', 'heatProfile.validationStatus', 'heatProfile.breadthScore'],
            metricEvidence('primary_relay_score', 'Relay score', opportunity.scores.relayScore, opportunity.heatProfile?.validationSummary),
          )
          : opportunity.type === 'proxy_narrative'
            ? evidenceForFields(
              opportunity,
              ['scores.purityScore', 'proxyProfile.identityNote', 'proxyProfile.mappingTarget'],
              metricEvidence('primary_proxy_score', 'Proxy score', opportunity.scores.purityScore, opportunity.proxyProfile?.identityNote),
            )
            : evidenceForFields(
              opportunity,
              ['scores.tradeabilityScore', 'primaryTicker'],
              metricEvidence('primary_tradeability_score', 'Tradeability score', opportunity.scores.tradeabilityScore, opportunity.primaryTicker),
            ),
    },
    preTradeFactor(opportunity),
    missionFactor(opportunity),
    {
      id: 'tradeability',
      label: 'Tradeability',
      tone: scoreTone(opportunity.scores.tradeabilityScore, 70, 55),
      value: opportunity.scores.tradeabilityScore,
      detail: '用于约束是否能从研究推进到实际执行。',
      evidence: evidenceForFields(
        opportunity,
        ['scores.tradeabilityScore', 'primaryTicker', 'proxyTicker'],
        metricEvidence('tradeability_score', 'Tradeability score', opportunity.scores.tradeabilityScore, opportunity.primaryTicker || opportunity.proxyTicker),
      ),
    },
    ...typeFactors(opportunity),
    ...movementFactors(opportunity),
  ];
  const factorsWithContributions = attachContributions(factors);
  const riskCount = factorsWithContributions.filter((factor) => factor.tone === 'risk').length;
  const strongCount = factorsWithContributions.filter((factor) => factor.tone === 'strong').length;
  const readiness = buildPreTradeChecklist(opportunity);

  return {
    headline: `${primary.label} ${primary.value}`,
    summary: riskCount > 0
      ? `${riskCount} 个风险因子压制评分，先处理 ${factorsWithContributions.find((factor) => factor.tone === 'risk')?.label || 'risk'}。`
      : `${strongCount} 个强因子支撑排序，pre-trade 当前为 ${readiness.label}。`,
    primaryLabel: primary.label,
    primaryValue: primary.value,
    primaryTone,
    readinessLabel: readiness.label,
    factors: factorsWithContributions,
  };
}
