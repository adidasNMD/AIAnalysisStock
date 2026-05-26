Plan: Fix mission-dispatcher integration with entry signals and OpenBB alerts
- Implement after anti-sell guard loop: sendEntrySignal for agreed, non-vetoed tickers where openclawVerdict/taVerdict are BUY
- Implement sendStopLossAlert for tickers with openbbVerdict === 'FAIL'
- Update worker.ts import to include .js extension for moduleResolution node16
- Verify TypeScript compile for src/ with noEmit

- Rationale: Keeps the two new runtime hooks isolated and guarded, preventing crashes via try/catch.
- Validation: Run npx tsc --noEmit and ensure no new errors in touched files; ensure runtime calls trigger as expected.
