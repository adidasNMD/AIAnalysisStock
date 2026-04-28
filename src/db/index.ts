import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import { logger } from '../utils/logger';

let dbInstance: Database | null = null;

const DB_PATH = path.join(process.cwd(), 'data', 'openclaw.db');

interface SchemaMigration {
  id: string;
  apply: (db: Database) => Promise<void>;
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
      appliedAt TEXT NOT NULL
    );
  `);
}

async function hasColumn(db: Database, tableName: string, columnName: string): Promise<boolean> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`);
  return columns.some(column => column.name === columnName);
}

async function addColumnIfMissing(
  db: Database,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  if (await hasColumn(db, tableName, columnName)) return;
  await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

async function applyMigration(db: Database, migration: SchemaMigration): Promise<void> {
  const existing = await db.get<{ id: string }>(
    'SELECT id FROM schema_migrations WHERE id = ?',
    migration.id,
  );
  if (existing) return;

  try {
    await db.exec('BEGIN');
    await migration.apply(db);
    await db.run(
      'INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)',
      migration.id,
      new Date().toISOString(),
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
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

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    id: '001_core_schema_registry',
    apply: ensureMigrationTable,
  },
  {
    id: '002_mission_canonical_index',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS missions_index (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          mode TEXT NOT NULL,
          query TEXT NOT NULL,
          source TEXT,
          depth TEXT,
          opportunityId TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          inputPayload TEXT NOT NULL,
          artifactPath TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_missions_index_updated
          ON missions_index (updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_missions_index_status_updated
          ON missions_index (status, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_missions_index_opportunity
          ON missions_index (opportunityId, updatedAt DESC);

        CREATE TABLE IF NOT EXISTS mission_events (
          id TEXT PRIMARY KEY,
          missionId TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT,
          phase TEXT,
          message TEXT NOT NULL,
          meta TEXT,
          artifactPath TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mission_events_lookup
          ON mission_events (missionId, timestamp ASC);

        CREATE TABLE IF NOT EXISTS mission_evidence_refs (
          id TEXT PRIMARY KEY,
          missionId TEXT NOT NULL,
          runId TEXT NOT NULL,
          capturedAt TEXT NOT NULL,
          status TEXT NOT NULL,
          completeness TEXT NOT NULL,
          artifactPath TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mission_evidence_refs_run
          ON mission_evidence_refs (runId);
        CREATE INDEX IF NOT EXISTS idx_mission_evidence_refs_mission
          ON mission_evidence_refs (missionId, capturedAt DESC);
      `);
    },
  },
  {
    id: '003_mission_run_lifecycle_columns',
    apply: async (db) => {
      await addColumnIfMissing(db, 'mission_runs', 'cancelRequestedAt', 'TEXT');
      await addColumnIfMissing(db, 'mission_runs', 'failureCode', 'TEXT');
    },
  },
  {
    id: '004_durable_stream_events',
    apply: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS stream_events (
          id TEXT PRIMARY KEY,
          stream TEXT NOT NULL,
          type TEXT NOT NULL,
          version INTEGER NOT NULL,
          entityId TEXT,
          occurredAt TEXT NOT NULL,
          payload TEXT NOT NULL,
          source TEXT NOT NULL,
          runId TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_stream_events_stream_time
          ON stream_events (stream, occurredAt ASC, id ASC);
        CREATE INDEX IF NOT EXISTS idx_stream_events_entity_time
          ON stream_events (entityId, occurredAt ASC, id ASC);
      `);
    },
  },
  {
    id: '005_task_runtime_columns',
    apply: async (db) => {
      await addColumnIfMissing(db, 'tasks', 'missionId', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'runId', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'statePayload', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'inputPayload', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'dedupeKey', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'idempotencyKey', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'inputHash', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'leaseId', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'heartbeatAt', 'INTEGER');
      await addColumnIfMissing(db, 'tasks', 'cancelRequestedAt', 'INTEGER');
      await addColumnIfMissing(db, 'tasks', 'failureCode', 'TEXT');
      await addColumnIfMissing(db, 'tasks', 'degradedFlags', 'TEXT');
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_dedupe_status
        ON tasks (dedupeKey, status);
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_idempotency_status
        ON tasks (idempotencyKey, status);
      `);
    },
  },
  {
    id: '006_opportunity_profile_columns',
    apply: async (db) => {
      await addColumnIfMissing(db, 'opportunities', 'heatProfile', 'TEXT');
      await addColumnIfMissing(db, 'opportunities', 'proxyProfile', 'TEXT');
      await addColumnIfMissing(db, 'opportunities', 'ipoProfile', 'TEXT');
      await addColumnIfMissing(db, 'opportunities', 'catalystCalendar', "TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    id: '007_narrative_lifecycle_columns',
    apply: async (db) => {
      await addColumnIfMissing(db, 'narratives', 'title', 'TEXT');
      await addColumnIfMissing(db, 'narratives', 'stage', "TEXT DEFAULT 'earlyFermentation'");
      await addColumnIfMissing(db, 'narratives', 'status', "TEXT DEFAULT 'active'");
      await addColumnIfMissing(db, 'narratives', 'impactScore', 'REAL DEFAULT 0');
      await addColumnIfMissing(db, 'narratives', 'coreTicker', 'TEXT');
      await addColumnIfMissing(db, 'narratives', 'lastUpdatedAt', 'INTEGER');
    },
  },
];

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
