export const BOARD_LIST_WINDOW_THRESHOLD = 18;
export const BOARD_LIST_INITIAL_RENDER_LIMIT = 12;
export const BOARD_LIST_RENDER_INCREMENT = 12;
export const BOARD_LIST_VIRTUAL_ITEM_ESTIMATE = 520;
export const BOARD_LIST_VIRTUAL_MIN_ITEM_ESTIMATE = 360;
export const BOARD_LIST_VIRTUAL_MAX_ITEM_ESTIMATE = 1800;
export const BOARD_LIST_VIRTUAL_ESTIMATE_UPDATE_THRESHOLD = 32;
export const BOARD_LIST_VIRTUAL_OVERSCAN = 1;
export const BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT = 640;
export const BOARD_LIST_DEFAULT_SCROLL_SCOPE = 'all';

export type BoardListWindowState = {
  isWindowed: boolean;
  renderedCount: number;
  remainingCount: number;
  nextRenderCount: number;
};

export type BoardListVirtualWindow = {
  startIndex: number;
  endIndex: number;
  renderedCount: number;
  offsetTop: number;
  offsetBottom: number;
  totalHeight: number;
};

export function shouldWindowBoardList(totalCount: number) {
  return totalCount > BOARD_LIST_WINDOW_THRESHOLD;
}

export function clampBoardListRenderLimit(totalCount: number, requestedLimit: number) {
  if (!shouldWindowBoardList(totalCount)) return Math.max(0, totalCount);
  return Math.min(
    Math.max(BOARD_LIST_INITIAL_RENDER_LIMIT, requestedLimit),
    Math.max(0, totalCount),
  );
}

export function buildBoardListWindowState(
  totalCount: number,
  requestedLimit: number,
): BoardListWindowState {
  const safeTotal = Math.max(0, totalCount);
  const isWindowed = shouldWindowBoardList(safeTotal);
  const renderedCount = clampBoardListRenderLimit(safeTotal, requestedLimit);
  const remainingCount = Math.max(0, safeTotal - renderedCount);
  const nextRenderCount = Math.min(remainingCount, BOARD_LIST_RENDER_INCREMENT);

  return {
    isWindowed,
    renderedCount,
    remainingCount,
    nextRenderCount,
  };
}

export function nextBoardListRenderLimit(currentLimit: number, totalCount: number) {
  return clampBoardListRenderLimit(
    totalCount,
    currentLimit + BOARD_LIST_RENDER_INCREMENT,
  );
}

export function normalizeBoardListItemEstimate(
  itemEstimate: number,
  fallback = BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
) {
  const safeFallback = Number.isFinite(fallback)
    ? Math.min(
        BOARD_LIST_VIRTUAL_MAX_ITEM_ESTIMATE,
        Math.max(BOARD_LIST_VIRTUAL_MIN_ITEM_ESTIMATE, fallback),
      )
    : BOARD_LIST_VIRTUAL_ITEM_ESTIMATE;

  if (!Number.isFinite(itemEstimate) || itemEstimate <= 0) {
    return Math.round(safeFallback);
  }

  return Math.round(Math.min(
    BOARD_LIST_VIRTUAL_MAX_ITEM_ESTIMATE,
    Math.max(BOARD_LIST_VIRTUAL_MIN_ITEM_ESTIMATE, itemEstimate),
  ));
}

export function refineBoardListItemEstimate(
  currentEstimate: number,
  measuredEstimate: number,
  threshold = BOARD_LIST_VIRTUAL_ESTIMATE_UPDATE_THRESHOLD,
) {
  const current = normalizeBoardListItemEstimate(currentEstimate);
  const measured = normalizeBoardListItemEstimate(measuredEstimate, current);
  const safeThreshold = Math.max(0, threshold);

  if (Math.abs(current - measured) < safeThreshold) {
    return current;
  }

  return measured;
}

export function buildBoardListVirtualWindow(
  totalCount: number,
  scrollTop: number,
  viewportHeight: number,
  itemEstimate = BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
  overscan = BOARD_LIST_VIRTUAL_OVERSCAN,
): BoardListVirtualWindow {
  const safeTotal = Math.max(0, totalCount);
  const safeItemEstimate = normalizeBoardListItemEstimate(itemEstimate);
  const safeViewportHeight = Math.max(1, viewportHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT);
  const safeScrollTop = Math.max(0, scrollTop);
  const safeOverscan = Math.max(0, overscan);

  if (safeTotal === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
      offsetTop: 0,
      offsetBottom: 0,
      totalHeight: 0,
    };
  }

  const visibleStart = Math.floor(safeScrollTop / safeItemEstimate);
  const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / safeItemEstimate));
  const startIndex = Math.max(0, visibleStart - safeOverscan);
  const endIndex = Math.min(safeTotal, visibleStart + visibleCount + safeOverscan);
  const renderedCount = Math.max(0, endIndex - startIndex);
  const totalHeight = safeTotal * safeItemEstimate;

  return {
    startIndex,
    endIndex,
    renderedCount,
    offsetTop: startIndex * safeItemEstimate,
    offsetBottom: Math.max(0, (safeTotal - endIndex) * safeItemEstimate),
    totalHeight,
  };
}

export function clampBoardListScrollTop(
  totalCount: number,
  viewportHeight: number,
  scrollTop: number,
  itemEstimate = BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
) {
  const safeTotal = Math.max(0, totalCount);
  const safeViewportHeight = Math.max(1, viewportHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT);
  const safeItemEstimate = normalizeBoardListItemEstimate(itemEstimate);
  const maxScrollTop = Math.max(0, (safeTotal * safeItemEstimate) - safeViewportHeight);
  return Math.min(Math.max(0, scrollTop), maxScrollTop);
}

export function clampBoardListActiveIndex(totalCount: number, requestedIndex: number) {
  const safeTotal = Math.max(0, totalCount);
  if (safeTotal === 0) return null;
  const safeIndex = Number.isFinite(requestedIndex) ? Math.round(requestedIndex) : 0;
  return Math.min(Math.max(0, safeIndex), safeTotal - 1);
}

export function activeIndexFromBoardListScroll(
  totalCount: number,
  scrollTop: number,
  itemEstimate = BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
) {
  return clampBoardListActiveIndex(
    totalCount,
    Math.floor(Math.max(0, scrollTop) / normalizeBoardListItemEstimate(itemEstimate)),
  );
}

export function scrollTopForBoardListActiveIndex(
  totalCount: number,
  activeIndex: number,
  currentScrollTop: number,
  viewportHeight: number,
  itemEstimate = BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
) {
  const safeIndex = clampBoardListActiveIndex(totalCount, activeIndex);
  if (safeIndex === null) return 0;

  const safeEstimate = normalizeBoardListItemEstimate(itemEstimate);
  const safeViewportHeight = Math.max(1, viewportHeight || BOARD_LIST_VIRTUAL_DEFAULT_VIEWPORT_HEIGHT);
  const currentTop = Math.max(0, currentScrollTop);
  const rowTop = safeIndex * safeEstimate;
  const rowBottom = rowTop + safeEstimate;
  let nextScrollTop = currentTop;

  if (rowTop < currentTop) {
    nextScrollTop = rowTop;
  } else if (rowBottom > currentTop + safeViewportHeight) {
    nextScrollTop = rowBottom - safeViewportHeight;
  }

  return clampBoardListScrollTop(
    totalCount,
    safeViewportHeight,
    nextScrollTop,
    safeEstimate,
  );
}

export function buildBoardListScrollKey(boardType: string, activeMetricKey?: string | null) {
  return `${boardType}:${activeMetricKey || BOARD_LIST_DEFAULT_SCROLL_SCOPE}`;
}
