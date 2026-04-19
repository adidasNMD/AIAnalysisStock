import type { Database } from 'sqlite';

export const description = 'Bootstrap schema_version table';

export const SCHEMA_VERSION_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  appliedAt INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  direction TEXT NOT NULL,
  durationMs INTEGER NOT NULL
);
`;

export async function up(db: Database): Promise<void> {
  await db.exec(SCHEMA_VERSION_DDL);
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS schema_version;');
}
