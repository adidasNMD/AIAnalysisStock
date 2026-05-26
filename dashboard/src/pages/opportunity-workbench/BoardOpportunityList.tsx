import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react';
import type { OpportunitySummary, OpportunitySuggestedMission } from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import {
  BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT,
  BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
  activeIndexFromBoardListScroll,
  clampBoardListScrollTop,
  clampBoardListActiveIndex,
  buildBoardListVirtualWindow,
  buildBoardListWindowState,
  refineBoardListItemEstimate,
  scrollTopForBoardListActiveIndex,
} from './board-list-window';
import { OpportunityCard } from './OpportunityCard';
import type { MissionRecoveryActionFeedback } from './mission-actions';
import type { MissionRecoveryAction } from './recovery';
import type { WorkbenchSearchMatch } from './view-state';

type BoardOpportunityListProps = {
  scrollKey: string;
  allItemCount: number;
  items: OpportunitySummary[];
  recentEvents: Map<string, OpportunityStreamEvent>;
  activeMetricKey?: string | null;
  liveNow: number;
  searchMatches: Map<string, WorkbenchSearchMatch>;
  missionRecoveryActionFeedback?: MissionRecoveryActionFeedback | null;
  recoveringMissionActionKey?: string | null;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => void;
  onOpenMission: (missionId: string) => void;
  onOpenCommandCenter: () => void;
};

const virtualScrollMemory = new Map<string, number>();
const virtualItemEstimateMemory = new Map<string, number>();

function virtualRowId(scrollKey: string, opportunityId: string) {
  const safeKey = scrollKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeId = opportunityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `op-board-row-${safeKey}-${safeId}`;
}

function isInteractiveKeyTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, a, input, select, textarea, [contenteditable="true"]'));
}

function buildVirtualScrollMemoryKey(scrollKey: string) {
  return scrollKey;
}

function rememberVirtualScroll(
  memoryKey: string,
  scrollTop: number,
) {
  const safeScrollTop = Math.max(0, scrollTop);
  virtualScrollMemory.set(memoryKey, safeScrollTop);
}

function restoreVirtualScrollTop(
  memoryKey: string,
  items: OpportunitySummary[],
  viewportHeight: number,
  itemEstimate: number,
) {
  return clampBoardListScrollTop(
    items.length,
    viewportHeight,
    virtualScrollMemory.get(memoryKey) || 0,
    itemEstimate,
  );
}

export function BoardOpportunityList({
  scrollKey,
  allItemCount,
  items,
  recentEvents,
  activeMetricKey,
  liveNow,
  searchMatches,
  missionRecoveryActionFeedback,
  recoveringMissionActionKey,
  onOpenOpportunity,
  onRecoverMission,
  onLaunchOpportunityAnalysis,
  onOpenMission,
  onOpenCommandCenter,
}: BoardOpportunityListProps) {
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const virtualItemsRef = useRef<HTMLDivElement | null>(null);
  const restoringVirtualScrollRef = useRef(false);
  const [virtualViewport, setVirtualViewport] = useState({
    scrollTop: 0,
    viewportHeight: BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT,
  });
  const [itemEstimateState, setItemEstimateState] = useState({
    scrollKey: '',
    itemEstimate: BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
  });
  const [activeRowState, setActiveRowState] = useState<{
    scrollKey: string;
    index: number | null;
  }>({
    scrollKey: '',
    index: null,
  });
  const itemEstimate = itemEstimateState.scrollKey === scrollKey
    ? itemEstimateState.itemEstimate
    : virtualItemEstimateMemory.get(scrollKey) || BOARD_LIST_VIRTUAL_ITEM_ESTIMATE;
  const activeIndex = activeRowState.scrollKey === scrollKey
    ? clampBoardListActiveIndex(items.length, activeRowState.index ?? 0)
    : activeIndexFromBoardListScroll(items.length, virtualViewport.scrollTop, itemEstimate);
  const windowState = buildBoardListWindowState(items.length, items.length);
  const virtualWindow = useMemo(
    () => buildBoardListVirtualWindow(
      items.length,
      virtualViewport.scrollTop,
      virtualViewport.viewportHeight,
      itemEstimate,
    ),
    [itemEstimate, items.length, virtualViewport.scrollTop, virtualViewport.viewportHeight],
  );
  const renderedItems = useMemo(
    () => items.slice(virtualWindow.startIndex, virtualWindow.endIndex),
    [items, virtualWindow.endIndex, virtualWindow.startIndex],
  );
  const virtualRowStyle = useMemo(
    () => ({ '--op-card-intrinsic-size': `${itemEstimate}px` }) as CSSProperties,
    [itemEstimate],
  );
  const scrollProgress = useMemo(() => {
    const maxScrollTop = Math.max(1, virtualWindow.totalHeight - virtualViewport.viewportHeight);
    return Math.min(100, Math.max(0, Math.round((virtualViewport.scrollTop / maxScrollTop) * 100)));
  }, [virtualViewport.scrollTop, virtualViewport.viewportHeight, virtualWindow.totalHeight]);
  const activeOpportunity = activeIndex === null ? null : items[activeIndex] || null;
  const activeRowId = activeOpportunity
    && activeIndex !== null
    && activeIndex >= virtualWindow.startIndex
    && activeIndex < virtualWindow.endIndex
    ? virtualRowId(scrollKey, activeOpportunity.id)
    : undefined;

  useEffect(() => {
    if (!windowState.isWindowed) return;
    setActiveRowState((current) => {
      if (current.scrollKey !== scrollKey) {
        return {
          scrollKey,
          index: activeIndexFromBoardListScroll(items.length, virtualViewport.scrollTop, itemEstimate),
        };
      }

      const nextIndex = clampBoardListActiveIndex(items.length, current.index ?? 0);
      return nextIndex === current.index ? current : { scrollKey, index: nextIndex };
    });
  }, [itemEstimate, items.length, scrollKey, virtualViewport.scrollTop, windowState.isWindowed]);

  useEffect(() => {
    const node = virtualListRef.current;
    if (!node || !windowState.isWindowed) return undefined;
    const viewportHeight = node.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
    const memoryKey = buildVirtualScrollMemoryKey(scrollKey);
    const scrollTop = restoreVirtualScrollTop(memoryKey, items, viewportHeight, itemEstimate);
    restoringVirtualScrollRef.current = true;
    setVirtualViewport({
      scrollTop,
      viewportHeight,
    });
    setActiveRowState({
      scrollKey,
      index: activeIndexFromBoardListScroll(items.length, scrollTop, itemEstimate),
    });
    node.scrollTop = scrollTop;
    const frame = window.requestAnimationFrame(() => {
      restoringVirtualScrollRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [itemEstimate, items, items.length, scrollKey, windowState.isWindowed]);

  useEffect(() => {
    const node = virtualListRef.current;
    if (!node || !windowState.isWindowed) return undefined;

    const updateViewport = () => {
      const viewportHeight = node.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
      const memoryKey = buildVirtualScrollMemoryKey(scrollKey);
      const scrollTop = clampBoardListScrollTop(items.length, viewportHeight, node.scrollTop, itemEstimate);
      if (node.scrollTop !== scrollTop) node.scrollTop = scrollTop;
      if (!restoringVirtualScrollRef.current) {
        rememberVirtualScroll(memoryKey, scrollTop);
      }
      setVirtualViewport({
        scrollTop,
        viewportHeight,
      });
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);

    return () => observer.disconnect();
  }, [itemEstimate, items, items.length, scrollKey, windowState.isWindowed]);

  useEffect(() => {
    const listNode = virtualListRef.current;
    const itemsNode = virtualItemsRef.current;
    if (!listNode || !itemsNode || !windowState.isWindowed) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const listRect = listNode.getBoundingClientRect();
      const rows = Array.from(itemsNode.querySelectorAll<HTMLElement>('.op-board-virtual-row'));
      const rowHeights = rows
        .map((row) => row.getBoundingClientRect())
        .filter((rect) => rect.bottom > listRect.top && rect.top < listRect.bottom)
        .map((rect) => rect.height)
        .filter((height) => Number.isFinite(height) && height > 0);

      if (!rowHeights.length) return;

      const rowGap = Number.parseFloat(window.getComputedStyle(itemsNode).rowGap || '0') || 0;
      const measuredEstimate = (rowHeights.reduce((sum, height) => sum + height, 0) / rowHeights.length) + rowGap;
      const nextEstimate = refineBoardListItemEstimate(itemEstimate, measuredEstimate);

      if (nextEstimate === itemEstimate) return;

      const viewportHeight = listNode.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
      const memoryKey = buildVirtualScrollMemoryKey(scrollKey);
      const anchoredScrollTop = clampBoardListScrollTop(
        items.length,
        viewportHeight,
        listNode.scrollTop,
        nextEstimate,
      );

      virtualItemEstimateMemory.set(scrollKey, nextEstimate);
      setItemEstimateState({ scrollKey, itemEstimate: nextEstimate });

      if (Math.abs(listNode.scrollTop - anchoredScrollTop) > 1) {
        listNode.scrollTop = anchoredScrollTop;
        rememberVirtualScroll(memoryKey, anchoredScrollTop);
        setVirtualViewport({
          scrollTop: anchoredScrollTop,
          viewportHeight,
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    itemEstimate,
    items,
    items.length,
    scrollKey,
    virtualWindow.endIndex,
    virtualWindow.startIndex,
    windowState.isWindowed,
  ]);

  const handleVirtualScroll = useCallback(() => {
    const node = virtualListRef.current;
    if (!node) return;
    setVirtualViewport((current) => {
      const nextScrollTop = Math.max(0, node.scrollTop);
      const nextViewportHeight = node.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
      const memoryKey = buildVirtualScrollMemoryKey(scrollKey);
      const clampedScrollTop = clampBoardListScrollTop(items.length, nextViewportHeight, nextScrollTop, itemEstimate);
      if (node.scrollTop !== clampedScrollTop) node.scrollTop = clampedScrollTop;
      if (!restoringVirtualScrollRef.current) {
        rememberVirtualScroll(memoryKey, clampedScrollTop);
      }
      if (
        current.scrollTop === clampedScrollTop
        && current.viewportHeight === nextViewportHeight
      ) {
        return current;
      }
      return {
        scrollTop: clampedScrollTop,
        viewportHeight: nextViewportHeight,
      };
    });
  }, [itemEstimate, items, scrollKey]);

  const scrollVirtualListTo = useCallback((nextScrollTop: number) => {
    const node = virtualListRef.current;
    if (!node) return;
    const viewportHeight = node.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
    const memoryKey = buildVirtualScrollMemoryKey(scrollKey);
    const scrollTop = clampBoardListScrollTop(items.length, viewportHeight, nextScrollTop, itemEstimate);
    node.scrollTop = scrollTop;
    rememberVirtualScroll(memoryKey, scrollTop);
    setVirtualViewport({
      scrollTop,
      viewportHeight,
    });
  }, [itemEstimate, items, scrollKey]);

  const focusVirtualIndex = useCallback((nextIndex: number) => {
    const node = virtualListRef.current;
    const safeIndex = clampBoardListActiveIndex(items.length, nextIndex);
    if (safeIndex === null) return;

    const viewportHeight = node?.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
    const currentScrollTop = node?.scrollTop ?? virtualViewport.scrollTop;
    const nextScrollTop = scrollTopForBoardListActiveIndex(
      items.length,
      safeIndex,
      currentScrollTop,
      viewportHeight,
      itemEstimate,
    );

    setActiveRowState({ scrollKey, index: safeIndex });
    scrollVirtualListTo(nextScrollTop);
  }, [itemEstimate, items.length, scrollKey, scrollVirtualListTo, virtualViewport.scrollTop]);

  const handleVirtualFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (activeIndex !== null) {
      setActiveRowState({ scrollKey, index: activeIndex });
      return;
    }

    setActiveRowState({
      scrollKey,
      index: activeIndexFromBoardListScroll(items.length, virtualViewport.scrollTop, itemEstimate),
    });
  }, [activeIndex, itemEstimate, items.length, scrollKey, virtualViewport.scrollTop]);

  const handleVirtualKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (isInteractiveKeyTarget(event.target)) return;
    const node = virtualListRef.current;
    if (!node) return;
    const viewportHeight = node.clientHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT;
    const currentScrollTop = node.scrollTop;
    const pageDelta = Math.max(240, Math.round(viewportHeight * 0.86));
    const currentActiveIndex = activeIndex ?? activeIndexFromBoardListScroll(
      items.length,
      currentScrollTop,
      itemEstimate,
    ) ?? 0;
    let nextScrollTop: number | null = null;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusVirtualIndex(currentActiveIndex + 1);
      return;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusVirtualIndex(currentActiveIndex - 1);
      return;
    } else if (event.key === 'PageDown') {
      nextScrollTop = currentScrollTop + pageDelta;
    } else if (event.key === 'PageUp') {
      nextScrollTop = currentScrollTop - pageDelta;
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusVirtualIndex(0);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      focusVirtualIndex(items.length - 1);
      return;
    } else if (event.key === 'Enter') {
      if (activeOpportunity) {
        event.preventDefault();
        onOpenOpportunity(activeOpportunity);
      }
      return;
    }

    if (nextScrollTop === null) return;
    event.preventDefault();
    scrollVirtualListTo(nextScrollTop);
    setActiveRowState({
      scrollKey,
      index: activeIndexFromBoardListScroll(items.length, nextScrollTop, itemEstimate),
    });
  }, [
    activeIndex,
    activeOpportunity,
    focusVirtualIndex,
    itemEstimate,
    items.length,
    onOpenOpportunity,
    scrollKey,
    scrollVirtualListTo,
  ]);

  if (allItemCount === 0) {
    return <div className="today-empty">这个板块还没有机会卡</div>;
  }

  if (items.length === 0) {
    return <div className="today-empty">当前筛选下没有机会卡</div>;
  }

  if (windowState.isWindowed) {
    return (
      <div className="op-board-virtual-shell">
        <div className="op-board-window-status op-board-virtual-status" aria-live="polite">
          <span>列表</span>
          <span>挂载 {virtualWindow.renderedCount} / {items.length}</span>
          <span>范围 {virtualWindow.startIndex + 1}-{virtualWindow.endIndex}</span>
          {activeIndex !== null && <span>定位 {activeIndex + 1}/{items.length}</span>}
          <span>进度 {scrollProgress}%</span>
        </div>
        <div
          ref={virtualListRef}
          className="op-board-virtual-list"
          onScroll={handleVirtualScroll}
          onFocus={handleVirtualFocus}
          onKeyDown={handleVirtualKeyDown}
          tabIndex={0}
          role="list"
          aria-activedescendant={activeRowId}
          aria-label={`机会卡虚拟列表，共 ${items.length} 张`}
        >
          <div
            className="op-board-virtual-spacer"
            style={{ height: virtualWindow.offsetTop }}
            aria-hidden="true"
            role="presentation"
          />
          <div ref={virtualItemsRef} className="op-board-virtual-items">
            {renderedItems.map((opportunity, index) => (
              <div
                id={virtualRowId(scrollKey, opportunity.id)}
                key={opportunity.id}
                className={`op-board-virtual-row ${activeIndex === virtualWindow.startIndex + index ? 'active' : ''}`}
                role="listitem"
                aria-selected={activeIndex === virtualWindow.startIndex + index}
                style={virtualRowStyle}
              >
                <OpportunityCard
                  opportunity={opportunity}
                  density="dense"
                  activeMetricKey={activeMetricKey}
                  rank={virtualWindow.startIndex + index}
                  liveNow={liveNow}
                  livePriorityEvent={recentEvents.get(opportunity.id)}
                  searchMatch={searchMatches.get(opportunity.id)}
                  missionRecoveryActionFeedback={missionRecoveryActionFeedback}
                  recoveringMissionActionKey={recoveringMissionActionKey}
                  onOpenOpportunity={onOpenOpportunity}
                  onRecoverMission={onRecoverMission}
                  onLaunchOpportunityAnalysis={onLaunchOpportunityAnalysis}
                  onOpenMission={onOpenMission}
                  onOpenCommandCenter={onOpenCommandCenter}
                />
              </div>
            ))}
          </div>
          <div
            className="op-board-virtual-spacer"
            style={{ height: virtualWindow.offsetBottom }}
            aria-hidden="true"
            role="presentation"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {items.map((opportunity, index) => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          activeMetricKey={activeMetricKey}
          rank={index}
          liveNow={liveNow}
          livePriorityEvent={recentEvents.get(opportunity.id)}
          searchMatch={searchMatches.get(opportunity.id)}
          missionRecoveryActionFeedback={missionRecoveryActionFeedback}
          recoveringMissionActionKey={recoveringMissionActionKey}
          onOpenOpportunity={onOpenOpportunity}
          onRecoverMission={onRecoverMission}
          onLaunchOpportunityAnalysis={onLaunchOpportunityAnalysis}
          onOpenMission={onOpenMission}
          onOpenCommandCenter={onOpenCommandCenter}
        />
      ))}
    </>
  );
}
