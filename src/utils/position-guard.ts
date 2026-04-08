// Position Sizing Guard: central rules for portfolio sizing in reports

// Maximum exposure for a single position as a percentage of capital
export const MAX_SINGLE_POSITION_PCT = 20; // 20% — 画像 line 151: 单标的上限 20%

// Initial probing entry position percentage
export const PROBE_POSITION_PCT = 5; // 5%

/**
 * Check if a given position percentage is within the guard bounds
 */
export function isPositionWithinGuard(posPct: number): boolean {
  if (typeof posPct !== 'number' || Number.isNaN(posPct)) return false;
  return posPct >= 0 && posPct <= MAX_SINGLE_POSITION_PCT;
}

/** Clamp a position percentage to gate bounds */
export function clampPositionPct(posPct: number): number {
  if (typeof posPct !== 'number' || Number.isNaN(posPct)) return posPct;
  if (posPct < 0) return 0;
  if (posPct > MAX_SINGLE_POSITION_PCT) return MAX_SINGLE_POSITION_PCT;
  return posPct;
}
