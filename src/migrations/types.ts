import type { Database } from 'sqlite';

export interface MigrationModule {
  description: string;
  up(db: Database): Promise<void>;
  down(db: Database): Promise<void>;
}

export interface RegisteredMigration extends MigrationModule {
  version: string;
  filePath: string;
}

export interface MigrationRecord {
  version: string;
  appliedAt: number;
  checksum: string;
  direction: 'up' | 'down';
  durationMs: number;
}

export interface LoadedMigration {
  version: string;
  filePath: string;
  checksum: string;
  description: string;
  up(db: Database): Promise<void>;
  down(db: Database): Promise<void>;
}

export interface MigrateResult {
  applied: string[];
  rolledBack: string[];
  skipped: number;
}

export interface MigrationStatus {
  applied: Array<{ version: string; checksum: string; appliedAt: number }>;
  pending: string[];
  hasDivergence: boolean;
  divergentVersions: string[];
}

export class MigrationError extends Error {
  readonly version: string;
  readonly direction: 'up' | 'down';
  readonly cause: unknown;

  constructor(version: string, direction: 'up' | 'down', cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Migration ${direction} failed for ${version}: ${message}`);
    this.name = 'MigrationError';
    this.version = version;
    this.direction = direction;
    this.cause = cause;
  }
}
