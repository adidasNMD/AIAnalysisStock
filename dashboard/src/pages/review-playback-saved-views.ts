import type {
  OpportunityReviewPlaybackCategory,
  OpportunityReviewPlaybackTone,
  OpportunityType,
} from '../api';
import {
  parseWorkbenchStorageJson,
  readWorkbenchStorageJson,
  writeWorkbenchStorageJson,
} from './opportunity-workbench/workbench-storage';

export const REVIEW_PLAYBACK_SAVED_VIEWS_STORAGE_KEY = 'review-playback-saved-views-v1';

export type ReviewPlaybackCategoryFilter = OpportunityReviewPlaybackCategory | 'all';
export type ReviewPlaybackToneFilter = OpportunityReviewPlaybackTone | 'all';
export type ReviewPlaybackStrategyFilter = OpportunityType | 'all';

export interface ReviewPlaybackFilterSnapshot {
  q: string;
  opportunityId: string;
  category: ReviewPlaybackCategoryFilter;
  tone: ReviewPlaybackToneFilter;
  backtestTicker: string;
  backtestStrategy: ReviewPlaybackStrategyFilter;
  backtestFrom: string;
  backtestTo: string;
}

export interface ReviewPlaybackSavedView {
  id: string;
  label: string;
  filters: ReviewPlaybackFilterSnapshot;
  createdAt: string;
  updatedAt: string;
}

const MAX_REVIEW_PLAYBACK_SAVED_VIEWS = 10;
const CATEGORY_VALUES = new Set<ReviewPlaybackCategoryFilter>([
  'all',
  'mission',
  'pretrade',
  'evidence',
  'catalyst',
  'thesis',
  'signal',
  'status',
]);
const TONE_VALUES = new Set<ReviewPlaybackToneFilter>(['all', 'positive', 'warning', 'negative', 'neutral']);
const STRATEGY_VALUES = new Set<ReviewPlaybackStrategyFilter>([
  'all',
  'ipo_spinout',
  'relay_chain',
  'proxy_narrative',
  'ad_hoc',
]);

const STRATEGY_LABELS: Record<ReviewPlaybackStrategyFilter, string> = {
  all: 'All strategies',
  ipo_spinout: 'IPO / spinout',
  relay_chain: 'Relay chain',
  proxy_narrative: 'Proxy narrative',
  ad_hoc: 'Ad hoc',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function categoryValue(value: unknown): ReviewPlaybackCategoryFilter {
  return CATEGORY_VALUES.has(value as ReviewPlaybackCategoryFilter) ? value as ReviewPlaybackCategoryFilter : 'all';
}

function toneValue(value: unknown): ReviewPlaybackToneFilter {
  return TONE_VALUES.has(value as ReviewPlaybackToneFilter) ? value as ReviewPlaybackToneFilter : 'all';
}

function strategyValue(value: unknown): ReviewPlaybackStrategyFilter {
  return STRATEGY_VALUES.has(value as ReviewPlaybackStrategyFilter) ? value as ReviewPlaybackStrategyFilter : 'all';
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeReviewPlaybackFilterSnapshot(value: unknown): ReviewPlaybackFilterSnapshot {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<ReviewPlaybackFilterSnapshot>
    : {};
  return {
    q: text(candidate.q),
    opportunityId: text(candidate.opportunityId),
    category: categoryValue(candidate.category),
    tone: toneValue(candidate.tone),
    backtestTicker: text(candidate.backtestTicker).replace(/^\$/, '').toUpperCase(),
    backtestStrategy: strategyValue(candidate.backtestStrategy),
    backtestFrom: text(candidate.backtestFrom),
    backtestTo: text(candidate.backtestTo),
  };
}

export function buildReviewPlaybackSavedViewLabel(snapshot: ReviewPlaybackFilterSnapshot): string {
  const parts = [
    snapshot.backtestStrategy !== 'all' ? STRATEGY_LABELS[snapshot.backtestStrategy] : undefined,
    snapshot.backtestTicker || undefined,
    snapshot.backtestFrom && snapshot.backtestTo
      ? `${snapshot.backtestFrom} to ${snapshot.backtestTo}`
      : snapshot.backtestFrom || snapshot.backtestTo || undefined,
    snapshot.opportunityId || undefined,
    snapshot.q || undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.slice(0, 4).join(' · ') || 'All review playback';
}

export function orderReviewPlaybackSavedViews(views: ReviewPlaybackSavedView[]): ReviewPlaybackSavedView[] {
  return [...views]
    .sort((a, b) => (
      timestampValue(b.updatedAt) - timestampValue(a.updatedAt)
      || a.label.localeCompare(b.label)
    ))
    .slice(0, MAX_REVIEW_PLAYBACK_SAVED_VIEWS);
}

function normalizeStoredReviewPlaybackSavedViews(value: unknown): ReviewPlaybackSavedView[] {
  if (!Array.isArray(value)) return [];
  return orderReviewPlaybackSavedViews(value.flatMap((item): ReviewPlaybackSavedView[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<ReviewPlaybackSavedView>;
    if (typeof candidate.id !== 'string' || typeof candidate.label !== 'string') return [];
    const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date(0).toISOString();
    const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt;
    return [{
      id: candidate.id,
      label: candidate.label.trim() || buildReviewPlaybackSavedViewLabel(normalizeReviewPlaybackFilterSnapshot(candidate.filters)),
      filters: normalizeReviewPlaybackFilterSnapshot(candidate.filters),
      createdAt,
      updatedAt,
    }];
  }));
}

export function parseStoredReviewPlaybackSavedViews(raw: string | null): ReviewPlaybackSavedView[] {
  return parseWorkbenchStorageJson(raw, [], normalizeStoredReviewPlaybackSavedViews);
}

export function readStoredReviewPlaybackSavedViews(): ReviewPlaybackSavedView[] {
  return readWorkbenchStorageJson(
    REVIEW_PLAYBACK_SAVED_VIEWS_STORAGE_KEY,
    [],
    normalizeStoredReviewPlaybackSavedViews,
  );
}

export function writeStoredReviewPlaybackSavedViews(views: ReviewPlaybackSavedView[]): boolean {
  return writeWorkbenchStorageJson(
    REVIEW_PLAYBACK_SAVED_VIEWS_STORAGE_KEY,
    orderReviewPlaybackSavedViews(views),
  );
}
