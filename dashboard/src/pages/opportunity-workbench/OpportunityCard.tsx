import { ArrowRight } from 'lucide-react';
import type { OpportunitySummary, OpportunitySuggestedMission } from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import { buildExtraTemplates, buildLiveRankBadge } from './live';
import { buildBoardPrimaryAction, buildBoardPriorityReason } from './selectors';
import { CatalystList } from './CatalystList';
import { IpoEvidenceBlock } from './IpoEvidenceBlock';
import { MissionStatusBlock } from './MissionStatusBlock';
import { MissionRecoveryPanel } from './MissionRecoveryPanel';
import { OpportunityCardHeader } from './OpportunityCardHeader';
import { OpportunityPlaybookBlock } from './OpportunityPlaybookBlock';
import { PreTradeChecklistBlock } from './PreTradeChecklistBlock';
import { ScoreExplanationBlock } from './ScoreExplanationBlock';
import { OpportunityStatusNotes } from './OpportunityStatusNotes';
import { OpportunityTickerBlock } from './OpportunityTickerBlock';
import { OpportunityTimelineBlock } from './OpportunityTimelineBlock';
import { ProxyScoreBlock } from './ProxyScoreBlock';
import { RelayProfileBlock } from './RelayProfileBlock';
import { SuggestedMissionsBlock } from './SuggestedMissionsBlock';
import type { MissionRecoveryAction } from './recovery';

type OpportunityCardProps = {
  opportunity: OpportunitySummary;
  activeMetricKey?: string | null;
  rank: number;
  liveNow: number;
  livePriorityEvent?: OpportunityStreamEvent | null;
  recoveringMissionActionKey?: string | null;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => void;
  onOpenMission: (missionId: string) => void;
  onOpenCommandCenter: () => void;
};

export function OpportunityCard({
  opportunity,
  activeMetricKey,
  rank,
  liveNow,
  livePriorityEvent,
  recoveringMissionActionKey,
  onOpenOpportunity,
  onRecoverMission,
  onLaunchOpportunityAnalysis,
  onOpenMission,
  onOpenCommandCenter,
}: OpportunityCardProps) {
  const priorityReason = activeMetricKey ? buildBoardPriorityReason(opportunity, activeMetricKey, rank) : null;
  const primaryAction = buildBoardPrimaryAction(opportunity, activeMetricKey);
  const liveRankBadge = buildLiveRankBadge(livePriorityEvent, rank, liveNow);
  const extraTemplates = buildExtraTemplates(opportunity, primaryAction.template?.id, 2);

  return (
    <article
      key={opportunity.id}
      className={`op-card ${liveRankBadge ? 'live-ranked' : ''} ${liveRankBadge?.state || ''}`}
    >
      <OpportunityCardHeader
        opportunity={opportunity}
        liveNow={liveNow}
        livePriorityEvent={livePriorityEvent}
        liveRankBadge={liveRankBadge}
        priorityReason={priorityReason}
      />
      <OpportunityPlaybookBlock opportunity={opportunity} />
      <PreTradeChecklistBlock opportunity={opportunity} compact />
      <ScoreExplanationBlock opportunity={opportunity} compact />
      <SuggestedMissionsBlock opportunity={opportunity} />
      {opportunity.latestOpportunityDiff && (
        <div className="today-diff">
          <span className={`diff-chip ${opportunity.latestOpportunityDiff.changed ? 'changed' : 'stable'}`}>
            {opportunity.latestOpportunityDiff.changed ? `THESIS ${opportunity.latestOpportunityDiff.changeCount}` : 'THESIS STABLE'}
          </span>
          <span className="today-diff-summary">{opportunity.latestOpportunityDiff.summary}</span>
        </div>
      )}
      <div className="today-meta">
        {opportunity.primaryTicker && <span>Primary {opportunity.primaryTicker}</span>}
        {opportunity.leaderTicker && <span>Leader {opportunity.leaderTicker}</span>}
        {opportunity.proxyTicker && <span>Proxy {opportunity.proxyTicker}</span>}
      </div>
      <RelayProfileBlock opportunity={opportunity} />
      <ProxyScoreBlock opportunity={opportunity} />
      <CatalystList items={opportunity.catalystCalendar} />
      {opportunity.type === 'ipo_spinout' && <IpoEvidenceBlock profile={opportunity.ipoProfile} />}
      <OpportunityTickerBlock opportunity={opportunity} />
      <OpportunityStatusNotes opportunity={opportunity} />
      <MissionStatusBlock mission={opportunity.latestMission} diff={opportunity.latestDiff} />
      <MissionRecoveryPanel
        opportunity={opportunity}
        busyActionKey={recoveringMissionActionKey}
        limit={3}
        onRecoverMission={onRecoverMission}
      />
      <OpportunityTimelineBlock entries={opportunity.recentActionTimeline} />
      {opportunity.playbook && (
        <div className="op-card-detail">
          <div><ArrowRight size={12} /> {opportunity.playbook.nextStep}</div>
        </div>
      )}
      <div className="op-card-actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onOpenOpportunity(opportunity)}
        >
          详情 / 编辑
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onLaunchOpportunityAnalysis(opportunity, primaryAction.template || undefined)}
        >
          {primaryAction.label}
        </button>
        {extraTemplates.map((template) => (
          <button
            key={`${opportunity.id}_action_${template.id}`}
            type="button"
            className="secondary-btn"
            onClick={() => onLaunchOpportunityAnalysis(opportunity, template)}
          >
            {template.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => opportunity.latestMission ? onOpenMission(opportunity.latestMission.id) : onOpenCommandCenter()}
        >
          {opportunity.latestMission ? '查看任务' : '去控制台'}
        </button>
      </div>
    </article>
  );
}
