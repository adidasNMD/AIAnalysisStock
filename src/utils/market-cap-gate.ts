// Central Market Cap Gate
// Enforces a universal market cap window for all pipelines: $200M - $50B
export const MARKET_CAP_MIN = 200_000_000;
export const MARKET_CAP_MAX = 50_000_000_000;

/**
 * Check if a numeric market cap value falls within the gate.
 * @param cap market capitalization in USD
 */
export function isMarketCapWithinGate(cap: number | null | undefined): boolean {
  if (typeof cap !== 'number' || Number.isNaN(cap)) return false;
  return cap >= MARKET_CAP_MIN && cap <= MARKET_CAP_MAX;
}

/**
 * Clamp a market cap value to the gate bounds.
 * Useful to normalize out-of-range values without affecting downstream logic too much.
 */
export function clampMarketCapToGate(cap: number): number {
  if (typeof cap !== 'number' || Number.isNaN(cap)) return cap;
  if (cap < MARKET_CAP_MIN) return MARKET_CAP_MIN;
  if (cap > MARKET_CAP_MAX) return MARKET_CAP_MAX;
  return cap;
}
