# Migration Workflow

This repository uses hand-written versioned migrations under `src/migrations/versions/`.

## Goals

- Keep schema evolution explicit.
- Make rollback possible.
- Detect drift when an applied migration file is edited later.
- Keep runtime startup deterministic.

## Directory Layout

```text
src/
  migrations/
    runner.ts
    types.ts
    versions/index.ts
    versions/
      000_bootstrap.ts
      001_init_baseline.ts
      002_some_change.ts
```

## Naming Rules

- File name format: `NNN_description.ts`
- `NNN` must be zero-padded to 3 digits.
- The version key is the file name without `.ts`.

Examples:

- `000_bootstrap.ts`
- `001_init_baseline.ts`
- `002_events_table.ts`

## Required Exports

Every migration file must export exactly these symbols:

```ts
import type { Database } from 'sqlite';

export const description = 'Human-readable summary';

export async function up(db: Database): Promise<void> {
  // apply schema change
}

export async function down(db: Database): Promise<void> {
  // rollback schema change
}
```

## Runner Contract

The migration runner lives in `src/migrations/runner.ts`.

Primary functions:

- `runMigrations(db)`
- `rollbackMigrations(db, steps)`
- `getMigrationStatus(db)`
- `computeChecksum(filePath)`

The runner is the only code allowed to write `schema_version`.

Migration loading is explicit.

New migration files must be added to `src/migrations/versions/index.ts`.

## Bootstrap Behavior

`000_bootstrap.ts` owns the `schema_version` DDL.

Because the runner needs `schema_version` before it can record normal migrations,
startup performs a bootstrap check first:

1. If `schema_version` does not exist, create it.
2. Insert `000_bootstrap` once.
3. Continue with the explicit migration registry in `src/migrations/versions/index.ts`.

No business tables belong in `000_bootstrap.ts`.

## Checksum Rules

- Every migration file is hashed with SHA-256.
- The checksum is recorded when the migration is applied.
- Later status checks compare the recorded checksum with current file content.
- Mismatch is fatal. Do not add a bypass flag.

This is intentional fail-fast behavior.

## Transaction Rules

- Each migration runs inside its own transaction boundary.
- SQLite DDL is mostly transactional in this repo’s usage, but keep migrations simple.
- Avoid mixing many unrelated operations in one file.

## Locking Rules

- The runner temporarily switches to `PRAGMA locking_mode = EXCLUSIVE`.
- This avoids concurrent schema mutation during migration execution.
- The previous locking mode is restored after completion.

## CLI Usage

Available commands:

```bash
npm run migrate
npm run migrate -- --db /tmp/custom.db
npm run migrate:status
npm run migrate:down
npm run migrate:down -- all
npm run migrate:redo
```

Semantics:

- `migrate` → apply all missing migrations
- `migrate:status` → show applied, pending, and checksum mismatch state
- `migrate:down` → rollback 1 step by default
- `migrate:down -- all` → rollback all non-bootstrap migrations and preserve `schema_version`
- `migrate:redo` → rollback 1 step, then re-apply

## Startup Integration

`src/worker.ts` is the migration-aware startup path.

Expected flow:

1. Open database connection.
2. Run migrations.
3. Inject the same connection into the DB singleton.
4. Continue normal worker startup.

`getDb()` must not silently auto-run migrations.

## Legacy Trap

`initDb()` still exists in `src/db/index.ts` only as a deprecated trap.

Direct callers should receive:

```text
initDb is deprecated. Use runMigrations from src/migrations/runner.ts
```

This keeps grep-based tracking simple while preventing accidental reuse.

## Data Migration Policy

Do not mix schema migration and data backfill in the same file unless absolutely required.

Preferred pattern:

1. One migration adds tables/columns/indexes.
2. A later adjacent migration performs any data backfill.

Reason:

- rollback behavior stays clearer
- blast radius stays smaller
- debugging is easier

## Authoring Checklist

Before adding a migration:

- confirm the schema change is not already covered by an existing file
- pick the next sequential number
- write both `up()` and `down()` first
- register the new file in `src/migrations/versions/index.ts`
- keep the file focused on one schema concern
- avoid touching unrelated tables

Before merging a migration:

- run `npm run migrate`
- run `npm run migrate:status`
- run `npm run migrate:down`
- run `npm run migrate:redo`
- verify checksum behavior if the migration is security-sensitive

## Baseline Migration Notes

`001_init_baseline.ts` is special.

It represents the full pre-migration schema that previously lived in `src/db/index.ts`.
Future migrations should not edit `001_init_baseline.ts` except in emergencies before it ships.

Once applied in a real environment, editing `001_init_baseline.ts` will create checksum divergence.

## Common Mistakes

- adding a migration without `down()`
- renaming an already-shipped migration file
- editing an applied migration in place
- hiding checksum mismatch behind a force flag
- auto-running migrations inside `getDb()`
- mixing schema changes and business logic changes in one file

## Quick Template

```ts
import type { Database } from 'sqlite';

export const description = 'Add example table';

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS example_items (
      id TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL
    );
  `);
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS example_items;');
}
```

## Operational Rule

If `npm run migrate:status` reports mismatch, stop immediately.
Do not continue daemon startup until the divergence is understood and resolved.
