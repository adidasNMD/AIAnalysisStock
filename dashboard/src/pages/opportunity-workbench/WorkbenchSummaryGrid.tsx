import { ArrowRight } from 'lucide-react';
import type {
  OpportunitySuggestedMission,
  OpportunitySummary,
} from '../../api';
import {
  typeMeta,
  type InboxLane,
  type OpportunityPrimaryAction,
  type WorkbenchPulse,
} from './model';

type WorkbenchSummaryStats = {
  total: number;
  ready: number;
  active: number;
};

type CoreStats = {
  running: number;
  pending: number;
};

type PulsePrimaryTarget = {
  opportunity: OpportunitySummary;
  action: OpportunityPrimaryAction;
} | null;

type WorkbenchSummaryGridProps = {
  summary: WorkbenchSummaryStats;
  coreStats: CoreStats;
  pulse: WorkbenchPulse;
  pulsePrimaryTarget: PulsePrimaryTarget;
  pulseSecondaryTemplates: OpportunitySuggestedMission[];
  onOpenCommandCenter: () => void;
  onFocusLane: (lane?: InboxLane | null) => void;
  onExecutePrimaryAction: (
    opportunity: OpportunitySummary,
    action: OpportunityPrimaryAction,
  ) => void | Promise<void>;
  onLaunchOpportunityAnalysis: (
    opportunity: OpportunitySummary,
    suggested?: OpportunitySuggestedMission,
  ) => void | Promise<void>;
};

export function WorkbenchSummaryGrid({
  summary,
  coreStats,
  pulse,
  pulsePrimaryTarget,
  pulseSecondaryTemplates,
  onOpenCommandCenter,
  onFocusLane,
  onExecutePrimaryAction,
  onLaunchOpportunityAnalysis,
}: WorkbenchSummaryGridProps) {
  return (
    <div className="opportunity-summary-grid">
      <div className="op-summary-card glass-panel">
        <span>Total</span>
        <strong>{summary.total}</strong>
        <small>已建机会卡</small>
      </div>
      <div className="op-summary-card glass-panel">
        <span>Ready</span>
        <strong>{summary.ready}</strong>
        <small>可继续验证</small>
      </div>
      <div className="op-summary-card glass-panel">
        <span>Active</span>
        <strong>{summary.active}</strong>
        <small>正在跟踪</small>
      </div>
      <div className="op-summary-card glass-panel">
        <span>Core</span>
        <strong>{coreStats.running}R / {coreStats.pending}Q</strong>
        <small>
          <button type="button" className="inline-link-btn" onClick={onOpenCommandCenter}>
            打开执行控制台 <ArrowRight size={12} />
          </button>
        </small>
      </div>
      <div className="op-summary-card pulse glass-panel">
        <span>Pulse</span>
        <strong>{pulse.label}</strong>
        <div className="op-summary-detail">{pulse.summary}</div>
        <div className="op-summary-chips">
          {pulse.chips.map((chip) => (
            <span key={chip} className="timeline-chip muted">{chip}</span>
          ))}
        </div>
        {pulsePrimaryTarget && (
          <div className="op-summary-target">
            <div className="op-summary-target-top">
              <span className="diff-chip stable">FOCUS</span>
              <span className="op-summary-target-title">{pulsePrimaryTarget.opportunity.title}</span>
            </div>
            <div className="op-summary-target-copy">
              当前默认动作是“{pulsePrimaryTarget.action.label}”，目标在 {typeMeta(pulsePrimaryTarget.opportunity.type).label}。
            </div>
          </div>
        )}
        {pulse.targetLane && pulse.actionLabel && (
          <div className="op-summary-actions">
            <button
              type="button"
              className="secondary-btn tiny"
              onClick={() => onFocusLane(pulse.targetLane)}
            >
              {pulse.actionLabel}
            </button>
            {pulsePrimaryTarget && (
              <button
                type="button"
                className="secondary-btn tiny"
                onClick={() => void onExecutePrimaryAction(pulsePrimaryTarget.opportunity, pulsePrimaryTarget.action)}
              >
                直接执行: {pulsePrimaryTarget.action.label}
              </button>
            )}
            {pulsePrimaryTarget && pulseSecondaryTemplates.map((template) => (
              <button
                key={`${pulsePrimaryTarget.opportunity.id}_${template.id}`}
                type="button"
                className="secondary-btn tiny"
                onClick={() => void onLaunchOpportunityAnalysis(pulsePrimaryTarget.opportunity, template)}
              >
                备选: {template.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
