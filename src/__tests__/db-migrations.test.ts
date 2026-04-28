import { afterEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import { initDb } from '../db';

const openDbs: Database[] = [];

async function openMemoryDb(): Promise<Database> {
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });
  openDbs.push(db);
  return db;
}

async function columnNames(db: Database, tableName: string): Promise<string[]> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`);
  return columns.map(column => column.name);
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    if (db) await db.close();
  }
});

describe('database migrations', () => {
  it('records schema migrations and can run repeatedly', async () => {
    const db = await openMemoryDb();

    await initDb(db);
    await initDb(db);

    const migrations = await db.all<Array<{ id: string }>>(
      'SELECT id FROM schema_migrations ORDER BY id ASC',
    );

    expect(migrations.map(migration => migration.id)).toEqual([
      '001_core_schema_registry',
      '002_mission_canonical_index',
      '003_mission_run_lifecycle_columns',
      '004_durable_stream_events',
      '005_task_runtime_columns',
      '006_opportunity_profile_columns',
      '007_narrative_lifecycle_columns',
    ]);
  });

  it('upgrades legacy tables without relying on ignored ALTER errors', async () => {
    const db = await openMemoryDb();

    await db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        depth TEXT NOT NULL,
        priority INTEGER NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        progress TEXT,
        createdAt INTEGER NOT NULL,
        startedAt INTEGER,
        completedAt INTEGER,
        error TEXT
      );

      CREATE TABLE mission_runs (
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

      CREATE TABLE opportunities (
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
        latestMissionId TEXT,
        latestEventType TEXT,
        latestEventMessage TEXT,
        latestEventAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE narratives (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        meta TEXT
      );
    `);

    await initDb(db);

    await expect(columnNames(db, 'tasks')).resolves.toEqual(expect.arrayContaining([
      'missionId',
      'runId',
      'inputPayload',
      'dedupeKey',
      'idempotencyKey',
      'inputHash',
      'leaseId',
      'heartbeatAt',
      'cancelRequestedAt',
      'failureCode',
      'degradedFlags',
    ]));
    await expect(columnNames(db, 'mission_runs')).resolves.toEqual(expect.arrayContaining([
      'cancelRequestedAt',
      'failureCode',
    ]));
    await expect(columnNames(db, 'opportunities')).resolves.toEqual(expect.arrayContaining([
      'heatProfile',
      'proxyProfile',
      'ipoProfile',
      'catalystCalendar',
    ]));
    await expect(columnNames(db, 'narratives')).resolves.toEqual(expect.arrayContaining([
      'title',
      'stage',
      'status',
      'impactScore',
      'coreTicker',
      'lastUpdatedAt',
    ]));
  });
});
