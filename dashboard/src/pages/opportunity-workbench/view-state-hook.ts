import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { OpportunityBoardHealthMap, OpportunityBoardType } from '../../api';
import {
  BOARD_FILTER_QUERY_KEYS,
  BOARD_TYPES,
  sameBoardFilters,
  type BoardFilterState,
  type InboxLane,
} from './model';
import {
  buildSavedViewLabel,
  cleanBoardFilters,
  countBoardFilters,
  normalizeWorkbenchSearchQuery,
  parseBoardFiltersFromSearchParams,
  readStoredWorkbenchViews,
  writeStoredWorkbenchViews,
  type WorkbenchSavedView,
} from './view-state';

interface WorkbenchViewStateOptions {
  liveBoardHealth: OpportunityBoardHealthMap | null;
  onFocusLane: (lane: InboxLane | null) => void;
}

export function useWorkbenchViewState({
  liveBoardHealth,
  onFocusLane,
}: WorkbenchViewStateOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeBoardFilters, setActiveBoardFilters] = useState<BoardFilterState>({});
  const [searchQuery, setSearchQuery] = useState(() => normalizeWorkbenchSearchQuery(searchParams.get('q')));
  const [viewLane, setViewLane] = useState<InboxLane | null>(null);
  const [savedViews, setSavedViews] = useState<WorkbenchSavedView[]>(() => readStoredWorkbenchViews());
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

  const syncWorkbenchViewState = useCallback((
    nextSearchQuery: string,
    nextFilters: BoardFilterState,
    replace = false,
  ) => {
    const normalizedQuery = normalizeWorkbenchSearchQuery(nextSearchQuery);
    const normalizedFilters = cleanBoardFilters(nextFilters);
    setSearchQuery(normalizedQuery);
    setActiveBoardFilters(normalizedFilters);

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
    setSearchParams(nextParams, { replace });
  }, [searchParams, setSearchParams]);

  const syncBoardFilters = useCallback((nextFilters: BoardFilterState, replace = false) => {
    syncWorkbenchViewState(searchQuery, nextFilters, replace);
    setActiveSavedViewId(null);
  }, [searchQuery, syncWorkbenchViewState]);

  const syncSearchQuery = useCallback((nextQuery: string, replace = false) => {
    syncWorkbenchViewState(nextQuery, activeBoardFilters, replace);
    setActiveSavedViewId(null);
  }, [activeBoardFilters, syncWorkbenchViewState]);

  const focusWorkbenchLane = useCallback((lane: InboxLane | null) => {
    setViewLane(lane);
    setActiveSavedViewId(null);
    if (lane) {
      onFocusLane(lane);
    }
  }, [onFocusLane]);

  const saveCurrentWorkbenchView = useCallback(() => {
    const now = new Date().toISOString();
    const snapshot = {
      searchQuery,
      boardFilters: activeBoardFilters,
      focusLane: viewLane,
    };
    const view: WorkbenchSavedView = {
      id: activeSavedViewId || `view_${Date.now().toString(36)}`,
      label: buildSavedViewLabel(snapshot),
      ...snapshot,
      createdAt: savedViews.find((item) => item.id === activeSavedViewId)?.createdAt || now,
      updatedAt: now,
    };
    const nextViews = [view, ...savedViews.filter((item) => item.id !== view.id)].slice(0, 8);
    setSavedViews(nextViews);
    writeStoredWorkbenchViews(nextViews);
    setActiveSavedViewId(view.id);
  }, [activeBoardFilters, activeSavedViewId, savedViews, searchQuery, viewLane]);

  const applyWorkbenchView = useCallback((view: WorkbenchSavedView) => {
    setActiveSavedViewId(view.id);
    setViewLane(view.focusLane);
    syncWorkbenchViewState(view.searchQuery, view.boardFilters);
    if (view.focusLane) {
      window.requestAnimationFrame(() => onFocusLane(view.focusLane));
    }
  }, [onFocusLane, syncWorkbenchViewState]);

  const deleteWorkbenchView = useCallback((viewId: string) => {
    const nextViews = savedViews.filter((view) => view.id !== viewId);
    setSavedViews(nextViews);
    writeStoredWorkbenchViews(nextViews);
    if (activeSavedViewId === viewId) {
      setActiveSavedViewId(null);
    }
  }, [activeSavedViewId, savedViews]);

  const resetWorkbenchView = useCallback(() => {
    setViewLane(null);
    setActiveSavedViewId(null);
    syncWorkbenchViewState('', {}, true);
  }, [syncWorkbenchViewState]);

  const toggleBoardFilter = useCallback((type: OpportunityBoardType, metricKey: string, count: number) => {
    if (metricKey === 'cards' || count === 0) return;
    const nextFilters = {
      ...activeBoardFilters,
      [type]: activeBoardFilters[type] === metricKey ? null : metricKey,
    };
    syncBoardFilters(nextFilters);
  }, [activeBoardFilters, syncBoardFilters]);

  const clearBoardFilter = useCallback((type: OpportunityBoardType) => {
    syncBoardFilters({ ...activeBoardFilters, [type]: null });
  }, [activeBoardFilters, syncBoardFilters]);

  useEffect(() => {
    const result = parseBoardFiltersFromSearchParams(searchParams, liveBoardHealth);
    setActiveBoardFilters((current) => (
      sameBoardFilters(current, result.filters) ? current : result.filters
    ));

    if (result.normalized) {
      setSearchParams(result.normalizedParams, { replace: true });
    }
  }, [liveBoardHealth, searchParams, setSearchParams]);

  useEffect(() => {
    const nextQuery = normalizeWorkbenchSearchQuery(searchParams.get('q'));
    setSearchQuery((current) => (current === nextQuery ? current : nextQuery));
  }, [searchParams]);

  const activeFilterCount = useMemo(() => countBoardFilters(activeBoardFilters), [activeBoardFilters]);

  return {
    activeBoardFilters,
    activeFilterCount,
    activeSavedViewId,
    savedViews,
    searchQuery,
    viewLane,
    syncBoardFilters,
    syncSearchQuery,
    focusWorkbenchLane,
    saveCurrentWorkbenchView,
    applyWorkbenchView,
    deleteWorkbenchView,
    resetWorkbenchView,
    toggleBoardFilter,
    clearBoardFilter,
  };
}
