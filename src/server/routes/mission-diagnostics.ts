import { Router, Request, Response } from 'express';
import { getSchemaMigrationStatuses } from '../../db';
import {
  backfillCanonicalMissions,
  backfillMissionArtifactRefs,
  backfillOpportunityFieldEvidence,
  getMissionArtifactHealthDiagnostics,
  getMissionArtifactRepairPlan,
  getMissionCanonicalCoverageDiagnostics,
  getOpportunityFieldEvidenceCoverageDiagnostics,
  getOpportunityFieldEvidenceRepairPlan,
  refreshMissionArtifactIntegrity,
  repairOpportunityFieldEvidence,
  repairMissionArtifacts,
} from '../../workflows';
import { sendInternalError } from '../route-helpers';

export const missionDiagnosticsRouter = Router();

missionDiagnosticsRouter.get('/diagnostics/db-migrations', async (_req: Request, res: Response) => {
  try {
    const migrations = await getSchemaMigrationStatuses();
    const failed = migrations.filter(migration => migration.status === 'failed');
    const missing = migrations.filter(migration => migration.status === 'missing');
    const mismatched = migrations.filter(migration => (
      migration.status !== 'missing' && migration.checksumMatches === false
    ));

    res.json({
      status: failed.length || missing.length || mismatched.length ? 'degraded' : 'ok',
      total: migrations.length,
      applied: migrations.filter(migration => migration.status === 'applied').length,
      failed: failed.length,
      missing: missing.length,
      mismatched: mismatched.length,
      migrations,
    });
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.get('/diagnostics/mission-artifacts', async (_req: Request, res: Response) => {
  try {
    res.json(await getMissionArtifactHealthDiagnostics());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.get('/diagnostics/mission-artifacts/repair-plan', async (_req: Request, res: Response) => {
  try {
    res.json(await getMissionArtifactRepairPlan());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.get('/diagnostics/missions', async (_req: Request, res: Response) => {
  try {
    res.json(await getMissionCanonicalCoverageDiagnostics());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.get('/diagnostics/opportunity-field-evidence', async (_req: Request, res: Response) => {
  try {
    res.json(await getOpportunityFieldEvidenceCoverageDiagnostics());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.get('/diagnostics/opportunity-field-evidence/repair-plan', async (_req: Request, res: Response) => {
  try {
    res.json(await getOpportunityFieldEvidenceRepairPlan());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.post('/diagnostics/mission-artifacts/backfill', async (_req: Request, res: Response) => {
  try {
    res.status(202).json(await backfillMissionArtifactRefs());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.post('/diagnostics/mission-artifacts/repair', async (req: Request, res: Response) => {
  try {
    const artifactIds = Array.isArray(req.body?.artifactIds)
      ? req.body.artifactIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : undefined;
    const includeManualReview = Boolean(req.body?.includeManualReview);
    res.status(202).json(await repairMissionArtifacts({
      ...(artifactIds ? { artifactIds } : {}),
      includeManualReview,
    }));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.post('/diagnostics/missions/backfill', async (_req: Request, res: Response) => {
  try {
    res.status(202).json(await backfillCanonicalMissions());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.post('/diagnostics/opportunity-field-evidence/backfill', async (_req: Request, res: Response) => {
  try {
    res.status(202).json(await backfillOpportunityFieldEvidence());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.post('/diagnostics/opportunity-field-evidence/repair', async (req: Request, res: Response) => {
  try {
    const evidenceIds = Array.isArray(req.body?.evidenceIds)
      ? req.body.evidenceIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : undefined;
    res.status(202).json(await repairOpportunityFieldEvidence({
      ...(evidenceIds ? { evidenceIds } : {}),
    }));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

missionDiagnosticsRouter.post('/diagnostics/mission-artifacts/refresh-integrity', async (req: Request, res: Response) => {
  try {
    const overwriteMismatches = Boolean(req.body?.overwriteMismatches);
    res.status(202).json(await refreshMissionArtifactIntegrity({ overwriteMismatches }));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});
