import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Search, CheckCircle, AlertTriangle, XCircle, Loader } from 'lucide-react';
import { fetchTraces } from '../api';
import type { MissionSummary, TraceItem } from '../api';
import { usePolling } from '../hooks/useAgentStream';
import { useMissionListQuery } from '../queries/mission-queries';
import '../styles/workflow-shared.css';

function statusIcon(status: string) {
  switch (status) {
    case 'fully_enriched': return <CheckCircle size={14} className="icon-green" />;
    case 'main_complete':
    case 'main_only': return <CheckCircle size={14} className="icon-cyan" />;
    case 'main_running':
    case 'ta_running': return <Loader size={14} className="spin icon-amber" />;
    case 'canceled': return <AlertTriangle size={14} className="icon-amber" />;
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

function missionDiffBadge(diff?: MissionSummary['latestDiff']) {
  if (!diff) return null;
  return diff.changed
    ? { label: `CHANGED ${diff.changeCount}`, tone: 'changed' as const }
    : { label: 'STABLE', tone: 'stable' as const };
}

interface CompareTarget {
  id: string;
  latestDiff?: MissionSummary['latestDiff'];
}

type TimelineFilter = 'all' | 'recovery' | 'reused' | 'new' | 'failed';

interface TimelineItem {
  type: 'mission' | 'trace';
  id: string;
  query: string;
  status: string;
  createdAt: string;
  tickers: string[];
  consensus: MissionSummary['consensus'];
  duration: number;
  mode: string;
  source: string;
  latestRun?: MissionSummary['latestRun'];
  latestDiff?: MissionSummary['latestDiff'];
  latestRecoveryEvent?: MissionSummary['latestRecoveryEvent'];
}

const timelineFilters: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'recovery', label: '有恢复' },
  { id: 'reused', label: '复用恢复' },
  { id: 'new', label: '新建恢复' },
  { id: 'failed', label: '失败/取消' },
];

function recoveryTone(event?: MissionSummary['latestRecoveryEvent']) {
  if (!event) return 'neutral';
  if (event.reusedExistingRetry || event.action.startsWith('reused_')) return 'warning';
  if (event.action === 'queued_new_retry') return 'changed';
  return 'stable';
}

function recoveryMatchesFilter(item: TimelineItem, filter: TimelineFilter) {
  if (filter === 'all') return true;
  if (filter === 'failed') return item.status === 'failed' || item.status === 'canceled';

  const event = item.latestRecoveryEvent;
  if (!event) return false;
  if (filter === 'recovery') return true;
  if (filter === 'reused') return event.reusedExistingRetry || event.action.startsWith('reused_');
  if (filter === 'new') return event.action === 'queued_new_retry';
  return true;
}

export function MissionTimeline() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');
  const { data: missions } = useMissionListQuery(30);
  const { data: legacyTraces } = usePolling<TraceItem[]>(() => fetchTraces(), 10000, []);

  // 合并新 Mission 和旧 Trace 为统一时间线
  const timelineItems = useMemo<TimelineItem[]>(() => [
    ...(missions || []).map((m): TimelineItem => ({
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
      latestRun: m.latestRun,
      latestDiff: m.latestDiff,
      latestRecoveryEvent: m.latestRecoveryEvent,
    })),
    ...(legacyTraces || []).map((t): TimelineItem => ({
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
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [legacyTraces, missions]);

  const filterCounts = useMemo(() => {
    return timelineFilters.reduce<Record<TimelineFilter, number>>((counts, filter) => {
      counts[filter.id] = timelineItems.filter(item => recoveryMatchesFilter(item, filter.id)).length;
      return counts;
    }, {
      all: 0,
      recovery: 0,
      reused: 0,
      new: 0,
      failed: 0,
    });
  }, [timelineItems]);

  const filteredTimelineItems = useMemo(
    () => timelineItems.filter(item => recoveryMatchesFilter(item, activeFilter)),
    [activeFilter, timelineItems],
  );

  const openMissionCompare = (mission: CompareTarget) => {
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
    <div className="page mission-timeline">
      <div className="page-header">
        <h1><Clock size={24} /> 任务时间线</h1>
        <div className="header-count">
          {activeFilter === 'all'
            ? `${timelineItems.length} 条记录`
            : `${filteredTimelineItems.length}/${timelineItems.length} 条记录`}
        </div>
      </div>

      <div className="timeline-filter-bar" aria-label="任务时间线筛选">
        {timelineFilters.map(filter => (
          <button
            key={filter.id}
            type="button"
            className={`timeline-filter-btn ${activeFilter === filter.id ? 'active' : ''}`}
            data-mission-timeline-filter={filter.id}
            aria-pressed={activeFilter === filter.id}
            onClick={() => setActiveFilter(filter.id)}
          >
            <span>{filter.label}</span>
            <strong>{filterCounts[filter.id]}</strong>
          </button>
        ))}
      </div>

      <div className="timeline-list">
        {filteredTimelineItems.length === 0 ? (
            <div className="empty-state">
              <Search size={48} />
              <p>{timelineItems.length === 0 ? '暂无任务记录' : '没有匹配记录'}</p>
              <p className="hint">在机会工作台创建机会卡，或去执行控制台直接发射任务</p>
            </div>
        ) : (
          filteredTimelineItems.map(item => {
            const diffBadge = item.type === 'mission' ? missionDiffBadge(item.latestDiff) : null;
            const recoveryEvent = item.type === 'mission' ? item.latestRecoveryEvent : undefined;

            return (
              <div
                key={item.id}
                className="timeline-card glass-panel"
                onClick={() => item.type === 'mission' ? navigate(`/missions/${item.id}`) : null}
                style={{ cursor: item.type === 'mission' ? 'pointer' : 'default' }}
                data-mission-timeline-item
                data-mission-id={item.id}
                data-mission-type={item.type}
                data-mission-status={item.status}
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
                      {item.type === 'mission' && item.latestRun && (
                        <span className="tc-source">
                          run#{item.latestRun.attempt} {item.latestRun.status}:{item.latestRun.stage}
                        </span>
                      )}
                    </div>
                    {item.type === 'mission' && item.latestDiff && diffBadge && (
                      <div className="tc-diff">
                        <span className={`diff-chip ${diffBadge.tone}`}>{diffBadge.label}</span>
                        <span className="tc-diff-summary">{item.latestDiff.summary}</span>
                        <button
                          type="button"
                          className="today-compare-btn"
                          data-mission-timeline-action="compare"
                          onClick={(event) => {
                            event.stopPropagation();
                            openMissionCompare(item);
                          }}
                        >
                          查看对比
                        </button>
                      </div>
                    )}
                    {recoveryEvent && (
                      <div
                        className="tc-recovery-audit"
                        data-mission-recovery-audit={recoveryEvent.action}
                      >
                        <span className={`diff-chip ${recoveryTone(recoveryEvent)}`}>
                          {recoveryEvent.label}
                        </span>
                        {recoveryEvent.depth && (
                          <span className="tc-recovery-copy">{recoveryEvent.depth} 深度</span>
                        )}
                        {recoveryEvent.costHint && (
                          <span className={`tc-recovery-cost ${recoveryEvent.costHint.tier}`}>
                            {recoveryEvent.costHint.label} · {recoveryEvent.costHint.estimate}
                          </span>
                        )}
                        {recoveryEvent.runId && (
                          <span className="tc-recovery-copy">run {recoveryEvent.runId}</span>
                        )}
                      </div>
                    )}
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
            );
          })
        )}
      </div>
    </div>
  );
}
