import {
  buildLatestMissionDiff,
  getLatestMissionRun,
  getMission,
  getMissionEvidence,
  getMissionEvidenceFromIndex,
  getMissionFromCanonicalIndex,
  getMissionFromIndex,
  listMissionEvents,
  listMissionEventsFromIndex,
  listMissionArtifactRefs,
  listMissionRuns,
  listMissions,
  listMissionsFromCanonicalIndex,
  listMissionsFromIndex,
  retryMissionRun,
  type MissionEventRecord,
  type MissionInput,
  type MissionRunRecord,
  type MissionStatus,
} from '../../workflows';
import {
  buildOffsetPage,
  offsetPageFetchLimit,
  type PageEnvelope,
  type PaginationRequest,
} from '../route-helpers';

type MissionRecoverySeverity = 'info' | 'warning' | 'critical';
type MissionRecoveryActionKind = 'retry' | 'retry_depth' | 'review' | 'inspect' | 'diagnostic';
type MissionRecoveryActionId =
  | 'retry_same'
  | 'retry_quick'
  | 'retry_deep'
  | 'review_recovery'
  | 'inspect_trace'
  | 'check_services';
type MissionRecoveryCostTier = 'low' | 'medium' | 'high';

export interface MissionRecoveryCostHint {
  tier: MissionRecoveryCostTier;
  label: string;
  estimate: string;
  detail: string;
}

export interface MissionRecoveryEventSummary {
  id: string;
  timestamp: string;
  action: string;
  label: string;
  reusedExistingRetry: boolean;
  message?: string;
  depth?: MissionInput['depth'];
  costHint?: MissionRecoveryCostHint;
  taskId?: string;
  runId?: string;
  idempotencyKey?: string;
  dedupeKey?: string;
}

export interface MissionRecoveryAction {
  id: MissionRecoveryActionId;
  label: string;
  detail: string;
  kind: MissionRecoveryActionKind;
  depth?: NonNullable<MissionInput['depth']>;
  priority: number;
  costHint?: MissionRecoveryCostHint;
}

export interface MissionRecoverySuggestion {
  missionId: string;
  recoverable: boolean;
  latestRun?: MissionRunRecord;
  summary: {
    label: string;
    detail: string;
    severity: MissionRecoverySeverity;
  };
  suggestedActions: MissionRecoveryAction[];
  reason: {
    status: MissionStatus;
    runStatus?: MissionRunRecord['status'];
    stage?: MissionRunRecord['stage'];
    failureCode?: string;
    failureMessage?: string;
    degradedFlags?: string[];
    cancelRequestedAt?: string;
  };
}

interface RetryMissionApiInput {
  depth?: MissionInput['depth'];
  source?: string;
  idempotencyKey?: string;
}

function recoveryCostHintForDepth(depth: MissionInput['depth'] | undefined, fallbackLabel = '沿用原深度'): MissionRecoveryCostHint {
  if (depth === 'quick') {
    return {
      tier: 'low',
      label: '低成本',
      estimate: '约 1-3 分钟',
      detail: '先验证数据源和核心链路是否恢复，适合失败后第一步。',
    };
  }

  if (depth === 'deep') {
    return {
      tier: 'high',
      label: '高成本',
      estimate: '约 8-15 分钟',
      detail: '重新补齐完整证据链，适合机会仍重要且 Quick 已确认链路正常时。',
    };
  }

  if (depth === 'standard') {
    return {
      tier: 'medium',
      label: '中成本',
      estimate: '约 3-6 分钟',
      detail: '在速度和证据覆盖之间折中，适合复核失败原因。',
    };
  }

  return {
    tier: 'medium',
    label: fallbackLabel,
    estimate: '取决于原任务深度',
    detail: '沿用原 Mission input 和深度，适合想保留原始执行语义时。',
  };
}

function createRecoveryAction(input: MissionRecoveryAction): MissionRecoveryAction {
  return input;
}

function retrySameAction(status: 'failed' | 'canceled'): MissionRecoveryAction {
  return createRecoveryAction({
    id: 'retry_same',
    label: status === 'failed' ? '重跑原任务' : '恢复任务',
    detail: '沿用原 mission input 和深度重新入队，保留机会卡联动关系。',
    kind: 'retry',
    priority: 100,
    costHint: recoveryCostHintForDepth(undefined),
  });
}

function retryDepthAction(
  depth: NonNullable<MissionInput['depth']>,
  priority: number,
  detail: string,
): MissionRecoveryAction {
  return createRecoveryAction({
    id: depth === 'quick' ? 'retry_quick' : 'retry_deep',
    label: `${depth[0]?.toUpperCase()}${depth.slice(1)} 重跑`,
    detail,
    kind: 'retry_depth',
    depth,
    priority,
    costHint: recoveryCostHintForDepth(depth),
  });
}

function reviewRecoveryAction(status: 'failed' | 'canceled' | 'degraded'): MissionRecoveryAction {
  const labelMap = {
    failed: '复核失败原因',
    canceled: '复核取消原因',
    degraded: '复核降级结果',
  };

  return createRecoveryAction({
    id: 'review_recovery',
    label: labelMap[status],
    detail: '新建 review mission，专门复核异常原因、影响范围和下一步动作。',
    kind: 'review',
    depth: status === 'failed' ? 'standard' : 'quick',
    priority: status === 'degraded' ? 80 : 70,
    costHint: recoveryCostHintForDepth(status === 'failed' ? 'standard' : 'quick'),
  });
}

function inspectTraceAction(): MissionRecoveryAction {
  return createRecoveryAction({
    id: 'inspect_trace',
    label: '查看执行轨迹',
    detail: '检查最近 run 的阶段、心跳、错误信息和证据产物。',
    kind: 'inspect',
    priority: 60,
  });
}

function checkServicesAction(): MissionRecoveryAction {
  return createRecoveryAction({
    id: 'check_services',
    label: '检查依赖服务',
    detail: '确认 OpenClaw、TradingAgents、OpenBB 等外部执行链路是否健康。',
    kind: 'diagnostic',
    priority: 50,
  });
}

function buildRecoveryReason(missionStatus: MissionStatus, latestRun: MissionRunRecord | null): MissionRecoverySuggestion['reason'] {
  return {
    status: missionStatus,
    ...(latestRun ? {
      runStatus: latestRun.status,
      stage: latestRun.stage,
    } : {}),
    ...(latestRun?.failureCode ? { failureCode: latestRun.failureCode } : {}),
    ...(latestRun?.failureMessage ? { failureMessage: latestRun.failureMessage } : {}),
    ...(latestRun?.degradedFlags && latestRun.degradedFlags.length > 0 ? { degradedFlags: latestRun.degradedFlags } : {}),
    ...(latestRun?.cancelRequestedAt ? { cancelRequestedAt: latestRun.cancelRequestedAt } : {}),
  };
}

function failureDetail(latestRun: MissionRunRecord | null): string {
  if (latestRun?.failureCode === 'timeout') {
    return '最近一次 run 超时，建议先 Quick 重跑确认外部服务恢复；如果机会仍重要，再 Deep 重跑补齐证据。';
  }

  if (latestRun?.failureCode === 'rate_limited') {
    return '最近一次 run 触发限流，建议等待一段时间后 Quick 重跑，或降低并发再恢复。';
  }

  if (latestRun?.failureCode === 'upstream_unavailable') {
    return '最近一次 run 的上游依赖不可用，建议先检查服务健康，再恢复任务。';
  }

  if (latestRun?.failureCode === 'validation_failed') {
    return '最近一次 run 的输入或结构校验失败，建议先检查 Mission 输入、payload hash 和证据结构。';
  }

  if (latestRun?.failureCode === 'execution_failed') {
    return '执行链路失败，建议先 Quick 重跑确认服务恢复；如果机会仍重要，再 Deep 重跑补齐完整证据。';
  }

  if (latestRun?.failureMessage) {
    return `最近一次 run 失败：${latestRun.failureMessage}`;
  }

  return '最近一次 Mission 失败，可以原样重跑、切换深度，或先发起复核任务。';
}

function degradedDetail(latestRun: MissionRunRecord | null): string {
  const flags = latestRun?.degradedFlags?.join(', ');
  if (flags) {
    return `最近一次 run 已完成，但存在降级标记：${flags}。建议复核缺失链路，必要时 Deep 重跑补证据。`;
  }

  return 'Mission 已生成主报告，但部分增强链路没有完整覆盖，建议复核或补跑深度任务。';
}

function stringMetaValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function booleanMetaValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function missionDepthMetaValue(value: unknown): MissionInput['depth'] | undefined {
  return value === 'quick' || value === 'standard' || value === 'deep' ? value : undefined;
}

function recoveryCostTierMetaValue(value: unknown): MissionRecoveryCostTier | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function recoveryCostHintMetaValue(value: unknown): MissionRecoveryCostHint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const tier = recoveryCostTierMetaValue(candidate.tier);
  const label = stringMetaValue(candidate.label);
  const estimate = stringMetaValue(candidate.estimate);
  const detail = stringMetaValue(candidate.detail);
  if (!tier || !label || !estimate || !detail) return undefined;
  return { tier, label, estimate, detail };
}

function recoveryEventLabel(action: string, reusedExistingRetry: boolean): string {
  if (reusedExistingRetry || action.startsWith('reused_')) {
    return '复用恢复';
  }
  if (action === 'queued_new_retry') {
    return '新建恢复';
  }
  return '恢复审计';
}

function toMissionRecoveryEventSummary(event: MissionEventRecord): MissionRecoveryEventSummary | null {
  const meta = event.meta || {};
  if (stringMetaValue(meta.operation) !== 'mission_retry') return null;

  const action = stringMetaValue(meta.recoveryAction) || stringMetaValue(meta.action);
  if (!action) return null;

  const reusedExistingRetry = booleanMetaValue(meta.reusedExistingRetry) ?? action.startsWith('reused_');
  const depth = missionDepthMetaValue(meta.depth);
  const costHint = recoveryCostHintMetaValue(meta.costHint);
  const taskId = stringMetaValue(meta.taskId);
  const runId = stringMetaValue(meta.runId);
  const idempotencyKey = stringMetaValue(meta.idempotencyKey);
  const dedupeKey = stringMetaValue(meta.dedupeKey);
  return {
    id: event.id,
    timestamp: event.timestamp,
    action,
    label: recoveryEventLabel(action, reusedExistingRetry),
    reusedExistingRetry,
    ...(event.message ? { message: event.message } : {}),
    ...(depth ? { depth } : {}),
    ...(costHint ? { costHint } : {}),
    ...(taskId ? { taskId } : {}),
    ...(runId ? { runId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
  };
}

function latestMissionRecoveryEvent(events: MissionEventRecord[]): MissionRecoveryEventSummary | undefined {
  return events
    .map(toMissionRecoveryEventSummary)
    .filter((event): event is MissionRecoveryEventSummary => Boolean(event))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
}

async function listMissionEventsWithLegacyFallback(id: string) {
  const indexedEvents = await listMissionEventsFromIndex(id);
  return indexedEvents.length > 0 ? indexedEvents : listMissionEvents(id);
}

export type MissionSummary = Awaited<ReturnType<typeof listMissionSummaries>>[number];

export async function listMissionSummaries(limit = 50) {
  const canonicalMissions = await listMissionsFromCanonicalIndex(limit);
  const indexedMissions = canonicalMissions.length > 0 ? canonicalMissions : await listMissionsFromIndex(limit);
  const missions = indexedMissions.length > 0 ? indexedMissions : listMissions(limit);

  return Promise.all(missions.map(async (mission) => {
    const runs = await listMissionRuns(mission.id);
    const latestRun = runs[0] || null;
    const latestDiff = buildLatestMissionDiff(mission, runs);
    const events = await listMissionEventsWithLegacyFallback(mission.id);
    const latestRecoveryEvent = latestMissionRecoveryEvent(events);

    return {
      id: mission.id,
      mode: mission.input.mode,
      query: mission.input.query,
      source: mission.input.source,
      status: mission.status,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      openclawTickers: mission.openclawTickers,
      taCount: mission.taResults.length,
      consensus: mission.consensus,
      totalDurationMs: mission.totalDurationMs,
      ...(latestRun ? { latestRun } : {}),
      ...(latestDiff ? { latestDiff } : {}),
      ...(latestRecoveryEvent ? { latestRecoveryEvent } : {}),
    };
  }));
}

export async function listMissionSummariesPage(
  pagination: Pick<PaginationRequest, 'limit' | 'offset'>,
): Promise<PageEnvelope<MissionSummary>> {
  const rows = await listMissionSummaries(offsetPageFetchLimit(pagination));
  return buildOffsetPage(rows, pagination);
}

export async function getMissionDetail(id: string) {
  return await getMissionFromCanonicalIndex(id) || await getMissionFromIndex(id) || getMission(id);
}

export async function listMissionEventsForApi(id: string) {
  return listMissionEventsWithLegacyFallback(id);
}

export async function listMissionArtifactsForApi(id: string) {
  const mission = await getMissionDetail(id);
  if (!mission) return { status: 'mission_not_found' as const };

  return {
    status: 'found' as const,
    artifacts: await listMissionArtifactRefs(mission.id),
  };
}

export async function listMissionRunsForApi(id: string) {
  return listMissionRuns(id);
}

export async function getMissionEvidenceForApi(missionId: string, runId: string) {
  const mission = await getMissionDetail(missionId);
  if (!mission) return { status: 'mission_not_found' as const };

  const evidence = await getMissionEvidenceFromIndex(runId) || getMissionEvidence(runId);
  if (!evidence || evidence.missionId !== mission.id) {
    return { status: 'evidence_not_found' as const };
  }

  return { status: 'found' as const, evidence };
}

export async function getMissionRecoveryForApi(missionId: string) {
  const mission = await getMissionDetail(missionId);
  if (!mission) return { status: 'mission_not_found' as const };

  const runs = await listMissionRuns(mission.id);
  const latestRun = runs[0] || null;
  const failed = mission.status === 'failed' || latestRun?.status === 'failed';
  const canceled = mission.status === 'canceled' || latestRun?.status === 'canceled';
  const degraded = mission.status === 'main_only' || Boolean(latestRun?.degradedFlags?.length);
  const reason = buildRecoveryReason(mission.status, latestRun);

  if (failed) {
    const suggestion: MissionRecoverySuggestion = {
      missionId: mission.id,
      recoverable: true,
      ...(latestRun ? { latestRun } : {}),
      summary: {
        label: '任务失败待恢复',
        detail: failureDetail(latestRun),
        severity: 'critical',
      },
      suggestedActions: [
        retrySameAction('failed'),
        retryDepthAction('quick', 95, '用轻量深度先确认数据源和核心链路是否恢复。'),
        retryDepthAction('deep', 85, '直接做完整深度，适合确认机会仍然重要时使用。'),
        reviewRecoveryAction('failed'),
        inspectTraceAction(),
        checkServicesAction(),
      ],
      reason,
    };

    return { status: 'found' as const, recovery: suggestion };
  }

  if (canceled) {
    const suggestion: MissionRecoverySuggestion = {
      missionId: mission.id,
      recoverable: true,
      ...(latestRun ? { latestRun } : {}),
      summary: {
        label: '任务已取消',
        detail: '最近一次 Mission 已取消，可以恢复原任务，或用较轻深度重新验证。',
        severity: 'warning',
      },
      suggestedActions: [
        retrySameAction('canceled'),
        retryDepthAction('quick', 90, '用轻量深度快速恢复机会状态，避免重新跑完整链路。'),
        reviewRecoveryAction('canceled'),
        inspectTraceAction(),
      ],
      reason,
    };

    return { status: 'found' as const, recovery: suggestion };
  }

  if (degraded) {
    const suggestion: MissionRecoverySuggestion = {
      missionId: mission.id,
      recoverable: true,
      ...(latestRun ? { latestRun } : {}),
      summary: {
        label: '结果已降级',
        detail: degradedDetail(latestRun),
        severity: 'warning',
      },
      suggestedActions: [
        reviewRecoveryAction('degraded'),
        retryDepthAction('deep', 75, '补跑完整深度，尽量补齐 TA、OpenBB 或宏观证据链路。'),
        inspectTraceAction(),
      ],
      reason,
    };

    return { status: 'found' as const, recovery: suggestion };
  }

  const active = mission.status === 'queued'
    || mission.status === 'triggered'
    || mission.status === 'main_running'
    || mission.status === 'ta_running'
    || latestRun?.status === 'queued'
    || latestRun?.status === 'running';

  const suggestion: MissionRecoverySuggestion = {
    missionId: mission.id,
    recoverable: false,
    ...(latestRun ? { latestRun } : {}),
    summary: active
      ? {
        label: '任务仍在执行',
        detail: 'Mission 尚未进入失败或取消状态，当前不建议触发恢复。',
        severity: 'info',
      }
      : {
        label: '无需恢复',
        detail: '最近一次 Mission 没有失败、取消或降级信号。',
        severity: 'info',
      },
    suggestedActions: [],
    reason,
  };

  return { status: 'found' as const, recovery: suggestion };
}

export async function retryMissionForApi(missionId: string, input: RetryMissionApiInput) {
  const existingMission = getMission(missionId);
  if (!existingMission) return { status: 'mission_not_found' as const };
  const latestRunBefore = await getLatestMissionRun(existingMission.id);
  const depth = input.depth || existingMission.input.depth || 'deep';

  const mission = await retryMissionRun(missionId, {
    source: input.source || 'manual_retry',
    priority: 90,
    depth,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  if (!mission) return { status: 'conflict' as const };

  const latestRun = await getLatestMissionRun(mission.id);
  const reusedExistingRetry = Boolean(latestRunBefore?.id && latestRun?.id === latestRunBefore.id);
  return {
    status: 'queued' as const,
    response: {
      success: true,
      message: 'Mission retry queued',
      missionId: mission.id,
      runId: latestRun?.id,
      recoveryAudit: {
        operation: 'mission_retry',
        action: reusedExistingRetry ? 'reused_existing_retry' : 'queued_new_retry',
        reusedExistingRetry,
        depth,
        costHint: recoveryCostHintForDepth(depth),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    },
  };
}
