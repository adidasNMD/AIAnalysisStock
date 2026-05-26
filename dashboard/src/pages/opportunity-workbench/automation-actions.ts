import { useCallback, useState } from 'react';
import {
  createOpportunity,
  refreshNewCodeRadar,
  syncHeatTransferGraphs,
  type CreateOpportunityInput,
  type HeatTransferGraph,
  type OpportunityBoardHealthMap,
  type OpportunityInboxItem,
  type OpportunitySummary,
} from '../../api';
import {
  settleWorkbenchRefreshes,
  workbenchActionErrorMessage,
} from './action-utils';

type AutomationAction = 'radar' | 'graph';

interface OpportunityAutomationActionOptions {
  upsertOpportunity: (item: OpportunitySummary | null) => void;
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
  refreshHeatGraphs?: () => Promise<HeatTransferGraph[] | null>;
  setActionError: (message: string | null) => void;
}

export function buildRelayOpportunityInputFromHeatGraph(
  snapshot: HeatTransferGraph,
): CreateOpportunityInput {
  return {
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
  };
}

export function useOpportunityAutomationActions({
  upsertOpportunity,
  refreshInboxItem,
  refreshBoardHealth,
  refreshHeatGraphs,
  setActionError,
}: OpportunityAutomationActionOptions) {
  const [automationAction, setAutomationAction] = useState<AutomationAction | null>(null);

  const seedRelayOpportunity = useCallback(async (snapshot: HeatTransferGraph) => {
    setActionError(null);
    try {
      const created = await createOpportunity(buildRelayOpportunityInputFromHeatGraph(snapshot));
      upsertOpportunity(created);
      settleWorkbenchRefreshes([
        refreshInboxItem(created.id),
        refreshBoardHealth(),
      ]);
    } catch (error) {
      setActionError(workbenchActionErrorMessage(error, '从观察池生成 relay 机会失败'));
    }
  }, [refreshBoardHealth, refreshInboxItem, setActionError, upsertOpportunity]);

  const runRadarRefresh = useCallback(async () => {
    setAutomationAction('radar');
    setActionError(null);
    try {
      await refreshNewCodeRadar();
      settleWorkbenchRefreshes([refreshBoardHealth()]);
    } catch (error) {
      setActionError(workbenchActionErrorMessage(error, '刷新 New Code Radar 失败'));
    } finally {
      setAutomationAction(null);
    }
  }, [refreshBoardHealth, setActionError]);

  const runHeatGraphSync = useCallback(async () => {
    setAutomationAction('graph');
    setActionError(null);
    try {
      await syncHeatTransferGraphs();
      await Promise.all([
        refreshBoardHealth(),
        refreshHeatGraphs ? refreshHeatGraphs() : Promise.resolve(null),
      ]);
    } catch (error) {
      setActionError(workbenchActionErrorMessage(error, '同步 Heat Transfer Graph 失败'));
    } finally {
      setAutomationAction(null);
    }
  }, [refreshBoardHealth, refreshHeatGraphs, setActionError]);

  return {
    automationAction,
    runHeatGraphSync,
    runRadarRefresh,
    seedRelayOpportunity,
  };
}
