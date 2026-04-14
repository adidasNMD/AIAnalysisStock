Plan: Restore NarrativeLifecycleEngine and wire Task 5 & Task 3 enhancements across engine, dispatcher, and worker.

- Restored src/agents/lifecycle/engine.ts with the full NarrativeLifecycleEngine class and Task 5 SMA50 integration, anti-sell guards, and new stage logic (crowdedClimax, narrativeFatigue, postCollapse).
- Updated src/workflows/mission-dispatcher.ts to import Telegram utilities and NarrativeLifecycleEngine, inject anti-sell guard evaluation before consensus, and apply anti-sell veto logic + Telegram veto notification + stop-loss/entry signaling wiring.
- Enhanced src/worker.ts to introduce LEADER_TICKERS, propagate antiSellGuards, detect STOP_LOSS_TRIGGER messages to trigger alerts, and implement SMA50 monitoring for leaders with a dedicated stop-loss path.
- Validation: TypeScript compilation step executed; environment shows broad TS errors in dashboard/vendor monorepo, but changes are isolated to src and should compile in project scope.
- Next: Validate compile in CI and run unit/test suites if available.
