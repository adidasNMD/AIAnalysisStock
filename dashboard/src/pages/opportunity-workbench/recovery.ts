import type { OpportunitySummary } from '../../api';

export type RecoveryDepth = 'quick' | 'standard' | 'deep';
export type MissionRecoveryAction = {
  id: string;
  label: string;
  detail: string;
  kind: 'retry' | 'retry_depth' | 'review';
  depth?: RecoveryDepth;
};

export function isRecoverableMissionStatus(status?: string | null): boolean {
  return status === 'failed' || status === 'canceled';
}

export function recoveryStatusLabel(status?: string | null) {
  if (status === 'failed') return 'FAILED';
  if (status === 'canceled') return 'CANCELED';
  return null;
}

export function recoverySummary(opportunity: OpportunitySummary) {
  const status = opportunity.latestMission?.status;
  if (!isRecoverableMissionStatus(status)) return null;

  if (status === 'failed') {
    return {
      label: '任务失败待恢复',
      detail: opportunity.latestEventMessage || '最近一次 Mission 失败，可以原样重跑、切换深度，或先发起复核任务。',
    };
  }

  return {
    label: '任务已取消',
    detail: opportunity.latestEventMessage || '最近一次 Mission 已取消，可以恢复原任务，或用较轻深度重新验证。',
  };
}

export function buildMissionRecoveryActions(opportunity: OpportunitySummary): MissionRecoveryAction[] {
  const status = opportunity.latestMission?.status;
  if (!isRecoverableMissionStatus(status)) return [];

  const retryLabel = status === 'failed' ? '重跑原任务' : '恢复任务';
  const reviewLabel = status === 'failed' ? '复核失败原因' : '复核取消原因';
  const reviewDepth: RecoveryDepth = status === 'failed' ? 'standard' : 'quick';

  return [
    {
      id: 'retry_same',
      label: retryLabel,
      detail: '沿用原 mission input 和深度重新入队。',
      kind: 'retry',
    },
    {
      id: 'retry_quick',
      label: 'Quick 重跑',
      detail: '用轻量深度先确认数据源和核心链路是否恢复。',
      kind: 'retry_depth',
      depth: 'quick',
    },
    {
      id: 'retry_deep',
      label: 'Deep 重跑',
      detail: '直接做完整深度，适合确认机会仍然重要时使用。',
      kind: 'retry_depth',
      depth: 'deep',
    },
    {
      id: 'review_recovery',
      label: reviewLabel,
      detail: '新建 review mission，专门复核异常原因和后续动作。',
      kind: 'review',
      depth: reviewDepth,
    },
  ];
}

export function recoveryTickers(opportunity: OpportunitySummary): string[] | undefined {
  const tickers = [
    opportunity.primaryTicker,
    opportunity.leaderTicker,
    opportunity.proxyTicker,
    ...opportunity.relatedTickers,
    ...opportunity.relayTickers,
  ].filter((ticker): ticker is string => Boolean(ticker));

  const deduped = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  return deduped.length > 0 ? deduped : undefined;
}
