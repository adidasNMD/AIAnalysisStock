import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import type { Database } from 'sqlite';
import { eventBus } from '../utils/event-bus';
import {
  type LoadedMigration,
  type MigrationRecord,
  type MigrationStatus,
  type MigrateResult,
  type RegisteredMigration,
  MigrationError,
} from './types';
import { SCHEMA_VERSION_DDL } from './versions/000_bootstrap';
import { REGISTERED_MIGRATIONS } from './versions';

const BOOTSTRAP_VERSION = '000_bootstrap';
const DEFAULT_MIGRATION_REGISTRY = [...REGISTERED_MIGRATIONS].sort((a, b) => a.version.localeCompare(b.version));

let migrationRegistry: RegisteredMigration[] = [...DEFAULT_MIGRATION_REGISTRY];

async function setExclusiveLockingMode(db: Database): Promise<string> {
  const current = await db.get<{ locking_mode?: string }>('PRAGMA locking_mode;');
  await db.exec('PRAGMA locking_mode = EXCLUSIVE;');
  return current?.locking_mode?.toUpperCase?.() ?? 'NORMAL';
}

async function restoreLockingMode(db: Database, mode: string): Promise<void> {
  await db.exec(`PRAGMA locking_mode = ${mode};`);
}

async function publishMigrationEvent(type: 'migration.applied' | 'migration.failed', payload: Record<string, unknown>): Promise<void> {
  try {
    eventBus.emitSystem(type === 'migration.applied' ? 'info' : 'error', type, payload);
  } catch {
    // P0-5 not landed yet; migration flow must remain self-contained.
  }
}

function validateMigrationRegistry(registry: RegisteredMigration[]): RegisteredMigration[] {
  const sorted = [...registry].sort((a, b) => a.version.localeCompare(b.version));
  const seen = new Set<string>();

  for (const migration of sorted) {
    if (!/^\d{3}_[A-Za-z0-9_-]+$/.test(migration.version)) {
      throw new Error(`Invalid registered migration version: ${migration.version}`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate registered migration version: ${migration.version}`);
    }
    seen.add(migration.version);
  }

  if (sorted[0]?.version !== BOOTSTRAP_VERSION) {
    throw new Error(`First registered migration must be ${BOOTSTRAP_VERSION}`);
  }

  return sorted;
}

function getBootstrapMigration(): RegisteredMigration {
  const bootstrapMigration = migrationRegistry.find((migration) => migration.version === BOOTSTRAP_VERSION);
  if (!bootstrapMigration) {
    throw new Error(`Missing registered bootstrap migration: ${BOOTSTRAP_VERSION}`);
  }
  return bootstrapMigration;
}

export function setMigrationRegistryForTests(registry: RegisteredMigration[]): void {
  migrationRegistry = validateMigrationRegistry(registry);
}

export function resetMigrationRegistryForTests(): void {
  migrationRegistry = [...DEFAULT_MIGRATION_REGISTRY];
}

async function schemaVersionExists(db: Database): Promise<boolean> {
  const row = await db.get<{ name?: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
  );
  return row?.name === 'schema_version';
}

async function ensureBootstrap(db: Database): Promise<void> {
  if (!(await schemaVersionExists(db))) {
    await db.exec(SCHEMA_VERSION_DDL);
  }

  const existing = await db.get<{ version?: string }>('SELECT version FROM schema_version WHERE version = ?', BOOTSTRAP_VERSION);
  if (!existing) {
    const bootstrapChecksum = await computeChecksum(getBootstrapMigration().filePath);
    await db.run(
      'INSERT INTO schema_version (version, appliedAt, checksum, direction, durationMs) VALUES (?, ?, ?, ?, ?)',
      BOOTSTRAP_VERSION,
      Date.now(),
      bootstrapChecksum,
      'up',
      0,
    );
  }
}

export async function computeChecksum(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function loadMigration(migration: RegisteredMigration): Promise<LoadedMigration> {
  const checksum = await computeChecksum(migration.filePath);
  return {
    version: migration.version,
    filePath: migration.filePath,
    checksum,
    description: migration.description,
    up: migration.up,
    down: migration.down,
  };
}

async function loadMigrations(): Promise<LoadedMigration[]> {
  return Promise.all(validateMigrationRegistry(migrationRegistry).map(loadMigration));
}

async function getAppliedRecords(db: Database): Promise<MigrationRecord[]> {
  if (!(await schemaVersionExists(db))) {
    return [];
  }

  return db.all<MigrationRecord[]>(
    'SELECT version, appliedAt, checksum, direction, durationMs FROM schema_version ORDER BY version ASC, appliedAt ASC',
  );
}

async function assertNoChecksumDivergence(db: Database, migrations: LoadedMigration[]): Promise<string[]> {
  const appliedRecords = await getAppliedRecords(db);
  const lastUpByVersion = new Map<string, MigrationRecord>();

  for (const record of appliedRecords) {
    if (record.direction === 'up') {
      lastUpByVersion.set(record.version, record);
    }
    if (record.direction === 'down') {
      lastUpByVersion.delete(record.version);
    }
  }

  const divergentVersions: string[] = [];
  for (const migration of migrations) {
    const applied = lastUpByVersion.get(migration.version);
    if (applied && applied.checksum !== migration.checksum) {
      divergentVersions.push(migration.version);
    }
  }

  if (divergentVersions.length > 0) {
    throw new Error(`${divergentVersions.join(', ')} checksum mismatch`);
  }

  return Array.from(lastUpByVersion.keys()).sort();
}

async function runInTransaction(db: Database, fn: () => Promise<void>): Promise<void> {
  await db.exec('BEGIN TRANSACTION;');
  try {
    await fn();
    await db.exec('COMMIT;');
  } catch (error) {
    await db.exec('ROLLBACK;');
    throw error;
  }
}

export async function runMigrations(db: Database, opts?: { targetVersion?: string }): Promise<MigrateResult> {
  const previousLockingMode = await setExclusiveLockingMode(db);
  try {
    const bootstrapAlreadyExists = await schemaVersionExists(db);
    await ensureBootstrap(db);
    const migrations = await loadMigrations();
    const appliedVersions = await assertNoChecksumDivergence(db, migrations);
    const targetVersion = opts?.targetVersion;
    const toApply = migrations.filter((migration) => {
      if (appliedVersions.includes(migration.version)) {
        return false;
      }
      if (!targetVersion) {
        return true;
      }
      return migration.version <= targetVersion;
    });

    const applied: string[] = bootstrapAlreadyExists ? [] : [BOOTSTRAP_VERSION];
    for (const migration of toApply) {
      if (migration.version === BOOTSTRAP_VERSION) {
        continue;
      }
      const startedAt = Date.now();
      try {
        await runInTransaction(db, async () => {
          await migration.up(db);
          await db.run(
            'INSERT INTO schema_version (version, appliedAt, checksum, direction, durationMs) VALUES (?, ?, ?, ?, ?)',
            migration.version,
            startedAt,
            migration.checksum,
            'up',
            Date.now() - startedAt,
          );
        });
        applied.push(migration.version);
        await publishMigrationEvent('migration.applied', { version: migration.version, direction: 'up' });
      } catch (error) {
        await publishMigrationEvent('migration.failed', { version: migration.version, direction: 'up', error: error instanceof Error ? error.message : String(error) });
        throw new MigrationError(migration.version, 'up', error);
      }
    }

    return {
      applied,
      rolledBack: [],
      skipped: migrations.length - applied.length,
    };
  } finally {
    await restoreLockingMode(db, previousLockingMode);
  }
}

export async function rollbackMigrations(db: Database, steps: number | 'all' = 1): Promise<MigrateResult> {
  const previousLockingMode = await setExclusiveLockingMode(db);
  try {
    const migrations = await loadMigrations();
    if (!(await schemaVersionExists(db))) {
      return { applied: [], rolledBack: [], skipped: 0 };
    }
    await assertNoChecksumDivergence(db, migrations);
    const appliedRecords = await getAppliedRecords(db);
    const appliedVersions = appliedRecords
      .filter((record) => record.direction === 'up' && record.version !== BOOTSTRAP_VERSION)
      .map((record) => record.version);
    const uniqueApplied = Array.from(new Set(appliedVersions)).sort();
    const targets = steps === 'all'
      ? [...uniqueApplied].reverse()
      : uniqueApplied.slice(-steps).reverse();
    const rolledBack: string[] = [];

    for (const version of targets) {
      const migration = migrations.find((candidate) => candidate.version === version);
      if (!migration) {
        throw new Error(`Cannot rollback missing migration module: ${version}`);
      }
      const startedAt = Date.now();
      try {
        await runInTransaction(db, async () => {
          await migration.down(db);
          await db.run('DELETE FROM schema_version WHERE version = ?', version);
        });
        rolledBack.push(version);
      } catch (error) {
        await publishMigrationEvent('migration.failed', { version, direction: 'down', error: error instanceof Error ? error.message : String(error) });
        throw new MigrationError(version, 'down', error);
      }
    }

    return {
      applied: [],
      rolledBack,
      skipped: 0,
    };
  } finally {
    await restoreLockingMode(db, previousLockingMode);
  }
}

export async function getMigrationStatus(db: Database): Promise<MigrationStatus> {
  const migrations = await loadMigrations();
  if (!(await schemaVersionExists(db))) {
    return {
      applied: [],
      pending: migrations.map((migration) => migration.version).sort(),
      hasDivergence: false,
      divergentVersions: [],
    };
  }

  const appliedRecords = await getAppliedRecords(db);
  const lastUpByVersion = new Map<string, MigrationRecord>();

  for (const record of appliedRecords) {
    if (record.direction === 'up') {
      lastUpByVersion.set(record.version, record);
    }
    if (record.direction === 'down') {
      lastUpByVersion.delete(record.version);
    }
  }

  const divergentVersions: string[] = [];
  for (const migration of migrations) {
    const applied = lastUpByVersion.get(migration.version);
    if (applied && applied.checksum !== migration.checksum) {
      divergentVersions.push(migration.version);
    }
  }

  return {
    applied: Array.from(lastUpByVersion.values())
      .sort((a, b) => a.version.localeCompare(b.version))
      .map((record) => ({
        version: record.version,
        checksum: record.checksum,
        appliedAt: record.appliedAt,
      })),
    pending: migrations
      .map((migration) => migration.version)
      .filter((version) => !lastUpByVersion.has(version))
      .sort(),
    hasDivergence: divergentVersions.length > 0,
    divergentVersions,
  };
}
