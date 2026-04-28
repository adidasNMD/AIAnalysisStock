import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import { logger } from '../utils/logger';

let dbInstance: Database | null = null;

const DB_PATH = path.join(process.cwd(), 'data', 'openclaw.db');

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

async function applyMigration(db: Database, id: string, sql: string): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
  `);
  const existing = await db.get<{ id: string }>('SELECT id FROM schema_migrations WHERE id = ?', id);
  if (existing) return;

  try {
    await db.exec('BEGIN');
    await db.exec(sql);
    await db.run(
      'INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)',
      id,
      new Date().toISOString(),
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[DB] Migration ${id} failed: ${message}`);
    throw error;
  }
}

async function initDb(db: Database) {
  await db.exec(`PRAGMA journal_mode = WAL;`);
  await db.exec(`PRAGMA busy_timeout = 5000;`);

  await applyMigration(db, '001_core_schema_registry', `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
  `);

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
  // Handle migrations for existing DB
  try {
    await db.exec(`ALTER TABLE tasks ADD COLUMN missionId TEXT;`);
  } catch (e: any) {
    // Column already exists
  }
  try {
    await db.exec(`ALTER TABLE tasks ADD COLUMN runId TEXT;`);
  } catch (e: any) {
    // Column already exists
  }
  try {
    await db.exec(`ALTER TABLE tasks ADD COLUMN statePayload TEXT;`);
  } catch (e: any) {
    // Column already exists
  }
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN inputPayload TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN leaseId TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN heartbeatAt INTEGER;`); } catch {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN cancelRequestedAt INTEGER;`); } catch {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN failureCode TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN degradedFlags TEXT;`); } catch {}

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
  await applyMigration(db, '002_mission_canonical_index', `
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

  await applyMigration(db, '003_mission_run_lifecycle_columns', `
    ALTER TABLE mission_runs ADD COLUMN cancelRequestedAt TEXT;
    ALTER TABLE mission_runs ADD COLUMN failureCode TEXT;
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
  try { await db.exec(`ALTER TABLE opportunities ADD COLUMN heatProfile TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE opportunities ADD COLUMN proxyProfile TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE opportunities ADD COLUMN ipoProfile TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE opportunities ADD COLUMN catalystCalendar TEXT NOT NULL DEFAULT '[]';`); } catch {}

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
  try { await db.exec(`ALTER TABLE narratives ADD COLUMN title TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE narratives ADD COLUMN stage TEXT DEFAULT 'earlyFermentation';`); } catch {}
  try { await db.exec(`ALTER TABLE narratives ADD COLUMN status TEXT DEFAULT 'active';`); } catch {}
  try { await db.exec(`ALTER TABLE narratives ADD COLUMN impactScore REAL DEFAULT 0;`); } catch {}
  try { await db.exec(`ALTER TABLE narratives ADD COLUMN coreTicker TEXT;`); } catch {}
  try { await db.exec(`ALTER TABLE narratives ADD COLUMN lastUpdatedAt INTEGER;`); } catch {}
}
