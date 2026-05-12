import { getDb } from './index';
import {
  backfillOpportunityFieldEvidence,
  getOpportunityFieldEvidenceCoverageDiagnostics,
} from '../workflows';

async function main() {
  const db = await getDb();

  try {
    const result = await backfillOpportunityFieldEvidence();
    const coverage = await getOpportunityFieldEvidenceCoverageDiagnostics();

    console.log('[DB] Opportunity field evidence backfill completed');
    console.log(`- events scanned: ${result.eventsScanned}`);
    console.log(`- recorded: ${result.recordedEvents}`);
    console.log(`- inserted: ${result.inserted}`);
    console.log(`- refreshed: ${result.refreshed}`);
    console.log(`- invalidated: ${result.invalidated}`);
    console.log(`- restored: ${result.restored}`);
    console.log(`- skipped missing field: ${result.skippedMissingField}`);
    console.log(`- coverage: ${coverage.status} (${coverage.covered}/${coverage.recordedEvents} covered, ${coverage.issues.length} sampled issues)`);
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
