import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createMission,
  retryMission,
  type CreateMissionResponse,
  type OpportunityBoardHealthMap,
  type OpportunityInboxItem,
  type OpportunitySuggestedMission,
  type OpportunitySummary,
} from '../../api';
import type { OpportunityPrimaryAction } from './model';
import type { MissionRecoveryAction, MissionRecoveryFeedbackStatus } from './recovery';
import {
  missionRecoveryFailureAdvice,
  missionRecoveryFeedbackExpiresAt,
  recoveryTickers,
  shouldDismissMissionRecoveryFeedback,
} from './recovery';
import { buildMissionInput } from './selectors';
import {
  workbenchActionErrorMessage,
} from './action-utils';

interface OpportunityMissionActionOptions {
  openMission: (missionId: string) => void;
  refreshInboxItem: (id: string) => Promise<OpportunityInboxItem | null>;
  refreshOpportunity: (id: string) => Promise<OpportunitySummary | null>;
  refreshBoardHealth: () => Promise<OpportunityBoardHealthMap | null>;
  refreshQueue?: () => Promise<unknown>;
  setActionError: (message: string | null) => void;
  setDetailError: (message: string | null) => void;
  setDetailOpportunity: Dispatch<SetStateAction<OpportunitySummary | null>>;
}

export type MissionRecoveryActionFeedback = {
  opportunityId: string;
  actionId: string;
  actionLabel: string;
  status: MissionRecoveryFeedbackStatus;
  label: string;
  detail: string;
  suggestionLabel?: string;
  suggestionDetail?: string;
  suggestionTone?: 'danger' | 'warning' | 'info';
  missionId?: string;
  runId?: string;
  at: number;
  expiresAt?: number;
};

function missionRecoverySuccessDetail(
  missionId: string,
  runId?: string,
  refreshFailures = 0,
  recoveryAudit?: CreateMissionResponse['recoveryAudit'],
) {
  const runText = runId ? `，Run ${runId}` : '';
  const recoveryText = recoveryAudit?.reusedExistingRetry
    ? '已有相同恢复任务在队列或执行中，本次没有重复入队。'
    : '恢复任务已提交。';
  const costText = recoveryAudit?.costHint
    ? `预计 ${recoveryAudit.costHint.label}，${recoveryAudit.costHint.estimate}。`
    : '';
  const refreshText = refreshFailures > 0
    ? '任务已提交，但部分工作台数据刷新失败，后续轮询会继续补齐。'
    : '关联机会、Inbox、队列和健康状态已刷新。';
  return `Mission ${missionId}${runText} 已入队。${recoveryText}${costText}${refreshText}`;
}

export function useOpportunityMissionActions({
  openMission,
  refreshInboxItem,
  refreshOpportunity,
  refreshBoardHealth,
  refreshQueue,
  setActionError,
  setDetailError,
  setDetailOpportunity,
}: OpportunityMissionActionOptions) {
  const recoveryActionLockRef = useRef<string | null>(null);
  const [recoveringMissionActionKey, setRecoveringMissionActionKey] = useState<string | null>(null);
  const [missionRecoveryActionFeedback, setMissionRecoveryActionFeedback] = useState<MissionRecoveryActionFeedback | null>(null);
  const clearMissionRecoveryActionFeedback = useCallback(() => {
    setMissionRecoveryActionFeedback(null);
  }, []);

  useEffect(() => {
    const expiresAt = missionRecoveryActionFeedback?.expiresAt;
    if (!expiresAt) return undefined;

    const delayMs = Math.max(0, expiresAt - Date.now());
    const feedbackAt = missionRecoveryActionFeedback.at;
    const timeoutId = window.setTimeout(() => {
      setMissionRecoveryActionFeedback((current) => (
        current?.at === feedbackAt && shouldDismissMissionRecoveryFeedback(current.expiresAt)
          ? null
          : current
      ));
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [missionRecoveryActionFeedback?.at, missionRecoveryActionFeedback?.expiresAt]);

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
      setActionError(workbenchActionErrorMessage(error, '分析任务创建失败'));
    }
  }, [openMission, setActionError]);

  const recoverOpportunityMission = useCallback(async (
    opportunity: OpportunitySummary,
    action: MissionRecoveryAction,
  ) => {
    if (!opportunity.latestMission) return;

    const actionKey = `${opportunity.id}:${action.id}`;
    if (recoveryActionLockRef.current) return;
    recoveryActionLockRef.current = actionKey;
    setRecoveringMissionActionKey(actionKey);
    setActionError(null);
    setDetailError(null);
    const pendingAt = Date.now();
    setMissionRecoveryActionFeedback({
      opportunityId: opportunity.id,
      actionId: action.id,
      actionLabel: action.label,
      status: 'pending',
      label: `正在${action.label}`,
      detail: '正在提交恢复动作，并准备刷新关联 Opportunity、Inbox、队列和健康状态。',
      at: pendingAt,
      expiresAt: missionRecoveryFeedbackExpiresAt('pending', pendingAt),
    });

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

      const refreshResults = await Promise.allSettled([
        refreshOpportunity(opportunity.id),
        refreshInboxItem(opportunity.id),
        refreshBoardHealth(),
        refreshQueue ? refreshQueue() : Promise.resolve(null),
      ]);
      const updatedResult = refreshResults[0];
      const updated = updatedResult.status === 'fulfilled' ? updatedResult.value : null;
      if (updated) {
        setDetailOpportunity((current) => (current?.id === updated.id ? updated : current));
      }
      const refreshFailures = refreshResults.filter((result) => result.status === 'rejected').length;
      const successAt = Date.now();
      setMissionRecoveryActionFeedback({
        opportunityId: opportunity.id,
        actionId: action.id,
        actionLabel: action.label,
        status: 'success',
        label: `${action.label}已提交`,
        detail: missionRecoverySuccessDetail(mission.missionId, mission.runId, refreshFailures, mission.recoveryAudit),
        missionId: mission.missionId,
        runId: mission.runId,
        at: successAt,
        expiresAt: missionRecoveryFeedbackExpiresAt('success', successAt),
      });
    } catch (error) {
      const message = workbenchActionErrorMessage(error, '任务恢复失败');
      const advice = missionRecoveryFailureAdvice(error, action);
      const displayMessage = `${message}。建议：${advice.detail}`;
      setActionError(displayMessage);
      setDetailError(displayMessage);
      const errorAt = Date.now();
      setMissionRecoveryActionFeedback({
        opportunityId: opportunity.id,
        actionId: action.id,
        actionLabel: action.label,
        status: 'error',
        label: `${action.label}失败`,
        detail: message,
        suggestionLabel: advice.label,
        suggestionDetail: advice.detail,
        suggestionTone: advice.tone,
        at: errorAt,
        expiresAt: missionRecoveryFeedbackExpiresAt('error', errorAt),
      });
    } finally {
      recoveryActionLockRef.current = null;
      setRecoveringMissionActionKey(null);
    }
  }, [
    refreshBoardHealth,
    refreshInboxItem,
    refreshOpportunity,
    refreshQueue,
    setActionError,
    setDetailError,
    setDetailOpportunity,
  ]);

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
    executePrimaryAction,
    launchOpportunityAnalysis,
    clearMissionRecoveryActionFeedback,
    missionRecoveryActionFeedback,
    recoverOpportunityMission,
    recoveringMissionActionKey,
  };
}
