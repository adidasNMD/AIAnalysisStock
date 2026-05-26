import { describe, expect, it } from 'vitest';
import { DIAGNOSTICS_INTERVALS } from '../../dashboard/src/queries/diagnostics-queries';

describe('diagnostics query hooks', () => {
  it('keeps CommandCenter diagnostic polling cadences explicit', () => {
    expect(DIAGNOSTICS_INTERVALS).toEqual({
      health: 5000,
      services: 10000,
      dbMigrations: 15000,
      missionCanonical: 15000,
      missionArtifacts: 15000,
      missionArtifactRepairPlan: 15000,
      opportunityFieldEvidence: 15000,
      opportunityFieldEvidenceRepairPlan: 15000,
      opportunityPriceHistory: 15000,
    });
  });
});
