Task: Fix TypeScript compilation errors in src/worker.ts by correcting SMACheckResult property names used in Leader SMA50 check.
- Replaced smaValue -> sma and currentPrice -> price in the Leader SMA50 block.
- Updated calculation: dropPercent now uses (sma50.sma - sma50.price) / sma50.sma.
- Updated display: show Current price as sma50.price and SMA as sma50.sma.
- Validation: tsc --noEmit should report ZERO errors for src/worker.ts (note: pre-existing dashboard/vendor errors may persist).
