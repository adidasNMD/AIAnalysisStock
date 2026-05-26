/**
 * Centralized application constants for OpenClaw V4.
 *
 * Usage: `import { MARKET_CAP_MIN, T1_INTERVAL_MS } from '../config/constants'`
 *
 * Do NOT import from individual files once these are established — use this module.
 * Note: Runtime-overridable values (T1 sentinel toggle) are in src/config/runtime-config.ts (T12).
 */

// ── Market Cap Gate ─────────────────────────────────────────────────────────
export const MARKET_CAP_MIN = 200_000_000; // $200M lower bound
export const MARKET_CAP_MAX = 50_000_000_000; // $50B upper bound

// ── Task Queue ──────────────────────────────────────────────────────────────
export const TASK_QUEUE_CONCURRENCY = 3; // concurrent missions

// ── Sentinel Timing (ms) ────────────────────────────────────────────────────
export const T1_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — price/volume scan
export const T1_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes — T1 alert cooldown
export const T4_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes — trend radar scan

// ── Leader Tickers ───────────────────────────────────────────────────────────
/** Default leader tickers for SMA50 stop-loss checks (overridable at runtime via T12) */
export const DEFAULT_LEADER_TICKERS: readonly string[] = ['NVDA', 'AVGO'];

// ── LLM Defaults ─────────────────────────────────────────────────────────────
export const LLM_MAX_TOKENS = 8192;

// ── Health Monitor ───────────────────────────────────────────────────────────
export const HEALTH_FAILURE_THRESHOLD = 5; // failures before circuit opens
export const HEALTH_RECOVERY_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes recovery window

// ── Runtime Feature Defaults (overridable at runtime via API in T12) ─────────
/** T1 price-sentinel is OFF by default (web-configurable via PATCH /api/config) */
export const T1_SENTINEL_ENABLED_DEFAULT = false;
export const SMA250_VETO_ENABLED_DEFAULT = true;

// ── Position Guard ────────────────────────────────────────────────────────────
export const MAX_SINGLE_POSITION_PCT = 20; // 20% — max single position size
export const PROBE_POSITION_PCT = 5; // 5%  — initial probe entry size
