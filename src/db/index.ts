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
    await db.exec(`ALTER TABLE tasks ADD COLUMN statePayload TEXT;`);
  } catch (e: any) {
    // Column already exists
  }

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
}
