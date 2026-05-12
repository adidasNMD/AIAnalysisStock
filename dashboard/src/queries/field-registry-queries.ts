import {
  fetchOpportunityFieldRegistry,
  fetchOpportunityFieldRegistryAudit,
  type OpportunityFieldRegistryAuditEntry,
  fetchOpportunityFieldRegistryReport,
  type OpportunityFieldRegistryDiffReport,
  type OpportunityFieldRegistryEntry,
} from '../api';
import { usePollingQuery } from './query-client';

export function useOpportunityFieldRegistryQuery() {
  return usePollingQuery<OpportunityFieldRegistryEntry[]>({
    queryKey: 'opportunity-field-registry',
    fetcher: fetchOpportunityFieldRegistry,
    intervalMs: 15000,
    initialData: [],
  });
}

export function useOpportunityFieldRegistryAuditQuery(field?: string, limit = 20) {
  return usePollingQuery<OpportunityFieldRegistryAuditEntry[]>({
    queryKey: `opportunity-field-registry-audit:${field || 'all'}:${limit}`,
    fetcher: () => fetchOpportunityFieldRegistryAudit({ field, limit }),
    intervalMs: 15000,
    initialData: [],
  });
}

export function useOpportunityFieldRegistryReportQuery() {
  return usePollingQuery<OpportunityFieldRegistryDiffReport | null>({
    queryKey: 'opportunity-field-registry-report',
    fetcher: fetchOpportunityFieldRegistryReport,
    intervalMs: 15000,
    initialData: null,
  });
}
