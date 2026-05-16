import type { OpportunitySummary } from '../../api';
import { getFailureCodeInfo } from '../../utils/recovery';
import { isRecoverableMissionStatus } from './recovery-status';

export { isRecoverableMissionStatus };

export type RecoveryDepth = 'quick' | 'standard' | 'deep';
export type MissionRecoveryCostHint = {
  tier: 'low' | 'medium' | 'high';
  label: string;
  estimate: string;
  detail: string;
};
export type MissionRecoveryAction = {
  id: string;
  label: string;
  detail: string;
  kind: 'retry' | 'retry_depth' | 'review';
  depth?: RecoveryDepth;
  costHint?: MissionRecoveryCostHint;
};
export type MissionRecoveryMetaItem = {
  label: string;
  value: string;
  tone?: 'danger' | 'warning' | 'info';
  detail?: string;
};
export type MissionRecoveryDiagnosis = {
  label: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  primaryActionId: MissionRecoveryAction['id'];
  primaryActionLabel: string;
  serviceHint?: string;
};
export type MissionRecoveryFeedbackStatus = 'pending' | 'success' | 'error';
export type MissionRecoveryFailureAdvice = {
  label: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
};

export const MISSION_RECOVERY_SUCCESS_FEEDBACK_TTL_MS = 30_000;
export const MISSION_RECOVERY_ERROR_FEEDBACK_TTL_MS = 90_000;

export function missionRecoveryFeedbackExpiresAt(
  status: MissionRecoveryFeedbackStatus,
  nowMs: number,
): number | undefined {
  if (status === 'pending') return undefined;
  return nowMs + (
    status === 'success'
      ? MISSION_RECOVERY_SUCCESS_FEEDBACK_TTL_MS
      : MISSION_RECOVERY_ERROR_FEEDBACK_TTL_MS
  );
}

export function missionRecoveryFeedbackAutoDismissLabel(
  expiresAt?: number,
  nowMs = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const remainingSeconds = Math.max(1, Math.ceil((expiresAt - nowMs) / 1000));
  return remainingSeconds <= 1 ? '即将自动收起' : `约 ${remainingSeconds} 秒后自动收起`;
}

export function shouldDismissMissionRecoveryFeedback(expiresAt: number | undefined, nowMs = Date.now()): boolean {
  return Boolean(expiresAt && expiresAt <= nowMs);
}

function recoveryErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function recoveryErrorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error !== 'object') return String(error);

  const candidate = error as { message?: unknown; body?: unknown };
  const body = candidate.body;
  const parts: string[] = [];
  if (typeof candidate.message === 'string') parts.push(candidate.message);
  if (typeof body === 'string') {
    parts.push(body);
  } else if (body && typeof body === 'object') {
    const bodyObject = body as { error?: unknown; message?: unknown; code?: unknown };
    [bodyObject.error, bodyObject.message, bodyObject.code].forEach((value) => {
      if (typeof value === 'string') parts.push(value);
    });
  }

  return parts.join(' ');
}

export function missionRecoveryFailureAdvice(
  error: unknown,
  action?: MissionRecoveryAction,
): MissionRecoveryFailureAdvice {
  const status = recoveryErrorStatus(error);
  const text = recoveryErrorText(error).toLowerCase();

  if (status === 429 || /rate.?limit|too many|quota|限流/.test(text)) {
    return {
      label: '接口限流',
      detail: '先暂停几分钟，再用 Quick 重跑；如果连续限流，降低并发或缩小 ticker 篮子。',
      tone: 'warning',
    };
  }

  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /upstream|unavailable|gateway|openbb|tradingagents|service|服务不可用/.test(text)
  ) {
    return {
      label: '先检查服务',
      detail: '去 Command Center 看 OpenBB / TradingAgents 健康状态，服务恢复后先 Quick 重跑确认链路。',
      tone: 'danger',
    };
  }

  if (status === 408 || /timeout|timed out|超时/.test(text)) {
    return {
      label: '执行超时',
      detail: '先用 Quick 重跑确认链路是否恢复；如果仍超时，再检查上游服务或减少输入范围。',
      tone: 'warning',
    };
  }

  if (status === 400 || status === 422 || /validation|invalid|schema|input|payload|ticker|校验/.test(text)) {
    return {
      label: '复核输入',
      detail: '先检查原 Mission query、tickers、depth 和 Opportunity 关联关系，修正输入后再恢复。',
      tone: 'danger',
    };
  }

  if (status === 404 || /not found|missing|不存在/.test(text)) {
    return {
      label: '任务不存在',
      detail: '先打开机会详情确认 latest Mission 是否还存在；如果丢失，就新建复核任务重建上下文。',
      tone: 'warning',
    };
  }

  if (status === 409 || /conflict|running|active|already|冲突|运行中/.test(text)) {
    return {
      label: '状态冲突',
      detail: '先刷新队列和 Mission 状态，避免同一任务重复恢复；如果仍卡住，再去 Command Center 处理 stale run。',
      tone: 'warning',
    };
  }

  if (/network|failed to fetch|fetch failed|load failed/.test(text)) {
    return {
      label: '网络请求失败',
      detail: '先确认本地 API 服务和网络连接，再重试恢复动作。',
      tone: 'warning',
    };
  }

  if (action?.kind === 'review') {
    return {
      label: '复核任务未创建',
      detail: '先检查 Opportunity 输入和服务健康；必要时回到详情页手动调整后再创建 review mission。',
      tone: 'warning',
    };
  }

  if (action?.depth === 'deep') {
    return {
      label: 'Deep 重跑失败',
      detail: '先不要继续 Deep 重跑，改用 Quick 验证链路；链路正常后再补完整证据。',
      tone: 'warning',
    };
  }

  return {
    label: '恢复未完成',
    detail: '先刷新队列和机会状态；如果没有新 Run 入队，检查服务健康后再用 Quick 重跑。',
    tone: 'warning',
  };
}

export function recoveryStatusLabel(status?: string | null) {
  if (status === 'failed') return 'FAILED';
  if (status === 'canceled') return 'CANCELED';
  return null;
}

export function recoverySummary(opportunity: OpportunitySummary) {
  const status = opportunity.latestMission?.status;
  if (!isRecoverableMissionStatus(status)) return null;
  const failureInfo = getFailureCodeInfo(opportunity.latestRun?.failureCode);
  const stageText = opportunity.latestRun?.stage ? `阶段 ${opportunity.latestRun.stage}` : '';
  const failureText = failureInfo ? ` · ${failureInfo.label}` : '';

  if (status === 'failed') {
    return {
      label: '任务失败待恢复',
      detail: opportunity.latestEventMessage
        || `最近一次 Mission 失败${stageText || failureText ? `：${stageText}${failureText}` : ''}。可以原样重跑、切换深度，或先发起复核任务。`,
    };
  }

  return {
    label: '任务已取消',
    detail: opportunity.latestEventMessage
      || `最近一次 Mission 已取消${stageText ? `：${stageText}` : ''}。可以恢复原任务，或用较轻深度重新验证。`,
  };
}

export function recoveryActionGuidance(opportunity: OpportunitySummary): string | null {
  const status = opportunity.latestMission?.status;
  if (!isRecoverableMissionStatus(status)) return null;

  const failureCode = opportunity.latestRun?.failureCode;
  if (status === 'canceled') {
    return '建议顺序：恢复任务 → Quick 重跑 → 复核取消原因。';
  }
  if (failureCode === 'upstream_unavailable' || failureCode === 'rate_limited') {
    return '建议顺序：先检查服务 → Quick 重跑 → Deep 补证据。';
  }
  if (failureCode === 'timeout') {
    return '建议顺序：Quick 重跑确认链路 → Deep 补证据 → 复核失败原因。';
  }
  if (failureCode === 'validation_failed') {
    return '建议顺序：先复核失败原因 → 修正输入 → 再重跑。';
  }
  return '建议顺序：重跑原任务 → Quick 验证 → 必要时 Deep 补证据。';
}

function runText(opportunity: OpportunitySummary): string {
  return [
    opportunity.latestRun?.failureMessage,
    opportunity.latestEventMessage,
    opportunity.latestRun?.failureCode,
    ...(opportunity.latestRun?.degradedFlags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function missionRecoveryDiagnosis(opportunity: OpportunitySummary): MissionRecoveryDiagnosis | null {
  const status = opportunity.latestMission?.status;
  if (!isRecoverableMissionStatus(status)) return null;

  const failureCode = opportunity.latestRun?.failureCode;
  const text = runText(opportunity);
  const degradedFlags = opportunity.latestRun?.degradedFlags || [];

  if (status === 'canceled' || failureCode === 'canceled') {
    return {
      label: '主动取消',
      detail: '任务被用户或系统主动停止，不等同于分析结论失效。需要保留原上下文时先恢复任务；只想确认链路时用 Quick 重跑。',
      tone: 'info',
      primaryActionId: 'retry_same',
      primaryActionLabel: '恢复任务',
    };
  }

  if (failureCode === 'validation_failed' || /validation|invalid|schema|payload|hash|ticker|校验/.test(text)) {
    return {
      label: '输入或结构问题',
      detail: '失败更可能来自 Mission 输入、payload hash、ticker 或证据结构。先复核原因，修正输入后再恢复。',
      tone: 'danger',
      primaryActionId: 'review_recovery',
      primaryActionLabel: '复核失败原因',
    };
  }

  if (failureCode === 'timeout' || /timeout|timed out|超时/.test(text)) {
    return {
      label: '执行超时',
      detail: '任务卡在长请求或深度执行阶段。先 Quick 重跑确认链路，再决定是否 Deep 补齐证据。',
      tone: 'warning',
      primaryActionId: 'retry_quick',
      primaryActionLabel: 'Quick 重跑',
      serviceHint: '重复超时时优先检查 TradingAgents、OpenBB 和模型响应耗时。',
    };
  }

  if (failureCode === 'upstream_unavailable' || /upstream|unavailable|gateway|openbb|tradingagents|service|服务不可用/.test(text)) {
    return {
      label: '依赖服务异常',
      detail: '外部执行链路不可用或网关异常。先确认服务健康，恢复后用 Quick 重跑验证链路。',
      tone: 'danger',
      primaryActionId: 'retry_quick',
      primaryActionLabel: 'Quick 重跑',
      serviceHint: '先检查 Command Center 里的 OpenBB / TradingAgents / LLM 健康状态。',
    };
  }

  if (failureCode === 'rate_limited' || /rate.?limit|too many|quota|限流/.test(text)) {
    return {
      label: '接口限流',
      detail: '上游服务正在限流。等待窗口恢复后先用 Quick 重跑，不建议连续 Deep 重试。',
      tone: 'warning',
      primaryActionId: 'retry_quick',
      primaryActionLabel: 'Quick 重跑',
      serviceHint: '如果频繁限流，降低队列并发或缩小 tickers 输入。',
    };
  }

  if (failureCode === 'stale_recovered' || degradedFlags.includes('stale_recovered') || /stale|heartbeat|lease|恢复卡住/.test(text)) {
    return {
      label: '运行中断恢复',
      detail: '任务可能因为心跳丢失或 worker 中断被恢复。先恢复原任务保留上下文；若再次卡住，再 Quick 验证链路。',
      tone: 'warning',
      primaryActionId: 'retry_same',
      primaryActionLabel: '重跑原任务',
      serviceHint: '先确认没有同 mission 的活跃 run，避免重复恢复。',
    };
  }

  if (degradedFlags.includes('main_only')) {
    return {
      label: '部分降级',
      detail: '主报告已生成，但 enrichment 证据不完整。若机会仍重要，优先 Deep 重跑补齐 TA/OpenBB 证据。',
      tone: 'warning',
      primaryActionId: 'retry_deep',
      primaryActionLabel: 'Deep 重跑',
    };
  }

  return {
    label: '执行失败',
    detail: '失败原因尚未细分。先重跑原任务保持语义；如果再次失败，再用 Quick 验证链路或创建复核任务。',
    tone: 'warning',
    primaryActionId: 'retry_same',
    primaryActionLabel: '重跑原任务',
  };
}

export function buildMissionRecoveryMeta(opportunity: OpportunitySummary): MissionRecoveryMetaItem[] {
  const mission = opportunity.latestMission;
  if (!mission || !isRecoverableMissionStatus(mission.status)) return [];

  const run = opportunity.latestRun;
  const failureInfo = getFailureCodeInfo(run?.failureCode);
  const items: MissionRecoveryMetaItem[] = [];

  items.push({ label: 'mission', value: mission.status, tone: mission.status === 'failed' ? 'danger' : 'info' });
  if (run) {
    items.push({ label: 'run', value: `#${run.attempt} ${run.status}:${run.stage}`, tone: run.status === 'failed' ? 'danger' : run.status === 'canceled' ? 'info' : 'warning' });
  }
  if (failureInfo) {
    items.push({ label: 'failure', value: failureInfo.label, tone: failureInfo.tone, detail: failureInfo.detail });
  }
  if (run?.failureMessage) {
    items.push({ label: 'message', value: run.failureMessage, tone: 'warning' });
  }
  if (run?.degradedFlags?.length) {
    items.push({ label: 'degraded', value: run.degradedFlags.join(', '), tone: 'warning' });
  }
  if (run?.cancelRequestedAt) {
    items.push({ label: 'cancel', value: new Date(run.cancelRequestedAt).toLocaleString(), tone: 'info' });
  }
  if (mission.source) {
    items.push({ label: 'source', value: mission.source, tone: 'info' });
  }

  return items;
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
      costHint: {
        tier: 'medium',
        label: '沿用原深度',
        estimate: '取决于原任务',
        detail: '保留原 Mission input 和深度，适合想保持原始执行语义时。',
      },
    },
    {
      id: 'retry_quick',
      label: 'Quick 重跑',
      detail: '用轻量深度先确认数据源和核心链路是否恢复。',
      kind: 'retry_depth',
      depth: 'quick',
      costHint: {
        tier: 'low',
        label: '低成本',
        estimate: '约 1-3 分钟',
        detail: '适合失败后第一步确认链路。',
      },
    },
    {
      id: 'retry_deep',
      label: 'Deep 重跑',
      detail: '直接做完整深度，适合确认机会仍然重要时使用。',
      kind: 'retry_depth',
      depth: 'deep',
      costHint: {
        tier: 'high',
        label: '高成本',
        estimate: '约 8-15 分钟',
        detail: '适合 Quick 已确认链路正常后补齐完整证据。',
      },
    },
    {
      id: 'review_recovery',
      label: reviewLabel,
      detail: '新建 review mission，专门复核异常原因和后续动作。',
      kind: 'review',
      depth: reviewDepth,
      costHint: {
        tier: reviewDepth === 'quick' ? 'low' : 'medium',
        label: reviewDepth === 'quick' ? '低成本' : '中成本',
        estimate: reviewDepth === 'quick' ? '约 1-3 分钟' : '约 3-6 分钟',
        detail: '聚焦异常原因、影响范围和下一步动作。',
      },
    },
  ];
}

export function prioritizeMissionRecoveryActions(
  actions: MissionRecoveryAction[],
  primaryActionId?: string | null,
): MissionRecoveryAction[] {
  if (!primaryActionId || actions.length <= 1) return actions;

  const primary = actions.find((action) => action.id === primaryActionId);
  if (!primary) return actions;

  return [
    primary,
    ...actions.filter((action) => action.id !== primaryActionId),
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
