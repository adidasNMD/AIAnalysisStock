import { useState } from 'react';
import { Crosshair, Rocket, Activity, Search, BarChart3, RefreshCw } from 'lucide-react';
import { createMission, fetchHealth, fetchQueue, fetchDiagnostics } from '../api';
import type { HealthStatus, TaskQueueResponse, DiagnosticsResult } from '../api';
import { useAgentStream, usePolling } from '../hooks/useAgentStream';

export function CommandCenter() {
  const [mode, setMode] = useState<'explore' | 'analyze'>('explore');
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('deep');
  const [isLoading, setIsLoading] = useState(false);
  const { logs, isConnected } = useAgentStream(80);

  const { data: health } = usePolling<HealthStatus>(() => fetchHealth(), 5000, []);
  const { data: queue } = usePolling<TaskQueueResponse>(() => fetchQueue(), 3000, []);
  const { data: diagnostics } = usePolling<DiagnosticsResult | null>(() => fetchDiagnostics(), 10000, []);

  const isExecuting = queue?.tasks.some(t => t.status === 'running');
  const runningTask = queue?.tasks.find(t => t.status === 'running');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;
    setIsLoading(true);
    try {
      await createMission(mode, query, undefined, depth);
      setQuery('');
    } catch { }
    setIsLoading(false);
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
            <select value={depth} onChange={(e) => setDepth(e.target.value as any)}>
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
      </div>

      {/* 活跃任务 */}
      {isExecuting && runningTask && (
        <div className="active-mission glass-panel">
          <div className="mission-running-header">
            <Activity size={16} className="pulse" />
            <span>PROCESSING MISSION</span>
          </div>
          <div className="mission-running-title">{runningTask.query}</div>
          <div className="mission-running-meta">
            Depth: <span className="tag">{runningTask.depth.toUpperCase()}</span> |
            Source: {runningTask.source} |
            Phase: <span className="tag accent">{runningTask.progress?.toUpperCase() || 'INIT'}</span>
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
        {queue?.tasks.filter(t => t.status === 'pending').slice(0, 5).map(task => (
          <div key={task.id} className="queue-card">
            <span className="queue-query">{task.query}</span>
            <span className="queue-depth">{task.depth}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
