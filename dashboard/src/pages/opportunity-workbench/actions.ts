import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createMission,
  createOpportunity,
  refreshNewCodeRadar,
  retryMission,
  syncHeatTransferGraphs,
  updateOpportunity,
  type HeatTransferGraph,
  type OpportunityBoardHealthMap,
  type OpportunityInboxItem,
  type OpportunitySuggestedMission,
  type OpportunitySummary,
  type UpdateOpportunityInput,
} from '../../api';
import type {
  DraftState,
  OpportunityPrimaryAction,
} from './model';
import type { MissionRecoveryAction } from './recovery';
import { recoveryTickers } from './recovery';
import {
  buildIpoProfile,
  buildMissionInput,
  parseTickers,
} from './selectors';

interface WorkbenchActionsOptions {
  draft: DraftState;
  resetDraft: (type?: DraftState['type']) => void;
  upsertOpportunity: (item: OpportunitySummary | null) => void;
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshOpportunity: (id: string) => Promise<OpportunitySummary | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function buildCreateOpportunityInput(draft: DraftState) {
  const draftTitle = (draft.title || '').trim();
  const draftQuery = (draft.query || '').trim();
  const ipoProfile = buildIpoProfile(draft);

  return {
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
    ...(ipoProfile ? { ipoProfile } : {}),
  };
}

export function useOpportunityWorkbenchActions({
  draft,
  resetDraft,
  upsertOpportunity,
  refreshInboxItem,
  refreshOpportunity,
  refreshBoardHealth,
}: WorkbenchActionsOptions) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState<'save' | 'analyze' | null>(null);
  const [automationAction, setAutomationAction] = useState<'radar' | 'graph' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailOpportunity, setDetailOpportunity] = useState<OpportunitySummary | null>(null);
  const [detailSavingId, setDetailSavingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [recoveringMissionActionKey, setRecoveringMissionActionKey] = useState<string | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const openMission = useCallback((missionId: string) => {
    navigate(`/missions/${missionId}`);
  }, [navigate]);

  const openCommandCenter = useCallback(() => {
    navigate('/command-center');
  }, [navigate]);

  const persistOpportunity = useCallback(async (mode: 'save' | 'analyze') => {
    const draftTitle = (draft.title || '').trim();
    const draftQuery = (draft.query || '').trim();
    if (!draftTitle && !draftQuery) return;

    setSubmitting(mode);
    setActionError(null);

    try {
      const created = await createOpportunity(buildCreateOpportunityInput(draft));
      upsertOpportunity(created);
      void refreshInboxItem(created.id);
      void refreshBoardHealth();

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
        openMission(mission.missionId);
      } else {
        resetDraft(draft.type);
      }
    } catch (error) {
      setActionError(errorMessage(error, '机会创建失败'));
    } finally {
      setSubmitting(null);
    }
  }, [draft, openMission, refreshBoardHealth, refreshInboxItem, resetDraft, upsertOpportunity]);

  const launchOpportunityAnalysis = useCallback(async (
    opportunity: OpportunitySummary,
    suggested?: OpportunitySuggestedMission,
  ) => {
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
      openMission(mission.missionId);
    } catch (error) {
      setActionError(errorMessage(error, '分析任务创建失败'));
    }
  }, [openMission]);

  const openOpportunityDetail = useCallback((opportunity: OpportunitySummary) => {
    setDetailOpportunity(opportunity);
    setDetailError(null);
    void refreshOpportunity(opportunity.id).then((detail) => {
      if (detail) {
        setDetailOpportunity(detail);
      }
    });
  }, [refreshOpportunity]);

  const closeOpportunityDetail = useCallback(() => setDetailOpportunity(null), []);

  const saveOpportunityUpdate = useCallback(async (
    opportunity: OpportunitySummary,
    input: UpdateOpportunityInput,
  ) => {
    setDetailSavingId(opportunity.id);
    setDetailError(null);
    try {
      const updated = await updateOpportunity(opportunity.id, input);
      upsertOpportunity(updated);
      setDetailOpportunity(updated);
      await Promise.all([
        refreshInboxItem(updated.id),
        refreshBoardHealth(),
      ]);
    } catch (error) {
      setDetailError(errorMessage(error, '机会更新失败'));
    } finally {
      setDetailSavingId(null);
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

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

      const updated = await refreshOpportunity(opportunity.id);
      if (updated) {
        setDetailOpportunity((current) => (current?.id === updated.id ? updated : current));
      }
      await refreshInboxItem(opportunity.id);
      void refreshBoardHealth();
      openMission(mission.missionId);
    } catch (error) {
      const message = errorMessage(error, '任务恢复失败');
      setActionError(message);
      setDetailError(message);
    } finally {
      setRecoveringMissionActionKey(null);
    }
  }, [openMission, refreshBoardHealth, refreshInboxItem, refreshOpportunity]);

  const seedRelayOpportunity = useCallback(async (snapshot: HeatTransferGraph) => {
    setActionError(null);
    try {
      const created = await createOpportunity({
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
      upsertOpportunity(created);
      void refreshInboxItem(created.id);
      void refreshBoardHealth();
    } catch (error) {
      setActionError(errorMessage(error, '从观察池生成 relay 机会失败'));
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

  const runRadarRefresh = useCallback(async () => {
    setAutomationAction('radar');
    setActionError(null);
    try {
      await refreshNewCodeRadar();
      void refreshBoardHealth();
    } catch (error) {
      setActionError(errorMessage(error, '刷新 New Code Radar 失败'));
    } finally {
      setAutomationAction(null);
    }
  }, [refreshBoardHealth]);

  const runHeatGraphSync = useCallback(async () => {
    setAutomationAction('graph');
    setActionError(null);
    try {
      await syncHeatTransferGraphs();
      void refreshBoardHealth();
    } catch (error) {
      setActionError(errorMessage(error, '同步 Heat Transfer Graph 失败'));
    } finally {
      setAutomationAction(null);
    }
  }, [refreshBoardHealth]);

  const executePrimaryAction = useCallback(async (
    opportunity: OpportunitySummary,
    action: OpportunityPrimaryAction,
  ) => {
    if (action.target === 'mission' && opportunity.latestMission) {
      openMission(opportunity.latestMission.id);
      return;
    }

    await launchOpportunityAnalysis(opportunity, action.template || undefined);
  }, [launchOpportunityAnalysis, openMission]);

  return {
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
  };
}
