import { ExternalLink, PlayCircle, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OpportunitySummary, OpportunitySuggestedMission, UpdateOpportunityInput } from '../../api';
import {
  buildOpportunityUpdateInput,
  createOpportunityEditDraft,
  validateOpportunityEditDraft,
  type OpportunityEditDraft,
} from './edit-state';
import { CatalystReminderStrip } from './CatalystReminderStrip';
import { statusTone, typeMeta } from './model';
import { CatalystList } from './CatalystList';
import { IpoEvidenceBlock } from './IpoEvidenceBlock';
import { MissionRecoveryPanel } from './MissionRecoveryPanel';
import { MissionStatusBlock } from './MissionStatusBlock';
import { OpportunityTimelineBlock } from './OpportunityTimelineBlock';
import { PreTradeChecklistBlock } from './PreTradeChecklistBlock';
import { ScoreExplanationBlock } from './ScoreExplanationBlock';
import type { MissionRecoveryAction } from './recovery';

const STAGES: OpportunitySummary['stage'][] = [
  'radar',
  'framing',
  'tracking',
  'ready',
  'active',
  'cooldown',
  'archived',
];

const STATUSES: OpportunitySummary['status'][] = [
  'watching',
  'ready',
  'active',
  'degraded',
  'archived',
];

type OpportunityDetailDrawerProps = {
  opportunity: OpportunitySummary | null;
  saving: boolean;
  error: string | null;
  now: number;
  recoveringMissionActionKey?: string | null;
  onClose: () => void;
  onSave: (opportunity: OpportunitySummary, input: UpdateOpportunityInput) => Promise<void>;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => void;
  onOpenMission: (missionId: string) => void;
};

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="drawer-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="drawer-field wide">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} />
    </label>
  );
}

export function OpportunityDetailDrawer({
  opportunity,
  saving,
  error,
  now,
  recoveringMissionActionKey,
  onClose,
  onSave,
  onRecoverMission,
  onLaunchOpportunityAnalysis,
  onOpenMission,
}: OpportunityDetailDrawerProps) {
  const [draft, setDraft] = useState<OpportunityEditDraft | null>(() => (
    opportunity ? createOpportunityEditDraft(opportunity) : null
  ));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(opportunity ? createOpportunityEditDraft(opportunity) : null);
    setLocalError(null);
  }, [opportunity]);

  if (!opportunity || !draft) return null;

  const meta = typeMeta(opportunity.type);
  const Icon = meta.icon;

  const updateDraft = (patch: Partial<OpportunityEditDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setLocalError(null);
  };

  const handleSave = async () => {
    const validationError = validateOpportunityEditDraft(draft);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    await onSave(opportunity, buildOpportunityUpdateInput(opportunity, draft));
  };

  return (
    <div className="opportunity-drawer-shell" role="presentation" onMouseDown={onClose}>
      <aside
        className="opportunity-drawer glass-panel"
        role="dialog"
        aria-modal="true"
        aria-label="机会详情"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title-block">
            <div className="drawer-kicker">
              <span className={`consensus-badge ${statusTone(opportunity.status)}`}>
                <Icon size={13} /> {meta.label}
              </span>
              <span className="timeline-chip muted">{opportunity.stage} / {opportunity.status}</span>
            </div>
            <h2>{opportunity.title}</h2>
            <p>{opportunity.whyNowSummary || opportunity.thesis || opportunity.query}</p>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭详情">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-actions">
          <button type="button" className="secondary-btn" onClick={() => void handleSave()} disabled={saving}>
            <Save size={14} />
            {saving ? '保存中...' : '保存修改'}
          </button>
          <button
            type="button"
            onClick={() => onLaunchOpportunityAnalysis(opportunity)}
            disabled={saving}
          >
            <PlayCircle size={14} />
            发起分析
          </button>
          {opportunity.latestMission && (
            <button type="button" className="secondary-btn" onClick={() => onOpenMission(opportunity.latestMission!.id)}>
              <ExternalLink size={14} />
              查看任务
            </button>
          )}
        </div>

        {(localError || error) && (
          <div className="drawer-error">{localError || error}</div>
        )}

        <div className="drawer-content">
          <section className="drawer-edit-section">
            <div className="drawer-section-title">Core</div>
            <div className="drawer-form-grid">
              <TextField label="Title" value={draft.title} onChange={(title) => updateDraft({ title })} />
              <TextField label="Query" value={draft.query} onChange={(query) => updateDraft({ query })} />
              <label className="drawer-field">
                <span>Stage</span>
                <select
                  value={draft.stage}
                  onChange={(event) => updateDraft({ stage: event.target.value as OpportunitySummary['stage'] })}
                >
                  {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </label>
              <label className="drawer-field">
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={(event) => updateDraft({ status: event.target.value as OpportunitySummary['status'] })}
                >
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <TextAreaField label="Thesis" value={draft.thesis} onChange={(thesis) => updateDraft({ thesis })} rows={3} />
              <TextAreaField label="Summary" value={draft.summary} onChange={(summary) => updateDraft({ summary })} rows={2} />
            </div>

            <div className="drawer-section-title">Tickers</div>
            <div className="drawer-form-grid">
              <TextField label="Primary" value={draft.primaryTicker} onChange={(primaryTicker) => updateDraft({ primaryTicker })} />
              <TextField label="Leader" value={draft.leaderTicker} onChange={(leaderTicker) => updateDraft({ leaderTicker })} />
              <TextField label="Proxy" value={draft.proxyTicker} onChange={(proxyTicker) => updateDraft({ proxyTicker })} />
              <TextField label="Related" value={draft.relatedTickersText} onChange={(relatedTickersText) => updateDraft({ relatedTickersText })} placeholder="NVDA, MU" />
              <TextField label="Relay" value={draft.relayTickersText} onChange={(relayTickersText) => updateDraft({ relayTickersText })} placeholder="AAOI, CLS" />
            </div>

            <div className="drawer-section-title">Catalyst</div>
            <div className="drawer-form-grid">
              <TextField label="Next catalyst" value={draft.nextCatalystAt} onChange={(nextCatalystAt) => updateDraft({ nextCatalystAt })} />
              <TextField label="Supply" value={draft.supplyOverhang} onChange={(supplyOverhang) => updateDraft({ supplyOverhang })} />
              <TextField label="Policy" value={draft.policyStatus} onChange={(policyStatus) => updateDraft({ policyStatus })} />
            </div>

            {opportunity.type === 'ipo_spinout' && (
              <>
                <div className="drawer-section-title">IPO</div>
                <div className="drawer-form-grid">
                  <TextField label="Trading date" value={draft.officialTradingDate} onChange={(officialTradingDate) => updateDraft({ officialTradingDate })} />
                  <TextField label="Spinout date" value={draft.spinoutDate} onChange={(spinoutDate) => updateDraft({ spinoutDate })} />
                  <TextField label="Retained stake %" value={draft.retainedStakePercentText} onChange={(retainedStakePercentText) => updateDraft({ retainedStakePercentText })} />
                  <TextField label="Lockup" value={draft.lockupDate} onChange={(lockupDate) => updateDraft({ lockupDate })} />
                  <TextField label="Greenshoe" value={draft.greenshoeStatus} onChange={(greenshoeStatus) => updateDraft({ greenshoeStatus })} />
                  <TextField label="First earnings" value={draft.firstIndependentEarningsAt} onChange={(firstIndependentEarningsAt) => updateDraft({ firstIndependentEarningsAt })} />
                  <TextField label="First coverage" value={draft.firstCoverageAt} onChange={(firstCoverageAt) => updateDraft({ firstCoverageAt })} />
                </div>
              </>
            )}
          </section>

          <section className="drawer-context-section">
            <div className="drawer-section-title">Context</div>
            <CatalystReminderStrip
              opportunity={opportunity}
              now={now}
              compact
              onOpenOpportunity={() => undefined}
              onLaunchOpportunityAnalysis={(target) => onLaunchOpportunityAnalysis(target)}
            />
            <PreTradeChecklistBlock opportunity={opportunity} />
            <div className="drawer-score-grid">
              <div><span>Purity</span><strong>{opportunity.scores.purityScore}</strong></div>
              <div><span>Scarcity</span><strong>{opportunity.scores.scarcityScore}</strong></div>
              <div><span>Relay</span><strong>{opportunity.scores.relayScore}</strong></div>
              <div><span>Catalyst</span><strong>{opportunity.scores.catalystScore}</strong></div>
            </div>
            <ScoreExplanationBlock opportunity={opportunity} />
            <CatalystList items={opportunity.catalystCalendar} />
            {opportunity.type === 'ipo_spinout' && <IpoEvidenceBlock profile={opportunity.ipoProfile} />}
            <MissionStatusBlock mission={opportunity.latestMission} diff={opportunity.latestDiff} />
            <MissionRecoveryPanel
              opportunity={opportunity}
              busyActionKey={recoveringMissionActionKey}
              onRecoverMission={onRecoverMission}
            />
            <OpportunityTimelineBlock entries={opportunity.recentActionTimeline} />
          </section>
        </div>
      </aside>
    </div>
  );
}
