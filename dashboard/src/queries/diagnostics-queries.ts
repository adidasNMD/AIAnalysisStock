import {
  fetchDbMigrationDiagnostics,
  fetchDiagnostics,
  fetchHealth,
  fetchMissionArtifactHealthDiagnostics,
  fetchMissionArtifactRepairPlan,
  fetchMissionCanonicalCoverageDiagnostics,
  fetchOpportunityFieldEvidenceCoverageDiagnostics,
  fetchOpportunityFieldEvidenceRepairPlan,
  fetchOpportunityPriceHistoryDiagnostics,
  type DbMigrationDiagnostics,
  type DiagnosticsResult,
  type HealthStatus,
  type MissionArtifactHealthDiagnostics,
  type MissionArtifactRepairPlan,
  type MissionCanonicalCoverageDiagnostics,
  type OpportunityFieldEvidenceCoverageDiagnostics,
  type OpportunityFieldEvidenceRepairPlan,
  type OpportunityPriceHistoryDiagnostics,
} from '../api';
import { usePollingQuery } from './query-client';

export const DIAGNOSTICS_INTERVALS = {
  health: 5000,
  services: 10000,
  dbMigrations: 15000,
  missionCanonical: 15000,
  missionArtifacts: 15000,
  missionArtifactRepairPlan: 15000,
  opportunityFieldEvidence: 15000,
  opportunityFieldEvidenceRepairPlan: 15000,
  opportunityPriceHistory: 15000,
} as const;

export function useHealthQuery() {
  return usePollingQuery<HealthStatus>({
    queryKey: 'diagnostics:health',
    fetcher: fetchHealth,
    intervalMs: DIAGNOSTICS_INTERVALS.health,
    initialData: null,
  });
}

export function useSystemDiagnosticsQuery() {
  return usePollingQuery<DiagnosticsResult | null>({
    queryKey: 'diagnostics:services',
    fetcher: fetchDiagnostics,
    intervalMs: DIAGNOSTICS_INTERVALS.services,
    initialData: null,
  });
}

export function useDbMigrationDiagnosticsQuery() {
  return usePollingQuery<DbMigrationDiagnostics | null>({
    queryKey: 'diagnostics:db-migrations',
    fetcher: fetchDbMigrationDiagnostics,
    intervalMs: DIAGNOSTICS_INTERVALS.dbMigrations,
    initialData: null,
  });
}

export function useMissionCanonicalDiagnosticsQuery() {
  return usePollingQuery<MissionCanonicalCoverageDiagnostics | null>({
    queryKey: 'diagnostics:mission-canonical',
    fetcher: fetchMissionCanonicalCoverageDiagnostics,
    intervalMs: DIAGNOSTICS_INTERVALS.missionCanonical,
    initialData: null,
  });
}

export function useMissionArtifactHealthQuery() {
  return usePollingQuery<MissionArtifactHealthDiagnostics | null>({
    queryKey: 'diagnostics:mission-artifacts',
    fetcher: fetchMissionArtifactHealthDiagnostics,
    intervalMs: DIAGNOSTICS_INTERVALS.missionArtifacts,
    initialData: null,
  });
}

export function useMissionArtifactRepairPlanQuery() {
  return usePollingQuery<MissionArtifactRepairPlan | null>({
    queryKey: 'diagnostics:mission-artifact-repair-plan',
    fetcher: fetchMissionArtifactRepairPlan,
    intervalMs: DIAGNOSTICS_INTERVALS.missionArtifactRepairPlan,
    initialData: null,
  });
}

export function useOpportunityFieldEvidenceDiagnosticsQuery() {
  return usePollingQuery<OpportunityFieldEvidenceCoverageDiagnostics | null>({
    queryKey: 'diagnostics:opportunity-field-evidence',
    fetcher: fetchOpportunityFieldEvidenceCoverageDiagnostics,
    intervalMs: DIAGNOSTICS_INTERVALS.opportunityFieldEvidence,
    initialData: null,
  });
}

export function useOpportunityFieldEvidenceRepairPlanQuery() {
  return usePollingQuery<OpportunityFieldEvidenceRepairPlan | null>({
    queryKey: 'diagnostics:opportunity-field-evidence-repair-plan',
    fetcher: fetchOpportunityFieldEvidenceRepairPlan,
    intervalMs: DIAGNOSTICS_INTERVALS.opportunityFieldEvidenceRepairPlan,
    initialData: null,
  });
}

export function useOpportunityPriceHistoryDiagnosticsQuery() {
  return usePollingQuery<OpportunityPriceHistoryDiagnostics | null>({
    queryKey: 'diagnostics:opportunity-price-history',
    fetcher: () => fetchOpportunityPriceHistoryDiagnostics(24),
    intervalMs: DIAGNOSTICS_INTERVALS.opportunityPriceHistory,
    initialData: null,
  });
}

export function useCommandCenterDiagnostics() {
  const health = useHealthQuery();
  const services = useSystemDiagnosticsQuery();
  const dbMigrations = useDbMigrationDiagnosticsQuery();
  const missionCanonical = useMissionCanonicalDiagnosticsQuery();
  const missionArtifacts = useMissionArtifactHealthQuery();
  const missionArtifactRepairPlan = useMissionArtifactRepairPlanQuery();
  const opportunityFieldEvidence = useOpportunityFieldEvidenceDiagnosticsQuery();
  const opportunityFieldEvidenceRepairPlan = useOpportunityFieldEvidenceRepairPlanQuery();
  const opportunityPriceHistory = useOpportunityPriceHistoryDiagnosticsQuery();

  return {
    health,
    services,
    dbMigrations,
    missionCanonical,
    missionArtifacts,
    missionArtifactRepairPlan,
    opportunityFieldEvidence,
    opportunityFieldEvidenceRepairPlan,
    opportunityPriceHistory,
  };
}
