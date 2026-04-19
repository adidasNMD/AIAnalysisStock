import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

let dbInstance: Database | null = null;

export const DB_PATH = path.join(process.cwd(), 'data', 'openclaw.db');

export async function configureDb(db: Database): Promise<void> {
  await db.exec(`PRAGMA journal_mode = WAL;`);
  await db.exec(`PRAGMA busy_timeout = 5000;`);
}

export async function openDbConnection(filename = DB_PATH): Promise<Database> {
  const db = await open({
    filename,
    driver: sqlite3.Database,
  });
  await configureDb(db);
  return db;
}

export function setDbInstance(db: Database): void {
  dbInstance = db;
}

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await openDbConnection();
  }
  return dbInstance;
}

export async function initDb(_db: Database): Promise<void> {
  throw new Error('initDb is deprecated. Use runMigrations from src/migrations/runner.ts');
}
