import type { PreTradeChecklistItem } from './pretrade';
import {
  readWorkbenchStorageJson,
  writeWorkbenchStorageJson,
} from './workbench-storage';

export const PRETRADE_PROGRESS_STORAGE_KEY = 'opportunity-workbench-pretrade-progress-v1';

export type PreTradeItemProgress = {
  completed: boolean;
  updatedAt: string;
  completedAt?: string;
  evidence?: string;
};

export type PreTradeProgressState = Record<string, Record<string, PreTradeItemProgress>>;

export type PreTradeProgressPatch = {
  completed?: boolean;
  evidence?: string;
};

export type PreTradeProgressSummary = {
  actionable: number;
  completed: number;
  remaining: number;
  blockingRemaining: number;
  warningRemaining: number;
  label: string;
  detail: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 240) : undefined;
}

function normalizeProgressItem(value: unknown): PreTradeItemProgress | null {
  if (!isObject(value)) return null;
  const updatedAt = normalizeText(value.updatedAt);
  if (!updatedAt) return null;
  const completed = value.completed === true;
  return {
    completed,
    updatedAt,
    ...(completed ? { completedAt: normalizeText(value.completedAt) || updatedAt } : {}),
    ...(normalizeText(value.evidence) ? { evidence: normalizeText(value.evidence) } : {}),
  };
}

export function normalizePreTradeProgress(value: unknown): PreTradeProgressState {
  if (!isObject(value)) return {};
  const normalized: PreTradeProgressState = {};

  Object.entries(value).forEach(([opportunityId, opportunityValue]) => {
    if (!isObject(opportunityValue)) return;
    const opportunityProgress: Record<string, PreTradeItemProgress> = {};

    Object.entries(opportunityValue).forEach(([itemId, itemValue]) => {
      const item = normalizeProgressItem(itemValue);
      if (item) opportunityProgress[itemId] = item;
    });

    if (Object.keys(opportunityProgress).length > 0) {
      normalized[opportunityId] = opportunityProgress;
    }
  });

  return normalized;
}

export function readPreTradeProgress(): PreTradeProgressState {
  return readWorkbenchStorageJson(PRETRADE_PROGRESS_STORAGE_KEY, {}, normalizePreTradeProgress);
}

export function writePreTradeProgress(progress: PreTradeProgressState): boolean {
  return writeWorkbenchStorageJson(PRETRADE_PROGRESS_STORAGE_KEY, progress);
}

export function getPreTradeItemProgress(
  progress: PreTradeProgressState,
  opportunityId: string,
  itemId: string,
): PreTradeItemProgress | null {
  return progress[opportunityId]?.[itemId] || null;
}

export function updatePreTradeProgress(
  progress: PreTradeProgressState,
  opportunityId: string,
  itemId: string,
  patch: PreTradeProgressPatch,
  nowMs = Date.now(),
): PreTradeProgressState {
  const updatedAt = new Date(nowMs).toISOString();
  const previous = progress[opportunityId]?.[itemId];
  const completed = patch.completed ?? previous?.completed ?? false;
  const evidence = patch.evidence !== undefined ? normalizeText(patch.evidence) : previous?.evidence;
  const nextItem: PreTradeItemProgress = {
    completed,
    updatedAt,
    ...(completed ? { completedAt: previous?.completedAt || updatedAt } : {}),
    ...(evidence ? { evidence } : {}),
  };

  return {
    ...progress,
    [opportunityId]: {
      ...(progress[opportunityId] || {}),
      [itemId]: nextItem,
    },
  };
}

export function summarizePreTradeProgress(
  items: PreTradeChecklistItem[],
  progress: PreTradeProgressState,
  opportunityId: string,
): PreTradeProgressSummary {
  const actionableItems = items.filter((item) => item.status !== 'pass');
  const completed = actionableItems.filter((item) => (
    getPreTradeItemProgress(progress, opportunityId, item.id)?.completed
  )).length;
  const remainingItems = actionableItems.filter((item) => (
    !getPreTradeItemProgress(progress, opportunityId, item.id)?.completed
  ));
  const remaining = remainingItems.length;
  const blockingRemaining = remainingItems.filter((item) => item.status === 'block').length;
  const warningRemaining = remainingItems.filter((item) => item.status === 'warn').length;
  const label = actionableItems.length === 0
    ? '0 action item'
    : `${completed}/${actionableItems.length} confirmed`;
  const detail = actionableItems.length === 0
    ? '系统没有发现需要人工确认的交易前事项。'
    : remaining === 0
      ? '人工处理项已确认，但系统风险判断仍以最新数据为准。'
      : `${blockingRemaining} block / ${warningRemaining} warn 仍未确认。`;

  return {
    actionable: actionableItems.length,
    completed,
    remaining,
    blockingRemaining,
    warningRemaining,
    label,
    detail,
  };
}
