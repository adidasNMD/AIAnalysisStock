import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Rocket, Activity, Search, BarChart3, RefreshCw } from 'lucide-react';
import {
  cancelMission,
  createMission,
  fetchDiagnostics,
  fetchHealth,
  fetchMissions,
  fetchQueue,
  recoverQueueTask,
  recoverStaleQueueTasks,
  retryMission,
} from '../api';
import type { HealthStatus, MissionSummary, TaskQueueResponse, DiagnosticsResult } from '../api';
import { useAgentStream, usePolling } from '../hooks/useAgentStream';
import { getFailureCodeInfo } from '../utils/recovery';

const STALE_TASK_THRESHOLD_MS = 2 * 60 * 1000;

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
  const [retryingMissionId, setRetryingMissionId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const { logs, isConnected } = useAgentStream(80);

  const { data: health } = usePolling<HealthStatus>(() => fetchHealth(), 5000, []);
  const { data: queue } = usePolling<TaskQueueResponse>(() => fetchQueue(), 3000, []);
  const { data: diagnostics } = usePolling<DiagnosticsResult | null>(() => fetchDiagnostics(), 10000, []);
  const { data: recentMissions } = usePolling<MissionSummary[]>(() => fetchMissions(8), 5000, []);

  const isExecuting = queue?.tasks.some(t => t.status === 'running');
  const runningTask = queue?.tasks.find(t => t.status === 'running');
  const isTaskStale = (task: TaskQueueResponse['tasks'][number]) => (
    task.status === 'running'
    && (!task.heartbeatAt || currentTime - task.heartbeatAt > STALE_TASK_THRESHOLD_MS)
  );
  const staleRunningTasks = (queue?.tasks || []).filter(isTaskStale);
  const recoverableQueueTasks = (queue?.tasks || []).filter((task) => ['failed', 'canceled'].includes(task.status));
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
    try {
      const canceled = await cancelMission(taskId);
      if (!canceled) {
        setSubmitError('任务取消失败');
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
    try {
      await retryMission(missionId, depth);
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
    try {
      const recovered = await recoverQueueTask(taskId);
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
    try {
      const result = await recoverStaleQueueTasks(STALE_TASK_THRESHOLD_MS);
      if (result.totalRecovered === 0) {
        setSubmitError(result.skippedActiveTaskIds.length > 0
          ? '检测到本进程仍在执行的任务，暂不自动恢复'
          : '没有需要恢复的卡住任务');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '卡住任务恢复失败');
    }
    setRecoveringStale(false);
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
            <div key={srv.key} className={`service-card ${statusClass}`} title={probe?.details || 'N/A'}>
              <div className="service-dot" />
              <div className="service-name">{srv.label}</div>
              <div className="service-port">{probe?.latency ? `${probe.latency}ms` : ''}</div>
              {probe?.status === 'error' && <div className="probe-error-hint">Hover for details</div>}
            </div>
          );
        })}
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
        {submitError && <div className="mode-hint" style={{ color: 'var(--accent-crimson)', marginTop: '8px' }}>{submitError}</div>}
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
        {staleRunningTasks.length > 0 && (
          <div className="queue-recovery-banner">
            <span>{staleRunningTasks.length} 个运行任务心跳超时</span>
            <button type="button" onClick={handleRecoverStaleTasks} disabled={recoveringStale}>
              {recoveringStale ? '恢复中...' : '恢复卡住任务'}
            </button>
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
        {recoverableQueueTasks.slice(0, 5).map(task => {
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
