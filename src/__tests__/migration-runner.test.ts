import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  computeChecksum,
  getMigrationStatus,
  resetMigrationRegistryForTests,
  rollbackMigrations,
  runMigrations,
  setMigrationRegistryForTests,
} from '../migrations/runner';
import { configureDb } from '../db';
import { REGISTERED_MIGRATIONS } from '../migrations/versions';

const tempRoot = path.join(process.cwd(), '.tmp-migration-tests');
const versionsDir = path.join(process.cwd(), 'src', 'migrations', 'versions');
const fakeMigrationPath = path.join(versionsDir, '999_test.ts');

async function openDb(name: string): Promise<Database> {
  await fs.mkdir(tempRoot, { recursive: true });
  const db = await open({
    filename: path.join(tempRoot, name),
    driver: sqlite3.Database,
  });
  await configureDb(db);
  return db;
}

const fakeMigrationSource = `
import type { Database } from 'sqlite';
export const description = 'fake test migration';
export async function up(db: Database): Promise<void> {
  await db.exec(\`CREATE TABLE IF NOT EXISTS fake_table (id TEXT PRIMARY KEY, note TEXT);\`);
}
export async function down(db: Database): Promise<void> {
  await db.exec(\`DROP TABLE IF EXISTS fake_table;\`);
}
`;

beforeEach(async () => {
  await fs.mkdir(versionsDir, { recursive: true });
  await fs.writeFile(fakeMigrationPath, fakeMigrationSource, 'utf8');
  setMigrationRegistryForTests([
    ...REGISTERED_MIGRATIONS,
    {
      version: '999_test',
      filePath: fakeMigrationPath,
      description: 'fake test migration',
      async up(db) {
        await db.exec('CREATE TABLE IF NOT EXISTS fake_table (id TEXT PRIMARY KEY, note TEXT);');
      },
      async down(db) {
        await db.exec('DROP TABLE IF EXISTS fake_table;');
      },
    },
  ]);
});

afterEach(async () => {
  resetMigrationRegistryForTests();
  await fs.rm(fakeMigrationPath, { force: true });
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('migration runner', () => {
  it('runs on empty db and creates schema_version', async () => {
    const db = await openDb('empty.db');
    try {
      const result = await runMigrations(db, { targetVersion: '000_bootstrap' });
      const table = await db.get<{ name?: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'");
      expect(table?.name).toBe('schema_version');
      expect(result.applied).toEqual(['000_bootstrap']);
    } finally {
      await db.close();
    }
  });

  it('applies fake migration then rolls back', async () => {
    const db = await openDb('roundtrip.db');
    try {
      const up = await runMigrations(db);
      const fakeTable = await db.get<{ name?: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='fake_table'");
      expect(up.applied).toContain('999_test');
      expect(fakeTable?.name).toBe('fake_table');

      const down = await rollbackMigrations(db, 1);
      const dropped = await db.get<{ name?: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='fake_table'");
      expect(down.rolledBack).toEqual(['999_test']);
      expect(dropped).toBeUndefined();
    } finally {
      await db.close();
    }
  });

  it('keeps bootstrap metadata when rolling back all', async () => {
    const db = await openDb('rollback-all.db');
    try {
      await runMigrations(db);

      const down = await rollbackMigrations(db, 'all');
      const schemaVersionTable = await db.get<{ name?: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'");
      const remaining = await db.all<Array<{ version: string }>>('SELECT version FROM schema_version ORDER BY version ASC');

      expect(down.rolledBack).toEqual(['999_test', '001_init_baseline']);
      expect(schemaVersionTable?.name).toBe('schema_version');
      expect(remaining).toEqual([{ version: '000_bootstrap' }]);
    } finally {
      await db.close();
    }
  });

  it('returns stable checksums', async () => {
    const first = await computeChecksum(fakeMigrationPath);
    const second = await computeChecksum(fakeMigrationPath);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects checksum tampering via status', async () => {
    const db = await openDb('divergence.db');
    try {
      await runMigrations(db);
      await fs.writeFile(fakeMigrationPath, `${fakeMigrationSource}\n// tampered\n`, 'utf8');

      const status = await getMigrationStatus(db);
      expect(status.hasDivergence).toBe(true);
      expect(status.divergentVersions).toContain('999_test');
    } finally {
      await db.close();
    }
  });
});
