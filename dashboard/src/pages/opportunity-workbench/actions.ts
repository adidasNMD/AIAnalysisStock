import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  HeatTransferGraph,
  OpportunityBoardHealthMap,
  OpportunityInboxItem,
  OpportunitySummary,
} from '../../api';
import type { DraftState } from './model';
import { useOpportunityAutomationActions } from './automation-actions';
import { useOpportunityCreationActions } from './creation-actions';
import { useOpportunityDetailActions } from './detail-actions';
import { useOpportunityMissionActions } from './mission-actions';

export { buildCreateOpportunityInput } from './creation-actions';

interface WorkbenchActionsOptions {
  draft: DraftState;
  resetDraft: (type?: DraftState['type']) => void;
  upsertOpportunity: (item: OpportunitySummary | null) => void;
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshOpportunity: (id: string) => Promise<OpportunitySummary | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
  refreshQueue?: () => Promise<unknown>;
  refreshHeatGraphs?: () => Promise<HeatTransferGraph[] | null>;
}

export function useOpportunityWorkbenchActions({
  draft,
  resetDraft,
  upsertOpportunity,
  refreshInboxItem,
  refreshOpportunity,
  refreshBoardHealth,
  refreshQueue,
  refreshHeatGraphs,
}: WorkbenchActionsOptions) {
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const openMission = useCallback((missionId: string) => {
    navigate(`/missions/${missionId}`);
  }, [navigate]);

  const openCommandCenter = useCallback(() => {
    navigate('/command-center');
  }, [navigate]);

  const {
    closeOpportunityDetail,
    detailError,
    detailOpportunity,
    detailSavingId,
    invalidateFieldEvidence,
    openOpportunityDetail,
    recordFieldEvidenceBatch,
    recordFieldEvidence,
    restoreFieldEvidence,
    saveOpportunityUpdate,
    setDetailError,
    setDetailOpportunity,
  } = useOpportunityDetailActions({
    upsertOpportunity,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
  });

  const {
    persistOpportunity,
    submitting,
  } = useOpportunityCreationActions({
    draft,
    resetDraft,
    upsertOpportunity,
    refreshInboxItem,
    refreshBoardHealth,
    openMission,
    setActionError,
  });

  const {
    executePrimaryAction,
    launchOpportunityAnalysis,
    clearMissionRecoveryActionFeedback,
    missionRecoveryActionFeedback,
    recoverOpportunityMission,
    recoveringMissionActionKey,
  } = useOpportunityMissionActions({
    openMission,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
    refreshQueue,
    setActionError,
    setDetailError,
    setDetailOpportunity,
  });

  const {
    automationAction,
    runHeatGraphSync,
    runRadarRefresh,
    seedRelayOpportunity,
  } = useOpportunityAutomationActions({
    upsertOpportunity,
    refreshInboxItem,
    refreshBoardHealth,
    refreshHeatGraphs,
    setActionError,
  });

  return {
    actionError,
    automationAction,
    clearActionError,
    closeOpportunityDetail,
    clearMissionRecoveryActionFeedback,
    detailError,
    detailOpportunity,
    detailSavingId,
    executePrimaryAction,
    launchOpportunityAnalysis,
    invalidateFieldEvidence,
    missionRecoveryActionFeedback,
    openCommandCenter,
    openMission,
    openOpportunityDetail,
    persistOpportunity,
    recordFieldEvidenceBatch,
    recordFieldEvidence,
    recoverOpportunityMission,
    recoveringMissionActionKey,
    restoreFieldEvidence,
    runHeatGraphSync,
    runRadarRefresh,
    saveOpportunityUpdate,
    seedRelayOpportunity,
    submitting,
  };
}
