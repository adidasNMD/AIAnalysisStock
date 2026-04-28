import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Brain, BarChart3, Shield, TrendingUp, TrendingDown, Clock, Zap, Target, Activity, CheckCircle, Search, Filter } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fetchMissionDetail, fetchMissionEvents, fetchMissionRunEvidence, fetchMissionRuns, fetchTraceByMissionId, fetchTraceByMissionRun, retryMission, type MissionEvidence, type MissionEvent, type MissionFull, type MissionRun, type TraceContent } from '../api';

// 终态集合 — 这些状态不会再变化，到达后停止轮询
const TERMINAL_STATES = new Set(['fully_enriched', 'main_only', 'failed', 'canceled']);

type SnapshotPayload = MissionFull | MissionEvidence;

interface RunDiffItem {
  title: string;
  detail: string;
  tone: 'agree' | 'partial' | 'disagree' | 'pending';
}

function deriveCompleteness(payload: SnapshotPayload): 'full' | 'partial' | 'failed' | 'canceled' {
  if ('completeness' in payload) return payload.completeness;
  if (payload.status === 'fully_enriched') return 'full';
  if (payload.status === 'main_only') return 'partial';
  if (payload.status === 'failed') return 'failed';
  if (payload.status === 'canceled') return 'canceled';
  return 'partial';
}

function defaultCompareRunId(runs: MissionRun[], activeRunId: string | null): string | null {
  if (!activeRunId) return null;
  const activeIndex = runs.findIndex((run) => run.id === activeRunId);
  if (activeIndex === -1) return null;
  return runs[activeIndex + 1]?.id || runs[activeIndex - 1]?.id || null;
}

function summarizeRunDiff(
  currentRun: MissionRun,
  currentPayload: SnapshotPayload,
  currentTrace: TraceContent | null,
  baselineRun: MissionRun,
  baselinePayload: SnapshotPayload,
  baselineTrace: TraceContent | null,
): RunDiffItem[] {
  const items: RunDiffItem[] = [];

  const currentDurationSeconds = Math.round(currentPayload.totalDurationMs / 1000);
  const baselineDurationSeconds = Math.round(baselinePayload.totalDurationMs / 1000);
  const durationDelta = currentDurationSeconds - baselineDurationSeconds;
  const currentCompleteness = deriveCompleteness(currentPayload);
  const baselineCompleteness = deriveCompleteness(baselinePayload);
  let executionDetail = `Run #${currentRun.attempt} ${currentPayload.status}/${currentCompleteness} vs Run #${baselineRun.attempt} ${baselinePayload.status}/${baselineCompleteness}`;
  if (currentDurationSeconds > 0 || baselineDurationSeconds > 0) {
    const speedText = durationDelta === 0
      ? 'same duration'
      : durationDelta < 0
        ? `${Math.abs(durationDelta)}s faster`
        : `${durationDelta}s slower`;
    executionDetail += ` · ${currentDurationSeconds}s vs ${baselineDurationSeconds}s (${speedText})`;
  }
  items.push({
    title: 'Execution',
    detail: executionDetail,
    tone: currentCompleteness === 'failed' || currentCompleteness === 'canceled'
      ? 'disagree'
      : (baselineCompleteness === 'failed' || baselineCompleteness === 'canceled' || durationDelta < 0)
        ? 'agree'
        : 'partial',
  });

  const addedTickers = currentPayload.openclawTickers.filter((ticker) => !baselinePayload.openclawTickers.includes(ticker));
  const removedTickers = baselinePayload.openclawTickers.filter((ticker) => !currentPayload.openclawTickers.includes(ticker));
  items.push({
    title: 'Coverage',
    detail: addedTickers.length === 0 && removedTickers.length === 0
      ? `Ticker coverage unchanged (${currentPayload.openclawTickers.join(', ') || 'none'}).`
      : `Added: ${addedTickers.join(', ') || 'none'} · Removed: ${removedTickers.join(', ') || 'none'}`,
    tone: addedTickers.length > 0 || removedTickers.length > 0 ? 'partial' : 'pending',
  });

  const baselineConsensus = new Map(baselinePayload.consensus.map((item) => [item.ticker, item]));
  const currentConsensus = new Map(currentPayload.consensus.map((item) => [item.ticker, item]));
  const consensusChanges: string[] = [];
  for (const ticker of new Set([...baselineConsensus.keys(), ...currentConsensus.keys()])) {
    const previous = baselineConsensus.get(ticker);
    const next = currentConsensus.get(ticker);
    if (!previous && next) {
      consensusChanges.push(`${ticker} new:${next.agreement}`);
      continue;
    }
    if (previous && !next) {
      consensusChanges.push(`${ticker} removed`);
      continue;
    }
    if (!previous || !next) continue;
    if (
      previous.agreement !== next.agreement ||
      previous.openclawVerdict !== next.openclawVerdict ||
      previous.taVerdict !== next.taVerdict ||
      previous.openbbVerdict !== next.openbbVerdict
    ) {
      consensusChanges.push(`${ticker} ${previous.agreement}->${next.agreement}`);
    }
  }
  items.push({
    title: 'Consensus',
    detail: consensusChanges.length > 0
      ? `Changed ${consensusChanges.length} ticker calls: ${consensusChanges.slice(0, 3).join(' · ')}`
      : `Consensus unchanged across ${currentPayload.consensus.length} tickers.`,
    tone: consensusChanges.length > 0 ? 'partial' : 'pending',
  });

  const baselineActions = new Map(baselinePayload.taResults.map((result) => [result.ticker, result.portfolioManagerDecision?.action || result.status]));
  const currentActions = new Map(currentPayload.taResults.map((result) => [result.ticker, result.portfolioManagerDecision?.action || result.status]));
  const taChanges: string[] = [];
  for (const ticker of new Set([...baselineActions.keys(), ...currentActions.keys()])) {
    const previous = baselineActions.get(ticker);
    const next = currentActions.get(ticker);
    if (previous !== next) {
      taChanges.push(`${ticker} ${previous || '-'}->${next || '-'}`);
    }
  }
  items.push({
    title: 'TradingAgents',
    detail: taChanges.length > 0
      ? `PM actions shifted: ${taChanges.slice(0, 3).join(' · ')}`
      : `TradingAgents stance unchanged across ${currentPayload.taResults.length} tickers.`,
    tone: taChanges.length > 0 ? 'partial' : 'pending',
  });

  const baselineVerdicts = new Map(baselinePayload.openbbData.map((result) => [result.ticker, result.verdict]));
  const currentVerdicts = new Map(currentPayload.openbbData.map((result) => [result.ticker, result.verdict]));
  const openbbChanges: string[] = [];
  for (const ticker of new Set([...baselineVerdicts.keys(), ...currentVerdicts.keys()])) {
    const previous = baselineVerdicts.get(ticker);
    const next = currentVerdicts.get(ticker);
    if (previous !== next) {
      openbbChanges.push(`${ticker} ${previous || '-'}->${next || '-'}`);
    }
  }
  items.push({
    title: 'OpenBB',
    detail: openbbChanges.length > 0
      ? `Risk verdict changes: ${openbbChanges.slice(0, 3).join(' · ')}`
      : `OpenBB verdicts unchanged across ${currentPayload.openbbData.length} tickers.`,
    tone: openbbChanges.length > 0 ? 'partial' : 'pending',
  });

  const currentPhases = currentTrace ? [...new Set(currentTrace.steps.map((step) => step.phase))] : [];
  const baselinePhases = baselineTrace ? [...new Set(baselineTrace.steps.map((step) => step.phase))] : [];
  const addedPhases = currentPhases.filter((phase) => !baselinePhases.includes(phase));
  const removedPhases = baselinePhases.filter((phase) => !currentPhases.includes(phase));
  const traceDetail = currentTrace || baselineTrace
    ? `${currentTrace?.steps.length || 0} steps vs ${baselineTrace?.steps.length || 0} · Added phases: ${addedPhases.join(', ') || 'none'} · Removed: ${removedPhases.join(', ') || 'none'}`
    : 'Neither run has a saved trace snapshot.';
  items.push({
    title: 'Trace',
    detail: traceDetail,
    tone: addedPhases.length > 0 || removedPhases.length > 0 ? 'partial' : 'pending',
  });

  return items;
}

export function MissionViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mission, setMission] = useState<MissionFull | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [runs, setRuns] = useState<MissionRun[]>([]);
  const [trace, setTrace] = useState<TraceContent | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceContent | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<MissionEvidence | null>(null);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);
  const [compareEvidence, setCompareEvidence] = useState<MissionEvidence | null>(null);
  const [compareTrace, setCompareTrace] = useState<TraceContent | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const evidenceCacheRef = useRef<Record<string, MissionEvidence | null>>({});
  const traceCacheRef = useRef<Record<string, TraceContent | null>>({});
  const latestRun = runs[0] || null;
  const canRetry = !retrying && (!latestRun || !['queued', 'running'].includes(latestRun.status));
  const requestedRunId = searchParams.get('run');
  const requestedCompareRunId = searchParams.get('compare');

  const syncRunParams = (runId: string | null, baselineRunId: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (runId) {
      nextParams.set('run', runId);
    } else {
      nextParams.delete('run');
    }

    if (baselineRunId && baselineRunId !== runId) {
      nextParams.set('compare', baselineRunId);
    } else {
      nextParams.delete('compare');
    }

    setSearchParams(nextParams, { replace: true });
  };

  const loadArtifactsForRun = async (missionId: string, run: MissionRun): Promise<{ evidence: MissionEvidence | null; trace: TraceContent | null }> => {
    if (run.id === latestRun?.id) {
      return { evidence: null, trace };
    }

    if (!(run.id in evidenceCacheRef.current)) {
      evidenceCacheRef.current[run.id] = await fetchMissionRunEvidence(missionId, run.id);
    }
    if (!(run.id in traceCacheRef.current)) {
      traceCacheRef.current[run.id] = await fetchTraceByMissionRun(missionId, run.id);
    }

    return {
      evidence: evidenceCacheRef.current[run.id] ?? null,
      trace: traceCacheRef.current[run.id] ?? null,
    };
  };

  const loadMission = async (missionId: string) => {
    const data = await fetchMissionDetail(missionId);
    setMission(data);
    setSelectedTicker((current) => current || data?.openclawTickers?.[0] || null);

    if (data?.id) {
      const [eventData, runData, trData] = await Promise.all([
        fetchMissionEvents(data.id),
        fetchMissionRuns(data.id),
        fetchTraceByMissionId(data.id),
        ]);
        setEvents(eventData);
        setRuns(runData);
        setTrace(trData);
        if (runData[0]) {
          traceCacheRef.current[runData[0].id] = trData;
        }

        const nextSelectedRunId = requestedRunId && runData.some((run) => run.id === requestedRunId)
          ? requestedRunId
          : selectedRunIdRef.current && runData.some((run) => run.id === selectedRunIdRef.current)
            ? selectedRunIdRef.current
            : (runData[0]?.id || null);
        const nextCompareRunId = nextSelectedRunId
          ? requestedCompareRunId && requestedCompareRunId !== nextSelectedRunId && runData.some((run) => run.id === requestedCompareRunId)
            ? requestedCompareRunId
            : defaultCompareRunId(runData, nextSelectedRunId)
          : null;

        if (nextSelectedRunId !== selectedRunIdRef.current) {
          selectedRunIdRef.current = nextSelectedRunId;
          setSelectedRunId(nextSelectedRunId);
          const selectedRun = nextSelectedRunId ? runData.find((run) => run.id === nextSelectedRunId) : null;
          if (selectedRun && selectedRun.id !== runData[0]?.id) {
            const artifacts = await loadArtifactsForRun(data.id, selectedRun);
            setSelectedEvidence(artifacts.evidence);
            setSelectedTrace(artifacts.trace);
            setActionError(!artifacts.evidence ? '未找到该次运行的证据快照' : null);
            setSelectedTicker((current) => {
              const payload = artifacts.evidence ?? data;
              if (current && payload.openclawTickers.includes(current)) return current;
              return payload.openclawTickers[0] || null;
            });
          } else {
            setSelectedEvidence(null);
            setSelectedTrace(null);
            setActionError(null);
          }
        } else if (!nextSelectedRunId) {
          setSelectedRunId(null);
          setSelectedEvidence(null);
          setSelectedTrace(null);
        }
        setCompareRunId(nextCompareRunId);
        setCompareEvidence(null);
        setCompareTrace(null);
        if (
          nextSelectedRunId !== requestedRunId ||
          (nextCompareRunId || null) !== (requestedCompareRunId || null)
        ) {
          syncRunParams(nextSelectedRunId, nextCompareRunId);
        }
      }
      setLoading(false);

    if (data && TERMINAL_STATES.has(data.status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  // A3: 数据加载与 ticker 选择解耦 + 终态自动停止轮询
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void loadMission(id);
    intervalRef.current = setInterval(() => {
      void loadMission(id);
    }, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // loadMission intentionally snapshots URL run params while polling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, requestedRunId, requestedCompareRunId]); // P10 fix: 不再依赖 selectedTicker

  useEffect(() => {
    const activeRunId = selectedRunId || latestRun?.id || null;
    if (!activeRunId) {
      setCompareRunId(null);
      setCompareEvidence(null);
      setCompareTrace(null);
      setCompareError(null);
      return;
    }

    const availableRuns = runs.filter((run) => run.id !== activeRunId);
    if (availableRuns.length === 0) {
      setCompareRunId(null);
      setCompareEvidence(null);
      setCompareTrace(null);
      setCompareError(null);
      return;
    }

    setCompareRunId((current) => {
      if (current && current !== activeRunId && availableRuns.some((run) => run.id === current)) {
        return current;
      }
      return defaultCompareRunId(runs, activeRunId);
    });
  }, [runs, selectedRunId, latestRun?.id]);

  useEffect(() => {
    if (!id || !compareRunId) {
      setCompareLoading(false);
      setCompareEvidence(null);
      setCompareTrace(null);
      setCompareError(null);
      return;
    }

    const compareRun = runs.find((run) => run.id === compareRunId);
    if (!compareRun) {
      setCompareLoading(false);
      setCompareEvidence(null);
      setCompareTrace(null);
      setCompareError(null);
      return;
    }

    let canceled = false;
    const loadCompareArtifacts = async () => {
      setCompareLoading(true);
      const artifacts = await loadArtifactsForRun(id, compareRun);
      if (canceled) return;
      setCompareEvidence(artifacts.evidence);
      setCompareTrace(artifacts.trace);
      setCompareError(!artifacts.evidence && compareRun.id !== latestRun?.id ? '对比基线没有保存证据快照' : null);
      setCompareLoading(false);
    };

    void loadCompareArtifacts();
    return () => {
      canceled = true;
    };
  // loadArtifactsForRun reads the current artifact caches and latest trace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, compareRunId, runs, latestRun?.id, trace]);

  const handleSelectRun = async (run: MissionRun) => {
    if (!id) return;
    selectedRunIdRef.current = run.id;
    setSelectedRunId(run.id);
    setActionError(null);
    const nextCompareRunId = compareRunId && compareRunId !== run.id && runs.some((candidate) => candidate.id === compareRunId)
      ? compareRunId
      : defaultCompareRunId(runs, run.id);
    setCompareRunId(nextCompareRunId);
    syncRunParams(run.id, nextCompareRunId);

    if (run.id === latestRun?.id) {
      setSelectedEvidence(null);
      setSelectedTrace(null);
      setSelectedTicker((current) => current || mission?.openclawTickers?.[0] || null);
      return;
    }

    const { evidence, trace: runTrace } = await loadArtifactsForRun(id, run);
    if (!evidence) {
      setSelectedEvidence(null);
      setSelectedTrace(runTrace);
      setActionError('未找到该次运行的证据快照');
      return;
    }

    setSelectedEvidence(evidence);
    setSelectedTrace(runTrace);
    setSelectedTicker((current) => {
      if (current && evidence.openclawTickers.includes(current)) return current;
      return evidence.openclawTickers[0] || null;
    });
  };

  const handleRetry = async () => {
    if (!id || !canRetry) return;
    setRetrying(true);
    setActionError(null);
    try {
      await retryMission(id, mission?.input.depth as 'quick' | 'standard' | 'deep' | undefined);
      selectedRunIdRef.current = null;
      setSelectedRunId(null);
      setSelectedEvidence(null);
      setSelectedTrace(null);
      setCompareRunId(null);
      setCompareEvidence(null);
      setCompareTrace(null);
      syncRunParams(null, null);
      await loadMission(id);
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          void loadMission(id);
        }, 10000);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Mission retry failed');
    }
    setRetrying(false);
  };

  if (loading && !mission) return <div className="page loading-state"><Clock size={32} className="spin" /> 加载分析脑波中...</div>;
  if (!mission) return <div className="page error-state">Mission 迷航... 未找到对应追踪记录。</div>;

  const activePayload = selectedEvidence || mission;
  const activeRun = runs.find((run) => run.id === selectedRunId) || latestRun;
  const activeTrace = selectedTrace || trace;
  const showTrace = !!activeTrace && activeTrace.steps.length > 0;
  const compareRun = runs.find((run) => run.id === compareRunId) || null;
  const comparePayload = compareRun ? (compareRun.id === latestRun?.id ? mission : compareEvidence) : null;
  const compareTraceSnapshot = compareRun ? (compareRun.id === latestRun?.id ? trace : compareTrace) : null;
  const diffItems = activeRun && compareRun && comparePayload
    ? summarizeRunDiff(activeRun, activePayload, activeTrace, compareRun, comparePayload, compareTraceSnapshot)
    : [];

  // C1: optional chaining 安全取值
  const currentOpenBB = activePayload.openbbData?.find(d => d.ticker === selectedTicker);
  const currentTA = activePayload.taResults?.find(r => r.ticker === selectedTicker);

  return (
    <div className="page mission-viewer">
      <div className="viewer-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/missions')}>
          <ArrowLeft size={16} /> 返回指挥台
        </button>
        <div className="viewer-title">
          <h1>{mission.input.query}</h1>
          <div className="viewer-meta">
            <span className={`status-pill ${activePayload.status}`}>{activePayload.status.replace(/_/g, ' ').toUpperCase()}</span>
            <span><Clock size={12}/> {new Date(mission.createdAt).toLocaleString()}</span>
            <span><Zap size={12}/> {Math.round(activePayload.totalDurationMs / 1000)}s</span>
            {selectedEvidence && activeRun && <span>Run #{activeRun.attempt} snapshot</span>}
          </div>
        </div>
        <div className="trigger-controls">
          <button type="button" onClick={handleRetry} disabled={!canRetry}>
            {retrying ? '重试排队中...' : '重新运行'}
          </button>
        </div>
      </div>
      {actionError && <div className="mode-hint" style={{ color: 'var(--accent-crimson)', marginBottom: '12px' }}>{actionError}</div>}

      {/* Ticker 专属标签栏 */}
      {activePayload.openclawTickers.length > 0 && (
        <div className="ticker-ribbon">
          <span className="ribbon-label"><Target size={14}/> 锁定猎物: </span>
          {activePayload.openclawTickers.map(t => (
            <button
              key={t}
              className={`ticker-tab ${t === selectedTicker ? 'active' : ''}`}
              onClick={() => setSelectedTicker(t)}
            >${t}</button>
          ))}
        </div>
      )}

      {/* 双栏布局 */}
      <div className="viewer-layout">
        
        <div className="viewer-main">
          {events.length > 0 && (
            <section className="consensus-section glass-panel">
              <h4><Clock size={18}/> Mission 生命周期</h4>
              <div className="tc-consensus">
                {events.slice(-8).map((event) => (
                  <div key={event.id} className="consensus-inline">
                    <span className="ci-ticker">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    <span className={`consensus-badge ${
                      event.type === 'failed'
                        ? 'disagree'
                        : event.type === 'completed'
                          ? 'agree'
                          : event.type === 'canceled'
                            ? 'pending'
                            : event.type === 'stage'
                              ? 'partial'
                              : 'pending'
                    }`}>
                      {event.phase ? `${event.type}:${event.phase}` : event.type}
                    </span>
                    <span>{event.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {runs.length > 0 && (
            <section className="consensus-section glass-panel">
              <h4><Activity size={18}/> 执行实例</h4>
              <div className="tc-consensus">
                {runs.slice(0, 4).map((run) => {
                  const durationSeconds = run.startedAt && run.completedAt
                    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                    : null;

                  return (
                    <button
                      key={run.id}
                      type="button"
                      className="consensus-inline"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'flex-start',
                        opacity: selectedRunId === run.id ? 1 : 0.82,
                      }}
                      onClick={() => {
                        void handleSelectRun(run);
                      }}
                    >
                      <span className="ci-ticker">Run #{run.attempt}</span>
                      <span className={`consensus-badge ${
                        run.status === 'failed'
                          ? 'disagree'
                          : run.status === 'completed'
                            ? 'agree'
                            : 'partial'
                      }`}>
                        {run.status}:{run.stage}
                      </span>
                      <span>
                        {durationSeconds !== null
                          ? `${durationSeconds}s`
                          : new Date(run.createdAt).toLocaleTimeString()}
                        {run.degradedFlags?.length ? ` · degraded(${run.degradedFlags.join(', ')})` : ''}
                        {run.failureMessage ? ` · ${run.failureMessage}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeRun && compareRun && (
            <section className="consensus-section glass-panel">
              <div className="run-diff-header">
                <div>
                  <h4><Shield size={18}/> Run 对比</h4>
                  <div className="queue-stats">
                    当前 Run #{activeRun.attempt} 对比基线 Run #{compareRun.attempt}
                  </div>
                </div>
                <select
                  className="run-diff-select"
                  value={compareRunId || ''}
                  onChange={(event) => {
                    const nextCompareRunId = event.target.value || null;
                    setCompareRunId(nextCompareRunId);
                    setCompareError(null);
                    syncRunParams(activeRun?.id || null, nextCompareRunId);
                  }}
                >
                  {runs
                    .filter((run) => run.id !== activeRun.id)
                    .map((run) => (
                      <option key={run.id} value={run.id}>
                        Run #{run.attempt} · {run.status}:{run.stage}
                      </option>
                    ))}
                </select>
              </div>

              {compareError && (
                <div className="mode-hint" style={{ color: 'var(--accent-crimson)', marginBottom: '12px' }}>
                  {compareError}
                </div>
              )}

              <div className="run-diff-grid">
                {compareLoading ? (
                  <div className="run-diff-empty">对比基线加载中...</div>
                ) : diffItems.length > 0 ? (
                  diffItems.map((item) => (
                    <div key={item.title} className="run-diff-card">
                      <div className="run-diff-card-top">
                        <span className="run-diff-title">{item.title}</span>
                        <span className={`consensus-badge ${item.tone}`}>{item.tone.toUpperCase()}</span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  ))
                ) : (
                  <div className="run-diff-empty">没有可对比的运行基线。</div>
                )}
              </div>
            </section>
          )}

          {/* ━━━ OpenClaw 脑电波还原 ━━━ */}
          <section className="brain-section glass-panel">
            <div className="brain-header openclaw">
              <Brain size={18} />
              <span>大脑 A · OpenClaw 策略推导链路</span>
              <span className="brain-duration">{Math.round(activePayload.openclawDurationMs / 1000)}s</span>
            </div>
            
            {showTrace ? (
              <div className="trace-timeline">
                {activeTrace!.steps.map((step, i) => (
                  <div key={i} className="trace-step glass-card">
                    <div className="step-point"></div>
                    <div className="step-info">
                      <div className="step-agent">
                        {step.agentName === 'DataScout' && <Search size={14}/>}
                        {step.agentName === 'Normalizer' && <Filter size={14}/>}
                        {(step.agentName === 'Strategist' || step.agentName === 'InvestmentCouncil') && <Brain size={14}/>}
                        {(step.agentName === 'Synthesizer') && <CheckCircle size={14}/>}
                        <span className="agent-name">{step.agentName}</span>
                        <span className="agent-phase">{step.phase}</span>
                        <span className="agent-time">{step.durationMs}ms</span>
                      </div>
                      
                      <div className="step-output markdown-body custom-scroll">
                        {typeof step.output === 'string' ? (
                          <ReactMarkdown>{step.output}</ReactMarkdown>
                        ) : (
                          <pre>{JSON.stringify(step.output, null, 2)}</pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="brain-content markdown-body">
                {activePayload.openclawReport ? (
                  <ReactMarkdown>{activePayload.openclawReport}</ReactMarkdown>
                ) : (
                  <div className="brain-empty">OpenClaw 链路捕获中...</div>
                )}
              </div>
            )}
          </section>

          {/* ━━━ TradingAgents 量化竞技场 ━━━ */}
          {currentTA && (
            <section className="brain-section glass-panel">
              <div className="brain-header ta">
                <BarChart3 size={18} />
                <span>大脑 B · TradingAgents 竞技场 — ${selectedTicker}</span>
                <span className="brain-duration">{currentTA.duration}s</span>
              </div>

              {currentTA.status === 'error' ? (
                <div className="brain-error">分析崩溃: {currentTA.error}</div>
              ) : (
                <div className="arena-content">
                  
                  {/* 对抗赛与PM图章联合版块 */}
                  <div className="arena-top-tier">
                    <div className="pm-gauge-card glass-card">
                      <h4>📊 定盘决策 (PM)</h4>
                      <div className={`pm-stamp ${currentTA.portfolioManagerDecision?.action?.toLowerCase() ?? ''}`}>
                        {currentTA.portfolioManagerDecision?.action ?? 'N/A'}
                      </div>
                      <div className="pm-alloc-bar">
                        <div className="alloc-fill" style={{ 
                          width: currentTA.portfolioManagerDecision?.allocation ?? '0%', 
                          background: currentTA.portfolioManagerDecision?.action === 'BUY' ? 'var(--accent-green)' : currentTA.portfolioManagerDecision?.action === 'SELL' ? 'var(--accent-crimson)' : 'var(--accent-amber)' 
                        }}></div>
                        <span className="alloc-text">仓位分配: {currentTA.portfolioManagerDecision?.allocation ?? 'N/A'}</span>
                      </div>
                      <div className="pm-sl-level">止损线: {currentTA.portfolioManagerDecision?.stopLoss || 'N/A'}</div>
                      <p className="pm-reason compact-scroll">{currentTA.portfolioManagerDecision?.reasoning ?? ''}</p>
                    </div>

                    <div className="debate-arena glass-card">
                      <div className="debate-side bull-side">
                        <div className="side-title"><TrendingUp size={16}/> Bull Case</div>
                        <div className="side-args compact-scroll">
                          {currentTA.investmentDebate?.bullArguments?.map((arg, i) => <p key={i}>• {arg}</p>) ?? <p className="brain-empty">无数据</p>}
                        </div>
                      </div>
                      <div className="debate-side bear-side">
                        <div className="side-title"><TrendingDown size={16}/> Bear Case</div>
                        <div className="side-args compact-scroll">
                          {currentTA.investmentDebate?.bearArguments?.map((arg, i) => <p key={i}>• {arg}</p>) ?? <p className="brain-empty">无数据</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 风控透镜三棱镜 */}
                  <div className="risk-prism">
                    <h4>🛡️ 风控三棱视角</h4>
                    <div className="prism-grid">
                      <div className="prism-face aggressive">
                        <span className="prism-icon">🔥 激进</span>
                        <p>{currentTA.riskDebate?.aggressiveView ?? '暂无'}</p>
                      </div>
                      <div className="prism-face neutral">
                        <span className="prism-icon">⚖️ 中性</span>
                        <p>{currentTA.riskDebate?.neutralView ?? '暂无'}</p>
                      </div>
                      <div className="prism-face conservative">
                        <span className="prism-icon">🛡️ 保守</span>
                        <p>{currentTA.riskDebate?.conservativeView ?? '暂无'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
          
          {/* 双大脑共识 */}
          {activePayload.consensus.length > 0 && (
            <section className="consensus-section glass-panel">
              <h4><Shield size={18}/> 终极共识雷达</h4>
              <div className="consensus-grid">
                {activePayload.consensus.map(c => (
                  <div key={c.ticker} className={`consensus-card ${c.agreement}`}>
                    <div className="cc-ticker">${c.ticker}</div>
                    <div className="cc-verdicts">
                      <span className={`cc-oc align-${c.openclawVerdict?.toLowerCase()}`}>OC: {c.openclawVerdict || '-'}</span>
                      <span className={`cc-ta align-${c.taVerdict?.toLowerCase()}`}>TA: {c.taVerdict || '-'}</span>
                      {c.openbbVerdict && <span className={`cc-obb ${c.openbbVerdict.toLowerCase()}`}>BB: {c.openbbVerdict}</span>}
                    </div>
                    <div className={`cc-agreement ${c.agreement}`}>
                      {c.agreement === 'agree' ? '🟢 双重确认' :
                       c.agreement === 'disagree' ? '🔴 激烈分歧' :
                       c.agreement === 'partial' ? '🟡 部分共振' : '⏳ 待定'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        {/* ━━━ 右侧边栏：OpenBB 数据仪表 ━━━ */}
        <aside className="viewer-sidebar">
          {currentOpenBB ? (
            <div className="sidebar-data glass-panel">
              <h4 className="obb-title"><Activity size={16}/> {selectedTicker} 金融底座</h4>
              
              {/* 综合评级大图章 */}
              <div className={`openbb-verdict-card ${currentOpenBB.verdict?.toLowerCase() ?? ''}`}>
                <div className="verdict-label">OpenBB 量化信号</div>
                <div className="verdict-value">{currentOpenBB.verdict ?? '-'}</div>
                <div className="verdict-reason">{currentOpenBB.verdictReason ?? ''}</div>
              </div>

              {/* 视觉进度条指标区 — C1: 全部 optional chaining */}
              <div className="obb-metrics">
                <div className="obb-group">
                  <div className="obb-group-title">技术动量</div>
                  {currentOpenBB.background?.rsi14 != null && (
                    <div className="metric-bar-container">
                      <div className="metric-header">
                        <span>RSI (14)</span>
                        <span className={currentOpenBB.background.rsi14 > 70 ? 'text-red' : currentOpenBB.background.rsi14 < 30 ? 'text-green' : ''}>
                          {currentOpenBB.background.rsi14.toFixed(1)}
                        </span>
                      </div>
                      <div className="metric-track">
                        <div className="metric-fill" style={{ 
                          width: `${Math.min(100, currentOpenBB.background.rsi14)}%`,
                          background: currentOpenBB.background.rsi14 > 70 ? 'var(--accent-crimson)' : currentOpenBB.background.rsi14 < 30 ? 'var(--accent-green)' : 'var(--accent-cyan)'
                        }}></div>
                      </div>
                    </div>
                  )}

                  <div className="metric-status-row">
                    <span>SMA 20 突破</span>
                    {currentOpenBB.core?.priceVsSma20 === 'above' ? 
                      <span className="status-badge green">之上运行</span> : 
                      <span className="status-badge red">跌落趋势</span>}
                  </div>
                </div>

                <div className="obb-group">
                  <div className="obb-group-title">基盘与筹码</div>
                  <div className="metric-row">
                    <span>市值</span>
                    <strong>
                      {currentOpenBB.core?.marketCap != null
                        ? (currentOpenBB.core.marketCap / 1e9 > 1
                          ? `$${(currentOpenBB.core.marketCap / 1e9).toFixed(2)}B`
                          : `$${(currentOpenBB.core.marketCap / 1e6).toFixed(2)}M`)
                        : '-'}
                    </strong>
                  </div>
                  
                  {currentOpenBB.core?.institutionalOwnership != null && (
                    <div className="metric-bar-container">
                      <div className="metric-header">
                        <span>机构持仓</span>
                        <span>{currentOpenBB.core.institutionalOwnership.toFixed(1)}%</span>
                      </div>
                      <div className="metric-track">
                        <div className="metric-fill" style={{ width: `${currentOpenBB.core.institutionalOwnership}%`, background: 'var(--accent-amber)' }}></div>
                      </div>
                    </div>
                  )}

                  <div className="metric-status-row">
                    <span>内部人交易</span>
                    <span className={`status-badge ${currentOpenBB.core?.insiderNetDirection === 'net_buy' ? 'green' : 'red'}`}>
                      {currentOpenBB.core?.insiderNetDirection?.toUpperCase() || '-'}
                    </span>
                  </div>
                </div>

                <div className="obb-group">
                  <div className="obb-group-title">基本面乘数</div>
                  <div className="metric-grid">
                    <div className="m-box">
                      <span className="m-label">P/E</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.peRatio?.toFixed(1) ?? '-'}</span>
                    </div>
                    <div className="m-box">
                      <span className="m-label">P/S</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.psRatio?.toFixed(1) ?? '-'}</span>
                    </div>
                    <div className="m-box">
                      <span className="m-label">Rev YoY</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.revenueGrowthYoY != null ? `${currentOpenBB.auxiliary.revenueGrowthYoY}%` : '-'}</span>
                    </div>
                    <div className="m-box">
                      <span className="m-label">FCF</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.freeCashFlow != null ? `$${currentOpenBB.auxiliary.freeCashFlow.toFixed(1)}` : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="sidebar-empty glass-panel">
              <Activity size={32} />
              <p>等待金融底座数据注入</p>
            </div>
          )}
        </aside>
      </div>

    </div>
  );
}
