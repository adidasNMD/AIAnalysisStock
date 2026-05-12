import { getDb } from './index';
import { backfillCanonicalMissions } from '../workflows/mission-index';

async function main() {
  const db = await getDb();

  try {
    const result = await backfillCanonicalMissions();

    console.log('[DB] Canonical Mission backfill completed');
    console.log(`- scanned: ${result.missionsScanned}`);
    console.log(`- inserted: ${result.inserted}`);
    console.log(`- refreshed: ${result.refreshed}`);
    console.log(`- latest refs: ${result.latestRunsLinked} runs, ${result.latestEventsLinked} events`);
    console.log(`- input fallbacks: ${result.inputPayloadFallbacks}`);
    console.log(`- files: ${result.filesPresent} present, ${result.filesMissing} missing, ${result.filesUnreadable} unreadable`);
    console.log(`- artifact integrity recorded: ${result.artifactIntegrityRecorded}`);
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
