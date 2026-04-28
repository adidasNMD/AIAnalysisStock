import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Radar } from 'lucide-react';
import {
  createMission,
  createOpportunity,
  fetchOpportunityBoardHealth,
  fetchOpportunityDetail,
  fetchOpportunityInboxItem,
  fetchOpportunityInbox,
  fetchOpportunityEvents,
  fetchOpportunities,
  fetchQueue,
  fetchHeatTransferGraphs,
  refreshNewCodeRadar,
  retryMission,
  syncHeatTransferGraphs,
  updateOpportunity,
  type HeatTransferGraph,
  type OpportunityBoardHealthMap,
  type OpportunityBoardType,
  type OpportunitySuggestedMission,
  type OpportunityInboxItem,
  type OpportunitySummary,
  type UpdateOpportunityInput,
} from '../api';
import { useOpportunityStream, usePolling, type OpportunityStreamEvent } from '../hooks/useAgentStream';
import {
  BOARD_FILTER_QUERY_KEYS,
  BOARD_TYPES,
  DRAFT_STORAGE_KEY,
  createDraftState,
  isEditableTarget,
  readStoredDraft,
  sameBoardFilters,
  statusTone,
  timelineDecisionLabel,
  timelineDecisionTone,
  timelineDriverLabel,
  typeMeta,
} from './opportunity-workbench/model';
import type {
  BoardFilterState,
  DraftState,
  InboxLane,
  OpportunityPrimaryAction,
} from './opportunity-workbench/model';
import {
  buildBoardLiveSignal,
  buildExtraTemplates,
  buildLaneLiveSignal,
  buildLanePriorityView,
  buildLiveRankBadge,
  buildWorkbenchPulse,
  formatLiveAge,
  laneForInboxItem,
  liveSignalLabel,
  mergeInboxItem,
  mergeOpportunitySummary,
  shouldRefreshInboxItem,
  shouldRefreshOpportunitySummary,
} from './opportunity-workbench/live';
import {
  buildInboxPrimaryAction,
  buildIpoProfile,
  buildLaneActionPreview,
  buildLaneInsight,
  buildMissionInput,
  fallbackBoardHealthSummary,
  parseTickers,
} from './opportunity-workbench/selectors';
import { ActionInbox } from './opportunity-workbench/ActionInbox';
import { CreateOpportunityPanel } from './opportunity-workbench/CreateOpportunityPanel';
import { EventFeed } from './opportunity-workbench/EventFeed';
import { OpportunityDetailDrawer } from './opportunity-workbench/OpportunityDetailDrawer';
import { OpportunityBoardGrid } from './opportunity-workbench/OpportunityBoardGrid';
import { RelaySnapshotStrip } from './opportunity-workbench/RelaySnapshotStrip';
import { WorkbenchViewBar } from './opportunity-workbench/WorkbenchViewBar';
import { CatalystReminderStrip } from './opportunity-workbench/CatalystReminderStrip';
import { MissionRecoveryPanel } from './opportunity-workbench/MissionRecoveryPanel';
import { PreTradeChecklistBlock } from './opportunity-workbench/PreTradeChecklistBlock';
import { ScoreExplanationBlock } from './opportunity-workbench/ScoreExplanationBlock';
import { StrategyReviewPanel } from './opportunity-workbench/StrategyReviewPanel';
import type { MissionRecoveryAction } from './opportunity-workbench/recovery';
import { recoveryTickers } from './opportunity-workbench/recovery';
import {
  buildSavedViewLabel,
  cleanBoardFilters,
  countBoardFilters,
  filterOpportunitiesBySearch,
  normalizeWorkbenchSearchQuery,
  readStoredWorkbenchViews,
  writeStoredWorkbenchViews,
  type WorkbenchSavedView,
} from './opportunity-workbench/view-state';
import { buildCatalystReminders } from './opportunity-workbench/catalyst-reminders';
import { buildStrategyReviewDigest } from './opportunity-workbench/review-digest';

export function OpportunityWorkbench() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<DraftState>(() => readStoredDraft() || createDraftState('relay_chain'));
  const [submitting, setSubmitting] = useState<'save' | 'analyze' | null>(null);
  const [automationAction, setAutomationAction] = useState<'radar' | 'graph' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [liveInbox, setLiveInbox] = useState<OpportunityInboxItem[]>([]);
  const [liveOpportunities, setLiveOpportunities] = useState<OpportunitySummary[]>([]);
  const [liveBoardHealth, setLiveBoardHealth] = useState<OpportunityBoardHealthMap | null>(null);
  const [activeBoardFilters, setActiveBoardFilters] = useState<BoardFilterState>({});
  const [searchQuery, setSearchQuery] = useState(() => normalizeWorkbenchSearchQuery(searchParams.get('q')));
  const [focusedLane, setFocusedLane] = useState<InboxLane | null>(null);
  const [viewLane, setViewLane] = useState<InboxLane | null>(null);
  const [savedViews, setSavedViews] = useState<WorkbenchSavedView[]>(() => readStoredWorkbenchViews());
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [detailOpportunity, setDetailOpportunity] = useState<OpportunitySummary | null>(null);
  const [detailSavingId, setDetailSavingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [recoveringMissionActionKey, setRecoveringMissionActionKey] = useState<string | null>(null);
  const processedInboxEvents = useRef<Set<string>>(new Set());
  const processedOpportunityEvents = useRef<Set<string>>(new Set());
  const laneFocusTimeoutRef = useRef<number | null>(null);
  const laneRefs = useRef<Record<InboxLane, HTMLElement | null>>({
    act: null,
    review: null,
    monitor: null,
  });

  const { data: opportunities } = usePolling<OpportunitySummary[]>(() => fetchOpportunities(60), 5000, []);
  const { data: boardHealth } = usePolling<OpportunityBoardHealthMap | null>(() => fetchOpportunityBoardHealth(60), 5000, []);
  const { data: inbox } = usePolling<OpportunityInboxItem[]>(() => fetchOpportunityInbox(10), 5000, []);
  const { data: recentEvents } = usePolling(() => fetchOpportunityEvents(20), 8000, []);
  const { data: queue } = usePolling(() => fetchQueue(), 5000, []);
  const { data: heatGraphs } = usePolling<HeatTransferGraph[]>(() => fetchHeatTransferGraphs(), 10000, []);
  const { events: streamedEvents, isConnected } = useOpportunityStream(20);

  const syncWorkbenchViewState = (
    nextSearchQuery: string,
    nextFilters: BoardFilterState,
    replace = false,
  ) => {
    const normalizedQuery = normalizeWorkbenchSearchQuery(nextSearchQuery);
    const normalizedFilters = cleanBoardFilters(nextFilters);
    setSearchQuery(normalizedQuery);
    setActiveBoardFilters(normalizedFilters);
    const nextParams = new URLSearchParams(searchParams);
    if (normalizedQuery) {
      nextParams.set('q', normalizedQuery);
    } else {
      nextParams.delete('q');
    }
    BOARD_TYPES.forEach((type) => {
      const value = normalizedFilters[type];
      const queryKey = BOARD_FILTER_QUERY_KEYS[type];
      if (value) {
        nextParams.set(queryKey, value);
      } else {
        nextParams.delete(queryKey);
      }
    });
    setSearchParams(nextParams, { replace });
  };

  const syncBoardFilters = (nextFilters: BoardFilterState, replace = false) => {
    syncWorkbenchViewState(searchQuery, nextFilters, replace);
    setActiveSavedViewId(null);
  };

  const syncSearchQuery = (nextQuery: string, replace = false) => {
    syncWorkbenchViewState(nextQuery, activeBoardFilters, replace);
    setActiveSavedViewId(null);
  };

  const focusLane = useCallback((lane?: InboxLane | null) => {
    if (!lane) return;
    setFocusedLane(lane);
    if (laneFocusTimeoutRef.current) {
      window.clearTimeout(laneFocusTimeoutRef.current);
    }
    laneFocusTimeoutRef.current = window.setTimeout(() => {
      setFocusedLane((current) => (current === lane ? null : current));
      laneFocusTimeoutRef.current = null;
    }, 2400);
    laneRefs.current[lane]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (laneFocusTimeoutRef.current) {
      window.clearTimeout(laneFocusTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (inbox) {
      setLiveInbox(inbox);
    }
  }, [inbox]);

  useEffect(() => {
    if (opportunities) {
      setLiveOpportunities(opportunities);
    }
  }, [opportunities]);

  useEffect(() => {
    if (boardHealth) {
      setLiveBoardHealth(boardHealth);
    }
  }, [boardHealth]);

  useEffect(() => {
    const nextFilters: BoardFilterState = {};
    let normalized = false;
    const nextParams = new URLSearchParams(searchParams);

    BOARD_TYPES.forEach((type) => {
      const value = searchParams.get(BOARD_FILTER_QUERY_KEYS[type]);
      if (!value) return;
      const exists = liveBoardHealth
        ? liveBoardHealth[type].metrics.some((metric) => metric.key === value && metric.opportunityIds.length > 0)
        : true;

      if (exists) {
        nextFilters[type] = value;
      } else {
        nextParams.delete(BOARD_FILTER_QUERY_KEYS[type]);
        normalized = true;
      }
    });

    setActiveBoardFilters((current) => (sameBoardFilters(current, nextFilters) ? current : nextFilters));

    if (normalized) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [liveBoardHealth, searchParams, setSearchParams]);

  useEffect(() => {
    const nextQuery = normalizeWorkbenchSearchQuery(searchParams.get('q'));
    setSearchQuery((current) => (current === nextQuery ? current : nextQuery));
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    const latestEvent = streamedEvents?.[0];
    if (!latestEvent || !shouldRefreshInboxItem(latestEvent)) return;
    if (processedInboxEvents.current.has(latestEvent.id)) return;

    processedInboxEvents.current.add(latestEvent.id);
    void fetchOpportunityInboxItem(latestEvent.opportunityId).then((item) => {
      if (!item) return;
      setLiveInbox((current) => mergeInboxItem(current, item, 10));
    });
  }, [streamedEvents]);

  useEffect(() => {
    const latestEvent = streamedEvents?.[0];
    if (!latestEvent || !shouldRefreshOpportunitySummary(latestEvent)) return;
    if (processedOpportunityEvents.current.has(latestEvent.id)) return;

    processedOpportunityEvents.current.add(latestEvent.id);
    void fetchOpportunityDetail(latestEvent.opportunityId).then((item) => {
      if (!item) return;
      setLiveOpportunities((current) => mergeOpportunitySummary(current, item, 60));
    });
    void fetchOpportunityBoardHealth(60).then((next) => {
      if (!next) return;
      setLiveBoardHealth(next);
    });
  }, [streamedEvents]);

  const eventFeed = useMemo(() => {
    const merged = [...(streamedEvents || []), ...((recentEvents || []) as typeof streamedEvents)];
    const seen = new Set<string>();
    return merged.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 14);
  }, [recentEvents, streamedEvents]);

  const visibleOpportunities = useMemo(
    () => filterOpportunitiesBySearch(liveOpportunities || [], searchQuery),
    [liveOpportunities, searchQuery],
  );
  const visibleInbox = useMemo(
    () => filterOpportunitiesBySearch(liveInbox || [], searchQuery),
    [liveInbox, searchQuery],
  );
  const catalystReminders = useMemo(
    () => buildCatalystReminders(visibleOpportunities, liveNow, 6),
    [liveNow, visibleOpportunities],
  );
  const strategyReviewDigest = useMemo(
    () => buildStrategyReviewDigest(visibleOpportunities, eventFeed, liveNow, 8),
    [eventFeed, liveNow, visibleOpportunities],
  );

  const groups = useMemo(() => ({
    ipo_spinout: visibleOpportunities.filter((item) => item.type === 'ipo_spinout'),
    relay_chain: visibleOpportunities.filter((item) => item.type === 'relay_chain'),
    proxy_narrative: visibleOpportunities.filter((item) => item.type === 'proxy_narrative'),
  }), [visibleOpportunities]);

  const summary = useMemo(() => ({
    total: visibleOpportunities.length,
    ready: visibleOpportunities.filter((item) => item.status === 'ready').length,
    active: visibleOpportunities.filter((item) => item.status === 'active').length,
    degraded: visibleOpportunities.filter((item) => item.status === 'degraded').length,
  }), [visibleOpportunities]);
  const opportunityMap = useMemo(() => new Map(visibleOpportunities.map((item) => [item.id, item])), [visibleOpportunities]);
  const coreStats = useMemo(() => ({
    running: queue?.tasks.filter((task) => task.status === 'running').length || 0,
    pending: queue?.tasks.filter((task) => task.status === 'pending').length || 0,
  }), [queue]);
  const relaySnapshots = useMemo(() => (heatGraphs || []).slice(0, 4), [heatGraphs]);
  const inboxLanes = useMemo(() => ({
    act: buildLanePriorityView(
      'act',
      visibleInbox.filter((item) => laneForInboxItem(item) === 'act'),
      streamedEvents || [],
      liveNow,
    ),
    review: buildLanePriorityView(
      'review',
      visibleInbox.filter((item) => laneForInboxItem(item) === 'review'),
      streamedEvents || [],
      liveNow,
    ),
    monitor: buildLanePriorityView(
      'monitor',
      visibleInbox.filter((item) => laneForInboxItem(item) === 'monitor'),
      streamedEvents || [],
      liveNow,
    ),
  }), [liveNow, streamedEvents, visibleInbox]);
  const laneLiveSignals = useMemo(() => ({
    act: buildLaneLiveSignal('act', streamedEvents || [], liveNow),
    review: buildLaneLiveSignal('review', streamedEvents || [], liveNow),
    monitor: buildLaneLiveSignal('monitor', streamedEvents || [], liveNow),
  }), [liveNow, streamedEvents]);
  const laneInsights = useMemo(() => ({
    act: buildLaneInsight(inboxLanes.act.items, 'act', laneLiveSignals.act),
    review: buildLaneInsight(inboxLanes.review.items, 'review', laneLiveSignals.review),
    monitor: buildLaneInsight(inboxLanes.monitor.items, 'monitor', laneLiveSignals.monitor),
  }), [inboxLanes, laneLiveSignals]);
  const laneActionPreviews = useMemo(() => ({
    act: buildLaneActionPreview('act', streamedEvents || [], opportunityMap, liveNow),
    review: buildLaneActionPreview('review', streamedEvents || [], opportunityMap, liveNow),
    monitor: buildLaneActionPreview('monitor', streamedEvents || [], opportunityMap, liveNow),
  }), [liveNow, opportunityMap, streamedEvents]);
  const boardLiveSignals = useMemo(() => ({
    ipo_spinout: buildBoardLiveSignal('ipo_spinout', streamedEvents || [], opportunityMap, liveNow),
    relay_chain: buildBoardLiveSignal('relay_chain', streamedEvents || [], opportunityMap, liveNow),
    proxy_narrative: buildBoardLiveSignal('proxy_narrative', streamedEvents || [], opportunityMap, liveNow),
  }), [liveNow, opportunityMap, streamedEvents]);
  const workbenchPulse = useMemo(
    () => buildWorkbenchPulse(laneLiveSignals, boardLiveSignals),
    [boardLiveSignals, laneLiveSignals],
  );
  const boardHealthMap = useMemo(() => liveBoardHealth || {
    ipo_spinout: fallbackBoardHealthSummary('ipo_spinout', groups.ipo_spinout),
    relay_chain: fallbackBoardHealthSummary('relay_chain', groups.relay_chain),
    proxy_narrative: fallbackBoardHealthSummary('proxy_narrative', groups.proxy_narrative),
  }, [groups, liveBoardHealth]);
  const activeFilterCount = useMemo(() => countBoardFilters(activeBoardFilters), [activeBoardFilters]);

  const focusWorkbenchLane = (lane: InboxLane | null) => {
    setViewLane(lane);
    setActiveSavedViewId(null);
    if (lane) {
      focusLane(lane);
    }
  };

  const saveCurrentWorkbenchView = () => {
    const now = new Date().toISOString();
    const snapshot = {
      searchQuery,
      boardFilters: activeBoardFilters,
      focusLane: viewLane,
    };
    const view: WorkbenchSavedView = {
      id: activeSavedViewId || `view_${Date.now().toString(36)}`,
      label: buildSavedViewLabel(snapshot),
      ...snapshot,
      createdAt: savedViews.find((item) => item.id === activeSavedViewId)?.createdAt || now,
      updatedAt: now,
    };
    const nextViews = [view, ...savedViews.filter((item) => item.id !== view.id)].slice(0, 8);
    setSavedViews(nextViews);
    writeStoredWorkbenchViews(nextViews);
    setActiveSavedViewId(view.id);
  };

  const applyWorkbenchView = (view: WorkbenchSavedView) => {
    setActiveSavedViewId(view.id);
    setViewLane(view.focusLane);
    syncWorkbenchViewState(view.searchQuery, view.boardFilters);
    if (view.focusLane) {
      window.requestAnimationFrame(() => focusLane(view.focusLane));
    }
  };

  const deleteWorkbenchView = (viewId: string) => {
    const nextViews = savedViews.filter((view) => view.id !== viewId);
    setSavedViews(nextViews);
    writeStoredWorkbenchViews(nextViews);
    if (activeSavedViewId === viewId) {
      setActiveSavedViewId(null);
    }
  };

  const resetWorkbenchView = () => {
    setViewLane(null);
    setActiveSavedViewId(null);
    syncWorkbenchViewState('', {}, true);
  };

  const toggleBoardFilter = (type: OpportunityBoardType, metricKey: string, count: number) => {
    if (metricKey === 'cards' || count === 0) return;
    const nextFilters = {
      ...activeBoardFilters,
      [type]: activeBoardFilters[type] === metricKey ? null : metricKey,
    };
    syncBoardFilters(nextFilters);
  };

  const applyTemplate = (type: DraftState['type']) => {
    setDraft((current) => createDraftState(type, {
      title: current.title,
      query: current.query,
    }));
    setActionError(null);
  };

  const persistOpportunity = async (mode: 'save' | 'analyze') => {
    const draftTitle = (draft.title || '').trim();
    const draftQuery = (draft.query || '').trim();
    if (!draftTitle && !draftQuery) return;
    setSubmitting(mode);
    setActionError(null);

    try {
      const created = await createOpportunity({
        type: draft.type,
        title: draftTitle || draftQuery,
        query: draftQuery || draftTitle,
        thesis: draft.thesis?.trim() || undefined,
        stage: draft.stage,
        status: draft.status,
        primaryTicker: draft.primaryTicker?.trim() || undefined,
        leaderTicker: draft.leaderTicker?.trim() || undefined,
        proxyTicker: draft.proxyTicker?.trim() || undefined,
        relatedTickers: parseTickers(draft.relatedTickersText),
        relayTickers: parseTickers(draft.relayTickersText),
        nextCatalystAt: draft.nextCatalystAt?.trim() || undefined,
        supplyOverhang: draft.supplyOverhang?.trim() || undefined,
        policyStatus: draft.policyStatus?.trim() || undefined,
        ...(buildIpoProfile(draft) ? { ipoProfile: buildIpoProfile(draft) } : {}),
      });

      if (mode === 'analyze') {
        const missionInput = buildMissionInput({ ...draft, title: created.title, query: created.query });
        const mission = await createMission(
          missionInput.mode,
          missionInput.query,
          missionInput.tickers,
          missionInput.depth || 'deep',
          created.id,
          missionInput.source || 'manual',
        );
        navigate(`/missions/${mission.missionId}`);
      } else {
        setDraft(createDraftState(draft.type));
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '机会创建失败');
    }

    setSubmitting(null);
  };

  const launchOpportunityAnalysis = useCallback(async (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => {
    setActionError(null);
    try {
      const missionInput = suggested || buildMissionInput(opportunity);
      const mission = await createMission(
        missionInput.mode,
        missionInput.query,
        missionInput.tickers,
        missionInput.depth || 'deep',
        opportunity.id,
        missionInput.source || 'manual',
      );
      navigate(`/missions/${mission.missionId}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '分析任务创建失败');
    }
  }, [navigate]);

  const openOpportunityDetail = useCallback((opportunity: OpportunitySummary) => {
    setDetailOpportunity(opportunity);
    setDetailError(null);
    void fetchOpportunityDetail(opportunity.id).then((detail) => {
      if (detail) {
        setDetailOpportunity(detail);
      }
    });
  }, []);

  const saveOpportunityUpdate = useCallback(async (
    opportunity: OpportunitySummary,
    input: UpdateOpportunityInput,
  ) => {
    setDetailSavingId(opportunity.id);
    setDetailError(null);
    try {
      const updated = await updateOpportunity(opportunity.id, input);
      setLiveOpportunities((current) => mergeOpportunitySummary(current, updated, 60));
      setDetailOpportunity(updated);

      const [inboxItem, nextBoardHealth] = await Promise.all([
        fetchOpportunityInboxItem(updated.id),
        fetchOpportunityBoardHealth(60),
      ]);
      setLiveInbox((current) => (
        inboxItem
          ? mergeInboxItem(current, inboxItem, 10)
          : current.filter((item) => item.id !== updated.id)
      ));
      if (nextBoardHealth) {
        setLiveBoardHealth(nextBoardHealth);
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '机会更新失败');
    } finally {
      setDetailSavingId(null);
    }
  }, []);

  const recoverOpportunityMission = useCallback(async (
    opportunity: OpportunitySummary,
    action: MissionRecoveryAction,
  ) => {
    if (!opportunity.latestMission) return;

    const actionKey = `${opportunity.id}:${action.id}`;
    setRecoveringMissionActionKey(actionKey);
    setActionError(null);
    setDetailError(null);

    try {
      const mission = action.kind === 'review'
        ? await createMission(
            'review',
            opportunity.latestMission.query || opportunity.query,
            recoveryTickers(opportunity),
            action.depth || 'standard',
            opportunity.id,
            'opportunity_recovery_review',
          )
        : await retryMission(opportunity.latestMission.id, action.depth);

      const updated = await fetchOpportunityDetail(opportunity.id);
      if (updated) {
        setLiveOpportunities((current) => mergeOpportunitySummary(current, updated, 60));
        setDetailOpportunity((current) => (current?.id === updated.id ? updated : current));
      }
      const inboxItem = await fetchOpportunityInboxItem(opportunity.id);
      setLiveInbox((current) => (
        inboxItem
          ? mergeInboxItem(current, inboxItem, 10)
          : current.filter((item) => item.id !== opportunity.id)
      ));
      void fetchOpportunityBoardHealth(60).then((next) => {
        if (next) setLiveBoardHealth(next);
      });
      navigate(`/missions/${mission.missionId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务恢复失败';
      setActionError(message);
      setDetailError(message);
    } finally {
      setRecoveringMissionActionKey(null);
    }
  }, [navigate]);

  const seedRelayOpportunity = async (snapshot: HeatTransferGraph) => {
    setActionError(null);
    try {
      await createOpportunity({
        type: 'relay_chain',
        title: `${snapshot.theme} 热量传导链`,
        query: snapshot.theme,
        thesis: snapshot.transmissionSummary,
        leaderTicker: snapshot.leaderTicker,
        relatedTickers: snapshot.bottleneckTickers,
        relayTickers: snapshot.laggardTickers,
        heatProfile: {
          temperature: snapshot.temperature,
          bottleneckTickers: snapshot.bottleneckTickers,
          laggardTickers: snapshot.laggardTickers,
          breadthScore: snapshot.breadthScore,
          validationStatus: snapshot.validationStatus,
          validationSummary: snapshot.validationSummary,
          edgeCount: snapshot.edgeCount,
          edges: snapshot.edges,
          transmissionNote: snapshot.transmissionSummary,
        },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '从观察池生成 relay 机会失败');
    }
  };

  const runRadarRefresh = async () => {
    setAutomationAction('radar');
    setActionError(null);
    try {
      await refreshNewCodeRadar();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '刷新 New Code Radar 失败');
    }
    setAutomationAction(null);
  };

  const runHeatGraphSync = async () => {
    setAutomationAction('graph');
    setActionError(null);
    try {
      await syncHeatTransferGraphs();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '同步 Heat Transfer Graph 失败');
    }
    setAutomationAction(null);
  };

  const executePrimaryAction = useCallback(async (
    opportunity: OpportunitySummary,
    action: OpportunityPrimaryAction,
  ) => {
    if (action.target === 'mission' && opportunity.latestMission) {
      navigate(`/missions/${opportunity.latestMission.id}`);
      return;
    }

    await launchOpportunityAnalysis(opportunity, action.template || undefined);
  }, [launchOpportunityAnalysis, navigate]);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const lane = event.key === '1'
        ? 'act'
        : event.key === '2'
          ? 'review'
          : event.key === '3'
            ? 'monitor'
            : null;
      if (!lane) return;

      event.preventDefault();
      if (!event.shiftKey) {
        focusLane(lane);
        return;
      }

      const target = resolveLanePrimaryTarget(lane);
      if (!target) return;
      void executePrimaryAction(target.opportunity, target.action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executePrimaryAction, focusLane, resolveLanePrimaryTarget]);

  const handleInboxPrimaryAction = async (item: OpportunityInboxItem) => {
    const primaryAction = buildInboxPrimaryAction(item);
    await executePrimaryAction(item, primaryAction);
  };

  const renderInboxCard = (
    item: OpportunityInboxItem,
    livePriorityEvent?: OpportunityStreamEvent | null,
    liveRank?: number,
  ) => {
    const primaryAction = buildInboxPrimaryAction(item);
    const liveRankBadge = buildLiveRankBadge(livePriorityEvent, liveRank ?? -1, liveNow);
    const extraTemplates = buildExtraTemplates(item, primaryAction.template?.id, 2);
    return (
    <article
      key={item.id}
      className={`today-card ${liveRankBadge ? 'live-ranked' : ''} ${liveRankBadge?.state || ''}`}
    >
      <div className="today-card-top">
        <span className={`consensus-badge ${statusTone(item.status)}`}>
          {typeMeta(item.type).label}
        </span>
        <div className="today-card-rank">
          {liveRankBadge && (
            <span className={`live-rank-badge ${liveRankBadge.state}`} title={liveRankBadge.detail}>
              {liveRankBadge.label}
            </span>
          )}
          <span className="today-run">Score {item.inboxScore}</span>
        </div>
      </div>
      <div className="today-query">{item.title}</div>
      <div className="today-meta">
        <span>{item.stage} / {item.status}</span>
        {item.primaryTicker && <span>Primary {item.primaryTicker}</span>}
        {item.leaderTicker && <span>Leader {item.leaderTicker}</span>}
        {item.proxyTicker && <span>Proxy {item.proxyTicker}</span>}
      </div>
      <div className="today-diff">
        <span className={`diff-chip ${item.recommendedAction === 'review' ? 'changed' : 'stable'}`}>
          {item.recommendedAction.toUpperCase()}
        </span>
        <span className="today-diff-summary">{item.inboxSummary}</span>
      </div>
      {livePriorityEvent && (
        <div className="today-live-priority">
          <div className="today-live-priority-top">
            <span className="live-dot-small" />
            <span className="today-live-priority-label">{liveSignalLabel(livePriorityEvent)}</span>
            <span className="today-live-priority-age">{formatLiveAge(livePriorityEvent.timestamp, liveNow)}</span>
          </div>
          <div className="today-live-priority-detail">{livePriorityEvent.message}</div>
        </div>
      )}
      {item.actionLabel && (
        <div className="today-action-callout">
          <div className="op-timeline-chips">
            {item.actionDecision && (
              <span className={`diff-chip ${timelineDecisionTone(item.actionDecision)}`}>
                {timelineDecisionLabel(item.actionDecision)}
              </span>
            )}
            {item.actionDriver && (
              <span className="timeline-chip">{timelineDriverLabel(item.actionDriver)}</span>
            )}
            {item.actionTimestamp && (
              <span className="timeline-chip muted">{new Date(item.actionTimestamp).toLocaleString()}</span>
            )}
          </div>
          <div className="today-action-label">{item.actionLabel}</div>
          {item.actionDetail && <div className="today-action-detail">{item.actionDetail}</div>}
        </div>
      )}
      {item.playbook && (
        <div className="op-card-detail">
          <div><ArrowRight size={12} /> {item.playbook.nextStep}</div>
        </div>
      )}
      <PreTradeChecklistBlock opportunity={item} compact />
      <ScoreExplanationBlock opportunity={item} compact />
      {item.suggestedMission && (
        <div className="today-meta">
          <span>{item.suggestedMission.mode}</span>
          <span>{item.suggestedMission.depth}</span>
          <span>{item.suggestedMission.query}</span>
        </div>
      )}
      {extraTemplates.length > 0 && (
        <div className="tc-tickers">
          {extraTemplates.map((template) => (
            <button
              key={`${item.id}_${template.id}`}
              type="button"
              className="secondary-btn"
              onClick={() => void launchOpportunityAnalysis(item, template)}
            >
              {template.label}
            </button>
          ))}
        </div>
      )}
      <div className="tc-tickers">
        {item.inboxReasons.slice(0, 3).map((reason) => (
          <span key={`${item.id}_${reason.code}`} className="ticker-pill">{reason.label}</span>
        ))}
      </div>
      <MissionRecoveryPanel
        opportunity={item}
        busyActionKey={recoveringMissionActionKey}
        limit={3}
        onRecoverMission={recoverOpportunityMission}
      />
      <div className="today-actions" style={{ marginTop: 10 }}>
        <button type="button" className="secondary-btn" onClick={() => openOpportunityDetail(item)}>
          详情 / 编辑
        </button>
        <button type="button" className="secondary-btn" onClick={() => void handleInboxPrimaryAction(item)}>
          {primaryAction.label}
        </button>
        {item.latestMission && (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => navigate(`/missions/${item.latestMission!.id}`)}
            disabled={primaryAction.target === 'mission'}
          >
            查看任务
          </button>
        )}
      </div>
    </article>
  );
  };

  return (
    <div className="page opportunity-workbench">
      <div className="page-header">
        <h1><Radar size={24} /> 机会工作台</h1>
        <div className="header-status">
          <span className={`status-dot ${isConnected ? 'ok' : 'warn'}`} />
          {isConnected ? 'EVENTS LIVE' : 'EVENTS POLLING'}
        </div>
      </div>

      <WorkbenchViewBar
        searchQuery={searchQuery}
        activeLane={viewLane}
        savedViews={savedViews}
        activeSavedViewId={activeSavedViewId}
        resultCount={visibleOpportunities.length}
        inboxCount={visibleInbox.length}
        filterCount={activeFilterCount}
        onSearchChange={syncSearchQuery}
        onLaneFocus={focusWorkbenchLane}
        onSaveView={saveCurrentWorkbenchView}
        onApplyView={applyWorkbenchView}
        onDeleteView={deleteWorkbenchView}
        onResetView={resetWorkbenchView}
      />

      <CatalystReminderStrip
        reminders={catalystReminders}
        now={liveNow}
        onOpenOpportunity={openOpportunityDetail}
        onLaunchOpportunityAnalysis={(opportunity) => void launchOpportunityAnalysis(opportunity)}
      />

      <div className="opportunity-summary-grid">
        <div className="op-summary-card glass-panel">
          <span>Total</span>
          <strong>{summary.total}</strong>
          <small>已建机会卡</small>
        </div>
        <div className="op-summary-card glass-panel">
          <span>Ready</span>
          <strong>{summary.ready}</strong>
          <small>可继续验证</small>
        </div>
        <div className="op-summary-card glass-panel">
          <span>Active</span>
          <strong>{summary.active}</strong>
          <small>正在跟踪</small>
        </div>
        <div className="op-summary-card glass-panel">
          <span>Core</span>
          <strong>{coreStats.running}R / {coreStats.pending}Q</strong>
          <small>
            <button type="button" className="inline-link-btn" onClick={() => navigate('/command-center')}>
              打开执行控制台 <ArrowRight size={12} />
            </button>
          </small>
        </div>
        <div className="op-summary-card pulse glass-panel">
          <span>Pulse</span>
          <strong>{workbenchPulse.label}</strong>
          <div className="op-summary-detail">{workbenchPulse.summary}</div>
        <div className="op-summary-chips">
          {workbenchPulse.chips.map((chip) => (
            <span key={chip} className="timeline-chip muted">{chip}</span>
          ))}
        </div>
          {pulsePrimaryTarget && (
            <div className="op-summary-target">
              <div className="op-summary-target-top">
                <span className="diff-chip stable">FOCUS</span>
                <span className="op-summary-target-title">{pulsePrimaryTarget.opportunity.title}</span>
              </div>
              <div className="op-summary-target-copy">
                当前默认动作是“{pulsePrimaryTarget.action.label}”，目标在 {typeMeta(pulsePrimaryTarget.opportunity.type).label}。
              </div>
            </div>
          )}
          {workbenchPulse.targetLane && workbenchPulse.actionLabel && (
            <div className="op-summary-actions">
              <button
                type="button"
                className="secondary-btn tiny"
                onClick={() => focusLane(workbenchPulse.targetLane)}
              >
                {workbenchPulse.actionLabel}
              </button>
              {pulsePrimaryTarget && (
                <button
                  type="button"
                  className="secondary-btn tiny"
                  onClick={() => void executePrimaryAction(pulsePrimaryTarget.opportunity, pulsePrimaryTarget.action)}
                >
                  直接执行: {pulsePrimaryTarget.action.label}
                </button>
              )}
              {pulsePrimaryTarget && pulseSecondaryTemplates.map((template) => (
                <button
                  key={`${pulsePrimaryTarget.opportunity.id}_${template.id}`}
                  type="button"
                  className="secondary-btn tiny"
                  onClick={() => void launchOpportunityAnalysis(pulsePrimaryTarget.opportunity, template)}
                >
                  备选: {template.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ActionInbox
        liveInbox={visibleInbox}
        inboxLanes={inboxLanes}
        laneInsights={laneInsights}
        laneLiveSignals={laneLiveSignals}
        laneActionPreviews={laneActionPreviews}
        focusedLane={focusedLane}
        setLaneRef={(lane, node) => {
          laneRefs.current[lane] = node;
        }}
        executePrimaryAction={executePrimaryAction}
        renderInboxCard={renderInboxCard}
      />

      <StrategyReviewPanel
        digest={strategyReviewDigest}
        onOpenOpportunity={openOpportunityDetail}
        onOpenMission={(missionId) => navigate(`/missions/${missionId}`)}
      />

      <div className="opportunity-top-grid">
        <CreateOpportunityPanel
          draft={draft}
          setDraft={setDraft}
          actionError={actionError}
          submitting={submitting}
          onApplyTemplate={applyTemplate}
          onPersist={(mode) => void persistOpportunity(mode)}
        />
        <EventFeed events={eventFeed} isConnected={isConnected} />
      </div>

      <RelaySnapshotStrip
        snapshots={relaySnapshots}
        automationAction={automationAction}
        onRunHeatGraphSync={() => void runHeatGraphSync()}
        onSeedRelayOpportunity={(snapshot) => void seedRelayOpportunity(snapshot)}
      />

      <OpportunityBoardGrid
        groups={groups}
        boardHealthMap={boardHealthMap}
        boardLiveSignals={boardLiveSignals}
        activeBoardFilters={activeBoardFilters}
        streamedEvents={streamedEvents || []}
        liveNow={liveNow}
        automationAction={automationAction}
        recoveringMissionActionKey={recoveringMissionActionKey}
        onToggleBoardFilter={toggleBoardFilter}
        onClearBoardFilter={(type) => syncBoardFilters({ ...activeBoardFilters, [type]: null })}
        onRunRadarRefresh={() => void runRadarRefresh()}
        onOpenOpportunity={openOpportunityDetail}
        onRecoverMission={(opportunity, action) => void recoverOpportunityMission(opportunity, action)}
        onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
        onOpenMission={(missionId) => navigate(`/missions/${missionId}`)}
        onOpenCommandCenter={() => navigate('/command-center')}
      />

      <OpportunityDetailDrawer
        opportunity={detailOpportunity}
        saving={detailSavingId === detailOpportunity?.id}
        error={detailError}
        now={liveNow}
        recoveringMissionActionKey={recoveringMissionActionKey}
        onClose={() => setDetailOpportunity(null)}
        onSave={saveOpportunityUpdate}
        onRecoverMission={(opportunity, action) => void recoverOpportunityMission(opportunity, action)}
        onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
        onOpenMission={(missionId) => navigate(`/missions/${missionId}`)}
      />
    </div>
  );
}
