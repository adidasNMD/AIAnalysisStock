import * as path from 'path';
import { openDbConnection } from '../src/db';
import { getMigrationStatus, rollbackMigrations, runMigrations } from '../src/migrations/runner';

interface ParsedArgs {
  command: 'up' | 'down' | 'status' | 'redo';
  dbPath: string;
  downSteps: number | 'all';
}

function parseArgs(argv: string[]): ParsedArgs {
  const [commandArg, ...rest] = argv;
  const command = (commandArg ?? 'up') as ParsedArgs['command'];
  if (!['up', 'down', 'status', 'redo'].includes(command)) {
    throw new Error(`Unknown migrate command: ${commandArg ?? '<empty>'}`);
  }

  let dbPath = path.join(process.cwd(), 'data', 'openclaw.db');
  let downSteps: number | 'all' = 1;

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index]!;
    if (current === '--db') {
      const next = rest[index + 1];
      if (!next) {
        throw new Error('Missing value for --db');
      }
      dbPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (command === 'down' && downSteps === 1) {
      if (current === 'all') {
        downSteps = 'all';
      } else {
        const parsed = Number(current);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Invalid rollback steps: ${current}`);
        }
        downSteps = parsed;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return { command, dbPath, downSteps };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const db = await openDbConnection(parsed.dbPath);

  try {
    if (parsed.command === 'up') {
      const result = await runMigrations(db);
      console.log(`[migrate] applied ${result.applied.length} migration(s): ${result.applied.join(', ') || 'none'}`);
      return;
    }

    if (parsed.command === 'down') {
      const result = await rollbackMigrations(db, parsed.downSteps);
      console.log(`[migrate] rolled back ${result.rolledBack.length} migration(s): ${result.rolledBack.join(', ') || 'none'}`);
      return;
    }

    if (parsed.command === 'redo') {
      const downResult = await rollbackMigrations(db, 1);
      const upResult = await runMigrations(db);
      console.log(`[migrate] redo down=${downResult.rolledBack.join(', ') || 'none'} up=${upResult.applied.join(', ') || 'none'}`);
      return;
    }

    const status = await getMigrationStatus(db);
    console.log(`[migrate] ${status.applied.length} applied, ${status.pending.length} pending`);
    if (status.applied.length > 0) {
      console.log(`[migrate] applied versions: ${status.applied.map((item) => item.version).join(', ')}`);
    }
    if (status.pending.length > 0) {
      console.log(`[migrate] pending versions: ${status.pending.join(', ')}`);
    }
    if (status.hasDivergence) {
      console.error(`[migrate] checksum mismatch: ${status.divergentVersions.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate] fatal: ${message}`);
  process.exit(1);
});
