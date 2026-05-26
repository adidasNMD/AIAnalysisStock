import { getDb } from './index';
import {
  getMissionArtifactHealthDiagnostics,
  refreshMissionArtifactIntegrity,
} from '../workflows/mission-index';

async function main() {
  const db = await getDb();

  try {
    const overwriteMismatches = process.argv.includes('--overwrite-mismatches');
    const result = await refreshMissionArtifactIntegrity({ overwriteMismatches });
    const health = await getMissionArtifactHealthDiagnostics();

    console.log('[DB] Mission artifact integrity refresh completed');
    console.log(`- scanned: ${result.total}`);
    console.log(`- refreshed: ${result.refreshed}`);
    console.log(`- files: ${result.filesPresent} present, ${result.filesMissing} missing, ${result.filesUnreadable} unreadable`);
    console.log(`- metadata gaps: ${result.integrityMissing}`);
    console.log(`- mismatches: ${result.checksumMismatches} checksum, ${result.sizeMismatches} size`);
    console.log(`- skipped mismatches: ${result.skippedMismatches}`);
    console.log(`- health: ${health.status} (${health.present}/${health.total} present, ${health.issues.length} sampled issues)`);
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
