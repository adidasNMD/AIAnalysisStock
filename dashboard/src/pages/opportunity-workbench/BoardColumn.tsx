import type {
  OpportunityBoardHealthSummary,
  OpportunityBoardType,
  OpportunitySummary,
  OpportunitySuggestedMission,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import { typeMeta, type BoardLiveSignal } from './model';
import { buildBoardPriorityView } from './live';
import {
  boardSortSummary,
  filterBoardItems,
  metricToneClass,
  sortBoardItems,
} from './selectors';
import { OpportunityCard } from './OpportunityCard';
import type { MissionRecoveryAction } from './recovery';

type BoardColumnProps = {
  type: OpportunityBoardType;
  items: OpportunitySummary[];
  boardHealth: OpportunityBoardHealthSummary;
  boardLiveSignal: BoardLiveSignal | null;
  activeMetricKey?: string | null;
  streamedEvents: OpportunityStreamEvent[];
  liveNow: number;
  automationAction: 'radar' | 'graph' | null;
  recoveringMissionActionKey?: string | null;
  onToggleBoardFilter: (type: OpportunityBoardType, metricKey: string, count: number) => void;
  onClearBoardFilter: (type: OpportunityBoardType) => void;
  onRunRadarRefresh: () => void;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => void;
  onOpenMission: (missionId: string) => void;
  onOpenCommandCenter: () => void;
};

export function BoardColumn({
  type,
  items,
  boardHealth,
  boardLiveSignal,
  activeMetricKey,
  streamedEvents,
  liveNow,
  automationAction,
  recoveringMissionActionKey,
  onToggleBoardFilter,
  onClearBoardFilter,
  onRunRadarRefresh,
  onOpenOpportunity,
  onRecoverMission,
  onLaunchOpportunityAnalysis,
  onOpenMission,
  onOpenCommandCenter,
}: BoardColumnProps) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  const { items: filteredItems, activeMetric } = filterBoardItems(items, boardHealth, activeMetricKey);
  const visibleItems = activeMetric ? sortBoardItems(filteredItems, activeMetric.key) : filteredItems;
  const boardPriorityView = buildBoardPriorityView(visibleItems, streamedEvents, liveNow);

  return (
    <section className="op-board glass-panel">
      <div className="op-board-header">
        <div>
          <h3><Icon size={16} /> {meta.label}</h3>
          <p>{meta.description}</p>
          <div className="op-board-health">
            <div className="op-board-health-headline">{boardHealth.headline}</div>
            <div className="op-board-health-summary">{boardHealth.summary}</div>
            <div className="op-board-health-chips">
              {boardHealth.metrics.map((metric) => (
                <button
                  key={`${type}_${metric.key}`}
                  type="button"
                  className={`timeline-chip muted board-health-chip ${metricToneClass(metric.tone)} ${activeMetric?.key === metric.key ? 'active' : ''}`}
                  onClick={() => onToggleBoardFilter(type, metric.key, metric.value)}
                  disabled={metric.key === 'cards' || metric.value === 0}
                  title={metric.explanation || metric.label}
                  aria-label={`${metric.label} ${metric.value}${metric.explanation ? `: ${metric.explanation}` : ''}`}
                >
                  {metric.label} {metric.value}
                </button>
              ))}
            </div>
            {activeMetric && (
              <div className="op-board-filter-bar">
                <span className="timeline-chip board-health-chip active">
                  筛选中: {activeMetric.label} {activeMetric.value}
                </span>
                <span className="timeline-chip muted">{boardSortSummary(activeMetric.key, boardLiveSignal)}</span>
                <button
                  type="button"
                  className="secondary-btn tiny"
                  onClick={() => onClearBoardFilter(type)}
                >
                  清除
                </button>
              </div>
            )}
            {activeMetric?.explanation && (
              <div className="op-board-metric-explain">
                {activeMetric.explanation}
              </div>
            )}
            {activeMetric?.details && activeMetric.details.length > 0 && (
              <div className="op-board-metric-details">
                {activeMetric.details.slice(0, 3).map((detail) => (
                  <div
                    key={`${activeMetric.key}_${detail.opportunityId}`}
                    className="op-board-metric-detail"
                    title={detail.evidence || detail.reason}
                  >
                    <span>{detail.title}</span>
                    <small>{detail.eventLabel ? `${detail.eventLabel}: ` : ''}{detail.reason}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
          {boardLiveSignal && (
            <div className={`op-board-live ${boardLiveSignal.state}`}>
              <div className="op-board-live-top">
                <span className="live-dot-small" />
                <span className="op-board-live-label">{boardLiveSignal.label}</span>
                <span className="op-board-live-target">{boardLiveSignal.targetTitle}</span>
                <span className={`live-state-chip ${boardLiveSignal.state}`}>{boardLiveSignal.stateLabel}</span>
                <span className="op-board-live-age">{boardLiveSignal.ageLabel}</span>
              </div>
              <div className="op-board-live-detail">{boardLiveSignal.detail}</div>
              <div className="op-board-live-note">{boardLiveSignal.stateSummary}</div>
            </div>
          )}
        </div>
        <div className="op-board-actions">
          <span className="header-count">
            {activeMetric ? `${boardPriorityView.items.length}/${items.length} cards` : `${items.length} cards`}
          </span>
          {type === 'ipo_spinout' && (
            <button type="button" className="secondary-btn" onClick={onRunRadarRefresh} disabled={automationAction !== null}>
              {automationAction === 'radar' ? '刷新中...' : '刷新 EDGAR Radar'}
            </button>
          )}
        </div>
      </div>
      <div className="op-board-list">
        {items.length === 0 ? (
          <div className="today-empty">这个板块还没有机会卡</div>
        ) : boardPriorityView.items.length === 0 ? (
          <div className="today-empty">当前筛选下没有机会卡</div>
        ) : (
          boardPriorityView.items.map((opportunity, index) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              activeMetricKey={activeMetric?.key}
              rank={index}
              liveNow={liveNow}
              livePriorityEvent={boardPriorityView.recentEvents.get(opportunity.id)}
              recoveringMissionActionKey={recoveringMissionActionKey}
              onOpenOpportunity={onOpenOpportunity}
              onRecoverMission={onRecoverMission}
              onLaunchOpportunityAnalysis={onLaunchOpportunityAnalysis}
              onOpenMission={onOpenMission}
              onOpenCommandCenter={onOpenCommandCenter}
            />
          ))
        )}
      </div>
    </section>
  );
}
