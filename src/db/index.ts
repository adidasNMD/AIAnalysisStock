import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { SCHEMA_MIGRATIONS, type SchemaMigration } from './migrations';

let dbInstance: Database | null = null;

const DB_PATH = path.join(process.cwd(), 'data', 'openclaw.db');

type MigrationStatus = 'applied' | 'failed';

interface SchemaMigrationRow {
  id: string;
  description: string | null;
  checksum: string | null;
  appliedAt: string;
  durationMs: number | null;
  status: MigrationStatus | null;
  error: string | null;
}

export interface SchemaMigrationStatus {
  id: string;
  description: string;
  checksum: string;
  appliedAt: string | null;
  durationMs: number;
  status: MigrationStatus | 'missing' | string;
  error: string | null;
  known: boolean;
  checksumMatches: boolean | null;
  expectedChecksum?: string;
}

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // 初始化表结构
    await initDb(dbInstance);
  }
  return dbInstance;
}

async function ensureMigrationTable(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL DEFAULT '',
      durationMs INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'applied',
      error TEXT
    );
  `);
  await addMigrationColumnIfMissing(db, 'description', "TEXT NOT NULL DEFAULT ''");
  await addMigrationColumnIfMissing(db, 'checksum', "TEXT NOT NULL DEFAULT ''");
  await addMigrationColumnIfMissing(db, 'durationMs', 'INTEGER NOT NULL DEFAULT 0');
  await addMigrationColumnIfMissing(db, 'status', "TEXT NOT NULL DEFAULT 'applied'");
  await addMigrationColumnIfMissing(db, 'error', 'TEXT');
}

async function hasMigrationColumn(db: Database, columnName: string): Promise<boolean> {
  const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(schema_migrations)');
  return columns.some(column => column.name === columnName);
}

async function addMigrationColumnIfMissing(
  db: Database,
  columnName: string,
  definition: string,
): Promise<void> {
  if (await hasMigrationColumn(db, columnName)) return;
  await db.exec(`ALTER TABLE schema_migrations ADD COLUMN ${columnName} ${definition};`);
}

export function migrationChecksum(migration: SchemaMigration): string {
  return createHash('sha256')
    .update(`${migration.id}\n${migration.checksumSource}`)
    .digest('hex');
}

async function applyMigration(db: Database, migration: SchemaMigration): Promise<void> {
  const checksum = migrationChecksum(migration);
  const existing = await db.get<SchemaMigrationRow>(
    'SELECT * FROM schema_migrations WHERE id = ?',
    migration.id,
  );
  if (existing?.status === 'applied') {
    if (existing.checksum && existing.checksum !== checksum) {
      throw new Error(`Migration checksum mismatch for ${migration.id}`);
    }
    await db.run(
      `UPDATE schema_migrations
       SET description = ?, checksum = ?, status = 'applied', error = NULL
       WHERE id = ?`,
      migration.description,
      checksum,
      migration.id,
    );
    return;
  }

  const startedAt = Date.now();

  try {
    await db.exec('BEGIN');
    await migration.apply(db);
    const durationMs = Date.now() - startedAt;
    await db.run(
      `INSERT INTO schema_migrations (
        id,
        appliedAt,
        description,
        checksum,
        durationMs,
        status,
        error
      ) VALUES (?, ?, ?, ?, ?, 'applied', NULL)
      ON CONFLICT(id) DO UPDATE SET
        appliedAt = excluded.appliedAt,
        description = excluded.description,
        checksum = excluded.checksum,
        durationMs = excluded.durationMs,
        status = 'applied',
        error = NULL`,
      migration.id,
      new Date().toISOString(),
      migration.description,
      checksum,
      durationMs,
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startedAt;
    await db.run(
      `INSERT INTO schema_migrations (
        id,
        appliedAt,
        description,
        checksum,
        durationMs,
        status,
        error
      ) VALUES (?, ?, ?, ?, ?, 'failed', ?)
      ON CONFLICT(id) DO UPDATE SET
        appliedAt = excluded.appliedAt,
        description = excluded.description,
        checksum = excluded.checksum,
        durationMs = excluded.durationMs,
        status = 'failed',
        error = excluded.error`,
      migration.id,
      new Date().toISOString(),
      migration.description,
      checksum,
      durationMs,
      message,
    );
    logger.error(`[DB] Migration ${migration.id} failed: ${message}`);
    throw error;
  }
}

async function applyMigrations(db: Database, migrations: SchemaMigration[]): Promise<void> {
  await ensureMigrationTable(db);
  for (const migration of migrations) {
    await applyMigration(db, migration);
  }
}

export async function readSchemaMigrationStatuses(db: Database): Promise<SchemaMigrationStatus[]> {
  await ensureMigrationTable(db);
  const rows = await db.all<SchemaMigrationRow[]>(
    `SELECT id, description, checksum, appliedAt, durationMs, status, error
     FROM schema_migrations
     ORDER BY id ASC`,
  );
  const expectedById = new Map(SCHEMA_MIGRATIONS.map((migration) => [migration.id, migration]));
  const seen = new Set<string>();
  const statuses = rows.map((row): SchemaMigrationStatus => {
    seen.add(row.id);
    const expected = expectedById.get(row.id);
    const expectedChecksum = expected ? migrationChecksum(expected) : undefined;
    return {
      id: row.id,
      description: row.description || expected?.description || '',
      checksum: row.checksum || '',
      appliedAt: row.appliedAt,
      durationMs: row.durationMs ?? 0,
      status: row.status || 'applied',
      error: row.error,
      known: Boolean(expected),
      checksumMatches: expectedChecksum ? row.checksum === expectedChecksum : null,
      ...(expectedChecksum ? { expectedChecksum } : {}),
    };
  });

  for (const migration of SCHEMA_MIGRATIONS) {
    if (seen.has(migration.id)) continue;
    const expectedChecksum = migrationChecksum(migration);
    statuses.push({
      id: migration.id,
      description: migration.description,
      checksum: '',
      appliedAt: null,
      durationMs: 0,
      status: 'missing',
      error: null,
      known: true,
      checksumMatches: false,
      expectedChecksum,
    });
  }

  return statuses.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getSchemaMigrationStatuses(): Promise<SchemaMigrationStatus[]> {
  return readSchemaMigrationStatuses(await getDb());
}

export async function initDb(db: Database) {
  await db.exec(`PRAGMA journal_mode = WAL;`);
  await db.exec(`PRAGMA busy_timeout = 5000;`);
  await ensureMigrationTable(db);

  // === Tasks Table ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      missionId TEXT,
      runId TEXT,
      query TEXT NOT NULL,
      depth TEXT NOT NULL,
      priority INTEGER NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      progress TEXT,
      statePayload TEXT,
      inputPayload TEXT,
      dedupeKey TEXT,
      idempotencyKey TEXT,
      inputHash TEXT,
      leaseId TEXT,
      heartbeatAt INTEGER,
      cancelRequestedAt INTEGER,
      failureCode TEXT,
      degradedFlags TEXT,
      createdAt INTEGER NOT NULL,
      startedAt INTEGER,
      completedAt INTEGER,
      error TEXT
    );
  `);
  // === Mission Runs Table ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mission_runs (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      taskId TEXT,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      workerLeaseId TEXT,
      createdAt TEXT NOT NULL,
      startedAt TEXT,
      heartbeatAt TEXT,
      completedAt TEXT,
      failureMessage TEXT,
      degradedFlags TEXT
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mission_runs_mission_created
    ON mission_runs (missionId, createdAt DESC);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mission_runs_task
    ON mission_runs (taskId);
  `);

  // === Opportunities Table ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      query TEXT NOT NULL,
      thesis TEXT,
      summary TEXT,
      primaryTicker TEXT,
      leaderTicker TEXT,
      proxyTicker TEXT,
      relatedTickers TEXT NOT NULL,
      relayTickers TEXT NOT NULL,
      nextCatalystAt TEXT,
      supplyOverhang TEXT,
      policyStatus TEXT,
      scores TEXT NOT NULL,
      heatProfile TEXT,
      proxyProfile TEXT,
      ipoProfile TEXT,
      catalystCalendar TEXT NOT NULL DEFAULT '[]',
      latestMissionId TEXT,
      latestEventType TEXT,
      latestEventMessage TEXT,
      latestEventAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunities_type_updated
    ON opportunities (type, updatedAt DESC);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunities_status_updated
    ON opportunities (status, updatedAt DESC);
  `);

  // === Opportunity Snapshots Table ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_snapshots (
      id TEXT PRIMARY KEY,
      opportunityId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunity_snapshots_lookup
    ON opportunity_snapshots (opportunityId, createdAt DESC);
  `);

  // === Opportunity Events Table ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_events (
      id TEXT PRIMARY KEY,
      opportunityId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      meta TEXT
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunity_events_lookup
    ON opportunity_events (opportunityId, timestamp DESC);
  `);

  // === Narratives Table ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS narratives (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT
    );
  `);

  await applyMigrations(db, SCHEMA_MIGRATIONS);
}
