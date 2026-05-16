import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import type { MissionRecoveryActionFeedback } from './mission-actions';
import {
  buildMissionRecoveryActions,
  buildMissionRecoveryMeta,
  missionRecoveryFeedbackAutoDismissLabel,
  missionRecoveryDiagnosis,
  prioritizeMissionRecoveryActions,
  recoveryActionGuidance,
  recoveryStatusLabel,
  recoverySummary,
  type MissionRecoveryAction,
} from './recovery';

type MissionRecoveryPanelProps = {
  opportunity: OpportunitySummary;
  actionFeedback?: MissionRecoveryActionFeedback | null;
  busyActionKey?: string | null;
  limit?: number;
  compact?: boolean;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onOpenMission?: (missionId: string) => void;
};

export function MissionRecoveryPanel({
  opportunity,
  actionFeedback,
  busyActionKey,
  limit,
  compact = false,
  onRecoverMission,
  onOpenMission,
}: MissionRecoveryPanelProps) {
  const summary = recoverySummary(opportunity);
  const panelFeedback = actionFeedback?.opportunityId === opportunity.id ? actionFeedback : null;
  if ((!summary || !opportunity.latestMission) && !panelFeedback) return null;

  const statusLabel = opportunity.latestMission ? recoveryStatusLabel(opportunity.latestMission.status) : null;
  const metaItems = summary && opportunity.latestMission ? buildMissionRecoveryMeta(opportunity) : [];
  const guidance = summary && opportunity.latestMission ? recoveryActionGuidance(opportunity) : null;
  const diagnosis = summary && opportunity.latestMission ? missionRecoveryDiagnosis(opportunity) : null;
  const actions = summary && opportunity.latestMission
    ? prioritizeMissionRecoveryActions(buildMissionRecoveryActions(opportunity), diagnosis?.primaryActionId)
    : [];
  const metaLimit = compact ? 2 : 5;
  const visibleActions = typeof limit === 'number' ? actions.slice(0, limit) : actions;
  const FeedbackIcon = panelFeedback?.status === 'success'
    ? CheckCircle2
    : panelFeedback?.status === 'error'
      ? AlertTriangle
      : Loader2;
  const autoDismissLabel = missionRecoveryFeedbackAutoDismissLabel(panelFeedback?.expiresAt);

  return (
    <div className={`mission-recovery-panel ${compact ? 'compact' : ''} ${panelFeedback ? `has-inline-feedback ${panelFeedback.status}` : ''}`}>
      {summary && statusLabel && (
        <>
          <div className="mission-recovery-top">
            <span className="diff-chip changed">{statusLabel}</span>
            <strong>{summary.label}</strong>
          </div>
          <div className="mission-recovery-detail">{summary.detail}</div>
        </>
      )}
      {metaItems.length > 0 && (
        <div className="mission-recovery-meta-row">
          {metaItems.slice(0, metaLimit).map((item) => (
            <span
              key={`${item.label}:${item.value}`}
              className={`mission-recovery-chip ${item.tone || 'info'}`}
              title={item.detail || item.value}
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
      {diagnosis && (
        <div
          className={`mission-recovery-diagnosis ${diagnosis.tone}`}
          data-mission-recovery-diagnosis={diagnosis.primaryActionId}
        >
          <div>
            <span>{diagnosis.label}</span>
            <strong>{diagnosis.primaryActionLabel}</strong>
          </div>
          {!compact && <p>{diagnosis.detail}</p>}
          {!compact && diagnosis.serviceHint && <em>{diagnosis.serviceHint}</em>}
        </div>
      )}
      {!compact && guidance && <div className="mission-recovery-guidance">{guidance}</div>}
      {panelFeedback && (
        <div className={`mission-recovery-inline-feedback ${panelFeedback.status}`} role="status" aria-live="polite">
          <FeedbackIcon size={14} className={panelFeedback.status === 'pending' ? 'spin' : undefined} />
          <div className="mission-recovery-inline-copy">
            <strong>{panelFeedback.label}</strong>
            <span>{panelFeedback.detail}</span>
            {panelFeedback.suggestionDetail && (
              <span className={`mission-recovery-inline-suggestion ${panelFeedback.suggestionTone || 'warning'}`}>
                建议：{panelFeedback.suggestionLabel ? `${panelFeedback.suggestionLabel}，` : ''}
                {panelFeedback.suggestionDetail}
              </span>
            )}
            {autoDismissLabel && (
              <span className="mission-recovery-inline-expiry">{autoDismissLabel}</span>
            )}
          </div>
          {panelFeedback.missionId && onOpenMission && (
            <button
              type="button"
              className="secondary-btn tiny"
              onClick={() => onOpenMission(panelFeedback.missionId!)}
            >
              查看任务
            </button>
          )}
        </div>
      )}
      {visibleActions.length > 0 && (
        <div className="mission-recovery-actions">
          {visibleActions.map((action) => {
            const busyKey = `${opportunity.id}:${action.id}`;
            const isBusy = busyActionKey === busyKey;
            return (
              <button
                key={action.id}
                type="button"
                className={`secondary-btn tiny ${diagnosis?.primaryActionId === action.id ? 'recommended' : ''}`}
                onClick={() => onRecoverMission(opportunity, action)}
                disabled={Boolean(busyActionKey)}
                title={action.costHint ? `${action.detail} ${action.costHint.detail}` : action.detail}
                data-mission-recovery-action-id={action.id}
                data-mission-recovery-recommended={diagnosis?.primaryActionId === action.id ? 'true' : 'false'}
              >
                <RotateCw size={12} />
                <span className="mission-recovery-action-copy">
                  <span>{isBusy ? '处理中...' : action.label}</span>
                  {action.costHint && (
                    <small className={`mission-recovery-action-cost ${action.costHint.tier}`}>
                      {action.costHint.label} · {action.costHint.estimate}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
