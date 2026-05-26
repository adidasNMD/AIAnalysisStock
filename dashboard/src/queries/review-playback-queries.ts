import {
  fetchOpportunityReviewPlayback,
  type OpportunityReviewPlaybackRequest,
  type OpportunityReviewPlaybackResponse,
} from '../api';
import { usePollingQuery } from './query-client';

const emptyReviewPlayback: OpportunityReviewPlaybackResponse = {
  generatedAt: '',
  metrics: {
    total: 0,
    missions: 0,
    pretrade: 0,
    evidence: 0,
    catalysts: 0,
    risks: 0,
    positives: 0,
    warnings: 0,
  },
  outcome: {
    status: 'quiet',
    headline: '暂无复盘信号',
    detail: '',
    nextStep: '',
    score: 0,
    blockers: 0,
    failedMissions: 0,
    completedMissions: 0,
    evidenceRecorded: 0,
    evidenceInvalidated: 0,
  },
  performance: {
    status: 'insufficient_data',
    headline: '暂无可复盘交易结果',
    detail: '',
    nextStep: '',
    opportunityCount: 0,
    triggeredCatalysts: 0,
    pretradeBlockHit: false,
    pretradeBlockers: 0,
    riskEvents: 0,
	    dataQuality: 'missing',
	    notes: [],
	    trades: [],
	    position: {
	      closedLegs: 0,
	      partialLegs: 0,
	      openLegs: 0,
	      sizedLegs: 0,
      notes: [],
      exitAttributions: [],
      executionQuality: [],
      planRepairSuggestions: [],
      sizingRules: [],
    },
    riskBacktest: {
      verdict: 'no_trades',
      label: 'No trades',
      detail: '',
      sampleSize: 0,
      closedLegs: 0,
      pricedLegs: 0,
      oversizedLegs: 0,
      planRepairLegs: 0,
      executionIssueLegs: 0,
      notes: [],
    },
    strategyBacktest: {
      status: 'empty',
      headline: '暂无策略回测样本',
      detail: '',
      filterLabel: 'All history',
      totalStrategies: 0,
      coveredStrategies: 0,
      opportunityCount: 0,
      pricedLegs: 0,
      closedLegs: 0,
      notes: [],
      groups: [],
    },
  },
  items: [],
};

function reviewPlaybackQueryKey(request: OpportunityReviewPlaybackRequest): string {
  return [
    'opportunity-review-playback',
    request.limit ?? 50,
    request.category ?? 'all',
    request.tone ?? 'all',
    request.opportunityId || '',
    request.q || '',
    request.backtestTicker || '',
    request.backtestFrom || '',
    request.backtestTo || '',
    request.backtestStrategy || '',
  ].join(':');
}

export function useOpportunityReviewPlaybackQuery(
  request: OpportunityReviewPlaybackRequest = {},
) {
  return usePollingQuery<OpportunityReviewPlaybackResponse>({
    queryKey: reviewPlaybackQueryKey(request),
    fetcher: () => fetchOpportunityReviewPlayback(request),
    intervalMs: 12000,
    initialData: emptyReviewPlayback,
  });
}
