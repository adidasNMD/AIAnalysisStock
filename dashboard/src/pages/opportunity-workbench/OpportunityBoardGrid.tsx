import type {
  OpportunityBoardHealthMap,
  OpportunityBoardType,
  OpportunitySummary,
  OpportunitySuggestedMission,
} from '../../api';
import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';
import { BOARD_TYPES, type BoardFilterState, type BoardLiveSignal } from './model';
import { BoardColumn } from './BoardColumn';
import type { MissionRecoveryAction } from './recovery';

type OpportunityBoardGridProps = {
  groups: Record<OpportunityBoardType, OpportunitySummary[]>;
  boardHealthMap: OpportunityBoardHealthMap;
  boardLiveSignals: Record<OpportunityBoardType, BoardLiveSignal | null>;
  activeBoardFilters: BoardFilterState;
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

export function OpportunityBoardGrid({
  groups,
  boardHealthMap,
  boardLiveSignals,
  activeBoardFilters,
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
}: OpportunityBoardGridProps) {
  return (
    <div className="op-board-grid">
      {BOARD_TYPES.map((type) => (
        <BoardColumn
          key={type}
          type={type}
          items={groups[type]}
          boardHealth={boardHealthMap[type]}
          boardLiveSignal={boardLiveSignals[type]}
          activeMetricKey={activeBoardFilters[type]}
          streamedEvents={streamedEvents}
          liveNow={liveNow}
          automationAction={automationAction}
          recoveringMissionActionKey={recoveringMissionActionKey}
          onToggleBoardFilter={onToggleBoardFilter}
          onClearBoardFilter={onClearBoardFilter}
          onRunRadarRefresh={onRunRadarRefresh}
          onOpenOpportunity={onOpenOpportunity}
          onRecoverMission={onRecoverMission}
          onLaunchOpportunityAnalysis={onLaunchOpportunityAnalysis}
          onOpenMission={onOpenMission}
          onOpenCommandCenter={onOpenCommandCenter}
        />
      ))}
    </div>
  );
}
