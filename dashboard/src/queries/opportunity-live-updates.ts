import { useEffect, useRef } from 'react';
import type {
  OpportunityBoardHealthMap,
  OpportunityInboxItem,
  OpportunitySummary,
} from '../api';
import type { OpportunityStreamEvent } from '../hooks/useAgentStream';

export interface OpportunityQueryInvalidation {
  inboxItem: boolean;
  opportunitySummary: boolean;
  boardHealth: boolean;
  queue: boolean;
  missionList: boolean;
}

export interface OpportunityLiveRefreshPlan {
  inboxIds: string[];
  opportunityIds: string[];
  boardHealth: boolean;
  queue: boolean;
  missionList: boolean;
}

const INBOX_INVALIDATION_EVENTS = new Set<OpportunityStreamEvent['type']>([
  'thesis_upgraded',
  'thesis_degraded',
  'leader_broken',
  'relay_triggered',
  'proxy_ignited',
  'catalyst_due',
  'catalyst_reminder_updated',
  'mission_failed',
  'mission_canceled',
  'mission_completed',
  'mission_queued',
]);

const MISSION_INVALIDATION_EVENTS = new Set<OpportunityStreamEvent['type']>([
  'mission_linked',
  'mission_queued',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
]);

const QUEUE_INVALIDATION_EVENTS = new Set<OpportunityStreamEvent['type']>([
  'mission_queued',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
]);

export function opportunityInvalidationsForEvent(
  event: OpportunityStreamEvent,
): OpportunityQueryInvalidation {
  const hasTarget = Boolean(event.opportunityId);
  return {
    inboxItem: hasTarget && INBOX_INVALIDATION_EVENTS.has(event.type),
    opportunitySummary: hasTarget,
    boardHealth: hasTarget,
    queue: QUEUE_INVALIDATION_EVENTS.has(event.type),
    missionList: MISSION_INVALIDATION_EVENTS.has(event.type),
  };
}

export function createOpportunityLiveRefreshPlan(
  streamedEvents: OpportunityStreamEvent[],
  processedEventIds: Set<string>,
): OpportunityLiveRefreshPlan {
  const inboxIds = new Set<string>();
  const opportunityIds = new Set<string>();
  let boardHealth = false;
  let queue = false;
  let missionList = false;

  streamedEvents.forEach((event) => {
    if (processedEventIds.has(event.id)) return;
    processedEventIds.add(event.id);

    const invalidations = opportunityInvalidationsForEvent(event);
    if (invalidations.inboxItem) inboxIds.add(event.opportunityId);
    if (invalidations.opportunitySummary) opportunityIds.add(event.opportunityId);
    if (invalidations.boardHealth) boardHealth = true;
    if (invalidations.queue) queue = true;
    if (invalidations.missionList) missionList = true;
  });

  return {
    inboxIds: [...inboxIds],
    opportunityIds: [...opportunityIds],
    boardHealth,
    queue,
    missionList,
  };
}

export interface OpportunityLiveUpdateOptions {
  streamedEvents: OpportunityStreamEvent[];
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshOpportunity: (id: string) => Promise<OpportunitySummary | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
  refreshQueue?: () => Promise<unknown>;
  refreshMissionList?: () => Promise<unknown>;
}

export function useOpportunityLiveUpdates({
  streamedEvents,
  refreshInboxItem,
  refreshOpportunity,
  refreshBoardHealth,
  refreshQueue,
  refreshMissionList,
}: OpportunityLiveUpdateOptions) {
  const processedEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    const plan = createOpportunityLiveRefreshPlan(streamedEvents, processedEvents.current);
    const refreshes: Promise<unknown>[] = [];

    plan.inboxIds.forEach((id) => {
      refreshes.push(refreshInboxItem(id));
    });
    plan.opportunityIds.forEach((id) => {
      refreshes.push(refreshOpportunity(id));
    });
    if (plan.boardHealth) {
      refreshes.push(refreshBoardHealth());
    }
    if (plan.queue && refreshQueue) {
      refreshes.push(refreshQueue());
    }
    if (plan.missionList && refreshMissionList) {
      refreshes.push(refreshMissionList());
    }
    if (refreshes.length > 0) {
      void Promise.allSettled(refreshes);
    }
  }, [
    refreshBoardHealth,
    refreshInboxItem,
    refreshMissionList,
    refreshOpportunity,
    refreshQueue,
    streamedEvents,
  ]);
}
