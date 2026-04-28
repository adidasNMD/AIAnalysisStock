import { useCallback, useMemo } from 'react';
import type {
  HeatTransferGraph,
  OpportunityBoardHealthMap,
  OpportunityBoardType,
  OpportunityInboxItem,
  OpportunitySummary,
  TaskQueueResponse,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import {
  buildBoardLiveSignal,
  buildExtraTemplates,
  buildLaneLiveSignal,
  buildLanePriorityView,
  buildWorkbenchPulse,
  laneForInboxItem,
} from './live';
import type { InboxLane } from './model';
import {
  buildInboxPrimaryAction,
  buildLaneActionPreview,
  buildLaneInsight,
  fallbackBoardHealthSummary,
} from './selectors';
import { filterOpportunitiesBySearch } from './view-state';
import { buildCatalystReminders } from './catalyst-reminders';
import { buildStrategyReviewDigest } from './review-digest';

const EMPTY_OPPORTUNITIES: OpportunitySummary[] = [];
const EMPTY_INBOX: OpportunityInboxItem[] = [];
const EMPTY_EVENTS: OpportunityStreamEvent[] = [];
const EMPTY_STREAM_EVENTS: OpportunityStreamEvent[] = [];
const EMPTY_HEAT_GRAPHS: HeatTransferGraph[] = [];

type WorkbenchDerivedStateInput = {
  liveOpportunities?: OpportunitySummary[] | null;
  liveInbox?: OpportunityInboxItem[] | null;
  liveBoardHealth?: OpportunityBoardHealthMap | null;
  eventFeed?: OpportunityStreamEvent[] | null;
  streamedEvents?: OpportunityStreamEvent[] | null;
  queue?: TaskQueueResponse | null;
  heatGraphs?: HeatTransferGraph[] | null;
  searchQuery: string;
  liveNow: number;
};

export function useOpportunityWorkbenchDerivedState({
  liveOpportunities,
  liveInbox,
  liveBoardHealth,
  eventFeed,
  streamedEvents,
  queue,
  heatGraphs,
  searchQuery,
  liveNow,
}: WorkbenchDerivedStateInput) {
  const opportunityEvents = eventFeed || EMPTY_EVENTS;
  const streamEvents = streamedEvents || EMPTY_STREAM_EVENTS;
  const visibleOpportunities = useMemo(
    () => filterOpportunitiesBySearch(liveOpportunities || EMPTY_OPPORTUNITIES, searchQuery),
    [liveOpportunities, searchQuery],
  );
  const visibleInbox = useMemo(
    () => filterOpportunitiesBySearch(liveInbox || EMPTY_INBOX, searchQuery),
    [liveInbox, searchQuery],
  );
  const catalystReminders = useMemo(
    () => buildCatalystReminders(visibleOpportunities, liveNow, 6),
    [liveNow, visibleOpportunities],
  );
  const strategyReviewDigest = useMemo(
    () => buildStrategyReviewDigest(visibleOpportunities, opportunityEvents, liveNow, 8),
    [opportunityEvents, liveNow, visibleOpportunities],
  );

  const groups = useMemo<Record<OpportunityBoardType, OpportunitySummary[]>>(() => ({
    ipo_spinout: visibleOpportunities.filter((item) => item.type === 'ipo_spinout'),
    relay_chain: visibleOpportunities.filter((item) => item.type === 'relay_chain'),
    proxy_narrative: visibleOpportunities.filter((item) => item.type === 'proxy_narrative'),
  }), [visibleOpportunities]);

  const summary = useMemo(() => ({
    total: visibleOpportunities.length,
    ready: visibleOpportunities.filter((item) => item.status === 'ready').length,
    active: visibleOpportunities.filter((item) => item.status === 'active').length,
  }), [visibleOpportunities]);

  const opportunityMap = useMemo(
    () => new Map(visibleOpportunities.map((item) => [item.id, item])),
    [visibleOpportunities],
  );
  const coreStats = useMemo(() => ({
    running: queue?.tasks.filter((task) => task.status === 'running').length || 0,
    pending: queue?.tasks.filter((task) => task.status === 'pending').length || 0,
  }), [queue]);
  const relaySnapshots = useMemo(() => (heatGraphs || EMPTY_HEAT_GRAPHS).slice(0, 4), [heatGraphs]);

  const inboxLanes = useMemo(() => ({
    act: buildLanePriorityView(
      'act',
      visibleInbox.filter((item) => laneForInboxItem(item) === 'act'),
      streamEvents,
      liveNow,
    ),
    review: buildLanePriorityView(
      'review',
      visibleInbox.filter((item) => laneForInboxItem(item) === 'review'),
      streamEvents,
      liveNow,
    ),
    monitor: buildLanePriorityView(
      'monitor',
      visibleInbox.filter((item) => laneForInboxItem(item) === 'monitor'),
      streamEvents,
      liveNow,
    ),
  }), [liveNow, streamEvents, visibleInbox]);

  const laneLiveSignals = useMemo(() => ({
    act: buildLaneLiveSignal('act', streamEvents, liveNow),
    review: buildLaneLiveSignal('review', streamEvents, liveNow),
    monitor: buildLaneLiveSignal('monitor', streamEvents, liveNow),
  }), [liveNow, streamEvents]);

  const laneInsights = useMemo(() => ({
    act: buildLaneInsight(inboxLanes.act.items, 'act', laneLiveSignals.act),
    review: buildLaneInsight(inboxLanes.review.items, 'review', laneLiveSignals.review),
    monitor: buildLaneInsight(inboxLanes.monitor.items, 'monitor', laneLiveSignals.monitor),
  }), [inboxLanes, laneLiveSignals]);

  const laneActionPreviews = useMemo(() => ({
    act: buildLaneActionPreview('act', streamEvents, opportunityMap, liveNow),
    review: buildLaneActionPreview('review', streamEvents, opportunityMap, liveNow),
    monitor: buildLaneActionPreview('monitor', streamEvents, opportunityMap, liveNow),
  }), [liveNow, opportunityMap, streamEvents]);

  const boardLiveSignals = useMemo(() => ({
    ipo_spinout: buildBoardLiveSignal('ipo_spinout', streamEvents, opportunityMap, liveNow),
    relay_chain: buildBoardLiveSignal('relay_chain', streamEvents, opportunityMap, liveNow),
    proxy_narrative: buildBoardLiveSignal('proxy_narrative', streamEvents, opportunityMap, liveNow),
  }), [liveNow, opportunityMap, streamEvents]);

  const workbenchPulse = useMemo(
    () => buildWorkbenchPulse(laneLiveSignals, boardLiveSignals),
    [boardLiveSignals, laneLiveSignals],
  );

  const boardHealthMap = useMemo(() => liveBoardHealth || {
    ipo_spinout: fallbackBoardHealthSummary('ipo_spinout', groups.ipo_spinout),
    relay_chain: fallbackBoardHealthSummary('relay_chain', groups.relay_chain),
    proxy_narrative: fallbackBoardHealthSummary('proxy_narrative', groups.proxy_narrative),
  }, [groups, liveBoardHealth]);

  const resolveLanePrimaryTarget = useCallback((lane: InboxLane) => {
    const lanePreview = laneActionPreviews[lane];
    const laneTopItem = inboxLanes[lane].items[0] || null;
    const opportunity = lanePreview?.opportunity || laneTopItem;
    const action = lanePreview?.action || (laneTopItem ? buildInboxPrimaryAction(laneTopItem) : null);

    if (!opportunity || !action) return null;
    return { opportunity, action };
  }, [inboxLanes, laneActionPreviews]);

  const pulsePrimaryTarget = useMemo(() => {
    const lane = workbenchPulse.targetLane;
    if (!lane) return null;
    return resolveLanePrimaryTarget(lane);
  }, [resolveLanePrimaryTarget, workbenchPulse.targetLane]);

  const pulseSecondaryTemplates = useMemo(() => {
    if (!pulsePrimaryTarget) return [];
    return buildExtraTemplates(
      pulsePrimaryTarget.opportunity,
      pulsePrimaryTarget.action.template?.id,
      2,
    );
  }, [pulsePrimaryTarget]);

  return {
    visibleOpportunities,
    visibleInbox,
    catalystReminders,
    strategyReviewDigest,
    groups,
    summary,
    coreStats,
    relaySnapshots,
    inboxLanes,
    laneLiveSignals,
    laneInsights,
    laneActionPreviews,
    boardLiveSignals,
    workbenchPulse,
    boardHealthMap,
    resolveLanePrimaryTarget,
    pulsePrimaryTarget,
    pulseSecondaryTemplates,
    streamEvents,
  };
}
