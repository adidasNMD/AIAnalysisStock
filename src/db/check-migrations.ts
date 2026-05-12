import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { initDb, migrationChecksum } from './index';
import { SCHEMA_MIGRATIONS } from './migrations';

type MigrationCheckRow = {
  id: string;
  description: string;
  checksum: string;
  durationMs: number;
  status: string;
  error: string | null;
};

async function main() {
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });

  try {
    await initDb(db);
    const rows = await db.all<MigrationCheckRow[]>(
      `SELECT id, description, checksum, durationMs, status, error
       FROM schema_migrations
       ORDER BY id ASC`,
    );
    const expectedById = new Map(SCHEMA_MIGRATIONS.map((migration) => [migration.id, migration]));
    const failures: string[] = [];

    if (rows.length !== SCHEMA_MIGRATIONS.length) {
      failures.push(`expected ${SCHEMA_MIGRATIONS.length} migrations, found ${rows.length}`);
    }

    for (const row of rows) {
      const expected = expectedById.get(row.id);
      if (!expected) {
        failures.push(`unexpected migration row: ${row.id}`);
        continue;
      }
      if (row.status !== 'applied') {
        failures.push(`${row.id} status=${row.status}${row.error ? ` error=${row.error}` : ''}`);
      }
      if (row.description !== expected.description) {
        failures.push(`${row.id} description mismatch`);
      }
      if (row.checksum !== migrationChecksum(expected)) {
        failures.push(`${row.id} checksum mismatch`);
      }
    }

    if (failures.length > 0) {
      console.error('[DB] Migration check failed');
      failures.forEach((failure) => console.error(`- ${failure}`));
      process.exitCode = 1;
      return;
    }

    console.log(`[DB] Migration check passed: ${rows.length} migrations`);
    rows.forEach((row) => {
      console.log(`- ${row.id} ${row.status} ${row.durationMs}ms ${row.checksum.slice(0, 12)}`);
    });
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
