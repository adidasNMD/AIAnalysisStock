import type {
  OpportunityBoardType,
  OpportunityInboxItem,
  OpportunitySummary,
} from '../../api';
import type { BoardFilterState, InboxLane } from './model';

export const WORKBENCH_VIEW_STORAGE_KEY = 'opportunity-workbench-saved-views-v1';
export const MAX_WORKBENCH_SAVED_VIEWS = 8;

const BOARD_FILTER_TYPES: OpportunityBoardType[] = ['ipo_spinout', 'relay_chain', 'proxy_narrative'];
const LANE_VALUES: InboxLane[] = ['act', 'review', 'monitor'];

export type WorkbenchSavedView = {
  id: string;
  label: string;
  searchQuery: string;
  boardFilters: BoardFilterState;
  focusLane: InboxLane | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkbenchViewSnapshot = Pick<
  WorkbenchSavedView,
  'label' | 'searchQuery' | 'boardFilters' | 'focusLane'
>;

export function normalizeWorkbenchSearchQuery(query: string | null | undefined) {
  return (query || '').replace(/\s+/g, ' ').trim();
}

function searchTextForOpportunity(item: OpportunitySummary | OpportunityInboxItem) {
  return [
    item.title,
    item.query,
    item.thesis,
    item.type,
    item.stage,
    item.status,
    item.primaryTicker,
    item.leaderTicker,
    item.proxyTicker,
    ...(item.relatedTickers || []),
    ...(item.relayTickers || []),
    item.latestMission?.query,
    'inboxSummary' in item ? item.inboxSummary : null,
  ].filter(Boolean).join(' ').toLowerCase();
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
  return BOARD_FILTER_TYPES.reduce<BoardFilterState>((next, type) => {
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

export function parseStoredWorkbenchViews(raw: string | null): WorkbenchSavedView[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((value): WorkbenchSavedView[] => {
      if (!value || typeof value !== 'object') return [];
      const candidate = value as Partial<WorkbenchSavedView>;
      if (typeof candidate.id !== 'string' || typeof candidate.label !== 'string') return [];

      return [{
        id: candidate.id,
        label: candidate.label.trim() || '全局视图',
        searchQuery: normalizeWorkbenchSearchQuery(candidate.searchQuery),
        boardFilters: cleanBoardFilters(candidate.boardFilters || {}),
        focusLane: isInboxLane(candidate.focusLane) ? candidate.focusLane : null,
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date(0).toISOString(),
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString(),
      }];
    }).slice(0, MAX_WORKBENCH_SAVED_VIEWS);
  } catch {
    return [];
  }
}

export function readStoredWorkbenchViews(): WorkbenchSavedView[] {
  if (typeof window === 'undefined') return [];
  return parseStoredWorkbenchViews(window.localStorage.getItem(WORKBENCH_VIEW_STORAGE_KEY));
}

export function writeStoredWorkbenchViews(views: WorkbenchSavedView[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    WORKBENCH_VIEW_STORAGE_KEY,
    JSON.stringify(views.slice(0, MAX_WORKBENCH_SAVED_VIEWS)),
  );
}
