import {
  emptyPage,
  fetchMissionsPage,
  type MissionEvent,
  type MissionRecoveryCostHint,
  type MissionRecoveryEventSummary,
  type MissionSummary,
  type PageEnvelope,
  type PageInfo,
} from '../api';
import { type PollingQueryResult, usePollingQuery } from './query-client';

export function useMissionListPageQuery(limit = 30) {
  return usePollingQuery<PageEnvelope<MissionSummary>>({
    queryKey: `missions:list-page:${limit}`,
    fetcher: () => fetchMissionsPage({ limit }),
    intervalMs: 5000,
    initialData: emptyPage<MissionSummary>(limit),
  });
}

export interface MissionListQueryResult extends Omit<PollingQueryResult<PageEnvelope<MissionSummary>>, 'data'> {
  data: MissionSummary[];
  pageInfo: PageInfo | null;
}

export function useMissionListQuery(limit = 30): MissionListQueryResult {
  const query = useMissionListPageQuery(limit);
  return {
    ...query,
    data: query.data?.items ?? [],
    pageInfo: query.data?.pageInfo ?? null,
  };
}

export type MissionRecoveryAuditTone = 'neutral' | 'warning' | 'changed' | 'stable';

export interface MissionRecoveryAuditInput {
  action: string;
  label?: string;
  reusedExistingRetry?: boolean;
  depth?: MissionRecoveryEventSummary['depth'];
  costHint?: MissionRecoveryCostHint;
  taskId?: string;
  runId?: string;
}

export function missionRecoveryAuditTone(event?: MissionRecoveryAuditInput | null): MissionRecoveryAuditTone {
  if (!event) return 'neutral';
  if (event.reusedExistingRetry || event.action.startsWith('reused_')) return 'warning';
  if (event.action === 'queued_new_retry') return 'changed';
  return 'stable';
}

export interface MissionRecoveryAuditMetaItem {
  key: 'depth' | 'cost' | 'run' | 'task';
  label: string;
  tone?: 'low' | 'medium' | 'high';
}

export interface MissionRecoveryAuditView {
  tone: MissionRecoveryAuditTone;
  label: string;
  meta: MissionRecoveryAuditMetaItem[];
  action: string;
}

function stringMetaValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function booleanMetaValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function missionDepthMetaValue(value: unknown): MissionRecoveryAuditInput['depth'] | undefined {
  return value === 'quick' || value === 'standard' || value === 'deep' ? value : undefined;
}

function missionRecoveryCostHintForDepth(
  depth: MissionRecoveryAuditInput['depth'],
): MissionRecoveryCostHint | undefined {
  if (depth === 'quick') {
    return {
      tier: 'low',
      label: '低成本',
      estimate: '约 1-3 分钟',
      detail: '先验证数据源和核心链路是否恢复。',
    };
  }
  if (depth === 'standard') {
    return {
      tier: 'medium',
      label: '中成本',
      estimate: '约 3-6 分钟',
      detail: '在速度和证据覆盖之间折中。',
    };
  }
  if (depth === 'deep') {
    return {
      tier: 'high',
      label: '高成本',
      estimate: '约 8-15 分钟',
      detail: '重新补齐完整证据链。',
    };
  }
  return undefined;
}

function recoveryCostTierMetaValue(value: unknown): MissionRecoveryCostHint['tier'] | undefined {
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

function missionRecoveryAuditLabel(event: MissionRecoveryAuditInput): string {
  if (event.label) return event.label;
  if (event.reusedExistingRetry || event.action.startsWith('reused_')) return '复用恢复';
  if (event.action === 'queued_new_retry') return '新建恢复';
  return '恢复审计';
}

export function buildMissionRecoveryAuditView(
  event?: MissionRecoveryAuditInput | null,
): MissionRecoveryAuditView | null {
  if (!event) return null;

  const meta: MissionRecoveryAuditMetaItem[] = [];
  if (event.depth) {
    meta.push({ key: 'depth', label: `${event.depth} 深度` });
  }
  if (event.costHint) {
    meta.push({
      key: 'cost',
      label: `${event.costHint.label} · ${event.costHint.estimate}`,
      tone: event.costHint.tier,
    });
  } else {
    const fallbackCostHint = missionRecoveryCostHintForDepth(event.depth);
    if (fallbackCostHint) {
      meta.push({
        key: 'cost',
        label: `${fallbackCostHint.label} · ${fallbackCostHint.estimate}`,
        tone: fallbackCostHint.tier,
      });
    }
  }
  if (event.taskId) {
    meta.push({ key: 'task', label: `task ${event.taskId}` });
  }
  if (event.runId) {
    meta.push({ key: 'run', label: `run ${event.runId}` });
  }

  return {
    tone: missionRecoveryAuditTone(event),
    label: missionRecoveryAuditLabel(event),
    meta,
    action: event.action,
  };
}

export function missionRecoveryEventFromMissionEvent(
  event: MissionEvent,
): MissionRecoveryEventSummary | null {
  const meta = event.meta || {};
  if (stringMetaValue(meta.operation) !== 'mission_retry') return null;

  const action = stringMetaValue(meta.recoveryAction) || stringMetaValue(meta.action);
  if (!action) return null;

  const reusedExistingRetry = booleanMetaValue(meta.reusedExistingRetry) ?? action.startsWith('reused_');
  const depth = missionDepthMetaValue(meta.depth);
  const costHint = recoveryCostHintMetaValue(meta.costHint) || missionRecoveryCostHintForDepth(depth);
  const taskId = stringMetaValue(meta.taskId);
  const runId = stringMetaValue(meta.runId);
  const idempotencyKey = stringMetaValue(meta.idempotencyKey);
  const dedupeKey = stringMetaValue(meta.dedupeKey);

  return {
    id: event.id,
    timestamp: event.timestamp,
    action,
    label: missionRecoveryAuditLabel({ action, reusedExistingRetry }),
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
