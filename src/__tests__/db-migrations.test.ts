import { afterEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import { initDb, migrationChecksum, readSchemaMigrationStatuses } from '../db';
import { SCHEMA_MIGRATIONS } from '../db/migrations';

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

    const migrations = await db.all<Array<{
      id: string;
      description: string;
      checksum: string;
      durationMs: number;
      status: string;
      error: string | null;
    }>>(
      'SELECT id, description, checksum, durationMs, status, error FROM schema_migrations ORDER BY id ASC',
    );

    expect(migrations.map(migration => migration.id)).toEqual([
      '001_core_schema_registry',
      '002_mission_canonical_index',
      '003_mission_run_lifecycle_columns',
      '004_durable_stream_events',
      '005_task_runtime_columns',
      '006_opportunity_profile_columns',
      '007_narrative_lifecycle_columns',
      '008_mission_artifact_refs',
      '009_mission_canonical_table',
      '010_opportunity_field_evidence',
      '011_opportunity_field_registry_overrides',
      '012_opportunity_field_registry_audit',
    ]);
    expect(migrations).toHaveLength(SCHEMA_MIGRATIONS.length);
    migrations.forEach((migration, index) => {
      expect(migration.description).toBe(SCHEMA_MIGRATIONS[index].description);
      expect(migration.checksum).toBe(migrationChecksum(SCHEMA_MIGRATIONS[index]));
      expect(migration.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(migration.durationMs).toBeGreaterThanOrEqual(0);
      expect(migration.status).toBe('applied');
      expect(migration.error).toBeNull();
    });
  });

  it('upgrades the legacy migration registry and backfills metadata', async () => {
    const db = await openMemoryDb();

    await db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        appliedAt TEXT NOT NULL
      );
    `);
    await db.run(
      'INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)',
      '001_core_schema_registry',
      '2026-01-01T00:00:00.000Z',
    );

    await initDb(db);

    await expect(columnNames(db, 'schema_migrations')).resolves.toEqual(expect.arrayContaining([
      'id',
      'appliedAt',
      'description',
      'checksum',
      'durationMs',
      'status',
      'error',
    ]));

    const registry = await db.all<Array<{
      id: string;
      description: string;
      checksum: string;
      status: string;
    }>>('SELECT id, description, checksum, status FROM schema_migrations ORDER BY id ASC');
    const firstMigration = registry.find(row => row.id === '001_core_schema_registry');

    expect(registry).toHaveLength(SCHEMA_MIGRATIONS.length);
    expect(firstMigration).toEqual(expect.objectContaining({
      description: SCHEMA_MIGRATIONS[0].description,
      checksum: migrationChecksum(SCHEMA_MIGRATIONS[0]),
      status: 'applied',
    }));
  });

  it('returns migration diagnostics with checksum health', async () => {
    const db = await openMemoryDb();

    await initDb(db);

    const statuses = await readSchemaMigrationStatuses(db);

    expect(statuses).toHaveLength(SCHEMA_MIGRATIONS.length);
    expect(statuses.every(status => status.status === 'applied')).toBe(true);
    expect(statuses.every(status => status.known)).toBe(true);
    expect(statuses.every(status => status.checksumMatches)).toBe(true);
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
    await expect(columnNames(db, 'mission_artifacts')).resolves.toEqual(expect.arrayContaining([
      'id',
      'missionId',
      'runId',
      'kind',
      'artifactPath',
      'sha256',
      'sizeBytes',
      'contentType',
      'createdAt',
      'updatedAt',
      'meta',
    ]));
    await expect(columnNames(db, 'missions')).resolves.toEqual(expect.arrayContaining([
      'id',
      'mode',
      'query',
      'tickers',
      'depth',
      'source',
      'opportunityId',
      'status',
      'createdAt',
      'updatedAt',
      'inputPayload',
      'inputHash',
      'latestRunId',
      'latestEventId',
      'artifactPath',
      'artifactSha256',
      'artifactSizeBytes',
    ]));
    await expect(columnNames(db, 'opportunity_field_evidence')).resolves.toEqual(expect.arrayContaining([
      'id',
      'opportunityId',
      'field',
      'label',
      'kind',
      'source',
      'confidence',
      'status',
      'value',
      'note',
      'observedAt',
      'recordedAt',
      'updatedAt',
      'createdEventId',
      'invalidatedEventId',
      'restoredEventId',
      'meta',
    ]));
  });
});
