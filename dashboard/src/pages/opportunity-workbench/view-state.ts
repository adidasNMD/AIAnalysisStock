import type {
  OpportunityBoardHealthMap,
  OpportunityBoardType,
  OpportunityInboxItem,
  OpportunitySummary,
} from '../../api';
import {
  BOARD_FILTER_QUERY_KEYS,
  BOARD_TYPES,
  type BoardFilterState,
  type InboxLane,
} from './model';
import {
  WORKBENCH_LAST_VIEW_STORAGE_KEY,
  WORKBENCH_VIEW_STORAGE_KEY,
  parseWorkbenchStorageJson,
  readWorkbenchStorageJson,
  writeWorkbenchStorageJson,
} from './workbench-storage';

export {
  WORKBENCH_LAST_VIEW_STORAGE_KEY,
  WORKBENCH_VIEW_STORAGE_KEY,
} from './workbench-storage';

export const MAX_WORKBENCH_SAVED_VIEWS = 8;

const LANE_VALUES: InboxLane[] = ['act', 'review', 'monitor'];

export type WorkbenchSavedView = {
  id: string;
  label: string;
  searchQuery: string;
  boardFilters: BoardFilterState;
  focusLane: InboxLane | null;
  isPinned: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkbenchViewSnapshot = Pick<
  WorkbenchSavedView,
  'label' | 'searchQuery' | 'boardFilters' | 'focusLane'
>;

export type WorkbenchLastView = {
  searchQuery: string;
  boardFilters: BoardFilterState;
  focusLane: InboxLane | null;
  updatedAt: string;
};

export function normalizeWorkbenchSearchQuery(query: string | null | undefined) {
  return (query || '').replace(/\s+/g, ' ').trim();
}

export type WorkbenchSearchMatchReason = {
  field: string;
  label: string;
  value: string;
  tokens: string[];
};

export type WorkbenchSearchMatch = {
  query: string;
  tokens: string[];
  reasons: WorkbenchSearchMatchReason[];
};

type SearchField = {
  field: string;
  label: string;
  value: string;
};

function compactSearchValue(value: string | null | undefined) {
  const normalized = normalizeWorkbenchSearchQuery(value);
  return normalized || null;
}

function searchFieldsForOpportunity(item: OpportunitySummary | OpportunityInboxItem): SearchField[] {
  const fields: Array<SearchField | null> = [
    { field: 'title', label: '标题', value: compactSearchValue(item.title) || '' },
    { field: 'query', label: 'Query', value: compactSearchValue(item.query) || '' },
    { field: 'thesis', label: '论点', value: compactSearchValue(item.thesis) || '' },
    { field: 'type', label: '类型', value: compactSearchValue(item.type) || '' },
    { field: 'stage', label: '阶段', value: compactSearchValue(item.stage) || '' },
    { field: 'status', label: '状态', value: compactSearchValue(item.status) || '' },
    { field: 'primaryTicker', label: '主标的', value: compactSearchValue(item.primaryTicker) || '' },
    { field: 'leaderTicker', label: '龙头', value: compactSearchValue(item.leaderTicker) || '' },
    { field: 'proxyTicker', label: '代理', value: compactSearchValue(item.proxyTicker) || '' },
    { field: 'latestMission', label: '最新任务', value: compactSearchValue(item.latestMission?.query) || '' },
    'inboxSummary' in item
      ? { field: 'inboxSummary', label: 'Inbox', value: compactSearchValue(item.inboxSummary) || '' }
      : null,
    ...(item.relatedTickers || []).map((ticker) => ({
      field: 'relatedTickers',
      label: '相关标的',
      value: compactSearchValue(ticker) || '',
    })),
    ...(item.relayTickers || []).map((ticker) => ({
      field: 'relayTickers',
      label: '传导标的',
      value: compactSearchValue(ticker) || '',
    })),
  ];

  return fields.filter((field): field is SearchField => Boolean(field?.value));
}

function searchTextForOpportunity(item: OpportunitySummary | OpportunityInboxItem) {
  return searchFieldsForOpportunity(item).map((field) => field.value).join(' ').toLowerCase();
}

export function buildOpportunitySearchMatch(
  item: OpportunitySummary | OpportunityInboxItem,
  query: string,
): WorkbenchSearchMatch | null {
  const normalized = normalizeWorkbenchSearchQuery(query);
  if (!normalized) return null;

  const tokens = normalized.toLowerCase().split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  const fields = searchFieldsForOpportunity(item);
  const reasons = new Map<string, WorkbenchSearchMatchReason>();

  for (const token of tokens) {
    const matchedField = fields.find((field) => field.value.toLowerCase().includes(token));
    if (!matchedField) return null;

    const reasonKey = `${matchedField.field}:${matchedField.value}`;
    const existing = reasons.get(reasonKey);
    if (existing) {
      existing.tokens.push(token);
    } else {
      reasons.set(reasonKey, {
        field: matchedField.field,
        label: matchedField.label,
        value: matchedField.value,
        tokens: [token],
      });
    }
  }

  return {
    query: normalized,
    tokens,
    reasons: Array.from(reasons.values()),
  };
}

export function filterOpportunitiesBySearch<T extends OpportunitySummary | OpportunityInboxItem>(
  items: T[],
  query: string,
): T[] {
  const normalized = normalizeWorkbenchSearchQuery(query).toLowerCase();
  if (!normalized) return items;
  const tokens = normalized.split(' ').filter(Boolean);
  return items.filter((item) => {
    const haystack = searchTextForOpportunity(item);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function cleanBoardFilters(filters: BoardFilterState): BoardFilterState {
  return BOARD_TYPES.reduce<BoardFilterState>((next, type) => {
    const value = filters[type];
    if (typeof value === 'string' && value.trim()) {
      next[type] = value.trim();
    }
    return next;
  }, {});
}

export function countBoardFilters(filters: BoardFilterState) {
  return Object.values(cleanBoardFilters(filters)).filter(Boolean).length;
}

export function boardFilterExists(
  boardHealth: OpportunityBoardHealthMap | null,
  type: OpportunityBoardType,
  metricKey: string,
): boolean {
  if (!boardHealth) return true;
  return boardHealth[type].metrics.some((metric) => (
    metric.key === metricKey && metric.opportunityIds.length > 0
  ));
}

export function parseBoardFiltersFromSearchParams(
  searchParams: URLSearchParams,
  boardHealth: OpportunityBoardHealthMap | null,
): {
  filters: BoardFilterState;
  normalizedParams: URLSearchParams;
  normalized: boolean;
} {
  const filters: BoardFilterState = {};
  let normalized = false;
  const normalizedParams = new URLSearchParams(searchParams);

  BOARD_TYPES.forEach((type) => {
    const queryKey = BOARD_FILTER_QUERY_KEYS[type];
    const value = searchParams.get(queryKey);
    if (!value) return;

    if (boardFilterExists(boardHealth, type, value)) {
      filters[type] = value;
    } else {
      normalizedParams.delete(queryKey);
      normalized = true;
    }
  });

  return {
    filters,
    normalizedParams,
    normalized,
  };
}

export function hasWorkbenchViewSearchParams(searchParams: URLSearchParams): boolean {
  return Boolean(searchParams.get('q'))
    || BOARD_TYPES.some((type) => Boolean(searchParams.get(BOARD_FILTER_QUERY_KEYS[type])));
}

export function buildWorkbenchViewSearchParams(
  searchParams: URLSearchParams,
  searchQuery: string,
  filters: BoardFilterState,
): URLSearchParams {
  const normalizedQuery = normalizeWorkbenchSearchQuery(searchQuery);
  const normalizedFilters = cleanBoardFilters(filters);
  const nextParams = new URLSearchParams(searchParams);

  if (normalizedQuery) {
    nextParams.set('q', normalizedQuery);
  } else {
    nextParams.delete('q');
  }

  BOARD_TYPES.forEach((type) => {
    const value = normalizedFilters[type];
    const queryKey = BOARD_FILTER_QUERY_KEYS[type];
    if (value) {
      nextParams.set(queryKey, value);
    } else {
      nextParams.delete(queryKey);
    }
  });

  return nextParams;
}

export function buildSavedViewLabel(snapshot: Omit<WorkbenchViewSnapshot, 'label'>) {
  const parts: string[] = [];
  const searchQuery = normalizeWorkbenchSearchQuery(snapshot.searchQuery);
  const filterCount = countBoardFilters(snapshot.boardFilters);

  if (searchQuery) {
    parts.push(searchQuery.length > 18 ? `${searchQuery.slice(0, 18)}...` : searchQuery);
  }
  if (filterCount > 0) {
    parts.push(`${filterCount} filters`);
  }
  if (snapshot.focusLane) {
    parts.push(snapshot.focusLane.toUpperCase());
  }

  return parts.join(' / ') || '全局视图';
}

function isInboxLane(value: unknown): value is InboxLane {
  return typeof value === 'string' && LANE_VALUES.includes(value as InboxLane);
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function withSingleDefaultView(views: WorkbenchSavedView[]): WorkbenchSavedView[] {
  const defaultViewId = views
    .filter((view) => view.isDefault)
    .sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt))[0]?.id;

  if (!defaultViewId) return views;

  return views.map((view) => (
    view.id === defaultViewId
      ? view
      : { ...view, isDefault: false }
  ));
}

export function orderWorkbenchSavedViews(views: WorkbenchSavedView[]): WorkbenchSavedView[] {
  return withSingleDefaultView(views).sort((a, b) => (
    Number(b.isPinned) - Number(a.isPinned)
    || Number(b.isDefault) - Number(a.isDefault)
    || timestampValue(b.updatedAt) - timestampValue(a.updatedAt)
    || a.label.localeCompare(b.label)
  )).slice(0, MAX_WORKBENCH_SAVED_VIEWS);
}

function normalizeStoredWorkbenchViews(value: unknown): WorkbenchSavedView[] {
  if (!Array.isArray(value)) return [];

  return orderWorkbenchSavedViews(value.flatMap((item): WorkbenchSavedView[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<WorkbenchSavedView>;
    if (typeof candidate.id !== 'string' || typeof candidate.label !== 'string') return [];

    return [{
      id: candidate.id,
      label: candidate.label.trim() || '全局视图',
      searchQuery: normalizeWorkbenchSearchQuery(candidate.searchQuery),
      boardFilters: cleanBoardFilters(candidate.boardFilters || {}),
      focusLane: isInboxLane(candidate.focusLane) ? candidate.focusLane : null,
      isPinned: candidate.isPinned === true,
      isDefault: candidate.isDefault === true,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date(0).toISOString(),
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString(),
    }];
  }));
}

export function parseStoredWorkbenchViews(raw: string | null): WorkbenchSavedView[] {
  return parseWorkbenchStorageJson(raw, [], normalizeStoredWorkbenchViews);
}

export function readStoredWorkbenchViews(): WorkbenchSavedView[] {
  return readWorkbenchStorageJson(WORKBENCH_VIEW_STORAGE_KEY, [], normalizeStoredWorkbenchViews);
}

export function writeStoredWorkbenchViews(views: WorkbenchSavedView[]) {
  return writeWorkbenchStorageJson(
    WORKBENCH_VIEW_STORAGE_KEY,
    orderWorkbenchSavedViews(views),
  );
}

function normalizeStoredWorkbenchLastView(value: unknown): WorkbenchLastView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<WorkbenchLastView>;
  return {
    searchQuery: normalizeWorkbenchSearchQuery(candidate.searchQuery),
    boardFilters: cleanBoardFilters(candidate.boardFilters || {}),
    focusLane: isInboxLane(candidate.focusLane) ? candidate.focusLane : null,
    updatedAt: typeof candidate.updatedAt === 'string'
      ? candidate.updatedAt
      : new Date(0).toISOString(),
  };
}

export function parseStoredWorkbenchLastView(raw: string | null): WorkbenchLastView | null {
  return parseWorkbenchStorageJson(raw, null as WorkbenchLastView | null, normalizeStoredWorkbenchLastView);
}

export function readStoredWorkbenchLastView(): WorkbenchLastView | null {
  return readWorkbenchStorageJson(
    WORKBENCH_LAST_VIEW_STORAGE_KEY,
    null as WorkbenchLastView | null,
    normalizeStoredWorkbenchLastView,
  );
}

export function writeStoredWorkbenchLastView(snapshot: Omit<WorkbenchLastView, 'updatedAt'>) {
  return writeWorkbenchStorageJson(WORKBENCH_LAST_VIEW_STORAGE_KEY, {
    searchQuery: normalizeWorkbenchSearchQuery(snapshot.searchQuery),
    boardFilters: cleanBoardFilters(snapshot.boardFilters),
    focusLane: snapshot.focusLane,
    updatedAt: new Date().toISOString(),
  });
}
