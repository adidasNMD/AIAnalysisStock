import { useCallback, useEffect, useRef, useState } from 'react';
import { Radar } from 'lucide-react';
import {
  fetchQueue,
  fetchHeatTransferGraphs,
  type HeatTransferGraph,
} from '../api';
import { usePolling } from '../hooks/useAgentStream';
import { useOpportunityWorkbenchData } from '../queries/opportunity-queries';
import { isEditableTarget } from './opportunity-workbench/model';
import type {
  DraftState,
  InboxLane,
} from './opportunity-workbench/model';
import { useOpportunityDraftState } from './opportunity-workbench/draft-state';
import { useWorkbenchViewState } from './opportunity-workbench/view-state-hook';
import { useOpportunityWorkbenchActions } from './opportunity-workbench/actions';
import { useOpportunityWorkbenchDerivedState } from './opportunity-workbench/derived-state';
import { ActionInbox } from './opportunity-workbench/ActionInbox';
import { CreateOpportunityPanel } from './opportunity-workbench/CreateOpportunityPanel';
import { EventFeed } from './opportunity-workbench/EventFeed';
import { OpportunityDetailDrawer } from './opportunity-workbench/OpportunityDetailDrawer';
import { OpportunityBoardGrid } from './opportunity-workbench/OpportunityBoardGrid';
import { RelaySnapshotStrip } from './opportunity-workbench/RelaySnapshotStrip';
import { WorkbenchViewBar } from './opportunity-workbench/WorkbenchViewBar';
import { CatalystReminderStrip } from './opportunity-workbench/CatalystReminderStrip';
import { StrategyReviewPanel } from './opportunity-workbench/StrategyReviewPanel';
import { WorkbenchSummaryGrid } from './opportunity-workbench/WorkbenchSummaryGrid';

export function OpportunityWorkbench() {
  const { draft, setDraft, applyDraftTemplate, resetDraft } = useOpportunityDraftState('relay_chain');
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [focusedLane, setFocusedLane] = useState<InboxLane | null>(null);
  const laneFocusTimeoutRef = useRef<number | null>(null);
  const laneRefs = useRef<Record<InboxLane, HTMLElement | null>>({
    act: null,
    review: null,
    monitor: null,
  });

  const {
    liveInbox,
    liveOpportunities,
    liveBoardHealth,
    eventFeed,
    streamedEvents,
    isConnected,
    upsertOpportunity,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
  } = useOpportunityWorkbenchData({
    opportunityLimit: 60,
    inboxLimit: 10,
    eventLimit: 20,
    streamLimit: 20,
  });
  const { data: queue } = usePolling(() => fetchQueue(), 5000, []);
  const { data: heatGraphs } = usePolling<HeatTransferGraph[]>(() => fetchHeatTransferGraphs(), 10000, []);

  const {
    actionError,
    automationAction,
    clearActionError,
    closeOpportunityDetail,
    detailError,
    detailOpportunity,
    detailSavingId,
    executePrimaryAction,
    launchOpportunityAnalysis,
    openCommandCenter,
    openMission,
    openOpportunityDetail,
    persistOpportunity,
    recoverOpportunityMission,
    recoveringMissionActionKey,
    runHeatGraphSync,
    runRadarRefresh,
    saveOpportunityUpdate,
    seedRelayOpportunity,
    submitting,
  } = useOpportunityWorkbenchActions({
    draft,
    resetDraft,
    upsertOpportunity,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
  });

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

  const {
    activeBoardFilters,
    activeFilterCount,
    activeSavedViewId,
    savedViews,
    searchQuery,
    viewLane,
    syncSearchQuery,
    focusWorkbenchLane,
    saveCurrentWorkbenchView,
    applyWorkbenchView,
    deleteWorkbenchView,
    resetWorkbenchView,
    toggleBoardFilter,
    clearBoardFilter,
  } = useWorkbenchViewState({
    liveBoardHealth,
    onFocusLane: focusLane,
  });

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

  const {
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
  } = useOpportunityWorkbenchDerivedState({
    liveOpportunities,
    liveInbox,
    liveBoardHealth,
    eventFeed,
    streamedEvents,
    queue,
    heatGraphs,
    searchQuery,
    liveNow,
  });
  const applyTemplate = (type: DraftState['type']) => {
    applyDraftTemplate(type);
    clearActionError();
  };
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

      <WorkbenchSummaryGrid
        summary={summary}
        coreStats={coreStats}
        pulse={workbenchPulse}
        pulsePrimaryTarget={pulsePrimaryTarget}
        pulseSecondaryTemplates={pulseSecondaryTemplates}
        onOpenCommandCenter={openCommandCenter}
        onFocusLane={focusLane}
        onExecutePrimaryAction={executePrimaryAction}
        onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
      />

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
        liveNow={liveNow}
        recoveringMissionActionKey={recoveringMissionActionKey}
        onOpenOpportunity={openOpportunityDetail}
        onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
        onRecoverMission={(opportunity, action) => void recoverOpportunityMission(opportunity, action)}
        onOpenMission={openMission}
      />

      <StrategyReviewPanel
        digest={strategyReviewDigest}
        onOpenOpportunity={openOpportunityDetail}
        onOpenMission={openMission}
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
        streamedEvents={streamEvents}
        liveNow={liveNow}
        automationAction={automationAction}
        recoveringMissionActionKey={recoveringMissionActionKey}
        onToggleBoardFilter={toggleBoardFilter}
        onClearBoardFilter={clearBoardFilter}
        onRunRadarRefresh={() => void runRadarRefresh()}
        onOpenOpportunity={openOpportunityDetail}
        onRecoverMission={(opportunity, action) => void recoverOpportunityMission(opportunity, action)}
        onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
        onOpenMission={openMission}
        onOpenCommandCenter={openCommandCenter}
      />

      <OpportunityDetailDrawer
        opportunity={detailOpportunity}
        saving={detailSavingId === detailOpportunity?.id}
        error={detailError}
        now={liveNow}
        recoveringMissionActionKey={recoveringMissionActionKey}
        onClose={closeOpportunityDetail}
        onSave={saveOpportunityUpdate}
        onRecoverMission={(opportunity, action) => void recoverOpportunityMission(opportunity, action)}
        onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
        onOpenMission={openMission}
      />
    </div>
  );
}
