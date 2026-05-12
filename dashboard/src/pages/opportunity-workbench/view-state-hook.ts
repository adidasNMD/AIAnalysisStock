import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { OpportunityBoardHealthMap, OpportunityBoardType } from '../../api';
import {
  sameBoardFilters,
  type BoardFilterState,
  type InboxLane,
} from './model';
import {
  buildWorkbenchViewSearchParams,
  buildSavedViewLabel,
  cleanBoardFilters,
  countBoardFilters,
  hasWorkbenchViewSearchParams,
  normalizeWorkbenchSearchQuery,
  orderWorkbenchSavedViews,
  parseBoardFiltersFromSearchParams,
  readStoredWorkbenchLastView,
  readStoredWorkbenchViews,
  writeStoredWorkbenchLastView,
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
  const [initialSavedViews] = useState(() => readStoredWorkbenchViews());
  const [initialViewRestore] = useState(() => {
    if (hasWorkbenchViewSearchParams(searchParams)) return null;

    const defaultView = initialSavedViews.find((view) => view.isDefault);
    if (defaultView) {
      return { kind: 'saved-view' as const, view: defaultView };
    }

    const lastView = readStoredWorkbenchLastView();
    return lastView ? { kind: 'last-view' as const, view: lastView } : null;
  });
  const [initialViewRestored, setInitialViewRestored] = useState(false);
  const [activeBoardFilters, setActiveBoardFilters] = useState<BoardFilterState>(
    () => initialViewRestore?.view.boardFilters || {},
  );
  const [searchQuery, setSearchQuery] = useState(() => (
    hasWorkbenchViewSearchParams(searchParams)
      ? normalizeWorkbenchSearchQuery(searchParams.get('q'))
      : initialViewRestore?.view.searchQuery || ''
  ));
  const [viewLane, setViewLane] = useState<InboxLane | null>(() => initialViewRestore?.view.focusLane || null);
  const [savedViews, setSavedViews] = useState<WorkbenchSavedView[]>(() => initialSavedViews);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(
    () => (initialViewRestore?.kind === 'saved-view' ? initialViewRestore.view.id : null),
  );

  const persistSavedViews = useCallback((nextViews: WorkbenchSavedView[]) => {
    const orderedViews = orderWorkbenchSavedViews(nextViews);
    setSavedViews(orderedViews);
    writeStoredWorkbenchViews(orderedViews);
    return orderedViews;
  }, []);

  const syncWorkbenchViewState = useCallback((
    nextSearchQuery: string,
    nextFilters: BoardFilterState,
    replace = false,
  ) => {
    const normalizedQuery = normalizeWorkbenchSearchQuery(nextSearchQuery);
    const normalizedFilters = cleanBoardFilters(nextFilters);
    setSearchQuery(normalizedQuery);
    setActiveBoardFilters(normalizedFilters);
    setSearchParams(
      buildWorkbenchViewSearchParams(searchParams, normalizedQuery, normalizedFilters),
      { replace },
    );
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
    const existingView = activeSavedViewId
      ? savedViews.find((item) => item.id === activeSavedViewId)
      : null;
    const view: WorkbenchSavedView = {
      id: activeSavedViewId || `view_${Date.now().toString(36)}`,
      label: buildSavedViewLabel(snapshot),
      ...snapshot,
      isPinned: existingView?.isPinned || false,
      isDefault: existingView?.isDefault || false,
      createdAt: existingView?.createdAt || now,
      updatedAt: now,
    };
    persistSavedViews([view, ...savedViews.filter((item) => item.id !== view.id)]);
    setActiveSavedViewId(view.id);
  }, [activeBoardFilters, activeSavedViewId, persistSavedViews, savedViews, searchQuery, viewLane]);

  const applyWorkbenchView = useCallback((view: WorkbenchSavedView) => {
    setActiveSavedViewId(view.id);
    setViewLane(view.focusLane);
    syncWorkbenchViewState(view.searchQuery, view.boardFilters);
    if (view.focusLane) {
      window.requestAnimationFrame(() => onFocusLane(view.focusLane));
    }
  }, [onFocusLane, syncWorkbenchViewState]);

  const deleteWorkbenchView = useCallback((viewId: string) => {
    persistSavedViews(savedViews.filter((view) => view.id !== viewId));
    if (activeSavedViewId === viewId) {
      setActiveSavedViewId(null);
    }
  }, [activeSavedViewId, persistSavedViews, savedViews]);

  const toggleSavedViewPin = useCallback((viewId: string) => {
    const now = new Date().toISOString();
    persistSavedViews(savedViews.map((view) => (
      view.id === viewId
        ? { ...view, isPinned: !view.isPinned, updatedAt: now }
        : view
    )));
  }, [persistSavedViews, savedViews]);

  const toggleDefaultSavedView = useCallback((viewId: string) => {
    const targetView = savedViews.find((view) => view.id === viewId);
    if (!targetView) return;

    const now = new Date().toISOString();
    const shouldSetDefault = !targetView.isDefault;
    persistSavedViews(savedViews.map((view) => ({
      ...view,
      isDefault: view.id === viewId ? shouldSetDefault : false,
      updatedAt: view.id === viewId ? now : view.updatedAt,
    })));
  }, [persistSavedViews, savedViews]);

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
    if (initialViewRestore && !initialViewRestored && !hasWorkbenchViewSearchParams(searchParams)) {
      setSearchParams(
        buildWorkbenchViewSearchParams(
          searchParams,
          initialViewRestore.view.searchQuery,
          initialViewRestore.view.boardFilters,
        ),
        { replace: true },
      );

      if (initialViewRestore.view.focusLane) {
        window.requestAnimationFrame(() => onFocusLane(initialViewRestore.view.focusLane));
      }
      setInitialViewRestored(true);
    }
  }, [initialViewRestore, initialViewRestored, onFocusLane, searchParams, setSearchParams]);

  useEffect(() => {
    if (initialViewRestore && !initialViewRestored && !hasWorkbenchViewSearchParams(searchParams)) return;

    const result = parseBoardFiltersFromSearchParams(searchParams, liveBoardHealth);
    setActiveBoardFilters((current) => (
      sameBoardFilters(current, result.filters) ? current : result.filters
    ));

    if (result.normalized) {
      setSearchParams(result.normalizedParams, { replace: true });
    }
  }, [initialViewRestore, initialViewRestored, liveBoardHealth, searchParams, setSearchParams]);

  useEffect(() => {
    if (initialViewRestore && !initialViewRestored && !hasWorkbenchViewSearchParams(searchParams)) return;
    const nextQuery = normalizeWorkbenchSearchQuery(searchParams.get('q'));
    setSearchQuery((current) => (current === nextQuery ? current : nextQuery));
  }, [initialViewRestore, initialViewRestored, searchParams]);

  useEffect(() => {
    writeStoredWorkbenchLastView({
      searchQuery,
      boardFilters: activeBoardFilters,
      focusLane: viewLane,
    });
  }, [activeBoardFilters, searchQuery, viewLane]);

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
    toggleSavedViewPin,
    toggleDefaultSavedView,
    resetWorkbenchView,
    toggleBoardFilter,
    clearBoardFilter,
  };
}
