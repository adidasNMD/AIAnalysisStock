import { ExternalLink, PlayCircle, Save, X } from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type {
  CatalystReminderPreferenceAudit,
  InvalidateOpportunityFieldEvidenceInput,
  OpportunityEvent,
  OpportunityFieldEvidenceBatchAudit,
  OpportunityFieldEvidenceAudit,
  OpportunitySummary,
  OpportunitySuggestedMission,
  PreTradeConfirmationAudit,
  RecordOpportunityFieldEvidenceBatchInput,
  RecordOpportunityFieldEvidenceInput,
  RestoreOpportunityFieldEvidenceInput,
  UpdateOpportunityInput,
} from '../../api';
import { fetchOpportunityEventsForOpportunity } from '../../api';
import {
  buildOpportunityUpdateInput,
  createOpportunityEditDraft,
  validateOpportunityEditDraft,
  type OpportunityEditDraft,
} from './edit-state';
import { statusTone, typeMeta } from './model';
import { CatalystReminderAuditTrailBlock } from './CatalystReminderAuditTrailBlock';
import { CatalystList } from './CatalystList';
import { IpoEvidenceBlock } from './IpoEvidenceBlock';
import { MissionStatusBlock } from './MissionStatusBlock';
import { OpportunityTimelineBlock } from './OpportunityTimelineBlock';
import { PreTradeAuditTrailBlock } from './PreTradeAuditTrailBlock';
import { PreTradeChecklistBlock } from './PreTradeChecklistBlock';
import { ScoreExplanationBlock } from './ScoreExplanationBlock';
import { SourceProvenanceBlock } from './SourceProvenanceBlock';
import type { MissionRecoveryActionFeedback } from './mission-actions';
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

const FieldEvidencePanel = lazy(() => (
  import('./FieldEvidencePanel').then((module) => ({ default: module.FieldEvidencePanel }))
));

const MissionRecoveryPanel = lazy(() => (
  import('./MissionRecoveryPanel').then((module) => ({ default: module.MissionRecoveryPanel }))
));

const CatalystReminderStrip = lazy(() => (
  import('./CatalystReminderStrip').then((module) => ({ default: module.CatalystReminderStrip }))
));

type OpportunityDetailDrawerProps = {
  opportunity: OpportunitySummary | null;
  saving: boolean;
  error: string | null;
  now: number;
  missionRecoveryActionFeedback?: MissionRecoveryActionFeedback | null;
  recoveringMissionActionKey?: string | null;
  onClose: () => void;
  onSave: (opportunity: OpportunitySummary, input: UpdateOpportunityInput) => Promise<void>;
  onRecoverMission: (opportunity: OpportunitySummary, action: MissionRecoveryAction) => void;
  onLaunchOpportunityAnalysis: (opportunity: OpportunitySummary, suggested?: OpportunitySuggestedMission) => void;
  onOpenMission: (missionId: string) => void;
  onRecordFieldEvidence: (
    opportunity: OpportunitySummary,
    input: RecordOpportunityFieldEvidenceInput,
  ) => Promise<OpportunityFieldEvidenceAudit | null>;
  onRecordFieldEvidenceBatch: (
    opportunity: OpportunitySummary,
    input: RecordOpportunityFieldEvidenceBatchInput,
  ) => Promise<OpportunityFieldEvidenceBatchAudit | null>;
  onInvalidateFieldEvidence: (
    opportunity: OpportunitySummary,
    evidenceId: string,
    input: InvalidateOpportunityFieldEvidenceInput,
  ) => Promise<OpportunityFieldEvidenceAudit | null>;
  onRestoreFieldEvidence: (
    opportunity: OpportunitySummary,
    evidenceId: string,
    input: RestoreOpportunityFieldEvidenceInput,
  ) => Promise<OpportunityFieldEvidenceAudit | null>;
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
  missionRecoveryActionFeedback,
  recoveringMissionActionKey,
  onClose,
  onSave,
  onRecoverMission,
  onLaunchOpportunityAnalysis,
  onOpenMission,
  onRecordFieldEvidence,
  onRecordFieldEvidenceBatch,
  onInvalidateFieldEvidence,
  onRestoreFieldEvidence,
}: OpportunityDetailDrawerProps) {
  const [draft, setDraft] = useState<OpportunityEditDraft | null>(() => (
    opportunity ? createOpportunityEditDraft(opportunity) : null
  ));
  const [localError, setLocalError] = useState<string | null>(null);
  const [preTradeAuditEvents, setPreTradeAuditEvents] = useState<OpportunityEvent[]>([]);
  const [remotePreTradeAuditEvents, setRemotePreTradeAuditEvents] = useState<OpportunityEvent[]>([]);
  const [catalystAuditEvents, setCatalystAuditEvents] = useState<OpportunityEvent[]>([]);
  const [remoteCatalystAuditEvents, setRemoteCatalystAuditEvents] = useState<OpportunityEvent[]>([]);
  const [fieldEvidenceAuditEvents, setFieldEvidenceAuditEvents] = useState<OpportunityEvent[]>([]);
  const [remoteFieldEvidenceAuditEvents, setRemoteFieldEvidenceAuditEvents] = useState<OpportunityEvent[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const opportunityId = opportunity?.id;
  const drawerReady = Boolean(opportunityId && draft);

  useEffect(() => {
    setDraft(opportunity ? createOpportunityEditDraft(opportunity) : null);
    setLocalError(null);
  }, [opportunity]);

  useEffect(() => {
    setPreTradeAuditEvents([]);
    setRemotePreTradeAuditEvents([]);
    setCatalystAuditEvents([]);
    setRemoteCatalystAuditEvents([]);
    setFieldEvidenceAuditEvents([]);
    setRemoteFieldEvidenceAuditEvents([]);
  }, [opportunityId]);

  useEffect(() => {
    if (!opportunityId) return undefined;
    let active = true;

    fetchOpportunityEventsForOpportunity(opportunityId, {
      limit: 25,
      types: ['pretrade_confirmed', 'pretrade_unconfirmed'],
    }).then((events) => {
      if (active) setRemotePreTradeAuditEvents(events);
    }).catch(() => {
      if (active) setRemotePreTradeAuditEvents([]);
    });

    fetchOpportunityEventsForOpportunity(opportunityId, {
      limit: 60,
      types: ['field_evidence_recorded', 'field_evidence_invalidated', 'field_evidence_restored'],
    }).then((events) => {
      if (active) setRemoteFieldEvidenceAuditEvents(events);
    }).catch(() => {
      if (active) setRemoteFieldEvidenceAuditEvents([]);
    });

    fetchOpportunityEventsForOpportunity(opportunityId, {
      limit: 25,
      types: ['catalyst_reminder_updated'],
    }).then((events) => {
      if (active) setRemoteCatalystAuditEvents(events);
    }).catch(() => {
      if (active) setRemoteCatalystAuditEvents([]);
    });

    return () => {
      active = false;
    };
  }, [opportunityId]);

  useEffect(() => {
    if (!drawerReady) return undefined;

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerReady, onClose, opportunityId]);

  if (!opportunity || !draft) return null;

  const meta = typeMeta(opportunity.type);
  const Icon = meta.icon;
  const showMissionRecoveryPanel = opportunity.latestMission?.status === 'failed'
    || opportunity.latestMission?.status === 'canceled'
    || missionRecoveryActionFeedback?.opportunityId === opportunity.id;

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

  const handlePreTradeAuditRecorded = (audit: PreTradeConfirmationAudit) => {
    setPreTradeAuditEvents((current) => [
      audit.event,
      ...current.filter((event) => event.id !== audit.event.id),
    ].slice(0, 5));
  };

  const handleCatalystReminderAuditRecorded = (audit: CatalystReminderPreferenceAudit) => {
    setCatalystAuditEvents((current) => [
      audit.event,
      ...current.filter((event) => event.id !== audit.event.id),
    ].slice(0, 8));
  };

  const handleFieldEvidenceAuditRecorded = (audit: OpportunityFieldEvidenceAudit | null) => {
    if (!audit?.event) return;
    setFieldEvidenceAuditEvents((current) => [
      audit.event,
      ...current.filter((event) => event.id !== audit.event.id),
    ].slice(0, 12));
  };

  const handleRecordFieldEvidence = async (input: RecordOpportunityFieldEvidenceInput) => {
    const audit = await onRecordFieldEvidence(opportunity, input);
    handleFieldEvidenceAuditRecorded(audit);
    return audit;
  };

  const handleRecordFieldEvidenceBatch = async (input: RecordOpportunityFieldEvidenceBatchInput) => {
    const audit = await onRecordFieldEvidenceBatch(opportunity, input);
    if (audit?.items) {
      setFieldEvidenceAuditEvents((current) => [
        ...audit.items
          .map((item) => item.event)
          .filter((event): event is OpportunityEvent => Boolean(event)),
        ...current,
      ].filter((event, index, events) => (
        events.findIndex((candidate) => candidate.id === event.id) === index
      )).slice(0, 12));
    }
    return audit;
  };

  const handleInvalidateFieldEvidence = async (
    evidenceId: string,
    input: InvalidateOpportunityFieldEvidenceInput,
  ) => {
    const audit = await onInvalidateFieldEvidence(opportunity, evidenceId, input);
    handleFieldEvidenceAuditRecorded(audit);
    return audit;
  };

  const handleRestoreFieldEvidence = async (
    evidenceId: string,
    input: RestoreOpportunityFieldEvidenceInput,
  ) => {
    const audit = await onRestoreFieldEvidence(opportunity, evidenceId, input);
    handleFieldEvidenceAuditRecorded(audit);
    return audit;
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
          <button
            ref={closeButtonRef}
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="关闭详情"
          >
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
            <Suspense fallback={null}>
              <CatalystReminderStrip
                opportunity={opportunity}
                now={now}
                compact
                onOpenOpportunity={() => undefined}
                onLaunchOpportunityAnalysis={(target) => onLaunchOpportunityAnalysis(target)}
                onPreferenceRecorded={handleCatalystReminderAuditRecorded}
              />
            </Suspense>
            <CatalystReminderAuditTrailBlock
              opportunity={opportunity}
              localEvents={[...catalystAuditEvents, ...remoteCatalystAuditEvents]}
            />
            <PreTradeChecklistBlock
              opportunity={opportunity}
              onAuditRecorded={handlePreTradeAuditRecorded}
            />
            <PreTradeAuditTrailBlock
              opportunity={opportunity}
              localEvents={[...preTradeAuditEvents, ...remotePreTradeAuditEvents]}
            />
            <div className="drawer-score-grid">
              <div><span>Purity</span><strong>{opportunity.scores.purityScore}</strong></div>
              <div><span>Scarcity</span><strong>{opportunity.scores.scarcityScore}</strong></div>
              <div><span>Relay</span><strong>{opportunity.scores.relayScore}</strong></div>
              <div><span>Catalyst</span><strong>{opportunity.scores.catalystScore}</strong></div>
            </div>
            <ScoreExplanationBlock opportunity={opportunity} />
            <CatalystList items={opportunity.catalystCalendar} />
            <SourceProvenanceBlock opportunity={opportunity} />
            <Suspense fallback={<div className="field-evidence-panel" data-field-evidence-loading>Loading field evidence...</div>}>
              <FieldEvidencePanel
                opportunity={opportunity}
                auditEvents={[...fieldEvidenceAuditEvents, ...remoteFieldEvidenceAuditEvents]}
                recording={saving}
                onRecordEvidence={handleRecordFieldEvidence}
                onRecordEvidenceBatch={handleRecordFieldEvidenceBatch}
                onInvalidateEvidence={handleInvalidateFieldEvidence}
                onRestoreEvidence={handleRestoreFieldEvidence}
              />
            </Suspense>
            {opportunity.type === 'ipo_spinout' && <IpoEvidenceBlock profile={opportunity.ipoProfile} />}
            <MissionStatusBlock mission={opportunity.latestMission} diff={opportunity.latestDiff} />
            {showMissionRecoveryPanel && (
              <Suspense fallback={null}>
                <MissionRecoveryPanel
                  opportunity={opportunity}
                  actionFeedback={missionRecoveryActionFeedback}
                  busyActionKey={recoveringMissionActionKey}
                  onRecoverMission={onRecoverMission}
                  onOpenMission={onOpenMission}
                />
              </Suspense>
            )}
            <OpportunityTimelineBlock entries={opportunity.recentActionTimeline} />
          </section>
        </div>
      </aside>
    </div>
  );
}
