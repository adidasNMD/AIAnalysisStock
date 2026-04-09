// Central Market Cap Gate
// Enforces a universal market cap window for all pipelines: $200M - $50B
export const MARKET_CAP_MIN = 200_000_000;
export const MARKET_CAP_MAX = 50_000_000_000;

function resolveMarketCapMin(): number {
  const value = Number(process.env.MARKET_CAP_MIN);
  return Number.isFinite(value) && value > 0 ? value : MARKET_CAP_MIN;
}

function resolveMarketCapMax(): number {
  const value = Number(process.env.MARKET_CAP_MAX);
  return Number.isFinite(value) && value > 0 ? value : MARKET_CAP_MAX;
}

/**
 * Check if a numeric market cap value falls within the gate.
 * @param cap market capitalization in USD
 */
export function isMarketCapWithinGate(cap: number | null | undefined): boolean {
  if (typeof cap !== 'number' || Number.isNaN(cap)) return false;
  return cap >= resolveMarketCapMin() && cap <= resolveMarketCapMax();
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
