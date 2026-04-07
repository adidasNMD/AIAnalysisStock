import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Search, CheckCircle, AlertTriangle, XCircle, Loader } from 'lucide-react';
import { fetchMissions, fetchTraces } from '../api';
import type { MissionSummary, TraceItem } from '../api';
import { usePolling } from '../hooks/useAgentStream';

function statusIcon(status: string) {
  switch (status) {
    case 'fully_enriched': return <CheckCircle size={14} className="icon-green" />;
    case 'main_complete':
    case 'main_only': return <CheckCircle size={14} className="icon-cyan" />;
    case 'main_running':
    case 'ta_running': return <Loader size={14} className="spin icon-amber" />;
    case 'failed': return <XCircle size={14} className="icon-red" />;
    default: return <AlertTriangle size={14} className="icon-dim" />;
  }
}

function consensusLabel(agreement: string) {
  switch (agreement) {
    case 'agree': return <span className="consensus-badge agree">🟢 双重确认</span>;
    case 'disagree': return <span className="consensus-badge disagree">🔴 分歧</span>;
    case 'partial': return <span className="consensus-badge partial">🟡 部分一致</span>;
    default: return <span className="consensus-badge pending">⏳ 待定</span>;
  }
}

export function MissionTimeline() {
  const navigate = useNavigate();
  const { data: missions } = usePolling<MissionSummary[]>(() => fetchMissions(30), 5000, []);
  const { data: legacyTraces } = usePolling<TraceItem[]>(() => fetchTraces(), 10000, []);

  // 合并新 Mission 和旧 Trace 为统一时间线
  const timelineItems = [
    ...(missions || []).map(m => ({
      type: 'mission' as const,
      id: m.id,
      query: m.query,
      status: m.status,
      createdAt: m.createdAt,
      tickers: m.openclawTickers,
      consensus: m.consensus,
      duration: m.totalDurationMs,
      mode: m.mode,
      source: m.source,
    })),
    ...(legacyTraces || []).map(t => ({
      type: 'trace' as const,
      id: t.filename.replace('.json', ''),
      query: t.filename.replace('.json', '').replace(/^mission_[\d-T_]+_/, '').replace(/_/g, ' '),
      status: 'legacy',
      createdAt: t.date,
      tickers: [] as string[],
      consensus: [],
      duration: 0,
      mode: 'legacy',
      source: 'legacy',
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page mission-timeline">
      <div className="page-header">
        <h1><Clock size={24} /> 任务时间线</h1>
        <div className="header-count">{timelineItems.length} 条记录</div>
      </div>

      <div className="timeline-list">
        {timelineItems.length === 0 ? (
          <div className="empty-state">
            <Search size={48} />
            <p>暂无任务记录</p>
            <p className="hint">在指挥中心发射一个任务开始</p>
          </div>
        ) : (
          timelineItems.map(item => (
            <div
              key={item.id}
              className="timeline-card glass-panel"
              onClick={() => item.type === 'mission' ? navigate(`/missions/${item.id}`) : null}
              style={{ cursor: item.type === 'mission' ? 'pointer' : 'default' }}
            >
              <div className="tc-left">
                {statusIcon(item.status)}
                <div className="tc-info">
                  <div className="tc-query">{item.query}</div>
                  <div className="tc-meta">
                    <span className="tc-time">{new Date(item.createdAt).toLocaleString()}</span>
                    {item.duration > 0 && <span className="tc-duration">{Math.round(item.duration / 1000)}s</span>}
                    <span className={`tc-mode ${item.mode}`}>{item.mode}</span>
                    {item.source !== 'legacy' && <span className="tc-source">{item.source}</span>}
                  </div>
                </div>
              </div>

              <div className="tc-right">
                {item.tickers.length > 0 && (
                  <div className="tc-tickers">
                    {item.tickers.slice(0, 4).map(t => (
                      <span key={t} className="ticker-pill">${t}</span>
                    ))}
                    {item.tickers.length > 4 && <span className="ticker-more">+{item.tickers.length - 4}</span>}
                  </div>
                )}
                {item.consensus.length > 0 && (
                  <div className="tc-consensus">
                    {item.consensus.slice(0, 3).map(c => (
                      <div key={c.ticker} className="consensus-inline">
                        <span className="ci-ticker">{c.ticker}</span>
                        {consensusLabel(c.agreement)}
                      </div>
                    ))}
                  </div>
                )}
                {item.type === 'mission' && <ChevronRight size={16} className="icon-dim" />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
