import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchOpportunities,
  fetchOpportunityBoardHealth,
  fetchOpportunityDetail,
  fetchOpportunityEvents,
  fetchOpportunityInbox,
  fetchOpportunityInboxItem,
  type OpportunityBoardHealthMap,
  type OpportunityEvent,
  type OpportunityInboxItem,
  type OpportunitySummary,
} from '../api';
import { useOpportunityStream, type OpportunityStreamEvent } from '../hooks/useAgentStream';
import {
  mergeInboxItem,
  mergeOpportunitySummary,
  shouldRefreshInboxItem,
  shouldRefreshOpportunitySummary,
} from '../pages/opportunity-workbench/live';
import { mergeSnapshotPreservingFresh, usePollingQuery } from './query-client';

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
}

export function useOpportunityWorkbenchData({
  opportunityLimit = 60,
  inboxLimit = 10,
  eventLimit = 20,
  streamLimit = 20,
}: OpportunityWorkbenchDataOptions = {}) {
  const [liveInbox, setLiveInbox] = useState<OpportunityInboxItem[]>([]);
  const [liveOpportunities, setLiveOpportunities] = useState<OpportunitySummary[]>([]);
  const [liveBoardHealth, setLiveBoardHealth] = useState<OpportunityBoardHealthMap | null>(null);
  const processedInboxEvents = useRef<Set<string>>(new Set());
  const processedOpportunityEvents = useRef<Set<string>>(new Set());

  const { data: opportunities } = useOpportunityListQuery(opportunityLimit);
  const { data: boardHealth } = useOpportunityBoardHealthQuery(opportunityLimit);
  const { data: inbox } = useOpportunityInboxQuery(inboxLimit);
  const { data: recentEvents } = useOpportunityEventsQuery(eventLimit);
  const { events: streamedEvents, isConnected } = useOpportunityStream(streamLimit);

  useEffect(() => {
    if (inbox) {
      setLiveInbox((current) => mergeSnapshotPreservingFresh(current, inbox, inboxLimit));
    }
  }, [inbox, inboxLimit]);

  useEffect(() => {
    if (opportunities) {
      setLiveOpportunities((current) => (
        mergeSnapshotPreservingFresh(current, opportunities, opportunityLimit)
      ));
    }
  }, [opportunities, opportunityLimit]);

  useEffect(() => {
    if (boardHealth) {
      setLiveBoardHealth(boardHealth);
    }
  }, [boardHealth]);

  const upsertInboxItem = useCallback((item: OpportunityInboxItem | null) => {
    setLiveInbox((current) => mergeInboxItem(current, item, inboxLimit));
  }, [inboxLimit]);

  const removeInboxItem = useCallback((id: string) => {
    setLiveInbox((current) => current.filter((item) => item.id !== id));
  }, []);

  const upsertOpportunity = useCallback((item: OpportunitySummary | null) => {
    setLiveOpportunities((current) => mergeOpportunitySummary(current, item, opportunityLimit));
  }, [opportunityLimit]);

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
  }, [opportunityLimit]);

  useEffect(() => {
    const latestEvent = streamedEvents[0];
    if (!latestEvent || !shouldRefreshInboxItem(latestEvent)) return;
    if (processedInboxEvents.current.has(latestEvent.id)) return;

    processedInboxEvents.current.add(latestEvent.id);
    void refreshInboxItem(latestEvent.opportunityId);
  }, [refreshInboxItem, streamedEvents]);

  useEffect(() => {
    const latestEvent = streamedEvents[0];
    if (!latestEvent || !shouldRefreshOpportunitySummary(latestEvent)) return;
    if (processedOpportunityEvents.current.has(latestEvent.id)) return;

    processedOpportunityEvents.current.add(latestEvent.id);
    void refreshOpportunity(latestEvent.opportunityId);
    void refreshBoardHealth();
  }, [refreshBoardHealth, refreshOpportunity, streamedEvents]);

  const eventFeed = useMemo(() => (
    mergeOpportunityEventFeed(streamedEvents, recentEvents || [], 14)
  ), [recentEvents, streamedEvents]);

  return {
    liveInbox,
    liveOpportunities,
    liveBoardHealth,
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
