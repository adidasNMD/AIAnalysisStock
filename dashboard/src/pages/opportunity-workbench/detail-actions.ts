import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  invalidateOpportunityFieldEvidence,
  recordOpportunityFieldEvidenceBatch,
  recordOpportunityFieldEvidence,
  restoreOpportunityFieldEvidence,
  updateOpportunity,
  type InvalidateOpportunityFieldEvidenceInput,
  type OpportunityBoardHealthMap,
  type OpportunityFieldEvidenceBatchAudit,
  type OpportunityFieldEvidenceAudit,
  type OpportunityInboxItem,
  type OpportunitySummary,
  type RecordOpportunityFieldEvidenceBatchInput,
  type RecordOpportunityFieldEvidenceInput,
  type RestoreOpportunityFieldEvidenceInput,
  type UpdateOpportunityInput,
} from '../../api';
import { workbenchActionErrorMessage } from './action-utils';

interface OpportunityDetailActionOptions {
  upsertOpportunity: (item: OpportunitySummary | null) => void;
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshOpportunity: (id: string) => Promise<OpportunitySummary | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
}

export function useOpportunityDetailActions({
  upsertOpportunity,
  refreshInboxItem,
  refreshOpportunity,
  refreshBoardHealth,
}: OpportunityDetailActionOptions) {
  const [detailOpportunity, setDetailOpportunity] = useState<OpportunitySummary | null>(null);
  const [detailSavingId, setDetailSavingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const focusRestoreRef = useRef<{
    opportunityId: string;
    element: HTMLElement | null;
  } | null>(null);

  const restoreOpportunityFocus = useCallback((opportunityId: string) => {
    if (typeof document === 'undefined') return;

    window.requestAnimationFrame(() => {
      const stored = focusRestoreRef.current;
      const storedElement = stored?.opportunityId === opportunityId ? stored.element : null;

      if (storedElement?.isConnected) {
        storedElement.focus({ preventScroll: true });
        return;
      }

      const fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-opportunity-id]'))
        .find((element) => element.dataset.opportunityId === opportunityId)
        ?.querySelector<HTMLElement>('[data-opportunity-action="details"]');

      if (fallback) {
        fallback.focus({ preventScroll: true });
      }
    });
  }, []);

  const openOpportunityDetail = useCallback((opportunity: OpportunitySummary) => {
    const activeElement = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    focusRestoreRef.current = {
      opportunityId: opportunity.id,
      element: activeElement,
    };
    setDetailOpportunity(opportunity);
    setDetailError(null);
    void refreshOpportunity(opportunity.id)
      .then((detail) => {
        if (detail) {
          setDetailOpportunity(detail);
        }
      })
      .catch((error: unknown) => {
        setDetailError(workbenchActionErrorMessage(error, '机会详情刷新失败'));
      });
  }, [refreshOpportunity]);

  const closeOpportunityDetail = useCallback(() => {
    const opportunityId = detailOpportunity?.id;
    setDetailOpportunity(null);
    if (opportunityId) restoreOpportunityFocus(opportunityId);
  }, [detailOpportunity?.id, restoreOpportunityFocus]);

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
      setDetailError(workbenchActionErrorMessage(error, '机会更新失败'));
    } finally {
      setDetailSavingId(null);
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

  const recordFieldEvidence = useCallback(async (
    opportunity: OpportunitySummary,
    input: RecordOpportunityFieldEvidenceInput,
  ): Promise<OpportunityFieldEvidenceAudit | null> => {
    setDetailSavingId(opportunity.id);
    setDetailError(null);
    try {
      const audit = await recordOpportunityFieldEvidence(opportunity.id, input);
      if (audit.opportunity) {
        upsertOpportunity(audit.opportunity);
        setDetailOpportunity(audit.opportunity);
        await Promise.all([
          refreshInboxItem(audit.opportunity.id),
          refreshBoardHealth(),
        ]);
      }
      return audit;
    } catch (error) {
      setDetailError(workbenchActionErrorMessage(error, '字段证据记录失败'));
      return null;
    } finally {
      setDetailSavingId(null);
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

  const recordFieldEvidenceBatch = useCallback(async (
    opportunity: OpportunitySummary,
    input: RecordOpportunityFieldEvidenceBatchInput,
  ): Promise<OpportunityFieldEvidenceBatchAudit | null> => {
    setDetailSavingId(opportunity.id);
    setDetailError(null);
    try {
      const audit = await recordOpportunityFieldEvidenceBatch(opportunity.id, input);
      if (audit.opportunity) {
        upsertOpportunity(audit.opportunity);
        setDetailOpportunity(audit.opportunity);
        await Promise.all([
          refreshInboxItem(audit.opportunity.id),
          refreshBoardHealth(),
        ]);
      }
      return audit;
    } catch (error) {
      setDetailError(workbenchActionErrorMessage(error, '字段证据批量写入失败'));
      return null;
    } finally {
      setDetailSavingId(null);
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

  const invalidateFieldEvidence = useCallback(async (
    opportunity: OpportunitySummary,
    evidenceId: string,
    input: InvalidateOpportunityFieldEvidenceInput,
  ): Promise<OpportunityFieldEvidenceAudit | null> => {
    setDetailSavingId(opportunity.id);
    setDetailError(null);
    try {
      const audit = await invalidateOpportunityFieldEvidence(opportunity.id, evidenceId, input);
      if (audit.opportunity) {
        upsertOpportunity(audit.opportunity);
        setDetailOpportunity(audit.opportunity);
        await Promise.all([
          refreshInboxItem(audit.opportunity.id),
          refreshBoardHealth(),
        ]);
      }
      return audit;
    } catch (error) {
      setDetailError(workbenchActionErrorMessage(error, '字段证据作废失败'));
      return null;
    } finally {
      setDetailSavingId(null);
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

  const restoreFieldEvidence = useCallback(async (
    opportunity: OpportunitySummary,
    evidenceId: string,
    input: RestoreOpportunityFieldEvidenceInput,
  ): Promise<OpportunityFieldEvidenceAudit | null> => {
    setDetailSavingId(opportunity.id);
    setDetailError(null);
    try {
      const audit = await restoreOpportunityFieldEvidence(opportunity.id, evidenceId, input);
      if (audit.opportunity) {
        upsertOpportunity(audit.opportunity);
        setDetailOpportunity(audit.opportunity);
        await Promise.all([
          refreshInboxItem(audit.opportunity.id),
          refreshBoardHealth(),
        ]);
      }
      return audit;
    } catch (error) {
      setDetailError(workbenchActionErrorMessage(error, '字段证据恢复失败'));
      return null;
    } finally {
      setDetailSavingId(null);
    }
  }, [refreshBoardHealth, refreshInboxItem, upsertOpportunity]);

  return {
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
    setDetailOpportunity: setDetailOpportunity as Dispatch<SetStateAction<OpportunitySummary | null>>,
  };
}
