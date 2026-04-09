# Storage Architecture

## SQLite (`data/openclaw.db`)
WAL mode enabled for concurrent reads. Tables:
- `tasks` — mission queue with state tracking (id, type, status, payload, result, createdAt, updatedAt)
- `narratives` — narrative lifecycle persistence (id, symbol, title, stage, status, impactScore, coreTicker, content, meta, timestamp, lastUpdatedAt)

## JSON Files (`data/`)
- `watchlist.json` — manual ticker watchlist with sector labels
- `dynamic_watchlist.json` — auto-discovered tickers from event analysis
- `supply_chain.json` — industry chain seed graph for downstream inference

## Filesystem (`out/`)
- `out/reports/` — archived analysis reports (YYYY-MM-DD_{ticker}_{hash}.md)
