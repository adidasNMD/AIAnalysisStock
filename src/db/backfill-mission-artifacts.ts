import { getDb } from './index';
import { backfillMissionArtifactRefs, getMissionArtifactHealthDiagnostics } from '../workflows/mission-index';

async function main() {
  const db = await getDb();

  try {
    const result = await backfillMissionArtifactRefs();
    const health = await getMissionArtifactHealthDiagnostics();

    console.log('[DB] Mission artifact backfill completed');
    console.log(`- missions: ${result.missionArtifactsUpserted}/${result.missionsScanned}`);
    console.log(`- event logs: ${result.eventLogArtifactsUpserted} from ${result.eventRowsScanned} events`);
    console.log(`- evidence: ${result.evidenceArtifactsUpserted}/${result.evidenceRefsScanned}`);
    console.log(`- files: ${result.filesPresent} present, ${result.filesMissing} missing, ${result.filesUnreadable} unreadable`);
    console.log(`- health: ${health.status} (${health.present}/${health.total} present, ${health.issues.length} sampled issues)`);
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
