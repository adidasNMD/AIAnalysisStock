import {
  fetchOpportunityCatalystReminderAudit,
  type OpportunityCatalystReminderAuditRequest,
  type OpportunityCatalystReminderAuditResponse,
} from '../api';
import { usePollingQuery } from './query-client';

const emptyCatalystReminderAudit: OpportunityCatalystReminderAuditResponse = {
  generatedAt: '',
  metrics: {
    total: 0,
    acknowledged: 0,
    snoozed: 0,
    reopened: 0,
    subscribed: 0,
    unsubscribed: 0,
    activeSubscriptions: 0,
  },
  items: [],
};

function catalystReminderQueryKey(request: OpportunityCatalystReminderAuditRequest): string {
  return [
    'opportunity-catalyst-reminders',
    request.limit ?? 50,
    request.preference ?? 'all',
    request.activeOnly ? 'active' : 'all',
    request.opportunityId || '',
    request.q || '',
  ].join(':');
}

export function useOpportunityCatalystReminderAuditQuery(
  request: OpportunityCatalystReminderAuditRequest = {},
) {
  return usePollingQuery<OpportunityCatalystReminderAuditResponse>({
    queryKey: catalystReminderQueryKey(request),
    fetcher: () => fetchOpportunityCatalystReminderAudit(request),
    intervalMs: 10000,
    initialData: emptyCatalystReminderAudit,
  });
}
