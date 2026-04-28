import { RotateCw } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import {
  buildMissionRecoveryActions,
  recoveryStatusLabel,
  recoverySummary,
  type MissionRecoveryAction,
} from './recovery';

type MissionRecoveryPanelProps = {
  opportunity: OpportunitySummary;
  busyActionKey?: string | null;
  limit?: number;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
};

export function MissionRecoveryPanel({
  opportunity,
  busyActionKey,
  limit,
  onRecoverMission,
}: MissionRecoveryPanelProps) {
  const summary = recoverySummary(opportunity);
  if (!summary || !opportunity.latestMission) return null;

  const actions = buildMissionRecoveryActions(opportunity);
  const visibleActions = typeof limit === 'number' ? actions.slice(0, limit) : actions;
  const statusLabel = recoveryStatusLabel(opportunity.latestMission.status);

  return (
    <div className="mission-recovery-panel">
      <div className="mission-recovery-top">
        <span className="diff-chip changed">{statusLabel}</span>
        <strong>{summary.label}</strong>
      </div>
      <div className="mission-recovery-detail">{summary.detail}</div>
      <div className="mission-recovery-actions">
        {visibleActions.map((action) => {
          const busyKey = `${opportunity.id}:${action.id}`;
          const isBusy = busyActionKey === busyKey;
          return (
            <button
              key={action.id}
              type="button"
              className="secondary-btn tiny"
              onClick={() => onRecoverMission(opportunity, action)}
              disabled={Boolean(busyActionKey)}
              title={action.detail}
            >
              <RotateCw size={12} />
              {isBusy ? '处理中...' : action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
