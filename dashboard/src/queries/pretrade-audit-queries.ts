import {
  fetchOpportunityPreTradeAudit,
  type OpportunityPreTradeAuditRequest,
  type OpportunityPreTradeAuditResponse,
} from '../api';
import { usePollingQuery } from './query-client';

const emptyPreTradeAudit: OpportunityPreTradeAuditResponse = {
  generatedAt: '',
  metrics: {
    total: 0,
    confirmations: 0,
    reopened: 0,
    blockers: 0,
    evidence: 0,
    blocked: 0,
    ready: 0,
  },
  items: [],
};

function preTradeAuditQueryKey(request: OpportunityPreTradeAuditRequest): string {
  return [
    'opportunity-pretrade-audit',
    request.limit ?? 50,
    request.category ?? 'all',
    request.status ?? 'all',
    request.opportunityId || '',
    request.q || '',
  ].join(':');
}

export function useOpportunityPreTradeAuditQuery(
  request: OpportunityPreTradeAuditRequest = {},
) {
  return usePollingQuery<OpportunityPreTradeAuditResponse>({
    queryKey: preTradeAuditQueryKey(request),
    fetcher: () => fetchOpportunityPreTradeAudit(request),
    intervalMs: 10000,
    initialData: emptyPreTradeAudit,
  });
}
