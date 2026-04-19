import * as path from 'path';
import type { MigrationModule, RegisteredMigration } from '../types';
import * as bootstrap from './000_bootstrap';
import * as initBaseline from './001_init_baseline';

const MIGRATIONS_DIR = __dirname;

function defineMigration(fileName: string, migration: MigrationModule): RegisteredMigration {
  return {
    version: fileName.replace(/\.ts$/, ''),
    filePath: path.join(MIGRATIONS_DIR, fileName),
    description: migration.description,
    up: migration.up,
    down: migration.down,
  };
}

export const REGISTERED_MIGRATIONS: RegisteredMigration[] = [
  defineMigration('000_bootstrap.ts', bootstrap),
  defineMigration('001_init_baseline.ts', initBaseline),
];
