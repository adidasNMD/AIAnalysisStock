import {
  fetchOpportunities,
  fetchOpportunityBoardHealth,
  fetchOpportunityEvents,
  fetchOpportunityInbox,
  type OpportunityBoardHealthMap,
  type OpportunityEvent,
  type OpportunityInboxItem,
  type OpportunitySummary,
} from '../api';
import { usePollingQuery } from './query-client';

export function useOpportunityListQuery(limit = 60) {
  return usePollingQuery<OpportunitySummary[]>({
    queryKey: `opportunities:list:${limit}`,
    fetcher: () => fetchOpportunities(limit),
    intervalMs: 5000,
    initialData: [],
  });
}

export function useOpportunityBoardHealthQuery(limit = 60) {
  return usePollingQuery<OpportunityBoardHealthMap | null>({
    queryKey: `opportunities:board-health:${limit}`,
    fetcher: () => fetchOpportunityBoardHealth(limit),
    intervalMs: 5000,
    initialData: null,
  });
}

export function useOpportunityInboxQuery(limit = 10) {
  return usePollingQuery<OpportunityInboxItem[]>({
    queryKey: `opportunities:inbox:${limit}`,
    fetcher: () => fetchOpportunityInbox(limit),
    intervalMs: 5000,
    initialData: [],
  });
}

export function useOpportunityEventsQuery(limit = 20) {
  return usePollingQuery<OpportunityEvent[]>({
    queryKey: `opportunities:events:${limit}`,
    fetcher: () => fetchOpportunityEvents(limit),
    intervalMs: 8000,
    initialData: [],
  });
}
