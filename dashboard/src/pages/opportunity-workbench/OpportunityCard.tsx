import { lazy, Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import type { OpportunitySummary, OpportunitySuggestedMission } from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import { buildExtraTemplates, buildLiveRankBadge } from './live';
import { buildBoardPrimaryAction, buildBoardPriorityReason } from './selectors';
import { CatalystList } from './CatalystList';
import { IpoEvidenceBlock } from './IpoEvidenceBlock';
import { MissionStatusBlock } from './MissionStatusBlock';
import { OpportunityCardHeader } from './OpportunityCardHeader';
import { OpportunitySearchMatchBlock } from './OpportunitySearchMatchBlock';
import { OpportunityPlaybookBlock } from './OpportunityPlaybookBlock';
import { PreTradeChecklistBlock } from './PreTradeChecklistBlock';
import { ScoreExplanationBlock } from './ScoreExplanationBlock';
import { OpportunityStatusNotes } from './OpportunityStatusNotes';
import { OpportunityTickerBlock } from './OpportunityTickerBlock';
import { OpportunityTimelineBlock } from './OpportunityTimelineBlock';
import { ProxyScoreBlock } from './ProxyScoreBlock';
import { RelayProfileBlock } from './RelayProfileBlock';
import { SuggestedMissionsBlock } from './SuggestedMissionsBlock';
import { preloadOpportunityDetailDrawer } from './detail-drawer-loader';
import type { MissionRecoveryActionFeedback } from './mission-actions';
import type { MissionRecoveryAction } from './recovery';
import type { WorkbenchSearchMatch } from './view-state';

const MissionRecoveryPanel = lazy(() => (
  import('./MissionRecoveryPanel').then((module) => ({ default: module.MissionRecoveryPanel }))
));

type OpportunityCardProps = {
  opportunity: OpportunitySummary;
  density?: 'standard' | 'dense';
  activeMetricKey?: string | null;
  rank: number;
  liveNow: number;
  livePriorityEvent?: OpportunityStreamEvent | null;
  searchMatch?: WorkbenchSearchMatch | null;
  missionRecoveryActionFeedback?: MissionRecoveryActionFeedback | null;
  recoveringMissionActionKey?: string | null;
  onOpenOpportunity: (opportunity: OpportunitySummary) => void;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => void;
  onOpenMission: (missionId: string) => void;
  onOpenCommandCenter: () => void;
};

export function OpportunityCard({
  opportunity,
  density = 'standard',
  activeMetricKey,
  rank,
  liveNow,
  livePriorityEvent,
  searchMatch,
  missionRecoveryActionFeedback,
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
  const isDense = density === 'dense';
  const extraTemplates = buildExtraTemplates(opportunity, primaryAction.template?.id, isDense ? 1 : 2);
  const showMissionRecoveryPanel = opportunity.latestMission?.status === 'failed'
    || opportunity.latestMission?.status === 'canceled'
    || missionRecoveryActionFeedback?.opportunityId === opportunity.id;

  return (
    <article
      key={opportunity.id}
      className={`op-card ${isDense ? 'dense' : ''} ${liveRankBadge ? 'live-ranked' : ''} ${liveRankBadge?.state || ''}`}
      data-opportunity-id={opportunity.id}
    >
      <OpportunityCardHeader
        opportunity={opportunity}
        liveNow={liveNow}
        livePriorityEvent={livePriorityEvent}
        liveRankBadge={liveRankBadge}
        priorityReason={priorityReason}
      />
      <OpportunitySearchMatchBlock match={searchMatch} />
      <OpportunityPlaybookBlock opportunity={opportunity} checklistLimit={isDense ? 1 : 3} summaryOnly={isDense} />
      <PreTradeChecklistBlock opportunity={opportunity} compact itemLimit={isDense ? 2 : 3} summaryOnly={isDense} />
      <ScoreExplanationBlock opportunity={opportunity} compact factorLimit={isDense ? 2 : 3} summaryOnly={isDense} />
      {!isDense && <SuggestedMissionsBlock opportunity={opportunity} limit={3} />}
      {!isDense && opportunity.latestOpportunityDiff && (
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
      <CatalystList items={opportunity.catalystCalendar} limit={isDense ? 1 : 2} />
      {!isDense && (
        <>
          <RelayProfileBlock opportunity={opportunity} />
          <ProxyScoreBlock opportunity={opportunity} />
          {opportunity.type === 'ipo_spinout' && <IpoEvidenceBlock profile={opportunity.ipoProfile} />}
          <OpportunityTickerBlock opportunity={opportunity} />
          <OpportunityStatusNotes opportunity={opportunity} />
        </>
      )}
      <MissionStatusBlock mission={opportunity.latestMission} diff={opportunity.latestDiff} />
      {showMissionRecoveryPanel && (
        <Suspense fallback={null}>
          <MissionRecoveryPanel
            opportunity={opportunity}
            actionFeedback={missionRecoveryActionFeedback}
            busyActionKey={recoveringMissionActionKey}
            limit={isDense ? 1 : 3}
            compact={isDense}
            onRecoverMission={onRecoverMission}
            onOpenMission={onOpenMission}
          />
        </Suspense>
      )}
      {!isDense && <OpportunityTimelineBlock entries={opportunity.recentActionTimeline} limit={3} />}
      {!isDense && opportunity.playbook && (
        <div className="op-card-detail">
          <div><ArrowRight size={12} /> {opportunity.playbook.nextStep}</div>
        </div>
      )}
      <div className="op-card-actions">
        <button
          type="button"
          className="secondary-btn"
          data-opportunity-action="details"
          onFocus={preloadOpportunityDetailDrawer}
          onMouseEnter={preloadOpportunityDetailDrawer}
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
