import type {
  OpportunityIpoEvidence,
  OpportunityStage,
  OpportunityStatus,
  OpportunitySummary,
  UpdateOpportunityInput,
} from '../../api';

export type OpportunityEditDraft = {
  title: string;
  query: string;
  thesis: string;
  summary: string;
  stage: OpportunityStage;
  status: OpportunityStatus;
  primaryTicker: string;
  leaderTicker: string;
  proxyTicker: string;
  relatedTickersText: string;
  relayTickersText: string;
  nextCatalystAt: string;
  supplyOverhang: string;
  policyStatus: string;
  officialTradingDate: string;
  spinoutDate: string;
  retainedStakePercentText: string;
  lockupDate: string;
  greenshoeStatus: string;
  firstIndependentEarningsAt: string;
  firstCoverageAt: string;
  ipoEvidence?: OpportunityIpoEvidence | undefined;
};

function joinTickers(values: string[]) {
  return values.join(', ');
}

function parseTickers(text: string) {
  return text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function createOpportunityEditDraft(opportunity: OpportunitySummary): OpportunityEditDraft {
  return {
    title: opportunity.title,
    query: opportunity.query,
    thesis: opportunity.thesis || '',
    summary: opportunity.summary || '',
    stage: opportunity.stage,
    status: opportunity.status,
    primaryTicker: opportunity.primaryTicker || '',
    leaderTicker: opportunity.leaderTicker || '',
    proxyTicker: opportunity.proxyTicker || '',
    relatedTickersText: joinTickers(opportunity.relatedTickers || []),
    relayTickersText: joinTickers(opportunity.relayTickers || []),
    nextCatalystAt: opportunity.nextCatalystAt || '',
    supplyOverhang: opportunity.supplyOverhang || '',
    policyStatus: opportunity.policyStatus || '',
    officialTradingDate: opportunity.ipoProfile?.officialTradingDate || '',
    spinoutDate: opportunity.ipoProfile?.spinoutDate || '',
    retainedStakePercentText: typeof opportunity.ipoProfile?.retainedStakePercent === 'number'
      ? String(opportunity.ipoProfile.retainedStakePercent)
      : '',
    lockupDate: opportunity.ipoProfile?.lockupDate || '',
    greenshoeStatus: opportunity.ipoProfile?.greenshoeStatus || '',
    firstIndependentEarningsAt: opportunity.ipoProfile?.firstIndependentEarningsAt || '',
    firstCoverageAt: opportunity.ipoProfile?.firstCoverageAt || '',
    ...(opportunity.ipoProfile?.evidence ? { ipoEvidence: opportunity.ipoProfile.evidence } : {}),
  };
}

export function validateOpportunityEditDraft(draft: OpportunityEditDraft): string | null {
  if (!draft.title.trim()) return '机会标题不能为空';
  if (!draft.query.trim()) return '分析 query 不能为空';

  const retainedStake = draft.retainedStakePercentText.trim();
  if (retainedStake && !Number.isFinite(Number(retainedStake))) {
    return 'Retained stake 需要是数字';
  }

  return null;
}

export function buildOpportunityUpdateInput(
  opportunity: OpportunitySummary,
  draft: OpportunityEditDraft,
): UpdateOpportunityInput {
  const retainedStake = draft.retainedStakePercentText.trim();
  const parsedRetainedStake = retainedStake ? Number(retainedStake) : undefined;
  const ipoProfile = opportunity.type === 'ipo_spinout'
    ? {
        ...(draft.officialTradingDate.trim() ? { officialTradingDate: draft.officialTradingDate.trim() } : {}),
        ...(draft.spinoutDate.trim() ? { spinoutDate: draft.spinoutDate.trim() } : {}),
        ...(parsedRetainedStake !== undefined && Number.isFinite(parsedRetainedStake)
          ? { retainedStakePercent: parsedRetainedStake }
          : {}),
        ...(draft.lockupDate.trim() ? { lockupDate: draft.lockupDate.trim() } : {}),
        ...(draft.greenshoeStatus.trim() ? { greenshoeStatus: draft.greenshoeStatus.trim() } : {}),
        ...(draft.firstIndependentEarningsAt.trim() ? { firstIndependentEarningsAt: draft.firstIndependentEarningsAt.trim() } : {}),
        ...(draft.firstCoverageAt.trim() ? { firstCoverageAt: draft.firstCoverageAt.trim() } : {}),
        ...(draft.ipoEvidence ? { evidence: draft.ipoEvidence } : {}),
      }
    : undefined;

  return {
    title: draft.title.trim(),
    query: draft.query.trim(),
    thesis: draft.thesis.trim(),
    summary: draft.summary.trim(),
    stage: draft.stage,
    status: draft.status,
    primaryTicker: draft.primaryTicker.trim(),
    leaderTicker: draft.leaderTicker.trim(),
    proxyTicker: draft.proxyTicker.trim(),
    relatedTickers: parseTickers(draft.relatedTickersText),
    relayTickers: parseTickers(draft.relayTickersText),
    nextCatalystAt: emptyToNull(draft.nextCatalystAt),
    supplyOverhang: emptyToNull(draft.supplyOverhang),
    policyStatus: emptyToNull(draft.policyStatus),
    ...(ipoProfile ? { ipoProfile } : {}),
  };
}
