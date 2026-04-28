import { ArrowRight } from 'lucide-react';
import type {
  OpportunityInboxItem,
  OpportunitySuggestedMission,
  OpportunitySummary,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import {
  statusTone,
  timelineDecisionLabel,
  timelineDecisionTone,
  timelineDriverLabel,
  typeMeta,
  type OpportunityPrimaryAction,
} from './model';
import {
  buildExtraTemplates,
  buildLiveRankBadge,
  formatLiveAge,
  liveSignalLabel,
} from './live';
import { buildInboxPrimaryAction } from './selectors';
import { MissionRecoveryPanel } from './MissionRecoveryPanel';
import { PreTradeChecklistBlock } from './PreTradeChecklistBlock';
import { ScoreExplanationBlock } from './ScoreExplanationBlock';
import type { MissionRecoveryAction } from './recovery';

type InboxOpportunityCardProps = {
  item: OpportunityInboxItem;
  liveNow: number;
  livePriorityEvent?: OpportunityStreamEvent | null;
  liveRank?: number;
  recoveringMissionActionKey?: string | null;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onExecutePrimaryAction: (
    opportunity: OpportunitySummary,
    action: OpportunityPrimaryAction,
  ) => void | Promise<void>;
  onLaunchOpportunityAnalysis: (
    opportunity: OpportunitySummary,
    suggested?: OpportunitySuggestedMission,
  ) => void | Promise<void>;
  onRecoverMission: (
    opportunity: OpportunitySummary,
    action: MissionRecoveryAction,
  ) => void | Promise<void>;
  onOpenMission: (missionId: string) => void;
};

export function InboxOpportunityCard({
  item,
  liveNow,
  livePriorityEvent,
  liveRank,
  recoveringMissionActionKey,
  onOpenOpportunity,
  onExecutePrimaryAction,
  onLaunchOpportunityAnalysis,
  onRecoverMission,
  onOpenMission,
}: InboxOpportunityCardProps) {
  const primaryAction = buildInboxPrimaryAction(item);
  const liveRankBadge = buildLiveRankBadge(livePriorityEvent, liveRank ?? -1, liveNow);
  const extraTemplates = buildExtraTemplates(item, primaryAction.template?.id, 2);

  return (
    <article
      key={item.id}
      className={`today-card ${liveRankBadge ? 'live-ranked' : ''} ${liveRankBadge?.state || ''}`}
    >
      <div className="today-card-top">
        <span className={`consensus-badge ${statusTone(item.status)}`}>
          {typeMeta(item.type).label}
        </span>
        <div className="today-card-rank">
          {liveRankBadge && (
            <span className={`live-rank-badge ${liveRankBadge.state}`} title={liveRankBadge.detail}>
              {liveRankBadge.label}
            </span>
          )}
          <span className="today-run">Score {item.inboxScore}</span>
        </div>
      </div>
      <div className="today-query">{item.title}</div>
      <div className="today-meta">
        <span>{item.stage} / {item.status}</span>
        {item.primaryTicker && <span>Primary {item.primaryTicker}</span>}
        {item.leaderTicker && <span>Leader {item.leaderTicker}</span>}
        {item.proxyTicker && <span>Proxy {item.proxyTicker}</span>}
      </div>
      <div className="today-diff">
        <span className={`diff-chip ${item.recommendedAction === 'review' ? 'changed' : 'stable'}`}>
          {item.recommendedAction.toUpperCase()}
        </span>
        <span className="today-diff-summary">{item.inboxSummary}</span>
      </div>
      {livePriorityEvent && (
        <div className="today-live-priority">
          <div className="today-live-priority-top">
            <span className="live-dot-small" />
            <span className="today-live-priority-label">{liveSignalLabel(livePriorityEvent)}</span>
            <span className="today-live-priority-age">{formatLiveAge(livePriorityEvent.timestamp, liveNow)}</span>
          </div>
          <div className="today-live-priority-detail">{livePriorityEvent.message}</div>
        </div>
      )}
      {item.actionLabel && (
        <div className="today-action-callout">
          <div className="op-timeline-chips">
            {item.actionDecision && (
              <span className={`diff-chip ${timelineDecisionTone(item.actionDecision)}`}>
                {timelineDecisionLabel(item.actionDecision)}
              </span>
            )}
            {item.actionDriver && (
              <span className="timeline-chip">{timelineDriverLabel(item.actionDriver)}</span>
            )}
            {item.actionTimestamp && (
              <span className="timeline-chip muted">{new Date(item.actionTimestamp).toLocaleString()}</span>
            )}
          </div>
          <div className="today-action-label">{item.actionLabel}</div>
          {item.actionDetail && <div className="today-action-detail">{item.actionDetail}</div>}
        </div>
      )}
      {item.playbook && (
        <div className="op-card-detail">
          <div><ArrowRight size={12} /> {item.playbook.nextStep}</div>
        </div>
      )}
      <PreTradeChecklistBlock opportunity={item} compact />
      <ScoreExplanationBlock opportunity={item} compact />
      {item.suggestedMission && (
        <div className="today-meta">
          <span>{item.suggestedMission.mode}</span>
          <span>{item.suggestedMission.depth}</span>
          <span>{item.suggestedMission.query}</span>
        </div>
      )}
      {extraTemplates.length > 0 && (
        <div className="tc-tickers">
          {extraTemplates.map((template) => (
            <button
              key={`${item.id}_${template.id}`}
              type="button"
              className="secondary-btn"
              onClick={() => void onLaunchOpportunityAnalysis(item, template)}
            >
              {template.label}
            </button>
          ))}
        </div>
      )}
      <div className="tc-tickers">
        {item.inboxReasons.slice(0, 3).map((reason) => (
          <span key={`${item.id}_${reason.code}`} className="ticker-pill">{reason.label}</span>
        ))}
      </div>
      <MissionRecoveryPanel
        opportunity={item}
        busyActionKey={recoveringMissionActionKey}
        limit={3}
        onRecoverMission={onRecoverMission}
      />
      <div className="today-actions" style={{ marginTop: 10 }}>
        <button type="button" className="secondary-btn" onClick={() => onOpenOpportunity(item)}>
          详情 / 编辑
        </button>
        <button type="button" className="secondary-btn" onClick={() => void onExecutePrimaryAction(item, primaryAction)}>
          {primaryAction.label}
        </button>
        {item.latestMission && (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onOpenMission(item.latestMission!.id)}
            disabled={primaryAction.target === 'mission'}
          >
            查看任务
          </button>
        )}
      </div>
    </article>
  );
}
