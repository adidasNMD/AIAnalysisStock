import type { ReactNode } from 'react';
import type { OpportunityInboxItem, OpportunitySummary } from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import {
  timelineDecisionLabel,
  type InboxLane,
  type LaneActionPreview,
  type LaneLiveSignal,
  type OpportunityPrimaryAction,
} from './model';
import { inboxLaneMeta } from './live';
import { buildInboxPrimaryAction } from './selectors';

type LanePriorityView = {
  items: OpportunityInboxItem[];
  recentEvents: Map<string, OpportunityStreamEvent>;
};

type LaneInsight = {
  summary: string;
  chips: string[];
  actionSummary: string | null;
};

type ActionInboxProps = {
  liveInbox: OpportunityInboxItem[];
  inboxLanes: Record<InboxLane, LanePriorityView>;
  laneInsights: Record<InboxLane, LaneInsight>;
  laneLiveSignals: Record<InboxLane, LaneLiveSignal | null>;
  laneActionPreviews: Record<InboxLane, LaneActionPreview | null>;
  focusedLane: InboxLane | null;
  setLaneRef: (lane: InboxLane, node: HTMLElement | null) => void;
  executePrimaryAction: (opportunity: OpportunitySummary, action: OpportunityPrimaryAction) => void | Promise<void>;
  renderInboxCard: (
    item: OpportunityInboxItem,
    livePriorityEvent?: OpportunityStreamEvent | null,
    liveRank?: number,
  ) => ReactNode;
};

export function ActionInbox({
  liveInbox,
  inboxLanes,
  laneInsights,
  laneLiveSignals,
  laneActionPreviews,
  focusedLane,
  setLaneRef,
  executePrimaryAction,
  renderInboxCard,
}: ActionInboxProps) {
  return (
    <div className="today-summary glass-panel">
      <div className="today-header">
        <div>
          <h3>Action Inbox</h3>
          <p>先按行动泳道分层，再在每条泳道里按催化、传导、退化和 thesis 变化排序。</p>
          <div className="today-shortcuts">
            <span className="timeline-chip muted">1 / 2 / 3 跳到泳道</span>
            <span className="timeline-chip muted">Shift + 1 / 2 / 3 直接执行</span>
          </div>
        </div>
        <div className="today-kpis">
          <div className="today-kpi">
            <span>Items</span>
            <strong>{liveInbox.length || 0}</strong>
          </div>
          <div className="today-kpi">
            <span>Act</span>
            <strong>{inboxLanes.act.items.length}</strong>
          </div>
          <div className="today-kpi">
            <span>Review</span>
            <strong>{inboxLanes.review.items.length}</strong>
          </div>
          <div className="today-kpi">
            <span>Monitor</span>
            <strong>{inboxLanes.monitor.items.length}</strong>
          </div>
          <div className="today-kpi">
            <span>Top</span>
            <strong>{liveInbox[0]?.inboxScore || 0}</strong>
          </div>
          <div className="today-kpi">
            <span>Priority</span>
            <strong>{liveInbox[0]?.actionDecision ? timelineDecisionLabel(liveInbox[0].actionDecision) : 'WATCH'}</strong>
          </div>
        </div>
      </div>
      <div className="today-lanes">
        {(['act', 'review', 'monitor'] as const).map((lane) => {
          const meta = inboxLaneMeta(lane);
          const laneView = inboxLanes[lane];
          const items = laneView.items;
          const insight = laneInsights[lane];
          const liveSignal = laneLiveSignals[lane];
          const laneActionPreview = laneActionPreviews[lane];
          const lanePrimaryItem = items[0] || null;
          const lanePrimaryOpportunity = laneActionPreview?.opportunity || lanePrimaryItem;
          const lanePrimaryAction = laneActionPreview?.action || (lanePrimaryItem ? buildInboxPrimaryAction(lanePrimaryItem) : null);
          return (
            <section
              key={lane}
              className={`today-lane ${lane} ${focusedLane === lane ? 'focused' : ''}`}
              ref={(node) => setLaneRef(lane, node)}
            >
              <div className="today-lane-header">
                <div>
                  <h4>{meta.label}</h4>
                  <p>{meta.description}</p>
                  {liveSignal && (
                    <div className={`today-lane-live ${liveSignal.state}`}>
                      <div className="today-lane-live-top">
                        <span className="live-dot-small" />
                        <span className="today-lane-live-label">{liveSignal.label}</span>
                        <span className={`live-state-chip ${liveSignal.state}`}>{liveSignal.stateLabel}</span>
                        <span className="today-lane-live-age">{liveSignal.ageLabel}</span>
                      </div>
                      <div className="today-lane-live-detail">{liveSignal.detail}</div>
                      <div className="today-lane-live-note">{liveSignal.stateSummary}</div>
                    </div>
                  )}
                  <div className="today-lane-summary">{insight.summary}</div>
                  {insight.chips.length > 0 && (
                    <div className="today-lane-chips">
                      {insight.chips.map((chip) => (
                        <span key={`${lane}_${chip}`} className="timeline-chip muted">{chip}</span>
                      ))}
                    </div>
                  )}
                  {lanePrimaryOpportunity && lanePrimaryAction && (
                    <div className={`today-lane-action ${laneActionPreview?.fresh ? 'fresh' : ''}`}>
                      {(laneActionPreview?.copy || insight.actionSummary) && (
                        <div className="today-lane-action-copy">{laneActionPreview?.copy || insight.actionSummary}</div>
                      )}
                      <div className="today-lane-action-row">
                        <button
                          type="button"
                          className="secondary-btn tiny"
                          onClick={() => void executePrimaryAction(lanePrimaryOpportunity, lanePrimaryAction)}
                        >
                          {lanePrimaryAction.label}
                        </button>
                        <span className="timeline-chip muted">{laneActionPreview?.targetTitle || lanePrimaryOpportunity.title}</span>
                        {laneActionPreview?.fresh && (
                          <span className="timeline-chip">LIVE</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <span className={`today-lane-count ${lane}`}>{items.length}</span>
              </div>
              <div className="today-feed-list">
                {items.length === 0 ? (
                  <div className="today-empty">{meta.empty}</div>
                ) : (
                  items.map((item, index) => renderInboxCard(item, laneView.recentEvents.get(item.id), index))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
