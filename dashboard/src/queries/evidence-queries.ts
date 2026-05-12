import {
  emptyPage,
  fetchOpportunityFieldEvidencePage,
  type OpportunityFieldEvidenceIndexItem,
  type OpportunityFieldEvidenceIndexRequest,
  type PageEnvelope,
} from '../api';
import { usePollingQuery } from './query-client';

function fieldEvidenceQueryKey(request: OpportunityFieldEvidenceIndexRequest): string {
  return [
    request.limit ?? 50,
    request.cursor || '',
    request.q || '',
    request.opportunityId || '',
    request.field || '',
    request.source || '',
    request.kind || 'all',
    request.confidence || 'all',
    request.status || 'all',
  ].join(':');
}

export function useOpportunityFieldEvidencePageQuery(
  request: OpportunityFieldEvidenceIndexRequest = {},
) {
  const limit = request.limit ?? 50;
  return usePollingQuery<PageEnvelope<OpportunityFieldEvidenceIndexItem>>({
    queryKey: `opportunity-field-evidence:${fieldEvidenceQueryKey(request)}`,
    fetcher: () => fetchOpportunityFieldEvidencePage({ ...request, limit }),
    intervalMs: 10000,
    initialData: emptyPage<OpportunityFieldEvidenceIndexItem>(limit),
  });
}
