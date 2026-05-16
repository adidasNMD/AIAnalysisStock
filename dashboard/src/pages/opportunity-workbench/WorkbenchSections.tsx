import { Suspense, lazy } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Radar, X } from 'lucide-react';
import type { OpportunityWorkbenchController } from './workbench-controller';
import { ActionInbox } from './ActionInbox';
import { CreateOpportunityPanel } from './CreateOpportunityPanel';
import { EventFeed } from './EventFeed';
import { OpportunityBoardGrid } from './OpportunityBoardGrid';
import { RelaySnapshotStrip } from './RelaySnapshotStrip';
import { StrategyReviewPanel } from './StrategyReviewPanel';
import { WorkbenchSummaryGrid } from './WorkbenchSummaryGrid';
import { WorkbenchViewBar } from './WorkbenchViewBar';
import { loadOpportunityDetailDrawer } from './detail-drawer-loader';
import { missionRecoveryFeedbackAutoDismissLabel } from './recovery';

const CatalystReminderStrip = lazy(() => (
  import('./CatalystReminderStrip').then((module) => ({ default: module.CatalystReminderStrip }))
));

const OpportunityDetailDrawer = lazy(loadOpportunityDetailDrawer);

type WorkbenchSectionProps = {
  controller: OpportunityWorkbenchController;
};

export function WorkbenchHeaderSection({ controller }: WorkbenchSectionProps) {
  const { isConnected } = controller;

  return (
    <div className="page-header">
      <h1><Radar size={24} /> 机会工作台</h1>
      <div className="header-status">
        <span className={`status-dot ${isConnected ? 'ok' : 'warn'}`} />
        {isConnected ? 'EVENTS LIVE' : 'EVENTS POLLING'}
      </div>
    </div>
  );
}

export function WorkbenchRecoveryFeedbackSection({ controller }: WorkbenchSectionProps) {
  const {
    clearMissionRecoveryActionFeedback,
    missionRecoveryActionFeedback,
    openMission,
  } = controller;

  if (!missionRecoveryActionFeedback) return null;

  const Icon = missionRecoveryActionFeedback.status === 'success'
    ? CheckCircle2
    : missionRecoveryActionFeedback.status === 'error'
      ? AlertTriangle
      : Loader2;
  const autoDismissLabel = missionRecoveryFeedbackAutoDismissLabel(missionRecoveryActionFeedback.expiresAt);

  return (
    <div className={`mission-recovery-feedback ${missionRecoveryActionFeedback.status}`} role="status" aria-live="polite">
      <div className="mission-recovery-feedback-main">
        <Icon size={16} className={missionRecoveryActionFeedback.status === 'pending' ? 'spin' : undefined} />
        <div>
          <strong>{missionRecoveryActionFeedback.label}</strong>
          <p>{missionRecoveryActionFeedback.detail}</p>
          {missionRecoveryActionFeedback.suggestionDetail && (
            <p className={`mission-recovery-feedback-suggestion ${missionRecoveryActionFeedback.suggestionTone || 'warning'}`}>
              建议：{missionRecoveryActionFeedback.suggestionLabel ? `${missionRecoveryActionFeedback.suggestionLabel}，` : ''}
              {missionRecoveryActionFeedback.suggestionDetail}
            </p>
          )}
        </div>
      </div>
      <div className="mission-recovery-feedback-actions">
        {autoDismissLabel && <span className="mission-recovery-feedback-expiry">{autoDismissLabel}</span>}
        {missionRecoveryActionFeedback.missionId && (
          <button
            type="button"
            className="secondary-btn tiny"
            onClick={() => openMission(missionRecoveryActionFeedback.missionId!)}
          >
            查看任务
          </button>
        )}
        <button
          type="button"
          className="workbench-icon-btn"
          onClick={clearMissionRecoveryActionFeedback}
          aria-label="关闭恢复结果"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function WorkbenchControlSection({ controller }: WorkbenchSectionProps) {
  const {
    activeFilterCount,
    activeSavedViewId,
    applyWorkbenchView,
    catalystReminders,
    coreStats,
    deleteWorkbenchView,
    executePrimaryAction,
    focusLane,
    focusWorkbenchLane,
    launchOpportunityAnalysis,
    liveNow,
    openCommandCenter,
    openOpportunityDetail,
    pulsePrimaryTarget,
    pulseSecondaryTemplates,
    resetWorkbenchView,
    saveCurrentWorkbenchView,
    savedViews,
    searchQuery,
    summary,
    syncSearchQuery,
    toggleDefaultSavedView,
    toggleSavedViewPin,
    viewLane,
    visibleInbox,
    visibleOpportunities,
    workbenchPulse,
  } = controller;

  return (
    <>
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
        onTogglePinView={toggleSavedViewPin}
        onToggleDefaultView={toggleDefaultSavedView}
        onResetView={resetWorkbenchView}
      />

      {catalystReminders.length > 0 && (
        <Suspense fallback={null}>
          <CatalystReminderStrip
            reminders={catalystReminders}
            now={liveNow}
            onOpenOpportunity={openOpportunityDetail}
            onLaunchOpportunityAnalysis={(opportunity) => void launchOpportunityAnalysis(opportunity)}
          />
        </Suspense>
      )}

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
    </>
  );
}

export function WorkbenchActionReviewSection({ controller }: WorkbenchSectionProps) {
  const {
    executePrimaryAction,
    focusedLane,
    inboxLanes,
    laneActionPreviews,
    laneInsights,
    laneLiveSignals,
    launchOpportunityAnalysis,
    liveNow,
    missionRecoveryActionFeedback,
    openMission,
    openOpportunityDetail,
    recoverOpportunityMission,
    recoveringMissionActionKey,
    setLaneRef,
    strategyReviewDigest,
    visibleInbox,
  } = controller;

  return (
    <>
      <ActionInbox
        liveInbox={visibleInbox}
        inboxLanes={inboxLanes}
        laneInsights={laneInsights}
        laneLiveSignals={laneLiveSignals}
        laneActionPreviews={laneActionPreviews}
        focusedLane={focusedLane}
        setLaneRef={setLaneRef}
        executePrimaryAction={executePrimaryAction}
        liveNow={liveNow}
        missionRecoveryActionFeedback={missionRecoveryActionFeedback}
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
    </>
  );
}

export function WorkbenchCreationFeedSection({ controller }: WorkbenchSectionProps) {
  const {
    actionError,
    applyTemplate,
    draft,
    eventFeed,
    isConnected,
    persistOpportunity,
    setDraft,
    submitting,
  } = controller;

  return (
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
  );
}

export function WorkbenchBoardSection({ controller }: WorkbenchSectionProps) {
  const {
    activeBoardFilters,
    automationAction,
    boardHealthMap,
    boardLiveSignals,
    clearBoardFilter,
    groups,
    launchOpportunityAnalysis,
    liveNow,
    missionRecoveryActionFeedback,
    openCommandCenter,
    openMission,
    openOpportunityDetail,
    opportunitySearchMatches,
    recoverOpportunityMission,
    recoveringMissionActionKey,
    relaySnapshots,
    runHeatGraphSync,
    runRadarRefresh,
    seedRelayOpportunity,
    streamEvents,
    toggleBoardFilter,
  } = controller;

  return (
    <>
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
        searchMatches={opportunitySearchMatches}
        automationAction={automationAction}
        missionRecoveryActionFeedback={missionRecoveryActionFeedback}
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
    </>
  );
}

export function WorkbenchDetailSection({ controller }: WorkbenchSectionProps) {
  const {
    closeOpportunityDetail,
    detailError,
    detailOpportunity,
    detailSavingId,
    invalidateFieldEvidence,
    launchOpportunityAnalysis,
    liveNow,
    missionRecoveryActionFeedback,
    openMission,
    recordFieldEvidenceBatch,
    recordFieldEvidence,
    recoverOpportunityMission,
    recoveringMissionActionKey,
    restoreFieldEvidence,
    saveOpportunityUpdate,
  } = controller;

  if (!detailOpportunity) return null;

  return (
    <Suspense fallback={null}>
      <OpportunityDetailDrawer
        opportunity={detailOpportunity}
        saving={detailSavingId === detailOpportunity?.id}
      error={detailError}
      now={liveNow}
      missionRecoveryActionFeedback={missionRecoveryActionFeedback}
      recoveringMissionActionKey={recoveringMissionActionKey}
      onClose={closeOpportunityDetail}
      onSave={saveOpportunityUpdate}
      onRecoverMission={(opportunity, action) => void recoverOpportunityMission(opportunity, action)}
      onLaunchOpportunityAnalysis={(opportunity, suggested) => void launchOpportunityAnalysis(opportunity, suggested)}
      onOpenMission={openMission}
      onRecordFieldEvidence={(opportunity, input) => recordFieldEvidence(opportunity, input)}
      onRecordFieldEvidenceBatch={(opportunity, input) => recordFieldEvidenceBatch(opportunity, input)}
      onInvalidateFieldEvidence={(opportunity, evidenceId, input) => invalidateFieldEvidence(opportunity, evidenceId, input)}
      onRestoreFieldEvidence={(opportunity, evidenceId, input) => restoreFieldEvidence(opportunity, evidenceId, input)}
      />
    </Suspense>
  );
}
