import { useCallback, useMemo } from 'react';
import {
  emptyPage,
  fetchOpportunities,
  fetchOpportunitiesPage,
  fetchOpportunityBoardHealth,
  fetchOpportunityDetail,
  fetchOpportunityEvents,
  fetchOpportunityInbox,
  fetchOpportunityInboxItem,
  type OpportunityBoardHealthMap,
  type OpportunityEvent,
  type OpportunityInboxItem,
  type OpportunitySummary,
  type PageEnvelope,
} from '../api';
import { useOpportunityStream, type OpportunityStreamEvent } from '../hooks/useAgentStream';
import { useOpportunityLiveStore } from './opportunity-live-store';
import { useOpportunityLiveUpdates } from './opportunity-live-updates';
import { usePollingQuery } from './query-client';

export function useOpportunityListQuery(limit = 60) {
  return usePollingQuery<OpportunitySummary[]>({
    queryKey: `opportunities:list:${limit}`,
    fetcher: () => fetchOpportunities(limit),
    intervalMs: 5000,
    initialData: [],
  });
}

export function useOpportunityListPageQuery(limit = 60) {
  return usePollingQuery<PageEnvelope<OpportunitySummary>>({
    queryKey: `opportunities:list-page:${limit}`,
    fetcher: () => fetchOpportunitiesPage({ limit }),
    intervalMs: 5000,
    initialData: emptyPage<OpportunitySummary>(limit),
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

export function mergeOpportunityEventFeed(
  streamedEvents: OpportunityStreamEvent[],
  recentEvents: OpportunityEvent[],
  limit = 14,
): OpportunityStreamEvent[] {
  const merged = [...streamedEvents, ...(recentEvents as OpportunityStreamEvent[])];
  const seen = new Set<string>();
  return merged
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export interface OpportunityWorkbenchDataOptions {
  opportunityLimit?: number;
  inboxLimit?: number;
  eventLimit?: number;
  streamLimit?: number;
  refreshQueue?: () => Promise<unknown>;
  refreshMissionList?: () => Promise<unknown>;
}

export function useOpportunityWorkbenchData({
  opportunityLimit = 60,
  inboxLimit = 10,
  eventLimit = 20,
  streamLimit = 20,
  refreshQueue,
  refreshMissionList,
}: OpportunityWorkbenchDataOptions = {}) {
  const { data: opportunityPage } = useOpportunityListPageQuery(opportunityLimit);
  const { data: boardHealth } = useOpportunityBoardHealthQuery(opportunityLimit);
  const { data: inbox } = useOpportunityInboxQuery(inboxLimit);
  const { data: recentEvents } = useOpportunityEventsQuery(eventLimit);
  const { events: streamedEvents, isConnected } = useOpportunityStream(streamLimit);
  const opportunities = opportunityPage?.items;
  const opportunityPageInfo = opportunityPage?.pageInfo ?? null;

  const {
    liveInbox,
    liveOpportunities,
    liveBoardHealth,
    setLiveBoardHealth,
    upsertInboxItem,
    removeInboxItem,
    upsertOpportunity,
  } = useOpportunityLiveStore({
    inboxSnapshot: inbox,
    opportunitySnapshot: opportunities,
    boardHealthSnapshot: boardHealth,
    inboxLimit,
    opportunityLimit,
  });

  const refreshInboxItem = useCallback(async (id: string) => {
    const item = await fetchOpportunityInboxItem(id);
    if (item) {
      upsertInboxItem(item);
    } else {
      removeInboxItem(id);
    }
    return item;
  }, [removeInboxItem, upsertInboxItem]);

  const refreshOpportunity = useCallback(async (id: string) => {
    const item = await fetchOpportunityDetail(id);
    if (item) {
      upsertOpportunity(item);
    }
    return item;
  }, [upsertOpportunity]);

  const refreshBoardHealth = useCallback(async () => {
    const next = await fetchOpportunityBoardHealth(opportunityLimit);
    if (next) {
      setLiveBoardHealth(next);
    }
    return next;
  }, [opportunityLimit, setLiveBoardHealth]);

  useOpportunityLiveUpdates({
    streamedEvents,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
    refreshQueue,
    refreshMissionList,
  });

  const eventFeed = useMemo(() => (
    mergeOpportunityEventFeed(streamedEvents, recentEvents || [], 14)
  ), [recentEvents, streamedEvents]);

  return {
    liveInbox,
    liveOpportunities,
    liveBoardHealth,
    opportunityPageInfo,
    eventFeed,
    streamedEvents,
    isConnected,
    setLiveBoardHealth,
    upsertInboxItem,
    removeInboxItem,
    upsertOpportunity,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
  };
}
