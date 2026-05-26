import { useCallback } from 'react';
import { useHeatTransferGraphsQuery } from '../../queries/heat-graph-queries';
import { useOpportunityWorkbenchData } from '../../queries/opportunity-queries';
import { useQueueQuery } from '../../queries/queue-queries';
import { useOpportunityWorkbenchActions } from './actions';
import { useOpportunityWorkbenchDerivedState } from './derived-state';
import { useOpportunityDraftState } from './draft-state';
import {
  useWorkbenchLaneFocus,
  useWorkbenchLaneKeyboardShortcuts,
  useWorkbenchLiveNow,
} from './interaction-state';
import type { DraftState } from './model';
import { useWorkbenchViewState } from './view-state-hook';

export function useOpportunityWorkbenchController() {
  const { draft, setDraft, applyDraftTemplate, resetDraft } = useOpportunityDraftState('relay_chain');
  const liveNow = useWorkbenchLiveNow();
  const {
    focusedLane,
    focusLane,
    setLaneRef,
  } = useWorkbenchLaneFocus();
  const { data: queue, refresh: refreshQueue } = useQueueQuery(5000);

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
    refreshQueue,
  });
  const { data: heatGraphs, refresh: refreshHeatGraphs } = useHeatTransferGraphsQuery();

  const actions = useOpportunityWorkbenchActions({
    draft,
    resetDraft,
    upsertOpportunity,
    refreshInboxItem,
    refreshOpportunity,
    refreshBoardHealth,
    refreshQueue,
    refreshHeatGraphs,
  });

  const viewState = useWorkbenchViewState({
    liveBoardHealth,
    onFocusLane: focusLane,
  });

  const derivedState = useOpportunityWorkbenchDerivedState({
    liveOpportunities,
    liveInbox,
    liveBoardHealth,
    eventFeed,
    streamedEvents,
    queue,
    heatGraphs,
    searchQuery: viewState.searchQuery,
    liveNow,
  });

  useWorkbenchLaneKeyboardShortcuts({
    focusLane,
    resolveLanePrimaryTarget: derivedState.resolveLanePrimaryTarget,
    executePrimaryAction: actions.executePrimaryAction,
  });

  const { clearActionError } = actions;
  const applyTemplate = useCallback((type: DraftState['type']) => {
    applyDraftTemplate(type);
    clearActionError();
  }, [applyDraftTemplate, clearActionError]);

  return {
    ...actions,
    ...viewState,
    ...derivedState,
    applyTemplate,
    draft,
    eventFeed,
    focusedLane,
    focusLane,
    isConnected,
    liveNow,
    setDraft,
    setLaneRef,
  };
}

export type OpportunityWorkbenchController = ReturnType<typeof useOpportunityWorkbenchController>;
