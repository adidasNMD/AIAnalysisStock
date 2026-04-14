import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

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

async function initDb(db: Database) {
  await db.exec(`PRAGMA journal_mode = WAL;`);
  await db.exec(`PRAGMA busy_timeout = 5000;`);

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
