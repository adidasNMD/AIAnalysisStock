import { useCallback, useState } from 'react';
import {
  createMission,
  createOpportunity,
  type OpportunityBoardHealthMap,
  type OpportunityInboxItem,
  type OpportunitySummary,
} from '../../api';
import type { DraftState } from './model';
import {
  buildIpoProfile,
  buildMissionInput,
  parseTickers,
} from './selectors';
import {
  settleWorkbenchRefreshes,
  workbenchActionErrorMessage,
} from './action-utils';

export type OpportunitySubmitMode = 'save' | 'analyze';

interface OpportunityCreationActionOptions {
  draft: DraftState;
  resetDraft: (type?: DraftState['type']) => void;
  upsertOpportunity: (item: OpportunitySummary | null) => void;
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
  openMission: (missionId: string) => void;
  setActionError: (message: string | null) => void;
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

export function useOpportunityCreationActions({
  draft,
  resetDraft,
  upsertOpportunity,
  refreshInboxItem,
  refreshBoardHealth,
  openMission,
  setActionError,
}: OpportunityCreationActionOptions) {
  const [submitting, setSubmitting] = useState<OpportunitySubmitMode | null>(null);

  const persistOpportunity = useCallback(async (mode: OpportunitySubmitMode) => {
    const draftTitle = (draft.title || '').trim();
    const draftQuery = (draft.query || '').trim();
    if (!draftTitle && !draftQuery) return;

    setSubmitting(mode);
    setActionError(null);

    try {
      const created = await createOpportunity(buildCreateOpportunityInput(draft));
      upsertOpportunity(created);
      settleWorkbenchRefreshes([
        refreshInboxItem(created.id),
        refreshBoardHealth(),
      ]);

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
      setActionError(workbenchActionErrorMessage(error, '机会创建失败'));
    } finally {
      setSubmitting(null);
    }
  }, [
    draft,
    openMission,
    refreshBoardHealth,
    refreshInboxItem,
    resetDraft,
    setActionError,
    upsertOpportunity,
  ]);

  return {
    persistOpportunity,
    submitting,
  };
}
