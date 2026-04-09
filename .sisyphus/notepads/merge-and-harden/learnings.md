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
