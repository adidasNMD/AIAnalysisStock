import {
  buildLatestMissionDiff,
  getLatestMissionRun,
  getMission,
  getMissionEvidence,
  getMissionEvidenceFromIndex,
  getMissionFromIndex,
  listMissionEvents,
  listMissionEventsFromIndex,
  listMissionRuns,
  listMissions,
  listMissionsFromIndex,
  retryMissionRun,
  type MissionInput,
  type MissionRunRecord,
  type MissionStatus,
} from '../../workflows';

type MissionRecoverySeverity = 'info' | 'warning' | 'critical';
type MissionRecoveryActionKind = 'retry' | 'retry_depth' | 'review' | 'inspect' | 'diagnostic';
type MissionRecoveryActionId =
  | 'retry_same'
  | 'retry_quick'
  | 'retry_deep'
  | 'review_recovery'
  | 'inspect_trace'
  | 'check_services';

export interface MissionRecoveryAction {
  id: MissionRecoveryActionId;
  label: string;
  detail: string;
  kind: MissionRecoveryActionKind;
  depth?: NonNullable<MissionInput['depth']>;
  priority: number;
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

export async function listMissionSummaries(limit = 50) {
  const indexedMissions = await listMissionsFromIndex(limit);
  const missions = indexedMissions.length > 0 ? indexedMissions : listMissions(limit);

  return Promise.all(missions.map(async (mission) => {
    const runs = await listMissionRuns(mission.id);
    const latestRun = runs[0] || null;
    const latestDiff = buildLatestMissionDiff(mission, runs);

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
    };
  }));
}

export async function getMissionDetail(id: string) {
  return await getMissionFromIndex(id) || getMission(id);
}

export async function listMissionEventsForApi(id: string) {
  const indexedEvents = await listMissionEventsFromIndex(id);
  return indexedEvents.length > 0 ? indexedEvents : listMissionEvents(id);
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

export async function retryMissionForApi(missionId: string, input: Partial<MissionInput>) {
  const existingMission = getMission(missionId);
  if (!existingMission) return { status: 'mission_not_found' as const };

  const mission = await retryMissionRun(missionId, {
    source: input.source || 'manual_retry',
    priority: 90,
    ...(input.depth ? { depth: input.depth } : {}),
  });
  if (!mission) return { status: 'conflict' as const };

  const latestRun = await getLatestMissionRun(mission.id);
  return {
    status: 'queued' as const,
    response: {
      success: true,
      message: 'Mission retry queued',
      missionId: mission.id,
      runId: latestRun?.id,
    },
  };
}
