# Learnings — merge-and-harden

## [2026-04-09] Session Init

### Branch Context
- Base branch: `feat/onmypro-260408` (13 commits, 27 files, +3102 lines, has SMA250 veto, decision trail, 78 vitest tests, Zod schemas, RejectedTicker)
- Source for cherry-picks: `origin/feat/0409-onmyair` (7 commits, 11 files, +346 lines, has position-guard, anti-sell guard, crowdedClimax, SMA50 sector stop-loss, market-cap-gate module, TrendRadar 15min+cap)
- Target branch: `feat/merge-and-harden` (NEW — must be created from onmypro-260408)

### Cherry-Pick SHAs (from origin/feat/0409-onmyair)
- `d6e5e8e` — fix(filter): unify market-cap gate (market-cap-gate.ts + openbb-provider + strategist changes)
- `5d81ce0` — feat(position): add position sizing guard (position-guard.ts)
- `4b0a217` — feat(synthesis): integrate report validator and position sizing
- `d59d3f6` — perf(sentinel): reduce TrendRadar polling to 15min + leader SMA50 + lifecycle
- `1217267` — feat(lifecycle): integrate anti-sell guard + crowdedClimax
- `5da3b90` — feat(report): add post-LLM structural validation
- `180041a` — feat(consensus): enforce dual-brain veto, stop-loss, anti-sell, entry signals

### Key Technical Decisions
- `report-validator.ts`: Keep onmypro's Zod version, SKIP onmyair's regex version
- `synthesis.ts`: Cherry-pick from onmyair BUT adapt imports — onmyair uses `validateReport` but onmypro's report-validator exports `validateTradeDecision`
- SQLite WAL pragmas go as FIRST statements inside `initDb()` function (before CREATE TABLE)
- Rate limiter: Zero npm dependencies — implement simple token bucket in-house
- Structured logger: Zero npm dependencies (no winston/pino)
- Vendors directory has 4 subdirs: `openbb/`, `openclaw/`, `trading-agents/`, `trendradar/`

### Runtime / Environment
- Node 16 environment
- Run vitest with: `NODE_OPTIONS="--max-old-space-size=8192" npx vitest run`
- Run after EACH cherry-pick — must pass before proceeding
- Existing test count: 78 tests on onmypro-260408

### Task 2 Execution Notes
- `git checkout origin/feat/0409-onmyair -- src/utils/market-cap-gate.ts` cleanly extracted only the new utility file from `d6e5e8e`.
- `git cherry-pick 5d81ce0` succeeded for `src/utils/position-guard.ts` after the first commit landed.
- Vitest passed with 11 files / 78 tests green on Node 16 using `NODE_OPTIONS="--max-old-space-size=8192"`.

### Commit Convention
- Format: `type(scope): message`
- Trailer: `Co-authored-by: Sisyphus <sisyphus@openclaw.ai>` on EVERY commit
- Atomic commits: 1 task = 1 commit

### T1 Sentinel
- Default: OFF
- Toggle via web API: `PATCH /api/config`

## T3: Cherry-pick 4 agent files from onmyair (2026-04-09)

- `git diff feat/onmypro-260408..origin/feat/0409-onmyair -- <file>` is the cleanest way to see what onmyair changed vs the shared base
- The 15-min interval for TrendRadar is NOT in trend-radar.ts itself — it's in the worker/scheduler (T5 scope). The trend-radar commit d59d3f6 adds cap gate filtering, latency timing, and eventBus metrics.
- synthesis.ts adaptation: onmyair uses `validateReport(report)` returning `{valid, warnings}`, but onmypro's `validateTradeDecision(report, ticker)` returns `TradeDecision | null`. Simple null check works.
- `npx tsc --noEmit` OOMs on Node 16 without `NODE_OPTIONS="--max-old-space-size=8192"`. Even with it, dashboard/ React files fail (missing deps) — pre-existing, not our concern.
- All 78 vitest tests pass after all 4 file changes.

## [2026-04-09] T6 ticker-discovery merge

- `isMarketCapWithinGate(cap)` accepts `number | null | undefined`, so ticker-discovery can gate directly on `quote.marketCap` without local min/max constants.
- Unified market-cap rejection keeps `rejectedTickers` intact by mapping out-of-range values to `'mega_cap'` when `marketCap > 50_000_000_000`, otherwise `'micro_cap'`.
- Removing the unused `GoogleNewsItem` import cleaned the file without touching the ticker discovery contract.

## [2026-04-09] T9 dispatcher split

- mission-dispatcher.ts was split into exactly 3 modules + barrel: types.ts, consensus.ts, dispatch-engine.ts, index.ts.
- computeConsensus remains async and preserves SMA250 veto flow and vetoReason as optional string (undefined when absent).
- All workflow import sites were moved to the workflows barrel path and mission-dispatcher.ts was removed.
- Verification passed: vitest 78/78 green, grep for mission-dispatcher in src/**/*.ts returned no matches, split files exist.

## [2026-04-09] T11 event-bus cleanup

- `SwarmEventBus` now tracks listeners in `listenerRegistry`, making per-mission cleanup explicit instead of relying only on process shutdown.
- Lowering `setMaxListeners` to 50 keeps warnings meaningful while cleanupMission/dispose handle lifecycle cleanup.
- `dispatchMission()` now calls `eventBus.cleanupMission(mission.id)` in `finally`, so mission-scoped listeners are released even on failures.

## T10: Graceful Shutdown

- `TaskQueue.runningCount` was already private; exposed via `getRunningCount()` — single line addition
- `gracefulShutdown()` uses a 30s poll loop (1s interval) to wait for task drain before DB close
- `isShuttingDown` flag guards all 4 cron callbacks (T1, T2, T3, T4) to prevent new work during shutdown
- `getDb()` imported from `../db` — same pattern used in task-queue.ts already
- Double-invocation guard (`if (isShuttingDown) return`) prevents race between SIGTERM and SIGINT
- T11 will add `eventBus.dispose()` separately — not included here per task boundaries

## T12 — Runtime Config API (2026-04-09)
- `app.ts` already has `express.json()` middleware — no need to add body parsing
- T10 added `isShuttingDown` guard and `getDb` import to worker.ts — T12 check placed right after shutdown guard
- Existing file convention: every API route group in `app.ts` gets a `// API:` comment prefix
- `GET /api/config/models` already exists for model config — new runtime config at `/api/config` (no collision)
- Pattern: `allowed` array whitelist in PATCH handler prevents arbitrary field injection
- Runtime config is intentionally in-memory only — reboot resets to defaults from constants.ts

## T13 — Rate Limiter

- Token-bucket pattern is simple and effective: refill tokens based on elapsed time, wait if depleted.
- Yahoo Finance uses `yahoo-finance2` library (not raw `fetch`), so rate limiting wraps `yahooFinance.quote()` and `yahooFinance.chart()` calls.
- RSS monitoring uses `rss-parser` library's `parseURL()`, rate limiting wraps that.
- `getQuote()` is called from both `market-data.ts` (internal) and `trend-radar.ts` (external). Adding limiter at both points provides defense-in-depth but double-acquires on the same singleton limiter — acceptable since it just makes calls slightly more conservative.
- No test changes needed — rate limiter is transparent to existing test mocks.

## T15 — Narrative DB Schema Upgrade
- Added 6 ALTER TABLE migrations (title, stage, status, impactScore, coreTicker, lastUpdatedAt) using same try/catch pattern as existing tasks table migration
- `loadNarratives()` now reads from proper columns with `??` fallback to meta JSON for backward compat with pre-migration rows
- `createNarrative()` writes all 12 columns (6 original + 6 new) in a single INSERT
- `updateNarrative()` writes stage, status, coreTicker, lastUpdatedAt to proper columns alongside meta JSON
- `meta` column preserved — never dropped — old rows still readable via fallback chain
- The `Database` import in narrative-store.ts was already unused (pre-existing hint) — left untouched to avoid scope creep

## T16: Token Usage Metering
- Added `trackTokenUsage()` / `getTokenUsage()` to `src/utils/llm.ts` — in-memory accumulation of `prompt_tokens` and `completion_tokens` from LLM API responses
- Both `generateStructuredOutput` and `generateTextCompletion` call `trackTokenUsage(undefined, responseData?.usage || {})` after non-streaming response parsing
- Streaming responses don't return `usage` in the standard OpenAI SSE format, so tracking only applies to non-streaming calls
- `missionId` is passed as `undefined` for now — threading it through the full call chain is a separate concern
- `GET /api/token-usage` added to `src/server/app.ts`, follows same pattern as existing `/api/config` routes
