import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Rocket, Activity, Search, BarChart3, RefreshCw } from 'lucide-react';
import {
  backfillCanonicalMissions,
  backfillMissionArtifacts,
  backfillOpportunityFieldEvidence,
  cancelMission,
  createMission,
  recoverQueueTask,
  recoverStaleQueueTasks,
  refreshMissionArtifactIntegrity,
  repairMissionArtifacts,
  repairOpportunityFieldEvidence,
  refreshOpportunityPriceHistory,
  retryMission,
} from '../api';
import type {
  DiagnosticsResult,
  MissionSummary,
  TaskQueueResponse,
} from '../api';
import { useAgentStream } from '../hooks/useAgentStream';
import { useCommandCenterDiagnostics } from '../queries/diagnostics-queries';
import { buildMissionRecoveryAuditView, useMissionListQuery } from '../queries/mission-queries';
import {
  buildQueueRecoveryIssues,
  DEFAULT_STALE_TASK_THRESHOLD_MS,
  isQueueTaskStale,
  recoverableQueueTasks,
  useQueueQuery,
} from '../queries/queue-queries';
import { getFailureCodeInfo } from '../utils/recovery';
import { evidenceRepairSearchUrl, registryDraftUrl } from '../utils/field-evidence-repair';
import '../styles/workflow-shared.css';
import './command-center.css';

function missionStatusBadge(status: string) {
  switch (status) {
    case 'fully_enriched':
      return { label: 'READY', tone: 'agree' };
    case 'main_only':
      return { label: 'PARTIAL', tone: 'partial' };
    case 'failed':
      return { label: 'FAILED', tone: 'disagree' };
    case 'canceled':
      return { label: 'CANCELED', tone: 'pending' };
    case 'main_running':
    case 'ta_running':
      return { label: 'LIVE', tone: 'partial' };
    case 'queued':
      return { label: 'QUEUED', tone: 'pending' };
    default:
      return { label: status.toUpperCase(), tone: 'pending' };
  }
}

function missionDiffBadge(diff?: MissionSummary['latestDiff']) {
  if (!diff) return null;
  return diff.changed
    ? { label: `CHANGED ${diff.changeCount}`, tone: 'changed' as const }
    : { label: 'STABLE', tone: 'stable' as const };
}

export function CommandCenter() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'explore' | 'analyze'>('explore');
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('deep');
  const [isLoading, setIsLoading] = useState(false);
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);
  const [recoveringTaskId, setRecoveringTaskId] = useState<string | null>(null);
  const [recoveringStale, setRecoveringStale] = useState(false);
  const [backfillingMissions, setBackfillingMissions] = useState(false);
  const [backfillingArtifacts, setBackfillingArtifacts] = useState(false);
  const [backfillingFieldEvidence, setBackfillingFieldEvidence] = useState(false);
  const [repairingArtifacts, setRepairingArtifacts] = useState(false);
  const [repairingFieldEvidence, setRepairingFieldEvidence] = useState(false);
  const [refreshingPriceHistory, setRefreshingPriceHistory] = useState(false);
  const [refreshingArtifactIntegrity, setRefreshingArtifactIntegrity] = useState(false);
  const [retryingMissionId, setRetryingMissionId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const { logs, isConnected } = useAgentStream(80);
  const { data: queue, refresh: refreshQueue } = useQueueQuery();
  const { data: recentMissions, refresh: refreshRecentMissions } = useMissionListQuery(8);
  const {
    health: { data: health },
    services: { data: diagnostics },
    dbMigrations: { data: dbMigrations },
    missionCanonical: { data: missionCanonicalHealth },
    missionArtifacts: { data: missionArtifactHealth },
    missionArtifactRepairPlan: { data: missionArtifactRepairPlan },
    opportunityFieldEvidence: { data: opportunityFieldEvidenceHealth },
    opportunityFieldEvidenceRepairPlan: { data: opportunityFieldEvidenceRepairPlan },
    opportunityPriceHistory: { data: opportunityPriceHistoryHealth, refresh: refreshPriceHistoryDiagnostics },
  } = useCommandCenterDiagnostics();

  const isExecuting = queue?.tasks.some(t => t.status === 'running');
  const runningTask = queue?.tasks.find(t => t.status === 'running');
  const isTaskStale = (task: TaskQueueResponse['tasks'][number]) => (
    isQueueTaskStale(task, currentTime, DEFAULT_STALE_TASK_THRESHOLD_MS)
  );
  const staleRunningTasks = (queue?.tasks || []).filter(isTaskStale);
  const recoverableTasks = recoverableQueueTasks(queue);
  const queueRecoveryIssues = buildQueueRecoveryIssues(queue, currentTime, DEFAULT_STALE_TASK_THRESHOLD_MS);
  const liveMissions = (recentMissions || []).filter((mission) => ['queued', 'main_running', 'ta_running'].includes(mission.status));
  const attentionMissions = (recentMissions || []).filter((mission) => ['failed', 'canceled', 'main_only'].includes(mission.status));
  const readyMissions = (recentMissions || []).filter((mission) => mission.status === 'fully_enriched');
  const missionPriority = (mission: MissionSummary) => {
    if (mission.latestRun?.status === 'running') return 0;
    if (mission.status === 'queued') return 1;
    if (mission.status === 'failed') return 2;
    if (mission.status === 'main_only') return 3;
    if (mission.status === 'canceled') return 4;
    if (mission.latestDiff?.changed) return 5;
    if (mission.status === 'fully_enriched') return 6;
    return 7;
  };
  const missionInbox = [...(recentMissions || [])]
    .sort((a, b) => {
      const priorityDiff = missionPriority(a) - missionPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      const aTime = a.latestRun?.createdAt || a.updatedAt || a.createdAt;
      const bTime = b.latestRun?.createdAt || b.updatedAt || b.createdAt;
      return bTime.localeCompare(aTime);
    })
    .slice(0, 6);
  const fieldEvidenceManualAction = opportunityFieldEvidenceRepairPlan?.sampledActions.find((action) => (
    action.issueCode === 'missing_field'
  )) || opportunityFieldEvidenceRepairPlan?.sampledActions.find((action) => action.safety !== 'automatic');
  const priceHistoryIssues = (opportunityPriceHistoryHealth?.metrics.missing || 0)
    + (opportunityPriceHistoryHealth?.metrics.stale || 0);
  const priceHistoryStatus = opportunityPriceHistoryHealth
    ? priceHistoryIssues > 0 ? 'warning' : 'ok'
    : 'offline';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 3000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;
    setIsLoading(true);
    setSubmitError(null);
    try {
      const mission = await createMission(mode, query, undefined, depth);
      void refreshQueue();
      void refreshRecentMissions();
      setQuery('');
      navigate(`/missions/${mission.missionId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '任务创建失败');
    }
    setIsLoading(false);
  };

  const handleCancelTask = async (taskId: string) => {
    if (cancelingTaskId) return;
    setCancelingTaskId(taskId);
    setSubmitError(null);
    setRecoveryNotice(null);
    try {
      const canceled = await cancelMission(taskId);
      if (!canceled) {
        setSubmitError('任务取消失败');
      } else {
        void refreshQueue();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '任务取消失败');
    }
    setCancelingTaskId(null);
  };

  const handleRetryMission = async (missionId: string) => {
    if (retryingMissionId) return;
    setRetryingMissionId(missionId);
    setSubmitError(null);
    setRecoveryNotice(null);
    try {
      const result = await retryMission(missionId, depth);
      void refreshQueue();
      void refreshRecentMissions();
      if (result.recoveryAudit) {
        setRecoveryNotice(result.recoveryAudit.reusedExistingRetry
          ? `Mission ${missionId} 已复用现有恢复任务。`
          : `Mission ${missionId} 已创建新的恢复任务。`);
      }
      navigate(`/missions/${missionId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '任务重试失败');
    }
    setRetryingMissionId(null);
  };

  const handleRecoverTask = async (taskId: string) => {
    if (recoveringTaskId) return;
    setRecoveringTaskId(taskId);
    setSubmitError(null);
    setRecoveryNotice(null);
    try {
      const recovered = await recoverQueueTask(taskId);
      void refreshQueue();
      void refreshRecentMissions();
      const recoveryAudit = buildMissionRecoveryAuditView(recovered.recoveryAudit);
      const recoveryAuditDetail = recoveryAudit
        ? ` ${recoveryAudit.label}${recoveryAudit.meta.length > 0 ? `（${recoveryAudit.meta.map((meta) => meta.label).join(' · ')}）` : ''}`
        : '';
      setRecoveryNotice(
        recovered.missionId
          ? `Mission ${recovered.missionId}${recovered.runId ? ` / Run ${recovered.runId}` : ''} 已恢复入队。${recoveryAuditDetail}`
          : `Task ${recovered.taskId || taskId} 已恢复入队。`,
      );
      if (recovered.missionId) {
        navigate(`/missions/${recovered.missionId}`);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '任务恢复失败');
    }
    setRecoveringTaskId(null);
  };

  const handleRecoverStaleTasks = async () => {
    if (recoveringStale) return;
    setRecoveringStale(true);
    setSubmitError(null);
    setRecoveryNotice(null);
    try {
      const result = await recoverStaleQueueTasks(DEFAULT_STALE_TASK_THRESHOLD_MS);
      void refreshQueue();
      if (result.totalRecovered > 0) {
        void refreshRecentMissions();
      }
      if (result.totalRecovered === 0) {
        setSubmitError(result.skippedActiveTaskIds.length > 0
          ? '检测到本进程仍在执行的任务，暂不自动恢复'
          : '没有需要恢复的卡住任务');
      } else {
        setRecoveryNotice(`已恢复 ${result.totalRecovered} 个卡住任务，重排 ${result.requeuedRuns} 个 Mission run。`);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '卡住任务恢复失败');
    }
    setRecoveringStale(false);
  };

  const handleBackfillMissionArtifacts = async () => {
    if (backfillingArtifacts) return;
    setBackfillingArtifacts(true);
    setSubmitError(null);
    try {
      const result = await backfillMissionArtifacts();
      if (result.totalArtifactsUpserted === 0) {
        setSubmitError('没有需要补齐的 Mission artifact 引用');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Mission artifact 补齐失败');
    }
    setBackfillingArtifacts(false);
  };

  const handleBackfillCanonicalMissions = async () => {
    if (backfillingMissions) return;
    setBackfillingMissions(true);
    setSubmitError(null);
    try {
      const result = await backfillCanonicalMissions();
      if (result.inserted + result.refreshed === 0) {
        setSubmitError('没有需要补齐的 Mission canonical rows');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Mission canonical backfill 失败');
    }
    setBackfillingMissions(false);
  };

  const handleBackfillOpportunityFieldEvidence = async () => {
    if (backfillingFieldEvidence) return;
    setBackfillingFieldEvidence(true);
    setSubmitError(null);
    try {
      const result = await backfillOpportunityFieldEvidence();
      if (result.inserted + result.refreshed === 0) {
        setSubmitError('没有需要补齐的 Opportunity field evidence rows');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Opportunity field evidence backfill 失败');
    }
    setBackfillingFieldEvidence(false);
  };

  const handleRepairOpportunityFieldEvidence = async () => {
    if (repairingFieldEvidence) return;
    setRepairingFieldEvidence(true);
    setSubmitError(null);
    try {
      const result = await repairOpportunityFieldEvidence();
      if (result.applied === 0) {
        setSubmitError(result.skippedManualReview > 0 || result.blocked > 0
          ? '没有可自动修复的 Field Evidence，剩余项需要人工复核'
          : '没有需要修复的 Field Evidence');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Field Evidence 自动修复失败');
    }
    setRepairingFieldEvidence(false);
  };

  const handleRefreshMissionArtifactIntegrity = async () => {
    if (refreshingArtifactIntegrity) return;
    setRefreshingArtifactIntegrity(true);
    setSubmitError(null);
    try {
      const result = await refreshMissionArtifactIntegrity(false);
      if (result.refreshed === 0) {
        setSubmitError(result.skippedMismatches > 0
          ? '检测到 artifact mismatch，已跳过自动覆盖'
          : '没有需要刷新的 artifact 元数据');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Mission artifact 元数据刷新失败');
    }
    setRefreshingArtifactIntegrity(false);
  };

  const handleRepairMissionArtifacts = async () => {
    if (repairingArtifacts) return;
    setRepairingArtifacts(true);
    setSubmitError(null);
    try {
      const result = await repairMissionArtifacts(undefined, false);
      if (result.applied === 0) {
        setSubmitError(result.skippedManualReview > 0 || result.blocked > 0
          ? '没有可自动修复的 artifact，剩余项需要人工复核或恢复文件'
          : '没有需要修复的 Mission artifact');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Mission artifact 自动修复失败');
    }
    setRepairingArtifacts(false);
  };

  const handleRefreshPriceHistory = async () => {
    if (refreshingPriceHistory) return;
    setRefreshingPriceHistory(true);
    setSubmitError(null);
    try {
      const result = await refreshOpportunityPriceHistory({ staleAfterHours: 24 });
      void refreshPriceHistoryDiagnostics();
      if (result.refreshed === 0 && result.skippedFresh > 0 && result.failed === 0) {
        setSubmitError('Price history cache 已经是最新的');
      } else if (result.failed > 0) {
        setSubmitError(`Price history refresh 有 ${result.failed} 个 ticker 失败，请检查 OpenBB`);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Price history refresh 失败');
    }
    setRefreshingPriceHistory(false);
  };

  const openMissionCompare = (mission: MissionSummary) => {
    if (!mission.latestDiff) {
      navigate(`/missions/${mission.id}`);
      return;
    }

    const params = new URLSearchParams({
      run: mission.latestDiff.currentRunId,
      compare: mission.latestDiff.baselineRunId,
    });
    navigate(`/missions/${mission.id}?${params.toString()}`);
  };

  return (
    <div className="page command-center">
      <div className="page-header">
        <h1><Crosshair size={24} /> 指挥中心</h1>
        <div className="header-status">
          <span className={`status-dot ${health?.isDegraded ? 'warn' : 'ok'}`} />
          {health?.isDegraded ? 'DEGRADED' : 'ONLINE'}
        </div>
      </div>

      {/* SysOps 诊断仪表盘 */}
      <div className="services-grid">
        {[
          { key: 'llm', label: 'LLM Brain' },
          { key: 'openbb', label: 'OpenBB Gateway' },
          { key: 'tradingAgents', label: 'Trading Agents' },
          { key: 'trendRadar', label: 'TrendRadar DB' },
        ].map(srv => {
          const probe = diagnostics?.probes?.[srv.key as keyof DiagnosticsResult['probes']];
          const statusClass = probe ? probe.status : 'offline';
          return (
            <div
              key={srv.key}
              className={`service-card ${statusClass}`}
              title={probe?.details || 'N/A'}
              data-command-service={srv.key}
            >
              <div className="service-dot" />
              <div className="service-name">{srv.label}</div>
              <div className="service-port">{probe?.latency ? `${probe.latency}ms` : ''}</div>
              {probe?.status === 'error' && <div className="probe-error-hint">Hover for details</div>}
            </div>
          );
        })}
        <div
          className={`service-card ${dbMigrations?.status || 'offline'}`}
          title={dbMigrations
            ? `${dbMigrations.applied}/${dbMigrations.total} applied · failed ${dbMigrations.failed} · missing ${dbMigrations.missing} · checksum ${dbMigrations.mismatched}`
            : 'N/A'}
          data-command-service="db-migrations"
        >
          <div className="service-dot" />
          <div className="service-name">DB Migrations</div>
          <div className="service-port">
            {dbMigrations ? `${dbMigrations.applied}/${dbMigrations.total}` : ''}
          </div>
          {dbMigrations?.status === 'degraded' && <div className="probe-error-hint">Hover for details</div>}
        </div>
        <div
          className={`service-card ${missionCanonicalHealth?.status || 'offline'}`}
          title={missionCanonicalHealth
            ? `${missionCanonicalHealth.covered}/${missionCanonicalHealth.indexTotal} covered · missing ${missionCanonicalHealth.missingCanonical} · stale ${missionCanonicalHealth.staleCanonical} · orphan ${missionCanonicalHealth.orphanCanonical} · metadata ${missionCanonicalHealth.integrityMissing}`
            : 'N/A'}
          data-command-service="mission-canonical"
        >
          <div className="service-dot" />
          <div className="service-name">Mission Canonical</div>
          <div className="service-port">
            {missionCanonicalHealth ? `${missionCanonicalHealth.covered}/${missionCanonicalHealth.indexTotal}` : ''}
          </div>
          {missionCanonicalHealth?.status !== 'ok' && missionCanonicalHealth && <div className="probe-error-hint">Hover for details</div>}
          {missionCanonicalHealth && missionCanonicalHealth.status !== 'ok' && (
            <div className="service-actions">
              <button
                type="button"
                className="service-card-action"
                onClick={handleBackfillCanonicalMissions}
                disabled={backfillingMissions}
                title="Backfill canonical Mission rows"
                data-command-action="backfill-canonical"
              >
                <RefreshCw size={10} className={backfillingMissions ? 'spin' : undefined} />
                {backfillingMissions ? 'Backfilling' : 'Backfill'}
              </button>
            </div>
          )}
        </div>
        <div
          className={`service-card ${missionArtifactHealth?.status || 'offline'}`}
          title={missionArtifactHealth
            ? `${missionArtifactHealth.present}/${missionArtifactHealth.total} present · missing ${missionArtifactHealth.missing} · hash ${missionArtifactHealth.checksumMismatch} · size ${missionArtifactHealth.sizeMismatch} · metadata ${missionArtifactHealth.integrityMissing} · repair ${missionArtifactRepairPlan?.automaticActions || 0} auto / ${missionArtifactRepairPlan?.manualReviewActions || 0} review / ${missionArtifactRepairPlan?.blockedActions || 0} blocked`
            : 'N/A'}
          data-command-service="mission-artifacts"
        >
          <div className="service-dot" />
          <div className="service-name">Mission Artifacts</div>
          <div className="service-port">
            {missionArtifactHealth
              ? missionArtifactRepairPlan?.totalActions
                ? `${missionArtifactRepairPlan.automaticActions}/${missionArtifactRepairPlan.totalActions} fix`
                : `${missionArtifactHealth.present}/${missionArtifactHealth.total}`
              : ''}
          </div>
          {(Boolean(missionArtifactRepairPlan?.automaticActions)
            || missionArtifactHealth?.status === 'warning'
            || missionArtifactHealth?.status === 'degraded') && (
            <div className="service-actions">
              {Boolean(missionArtifactRepairPlan?.automaticActions) && (
                <button
                  type="button"
                  className="service-card-action"
                  onClick={handleRepairMissionArtifacts}
                  disabled={repairingArtifacts}
                  title="Apply automatic Mission artifact repairs"
                  data-command-action="repair-artifacts"
                >
                  <RefreshCw size={10} className={repairingArtifacts ? 'spin' : undefined} />
                  {repairingArtifacts ? 'Repairing' : 'Repair'}
                </button>
              )}
              {missionArtifactHealth?.status === 'warning' && (
                <button
                  type="button"
                  className="service-card-action"
                  onClick={handleRefreshMissionArtifactIntegrity}
                  disabled={refreshingArtifactIntegrity}
                  title="Refresh missing artifact integrity metadata"
                  data-command-action="refresh-artifact-integrity"
                >
                  <RefreshCw size={10} className={refreshingArtifactIntegrity ? 'spin' : undefined} />
                  {refreshingArtifactIntegrity ? 'Refreshing' : 'Refresh'}
                </button>
              )}
              {missionArtifactHealth?.status === 'degraded' && (
                <button
                  type="button"
                  className="service-card-action"
                  onClick={handleBackfillMissionArtifacts}
                  disabled={backfillingArtifacts}
                  title="Backfill Mission artifact refs"
                  data-command-action="backfill-artifacts"
                >
                  <RefreshCw size={10} className={backfillingArtifacts ? 'spin' : undefined} />
                  {backfillingArtifacts ? 'Backfilling' : 'Backfill'}
                </button>
              )}
            </div>
          )}
        </div>
        <div
          className={`service-card ${opportunityFieldEvidenceHealth?.status || 'offline'}`}
          title={opportunityFieldEvidenceHealth
            ? `${opportunityFieldEvidenceHealth.covered}/${opportunityFieldEvidenceHealth.recordedEvents} covered · canonical ${opportunityFieldEvidenceHealth.canonicalRows} · missing ${opportunityFieldEvidenceHealth.missingCanonical} · orphan ${opportunityFieldEvidenceHealth.orphanCanonical} · mismatch ${opportunityFieldEvidenceHealth.statusMismatch} · repair ${opportunityFieldEvidenceRepairPlan?.automaticActions || 0} auto / ${opportunityFieldEvidenceRepairPlan?.manualReviewActions || 0} review / ${opportunityFieldEvidenceRepairPlan?.blockedActions || 0} blocked`
            : 'N/A'}
          data-command-service="opportunity-field-evidence"
        >
          <div className="service-dot" />
          <div className="service-name">Field Evidence</div>
          <div className="service-port">
            {opportunityFieldEvidenceHealth
              ? `${opportunityFieldEvidenceHealth.covered}/${opportunityFieldEvidenceHealth.recordedEvents}`
              : ''}
          </div>
          {opportunityFieldEvidenceHealth?.status !== 'ok' && opportunityFieldEvidenceHealth && (
            <>
              <div className="probe-error-hint">Hover for details</div>
              <div className="service-actions">
                {(opportunityFieldEvidenceRepairPlan?.automaticActions || 0) > 0 && (
                  <button
                    type="button"
                    className="service-card-action"
                    onClick={handleRepairOpportunityFieldEvidence}
                    disabled={repairingFieldEvidence}
                    title="Apply automatic Field Evidence repairs"
                    data-command-action="repair-field-evidence"
                  >
                    <RefreshCw size={10} className={repairingFieldEvidence ? 'spin' : undefined} />
                    {repairingFieldEvidence ? 'Repairing' : 'Repair'}
                  </button>
                )}
                <button
                  type="button"
                  className="service-card-action"
                  onClick={handleBackfillOpportunityFieldEvidence}
                  disabled={backfillingFieldEvidence}
                  title="Backfill Opportunity field evidence canonical rows"
                  data-command-action="backfill-field-evidence"
                >
                  <RefreshCw size={10} className={backfillingFieldEvidence ? 'spin' : undefined} />
                  {backfillingFieldEvidence ? 'Backfilling' : 'Backfill'}
                </button>
                {fieldEvidenceManualAction && (
                  <>
                    <button
                      type="button"
                      className="service-card-action"
                      onClick={() => navigate(evidenceRepairSearchUrl(fieldEvidenceManualAction))}
                      title="Open Evidence Center with this repair issue pre-filtered"
                      data-command-action="inspect-field-evidence"
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      className="service-card-action"
                      onClick={() => navigate(registryDraftUrl(fieldEvidenceManualAction))}
                      title="Create a Field Registry import draft for manual field metadata repair"
                      data-command-action="draft-field-registry"
                    >
                      Registry Draft
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <div
          className={`service-card ${priceHistoryStatus}`}
          title={opportunityPriceHistoryHealth
            ? `${opportunityPriceHistoryHealth.metrics.fresh}/${opportunityPriceHistoryHealth.metrics.tracked} fresh · stale ${opportunityPriceHistoryHealth.metrics.stale} · missing ${opportunityPriceHistoryHealth.metrics.missing} · orphan ${opportunityPriceHistoryHealth.metrics.orphan} · points ${opportunityPriceHistoryHealth.metrics.totalPoints}`
            : 'N/A'}
          data-command-service="opportunity-price-history"
        >
          <div className="service-dot" />
          <div className="service-name">Price History</div>
          <div className="service-port">
            {opportunityPriceHistoryHealth
              ? `${opportunityPriceHistoryHealth.metrics.coveragePct}%`
              : ''}
          </div>
          {opportunityPriceHistoryHealth && (
            <div className="service-actions">
              {priceHistoryIssues > 0 && <div className="probe-error-hint">Hover for details</div>}
              <button
                type="button"
                className="service-card-action"
                onClick={handleRefreshPriceHistory}
                disabled={refreshingPriceHistory}
                title="Refresh missing or stale price history from OpenBB"
                data-command-action="refresh-price-history"
              >
                <RefreshCw size={10} className={refreshingPriceHistory ? 'spin' : undefined} />
                {refreshingPriceHistory ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 双模式触发器 */}
      <div className="trigger-section glass-panel">
        <div className="mode-tabs">
          <button className={mode === 'explore' ? 'active' : ''} onClick={() => setMode('explore')}>
            <Search size={14} /> 探索模式
          </button>
          <button className={mode === 'analyze' ? 'active' : ''} onClick={() => setMode('analyze')}>
            <BarChart3 size={14} /> 分析模式
          </button>
        </div>

        <form onSubmit={handleSubmit} className="trigger-form">
          <input
            type="text"
            placeholder={mode === 'explore' ? '输入趋势或问题，如 "脑机接口投资机会"' : '输入 Ticker，如 "AXNX"'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          <div className="trigger-controls">
            <select value={depth} onChange={(e) => setDepth(e.target.value as 'quick' | 'standard' | 'deep')}>
              <option value="quick">⚡ Quick</option>
              <option value="standard">📊 Standard</option>
              <option value="deep">🔬 Deep</option>
            </select>
            <button type="submit" disabled={isLoading || !query.trim()}>
              <Rocket size={14} /> {isLoading ? '启动中...' : '发射'}
            </button>
          </div>
        </form>

        <div className="mode-hint">
          {mode === 'explore'
            ? '探索模式：OpenClaw 先推导标的 → 然后 TradingAgents 接力分析'
            : '分析模式：两个大脑同时启动，独立分析同一只票'}
        </div>
        {submitError && (
          <div
            className="mode-hint"
            style={{ color: 'var(--accent-crimson)', marginTop: '8px' }}
            data-command-submit-error
          >
            {submitError}
          </div>
        )}
      </div>

      {/* 活跃任务 */}
      {isExecuting && runningTask && (
        <div className="active-mission glass-panel">
          <div className="mission-running-header">
            <Activity size={16} className="pulse" />
            <span>PROCESSING MISSION</span>
          </div>
          <div
            className="mission-running-title"
            style={{ cursor: runningTask.missionId ? 'pointer' : 'default' }}
            onClick={() => {
              if (runningTask.missionId) {
                navigate(`/missions/${runningTask.missionId}`);
              }
            }}
          >
            {runningTask.query}
          </div>
          <div className="mission-running-meta">
            Depth: <span className="tag">{runningTask.depth.toUpperCase()}</span> |
            Source: {runningTask.source} |
            Phase: <span className="tag accent">{runningTask.progress?.toUpperCase() || 'INIT'}</span>
            {runningTask.heartbeatAt && (
              <> | Heartbeat: {Math.round((currentTime - runningTask.heartbeatAt) / 1000)}s ago</>
            )}
            {isTaskStale(runningTask) && <> | <span className="tag danger">STALE</span></>}
          </div>
          <div className="trigger-controls" style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => handleCancelTask(runningTask.id)}
              disabled={cancelingTaskId === runningTask.id}
            >
              {cancelingTaskId === runningTask.id ? '取消中...' : '取消任务'}
            </button>
            {isTaskStale(runningTask) && (
              <button
                type="button"
                onClick={handleRecoverStaleTasks}
                disabled={recoveringStale}
              >
                {recoveringStale ? '恢复中...' : '恢复卡住任务'}
              </button>
            )}
          </div>

          <div className="pipeline-steps">
            {['scout', 'analyst', 'strategist', 'council', 'synthesis'].map((step, idx, arr) => {
              const isActive = runningTask.progress === step;
              const isPast = arr.indexOf(runningTask.progress || 'scout') > idx;
              return (
                <div key={step} className="step-group">
                  <div className={`step-circle ${isPast ? 'done' : isActive ? 'active' : ''}`}>
                    {isPast ? '✓' : isActive ? <RefreshCw size={14} className="spin" /> : idx + 1}
                  </div>
                  <span className={`step-label ${isActive ? 'active' : ''}`}>{step}</span>
                  {idx < arr.length - 1 && <div className={`step-line ${isPast ? 'done' : ''}`} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="today-summary glass-panel">
        <div className="today-header">
          <div>
            <h3>Today Feed</h3>
            <div className="queue-stats">把最近的任务结果、异常和运行态压到一个入口里</div>
          </div>
          <div className="today-kpis">
            <div className="today-kpi">
              <span>Live</span>
              <strong>{liveMissions.length}</strong>
            </div>
            <div className="today-kpi">
              <span>Attention</span>
              <strong>{attentionMissions.length}</strong>
            </div>
            <div className="today-kpi">
              <span>Ready</span>
              <strong>{readyMissions.length}</strong>
            </div>
          </div>
        </div>

        <div className="today-feed-list">
          {missionInbox.length === 0 ? (
            <div className="today-empty">最近还没有 Mission 记录</div>
          ) : (
            missionInbox.map((mission) => {
              const badge = missionStatusBadge(mission.status);
              const diffBadge = missionDiffBadge(mission.latestDiff);
              const recoveryAudit = buildMissionRecoveryAuditView(mission.latestRecoveryEvent);
              return (
                <div
                  key={mission.id}
                  className="today-card"
                  onClick={() => navigate(`/missions/${mission.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="today-card-top">
                    <span className={`consensus-badge ${badge.tone}`}>{badge.label}</span>
                    <div className="today-actions">
                      {mission.latestRun && (
                        <span className="today-run">
                          run#{mission.latestRun.attempt} {mission.latestRun.status}:{mission.latestRun.stage}
                        </span>
                      )}
                      {(!mission.latestRun || !['queued', 'running'].includes(mission.latestRun.status)) && (
                        <button
                          type="button"
                          className="today-retry-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRetryMission(mission.id);
                          }}
                          disabled={retryingMissionId === mission.id}
                        >
                          {retryingMissionId === mission.id ? '重试中...' : '重试'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="today-query">{mission.query}</div>
                  <div className="today-meta">
                    <span>{new Date(mission.createdAt).toLocaleString()}</span>
                    <span>{mission.mode}</span>
                    <span>{mission.source}</span>
                    {mission.totalDurationMs > 0 && <span>{Math.round(mission.totalDurationMs / 1000)}s</span>}
                  </div>
                  {mission.latestDiff && diffBadge && (
                    <div className="today-diff">
                      <span className={`diff-chip ${diffBadge.tone}`}>{diffBadge.label}</span>
                      <span className="today-diff-summary">{mission.latestDiff.summary}</span>
                      <button
                        type="button"
                        className="today-compare-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          openMissionCompare(mission);
                        }}
                      >
                        查看对比
                      </button>
                    </div>
                  )}
                  {recoveryAudit && (
                    <div
                      className="tc-recovery-audit"
                      data-command-mission-recovery-audit={recoveryAudit.action}
                    >
                      <span className={`diff-chip ${recoveryAudit.tone}`}>
                        {recoveryAudit.label}
                      </span>
                      {recoveryAudit.meta.map((meta) => (
                        <span
                          key={`${mission.id}_${recoveryAudit.action}_${meta.key}`}
                          className={meta.key === 'cost' && meta.tone
                            ? `tc-recovery-cost ${meta.tone}`
                            : 'tc-recovery-copy'}
                        >
                          {meta.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {mission.openclawTickers.length > 0 && (
                    <div className="tc-tickers">
                      {mission.openclawTickers.slice(0, 4).map((ticker) => (
                        <span key={ticker} className="ticker-pill">${ticker}</span>
                      ))}
                    </div>
                  )}
                  {mission.consensus.length > 0 && (
                    <div className="tc-consensus">
                      {mission.consensus.slice(0, 2).map((consensus) => (
                        <div key={consensus.ticker} className="consensus-inline">
                          <span className="ci-ticker">{consensus.ticker}</span>
                          <span className={`consensus-badge ${consensus.agreement === 'agree' ? 'agree' : consensus.agreement === 'disagree' ? 'disagree' : consensus.agreement === 'partial' ? 'partial' : 'pending'}`}>
                            {consensus.agreement}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Agent 实时输出流 */}
      <div className="stream-section glass-panel">
        <div className="stream-header">
          <span>AGENT OUTPUT STREAM</span>
          <span className={`live-dot ${isConnected ? 'connected' : ''}`}>
            {isConnected ? '● CONNECTED' : '○ DISCONNECTED'}
          </span>
        </div>
        <div className="stream-terminal">
          {logs.length === 0 ? (
            <div className="stream-empty">等待数据流...</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="stream-line">
                <span className="stream-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="stream-agent">[{log.agentName}]</span>
                <span className={`stream-phase ${log.phase === 'error' ? 'error' : ''}`}>{log.phase}</span>
                <span className="stream-content">{log.content.substring(0, 300)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 队列概览 */}
      <div className="queue-section">
        <h3>任务队列</h3>
        <div className="queue-stats">{queue?.summary || '加载中...'}</div>
        {recoveryNotice && (
          <div className="queue-recovery-feedback success" role="status">
            <span>{recoveryNotice}</span>
          </div>
        )}
        {queueRecoveryIssues.length > 0 && (
          <div className="queue-recovery-diagnostic" data-command-queue-recovery>
            <div className="queue-recovery-diagnostic-header">
              <div>
                <span>恢复诊断</span>
                <strong>{queueRecoveryIssues.length} 个任务需要处理</strong>
              </div>
              {staleRunningTasks.length > 0 && (
                <button type="button" onClick={handleRecoverStaleTasks} disabled={recoveringStale}>
                  <RefreshCw size={12} className={recoveringStale ? 'spin' : undefined} />
                  {recoveringStale ? '恢复中...' : '批量恢复卡住任务'}
                </button>
              )}
            </div>
            <div className="queue-recovery-issue-list">
              {queueRecoveryIssues.slice(0, 4).map((issue) => (
                <div
                  key={issue.id}
                  className={`queue-recovery-issue ${issue.tone}`}
                  data-command-queue-recovery-issue={issue.kind}
                >
                  <div className="queue-recovery-issue-main">
                    <div className="queue-recovery-issue-title">
                      <span>{issue.label}</span>
                      {issue.failureLabel && <em>{issue.failureLabel}</em>}
                      {issue.ageLabel && <em>{issue.ageLabel}</em>}
                    </div>
                    <strong>{issue.task.query}</strong>
                    <p>{issue.detail}</p>
                  </div>
                  <div className="queue-recovery-issue-actions">
                    {issue.task.missionId && (
                      <button type="button" className="secondary-btn tiny" onClick={() => navigate(`/missions/${issue.task.missionId}`)}>
                        查看任务
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-btn tiny recommended"
                      onClick={() => {
                        if (issue.action === 'recover_stale') {
                          void handleRecoverStaleTasks();
                        } else {
                          void handleRecoverTask(issue.task.id);
                        }
                      }}
                      disabled={issue.action === 'recover_stale' ? recoveringStale : recoveringTaskId === issue.task.id}
                      data-command-queue-recovery-action={issue.action}
                    >
                      <RefreshCw
                        size={12}
                        className={(issue.action === 'recover_stale' ? recoveringStale : recoveringTaskId === issue.task.id) ? 'spin' : undefined}
                      />
                      {issue.action === 'recover_stale' && recoveringStale
                        ? '恢复中...'
                        : issue.action === 'recover_task' && recoveringTaskId === issue.task.id
                          ? '恢复中...'
                          : issue.actionLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {queue?.tasks.filter(t => t.status === 'pending').slice(0, 5).map(task => (
          <div
            key={task.id}
            className="queue-card"
            style={{ cursor: task.missionId ? 'pointer' : 'default' }}
            onClick={() => {
              if (task.missionId) {
                navigate(`/missions/${task.missionId}`);
              }
            }}
          >
            <span className="queue-query">{task.query}</span>
            <span className="queue-depth">{task.depth}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelTask(task.id);
              }}
              disabled={cancelingTaskId === task.id}
            >
              {cancelingTaskId === task.id ? '取消中...' : '取消'}
            </button>
          </div>
        ))}
        {recoverableTasks.slice(0, 5).map(task => {
          const failureInfo = getFailureCodeInfo(task.failureCode);
          return (
            <div
              key={task.id}
              className="queue-card recoverable"
              style={{ cursor: task.missionId ? 'pointer' : 'default' }}
              onClick={() => {
                if (task.missionId) {
                  navigate(`/missions/${task.missionId}`);
                }
              }}
            >
              <span className="queue-query">{task.query}</span>
              <span className="queue-depth">{task.status}</span>
              <div className="queue-card-actions">
                {failureInfo && (
                  <span className={`queue-failure-code ${failureInfo.tone}`} title={failureInfo.detail}>
                    {failureInfo.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRecoverTask(task.id);
                  }}
                  disabled={recoveringTaskId === task.id}
                >
                  {recoveringTaskId === task.id ? '恢复中...' : '恢复'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
