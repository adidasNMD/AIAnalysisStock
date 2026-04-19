# Storage Architecture

## SQLite (`data/openclaw.db`)
WAL mode enabled for concurrent reads.

Schema ownership:
- Versioned migrations live in `src/migrations/versions/`
- Migration metadata lives in `schema_version`
- Runtime startup must use `runMigrations(...)`, not `initDb()`

Current baseline tables:
- `schema_version` — applied migration metadata + checksums
- `tasks` — mission queue with state tracking
- `mission_runs` — mission execution attempts and leases
- `opportunities` — primary opportunity records
- `opportunity_snapshots` — point-in-time opportunity payload snapshots
- `opportunity_events` — structured opportunity event stream
- `narratives` — narrative lifecycle persistence

## JSON Files (`data/`)
- `watchlist.json` — manual ticker watchlist with sector labels
- `dynamic_watchlist.json` — auto-discovered tickers from event analysis
- `supply_chain.json` — industry chain seed graph for downstream inference

## Filesystem (`out/`)
- `out/reports/` — archived analysis reports (YYYY-MM-DD_{ticker}_{hash}.md)
