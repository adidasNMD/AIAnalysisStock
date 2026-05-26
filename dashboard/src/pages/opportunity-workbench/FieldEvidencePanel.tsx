import { CheckCircle2, ExternalLink, FileSearch, Layers3, PlusCircle, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  deleteOpportunityFieldRegistry,
  fetchOpportunityFieldRegistry,
  fetchOpportunityFieldRegistryAudit,
  type InvalidateOpportunityFieldEvidenceInput,
  type OpportunityEvent,
  type OpportunityFieldEvidenceAudit,
  type OpportunityFieldEvidenceRef,
  type OpportunityFieldRegistryAuditEntry,
  type OpportunityFieldRegistryEntry,
  type OpportunitySummary,
  type OpportunitySourceProvenanceConfidence,
  type OpportunityFieldEvidenceBatchAudit,
  type RecordOpportunityFieldEvidenceInput,
  type RecordOpportunityFieldEvidenceBatchInput,
  type RestoreOpportunityFieldEvidenceInput,
  upsertOpportunityFieldRegistry,
} from '../../api';
import {
  buildFieldEvidenceBatchDrafts,
  buildFieldEvidenceFieldOptions,
  buildFieldEvidenceRecordDraftFromRef,
  buildFieldEvidenceFieldReview,
  buildFieldEvidenceAuditView,
  buildFieldEvidenceView,
  type FieldEvidenceBatchDraft,
  fieldEvidenceFilterLabel,
  type FieldEvidenceAuditStatusFilter,
  type FieldEvidenceFilter,
} from './field-evidence';

type FieldEvidencePanelProps = {
  opportunity: OpportunitySummary;
  auditEvents?: OpportunityEvent[];
  limit?: number;
  recording?: boolean;
  onRecordEvidence?: (input: RecordOpportunityFieldEvidenceInput) => Promise<OpportunityFieldEvidenceAudit | null>;
  onRecordEvidenceBatch?: (input: RecordOpportunityFieldEvidenceBatchInput) => Promise<OpportunityFieldEvidenceBatchAudit | null>;
  onInvalidateEvidence?: (
    evidenceId: string,
    input: InvalidateOpportunityFieldEvidenceInput,
  ) => Promise<OpportunityFieldEvidenceAudit | null>;
  onRestoreEvidence?: (
    evidenceId: string,
    input: RestoreOpportunityFieldEvidenceInput,
  ) => Promise<OpportunityFieldEvidenceAudit | null>;
};

function evidenceConfidenceClass(item: OpportunityFieldEvidenceRef) {
  if (item.confidence === 'confirmed') return 'confirmed';
  if (item.confidence === 'inferred') return 'inferred';
  if (item.confidence === 'placeholder') return 'placeholder';
  return 'unknown';
}

function evidenceDetail(item: OpportunityFieldEvidenceRef) {
  return [item.source, item.value, item.note].filter(Boolean).join(' · ');
}

function evidenceValue(item: OpportunityFieldEvidenceRef) {
  return item.value || item.note || item.source;
}

function auditStatusLabel(status: FieldEvidenceAuditStatusFilter) {
  if (status === 'all') return 'All';
  if (status === 'recorded') return 'Recorded';
  if (status === 'invalidated') return 'Invalidated';
  return 'Restored';
}

function registryAuditSummary(entry: OpportunityFieldRegistryAuditEntry) {
  if (entry.action === 'delete') {
    return `Reset ${entry.before?.label || entry.field}`;
  }
  const target = entry.after || entry.before;
  const changed = entry.changedFields.length > 0 ? entry.changedFields.join(', ') : 'metadata';
  return `${target?.label || entry.field} · ${changed}`;
}

export function FieldEvidencePanel({
  opportunity,
  auditEvents = [],
  limit = 6,
  recording = false,
  onRecordEvidence,
  onRecordEvidenceBatch,
  onInvalidateEvidence,
  onRestoreEvidence,
}: FieldEvidencePanelProps) {
  const summary = opportunity.fieldEvidence;
  const [filter, setFilter] = useState<FieldEvidenceFilter>('all');
  const [field, setField] = useState('');
  const [source, setSource] = useState('manual_review');
  const [confidence, setConfidence] = useState<RecordOpportunityFieldEvidenceInput['confidence']>('confirmed');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [invalidateTargetId, setInvalidateTargetId] = useState<string | null>(null);
  const [invalidateReason, setInvalidateReason] = useState('Manual review superseded this evidence.');
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState('Manual review restored this evidence.');
  const [auditStatusFilter, setAuditStatusFilter] = useState<FieldEvidenceAuditStatusFilter>('all');
  const [auditFieldFilter, setAuditFieldFilter] = useState('all');
  const [auditSourceFilter, setAuditSourceFilter] = useState('all');
  const [auditConfidenceFilter, setAuditConfidenceFilter] = useState<OpportunitySourceProvenanceConfidence | 'all'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [registryEntries, setRegistryEntries] = useState<OpportunityFieldRegistryEntry[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registrySaving, setRegistrySaving] = useState(false);
  const [registryLabel, setRegistryLabel] = useState('');
  const [registrySource, setRegistrySource] = useState('');
  const [registryKind, setRegistryKind] = useState<RecordOpportunityFieldEvidenceInput['kind']>('source');
  const [registryConfidence, setRegistryConfidence] = useState<RecordOpportunityFieldEvidenceInput['confidence']>('unknown');
  const [registryNote, setRegistryNote] = useState('');
  const [registryHistory, setRegistryHistory] = useState<OpportunityFieldRegistryAuditEntry[]>([]);
  const [registryHistoryLoading, setRegistryHistoryLoading] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<FieldEvidenceBatchDraft[]>([]);
  const [batchDraftBatchId, setBatchDraftBatchId] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);

  const fieldOptions = useMemo(() => {
    return buildFieldEvidenceFieldOptions(summary);
  }, [summary]);

  useEffect(() => {
    if (field || fieldOptions.length === 0) return;
    setField(fieldOptions[0].value);
  }, [field, fieldOptions]);

  useEffect(() => {
    let active = true;
    setRegistryLoading(true);
    fetchOpportunityFieldRegistry()
      .then((entries) => {
        if (active) setRegistryEntries(entries);
      })
      .catch(() => {
        if (active) setRegistryEntries([]);
      })
      .finally(() => {
        if (active) setRegistryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const view = buildFieldEvidenceView(summary, filter, limit);
  const activeFilter = view.facets.some((facet) => facet.id === filter && facet.count > 0) ? filter : 'all';
  const selectedField = field || fieldOptions[0]?.value || '';
  const selectedFieldOption = fieldOptions.find((option) => option.value === selectedField);
  const selectedRegistryEntry = registryEntries.find((entry) => entry.field === selectedField);
  const fieldReview = buildFieldEvidenceFieldReview(summary, 4);
  const batchCandidates = useMemo(() => buildFieldEvidenceBatchDrafts(fieldReview.items, 6), [fieldReview.items]);
  const selectedBatchCount = batchDrafts.filter((draft) => draft.selected).length;
  const invalidateTarget = view.items.find((item) => item.auditEventId === invalidateTargetId);
  const invalidateTargetExists = Boolean(invalidateTarget);
  const auditView = buildFieldEvidenceAuditView(auditEvents, {
    status: auditStatusFilter,
    field: auditFieldFilter,
    source: auditSourceFilter,
    confidence: auditConfidenceFilter,
  }, 8);
  const restoreTarget = auditView.entries.find((entry) => entry.evidenceId === restoreTargetId && entry.canRestore);
  const restoreTargetExists = Boolean(restoreTarget);

  useEffect(() => {
    if (invalidateTargetId && !invalidateTargetExists) {
      setInvalidateTargetId(null);
    }
  }, [invalidateTargetExists, invalidateTargetId]);

  useEffect(() => {
    if (restoreTargetId && !restoreTargetExists) {
      setRestoreTargetId(null);
    }
  }, [restoreTargetExists, restoreTargetId]);

  useEffect(() => {
    if (!selectedField) return;
    const entry = selectedRegistryEntry;
    setRegistryLabel(entry?.label || selectedFieldOption?.label || selectedField);
    setRegistrySource(entry?.source || selectedFieldOption?.source || 'manual_field_evidence');
    setRegistryKind(entry?.kind || selectedFieldOption?.kind || 'source');
    setRegistryConfidence(entry?.confidence || selectedFieldOption?.confidence || 'unknown');
    setRegistryNote(entry?.note || '');
  }, [selectedField, selectedFieldOption, selectedRegistryEntry]);

  useEffect(() => {
    if (!selectedField) {
      setRegistryHistory([]);
      return;
    }

    let active = true;
    setRegistryHistoryLoading(true);
    fetchOpportunityFieldRegistryAudit({ field: selectedField, limit: 5 })
      .then((entries) => {
        if (active) setRegistryHistory(entries);
      })
      .catch(() => {
        if (active) setRegistryHistory([]);
      })
      .finally(() => {
        if (active) setRegistryHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedField]);

  if (!summary || summary.total === 0) return null;

  const handleRecordEvidence = async () => {
    const compactNote = note.trim();
    const compactValue = value.trim();
    if (!onRecordEvidence || !selectedField || (!compactNote && !compactValue)) {
      setLocalError('请选择字段并填写证据值或说明。');
      return;
    }

    setLocalError(null);
    setFeedback(null);
    const selected = fieldOptions.find((option) => option.value === selectedField);
    const audit = await onRecordEvidence({
      field: selectedField,
      label: selected?.label || selectedField,
      kind: selected?.kind || 'source',
      source: source.trim() || 'manual_review',
      confidence,
      ...(compactValue ? { value: compactValue } : {}),
      ...(compactNote ? { note: compactNote } : {}),
      observedAt: new Date().toISOString(),
    });
    if (!audit) return;
    setValue('');
    setNote('');
    setInvalidateTargetId(null);
    setFeedback('Field evidence recorded.');
  };

  const handleUseEvidenceDraft = (item: OpportunityFieldEvidenceRef) => {
    const draft = buildFieldEvidenceRecordDraftFromRef(item);
    setField(draft.field);
    setSource(draft.source || 'manual_review');
    setConfidence(draft.confidence || 'confirmed');
    setValue(draft.value || '');
    setNote(draft.note || '');
    setLocalError(null);
    setFeedback(`Draft loaded from ${draft.source || item.source}.`);
  };

  const updateBatchDraft = (id: string, patch: Partial<FieldEvidenceBatchDraft>) => {
    setBatchDrafts((drafts) => drafts.map((draft) => (
      draft.id === id ? { ...draft, ...patch } : draft
    )));
  };

  const handleGenerateBatchDrafts = () => {
    if (batchCandidates.length === 0) {
      setLocalError('当前没有需要批量复核的冲突或低可信字段。');
      return;
    }
    setBatchDrafts(batchCandidates);
    setBatchDraftBatchId(`field-evidence:${opportunity.id}:${Date.now()}`);
    setLocalError(null);
    setFeedback(`Generated ${batchCandidates.length} batch evidence drafts.`);
  };

  const handleSubmitBatchDrafts = async () => {
    if (!onRecordEvidence && !onRecordEvidenceBatch) return;
    const selectedDrafts = batchDrafts.filter((draft) => {
      return draft.selected && (draft.value?.trim() || draft.note.trim());
    });
    if (selectedDrafts.length === 0) {
      setLocalError('请选择至少一条批量草稿，并保留 value 或 note。');
      return;
    }

    setBatchSaving(true);
    setLocalError(null);
    setFeedback(null);
    const observedAt = new Date().toISOString();
    const completedIds: string[] = [];
    try {
      if (onRecordEvidenceBatch) {
        const audit = await onRecordEvidenceBatch({
          batchId: batchDraftBatchId || `field-evidence:${opportunity.id}:${Date.now()}`,
          items: selectedDrafts.map((draft) => ({
            clientId: draft.id,
            field: draft.field,
            label: draft.label,
            kind: draft.kind,
            source: draft.source.trim() || 'manual_review',
            confidence: draft.confidence,
            ...(draft.value?.trim() ? { value: draft.value.trim() } : {}),
            ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
            observedAt,
          })),
        });
        if (!audit) return;
        const acceptedIds = new Set(audit.items
          .filter((item) => item.status === 'recorded' || item.status === 'duplicate')
          .map((item) => item.clientId)
          .filter((clientId): clientId is string => Boolean(clientId)));
        const remainingDrafts = batchDrafts.filter((draft) => !acceptedIds.has(draft.id));
        setBatchDrafts(remainingDrafts);
        if (remainingDrafts.length === 0) setBatchDraftBatchId(null);
        if (audit.failed > 0) {
          setLocalError(`批量写入 ${audit.failed} 条失败，已保留失败草稿。`);
        }
        setFeedback(`Batch recorded ${audit.recorded} new, ${audit.duplicates} duplicate, ${audit.failed} failed.`);
        return;
      }

      if (!onRecordEvidence) return;
      for (const draft of selectedDrafts) {
        const audit = await onRecordEvidence({
          field: draft.field,
          label: draft.label,
          kind: draft.kind,
          source: draft.source.trim() || 'manual_review',
          confidence: draft.confidence,
          ...(draft.value?.trim() ? { value: draft.value.trim() } : {}),
          ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
          observedAt,
        });
        if (audit) completedIds.push(draft.id);
      }

      if (completedIds.length === 0) {
        setLocalError('批量证据没有成功写入，请检查上层错误提示。');
        return;
      }
      const remainingDrafts = batchDrafts.filter((draft) => !completedIds.includes(draft.id));
      setBatchDrafts(remainingDrafts);
      if (remainingDrafts.length === 0) setBatchDraftBatchId(null);
      setFeedback(`Batch recorded ${completedIds.length}/${selectedDrafts.length} evidence drafts.`);
    } finally {
      setBatchSaving(false);
    }
  };

  const refreshRegistryEntries = async () => {
    const entries = await fetchOpportunityFieldRegistry();
    setRegistryEntries(entries);
    return entries;
  };

  const refreshRegistryHistory = async () => {
    if (!selectedField) {
      setRegistryHistory([]);
      return [];
    }
    const entries = await fetchOpportunityFieldRegistryAudit({ field: selectedField, limit: 5 });
    setRegistryHistory(entries);
    return entries;
  };

  const handleSaveRegistryOverride = async () => {
    if (!selectedField) {
      setLocalError('请选择字段。');
      return;
    }
    if (!registryLabel.trim() && !registrySource.trim() && !registryKind && !registryConfidence && !registryNote.trim()) {
      setLocalError('请至少填写一个 registry 默认值。');
      return;
    }

    setRegistrySaving(true);
    setLocalError(null);
    setFeedback(null);
    try {
      const result = await upsertOpportunityFieldRegistry(selectedField, {
        label: registryLabel.trim() || selectedField,
        kind: registryKind || 'source',
        source: registrySource.trim() || 'manual_field_evidence',
        confidence: registryConfidence || 'unknown',
        ...(registryNote.trim() ? { note: registryNote.trim() } : {}),
        updatedBy: 'dashboard',
      });
      await refreshRegistryEntries();
      await refreshRegistryHistory();
      if (result.effective) {
        setRegistryLabel(result.effective.label);
        setRegistrySource(result.effective.source);
        setRegistryKind(result.effective.kind);
        setRegistryConfidence(result.effective.confidence);
      }
      setFeedback('Field registry default saved.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Field registry 保存失败。');
    } finally {
      setRegistrySaving(false);
    }
  };

  const handleResetRegistryOverride = async () => {
    if (!selectedField) return;
    setRegistrySaving(true);
    setLocalError(null);
    setFeedback(null);
    try {
      await deleteOpportunityFieldRegistry(selectedField);
      await refreshRegistryEntries();
      await refreshRegistryHistory();
      setFeedback('Field registry default reset.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Field registry 重置失败。');
    } finally {
      setRegistrySaving(false);
    }
  };

  const handleInvalidateEvidence = async () => {
    if (!onInvalidateEvidence || !invalidateTarget?.auditEventId) return;
    const reason = invalidateReason.trim();
    if (!reason) {
      setLocalError('请填写作废原因。');
      return;
    }

    setLocalError(null);
    setFeedback(null);
    const audit = await onInvalidateEvidence(invalidateTarget.auditEventId, {
      reason,
      field: invalidateTarget.field,
      source: invalidateTarget.source,
    });
    if (!audit) return;
    setInvalidateTargetId(null);
    setInvalidateReason('Manual review superseded this evidence.');
    setFeedback('Field evidence invalidated.');
  };

  const handleRestoreEvidence = async () => {
    if (!onRestoreEvidence || !restoreTarget) return;
    const reason = restoreReason.trim();
    if (!reason) {
      setLocalError('请填写恢复原因。');
      return;
    }

    setLocalError(null);
    setFeedback(null);
    const audit = await onRestoreEvidence(restoreTarget.evidenceId, {
      reason,
      field: restoreTarget.field,
      source: restoreTarget.source,
    });
    if (!audit) return;
    setRestoreTargetId(null);
    setRestoreReason('Manual review restored this evidence.');
    setFeedback('Field evidence restored.');
  };

  return (
    <section className="field-evidence-panel" data-field-evidence={opportunity.id}>
      <div className="field-evidence-head">
        <div>
          <span><Layers3 size={13} /> Field evidence</span>
          <strong>
            {summary.fields} fields · {summary.total} refs
            {summary.invalidated ? ` · ${summary.invalidated} invalidated` : ''}
          </strong>
        </div>
        {summary.latestObservedAt && <em>{new Date(summary.latestObservedAt).toLocaleDateString()}</em>}
      </div>

      {view.sourcePreview.length > 0 && (
        <div className="field-evidence-sources">
          {view.sourcePreview.map((source) => (
            <span key={source}>{source}</span>
          ))}
        </div>
      )}

      {fieldReview.items.length > 0 && (
        <div className="field-evidence-review" data-field-evidence-review>
          <div className="field-evidence-review-head">
            <span>Current values</span>
            <em>
              {fieldReview.conflictCount > 0
                ? `${fieldReview.conflictCount} conflicts`
                : fieldReview.lowConfidenceCount > 0
                  ? `${fieldReview.lowConfidenceCount} low confidence`
                  : `${fieldReview.items.length} multi-source fields`}
            </em>
          </div>
          <div className="field-evidence-review-list">
            {fieldReview.items.map((item) => (
              <div
                key={item.field}
                className={`field-evidence-review-row ${item.hasConflict ? 'conflict' : ''}`}
                data-field-evidence-review-row={item.field}
                data-field-evidence-review-conflict={item.hasConflict ? 'true' : 'false'}
              >
                <div className="field-evidence-review-main">
                  <strong>{item.label}</strong>
                  <p>
                    {item.field} · Adopted: {item.adoptedValue}
                  </p>
                  <small className="field-evidence-review-reason">{item.adoptedReason}</small>
                  {item.conflictValues.length > 1 && (
                    <div className="field-evidence-conflict-values" data-field-evidence-conflict-values={item.field}>
                      {item.conflictValues.slice(0, 3).map((value) => (
                        <span
                          key={`${item.field}:${value.value}`}
                          className={value.adopted ? 'adopted' : ''}
                          title={`${value.sources.join(', ')} · ${value.confidences.join(', ')}`}
                        >
                          {value.adopted ? 'adopted ' : ''}
                          {value.value}
                          <em>{value.count}</em>
                        </span>
                      ))}
                    </div>
                  )}
                  {(item.hasConflict || item.reviewPriority === 'low_confidence') && (
                    <p className="field-evidence-review-hint">{item.reviewHint}</p>
                  )}
                  {item.alternatives.length > 0 && (
                    <ul>
                      {item.alternatives.slice(0, 2).map((alternative) => (
                        <li key={alternative.id}>
                          <span>{alternative.source}: {evidenceValue(alternative)} · {alternative.confidence}</span>
                          {onRecordEvidence && (
                            <button
                              type="button"
                              title="Use as evidence draft"
                              aria-label={`Use ${alternative.label} from ${alternative.source} as evidence draft`}
                              data-field-evidence-use-ref={alternative.id}
                              onClick={() => handleUseEvidenceDraft(alternative)}
                              disabled={recording}
                            >
                              <CheckCircle2 size={12} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="field-evidence-review-meta">
                  <span>{item.adopted.confidence}</span>
                  <span>{item.sourceCount} sources</span>
                </div>
              </div>
            ))}
            {fieldReview.hiddenCount > 0 && (
              <div className="field-evidence-more">+{fieldReview.hiddenCount} more grouped fields</div>
            )}
          </div>
          {onRecordEvidence && (
            <div className="field-evidence-batch-toolbar">
              <span>
                {batchCandidates.length > 0
                  ? `${batchCandidates.length} fields can become manual review drafts`
                  : 'No conflict or low-confidence fields need batch review'}
              </span>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleGenerateBatchDrafts}
                disabled={recording || batchSaving || batchCandidates.length === 0}
                data-field-evidence-batch-generate
              >
                生成批量草稿
              </button>
            </div>
          )}
        </div>
      )}

      {onRecordEvidence && batchDrafts.length > 0 && (
        <div className="field-evidence-batch" data-field-evidence-batch>
          <div className="field-evidence-record-head">
            <span><CheckCircle2 size={12} /> Batch evidence drafts</span>
            <em>{selectedBatchCount}/{batchDrafts.length} selected</em>
          </div>
          <div className="field-evidence-batch-list">
            {batchDrafts.map((draft) => (
              <div
                key={draft.id}
                className={`field-evidence-batch-row ${draft.selected ? 'selected' : ''}`}
                data-field-evidence-batch-row={draft.field}
              >
                <label className="field-evidence-batch-toggle">
                  <input
                    type="checkbox"
                    checked={draft.selected}
                    onChange={(event) => updateBatchDraft(draft.id, { selected: event.target.checked })}
                    data-field-evidence-batch-select={draft.field}
                  />
                  <span>{draft.label}</span>
                </label>
                <p>
                  {draft.field} · {draft.reason === 'conflict' ? 'conflict' : 'low confidence'}
                </p>
                <div className="field-evidence-batch-grid">
                  <label>
                    <span>Source</span>
                    <input
                      value={draft.source}
                      onChange={(event) => updateBatchDraft(draft.id, { source: event.target.value })}
                      data-field-evidence-batch-source={draft.field}
                    />
                  </label>
                  <label>
                    <span>Value</span>
                    <input
                      value={draft.value || ''}
                      onChange={(event) => updateBatchDraft(draft.id, { value: event.target.value })}
                      data-field-evidence-batch-value={draft.field}
                    />
                  </label>
                  <label>
                    <span>Confidence</span>
                    <select
                      value={draft.confidence}
                      onChange={(event) => updateBatchDraft(draft.id, {
                        confidence: event.target.value as OpportunitySourceProvenanceConfidence,
                      })}
                      data-field-evidence-batch-confidence={draft.field}
                    >
                      <option value="confirmed">confirmed</option>
                      <option value="inferred">inferred</option>
                      <option value="placeholder">placeholder</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </label>
                </div>
                <textarea
                  value={draft.note}
                  onChange={(event) => updateBatchDraft(draft.id, { note: event.target.value })}
                  rows={2}
                  data-field-evidence-batch-note={draft.field}
                />
              </div>
            ))}
          </div>
          <div className="field-evidence-record-actions">
            {localError && <small>{localError}</small>}
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setBatchDrafts([]);
                setBatchDraftBatchId(null);
              }}
              disabled={recording || batchSaving}
              data-field-evidence-batch-clear
            >
              清空草稿
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleSubmitBatchDrafts()}
              disabled={recording || batchSaving || selectedBatchCount === 0}
              data-field-evidence-batch-submit
            >
              <CheckCircle2 size={13} />
              {batchSaving ? '写入中...' : '批量确认'}
            </button>
          </div>
        </div>
      )}

      <div className="field-evidence-filters" role="tablist" aria-label="Field evidence filters">
        {view.facets.map((facet) => (
          <button
            key={facet.id}
            type="button"
            className={facet.id === activeFilter ? 'active' : ''}
            data-field-evidence-filter={facet.id}
            onClick={() => setFilter(facet.id)}
          >
            {facet.label}
            <span>{facet.count}</span>
          </button>
        ))}
      </div>

      <div className="field-evidence-list">
        {view.items.map((item) => (
          <div
            key={item.id}
            className="field-evidence-item"
            data-field-evidence-item={item.kind}
            data-field-evidence-field={item.field}
          >
            <FileSearch size={13} />
            <div className="field-evidence-copy">
              <div className="field-evidence-title">
                <span>{item.label}</span>
                <em className={`field-evidence-confidence ${evidenceConfidenceClass(item)}`}>
                  {item.confidence.toUpperCase()}
                </em>
                <small>{fieldEvidenceFilterLabel(item.kind)}</small>
                {onInvalidateEvidence && item.auditEventId && (
                  <button
                    type="button"
                    className="field-evidence-invalidate-button"
                    title="Invalidate evidence"
                    aria-label={`Invalidate ${item.label}`}
                    data-field-evidence-invalidate={item.auditEventId}
                    onClick={() => {
                      setInvalidateTargetId(item.auditEventId || null);
                      setInvalidateReason(`Manual review invalidated evidence for ${item.field}.`);
                      setLocalError(null);
                      setFeedback(null);
                    }}
                    disabled={recording}
                  >
                    <XCircle size={12} />
                  </button>
                )}
              </div>
              <p>{item.field}{evidenceDetail(item) ? ` · ${evidenceDetail(item)}` : ''}</p>
              {item.artifact && (
                <a
                  className="field-evidence-artifact"
                  href={item.artifact.href}
                  title={item.artifact.artifactPath || item.artifact.label}
                  data-field-evidence-artifact={item.artifact.kind}
                  data-field-evidence-artifact-run={item.artifact.runId || ''}
                >
                  <ExternalLink size={12} />
                  {item.artifact.label}
                  {item.artifact.runId ? ` · ${item.artifact.runId}` : ''}
                </a>
              )}
            </div>
          </div>
        ))}
        {view.hiddenCount > 0 && (
          <div className="field-evidence-more">+{view.hiddenCount} more refs</div>
        )}
      </div>

      {onInvalidateEvidence && invalidateTarget && (
        <div className="field-evidence-invalidate" data-field-evidence-invalidate-form>
          <div className="field-evidence-record-head">
            <span><XCircle size={12} /> Invalidate evidence</span>
            <em>{invalidateTarget.field}</em>
          </div>
          <textarea
            value={invalidateReason}
            onChange={(event) => setInvalidateReason(event.target.value)}
            rows={2}
            data-field-evidence-invalidate-reason
          />
          <div className="field-evidence-record-actions">
            {localError && <small>{localError}</small>}
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setInvalidateTargetId(null)}
              disabled={recording}
            >
              取消
            </button>
            <button
              type="button"
              className="secondary-btn danger"
              onClick={() => void handleInvalidateEvidence()}
              disabled={recording}
              data-field-evidence-invalidate-submit
            >
              <XCircle size={13} />
              {recording ? '作废中...' : '确认作废'}
            </button>
          </div>
        </div>
      )}

      {auditView.facets.length > 0 && (
        <div className="field-evidence-audit" data-field-evidence-audit>
          <div className="field-evidence-record-head">
            <span><FileSearch size={12} /> Audit trail</span>
            <em>{auditView.facets[0]?.count || 0} events</em>
          </div>
          <div className="field-evidence-audit-filters" role="tablist" aria-label="Field evidence audit filters">
            {auditView.facets.map((facet) => (
              <button
                key={facet.id}
                type="button"
                className={facet.id === auditStatusFilter ? 'active' : ''}
                data-field-evidence-audit-filter={facet.id}
                onClick={() => setAuditStatusFilter(facet.id)}
              >
                {auditStatusLabel(facet.id)}
                <span>{facet.count}</span>
              </button>
            ))}
          </div>
          <div className="field-evidence-audit-selects">
            <select
              value={auditFieldFilter}
              onChange={(event) => setAuditFieldFilter(event.target.value)}
              data-field-evidence-audit-field
            >
              <option value="all">All fields</option>
              {auditView.fields.map((auditField) => (
                <option key={auditField} value={auditField}>{auditField}</option>
              ))}
            </select>
            <select
              value={auditSourceFilter}
              onChange={(event) => setAuditSourceFilter(event.target.value)}
              data-field-evidence-audit-source
            >
              <option value="all">All sources</option>
              {auditView.sources.map((auditSource) => (
                <option key={auditSource} value={auditSource}>{auditSource}</option>
              ))}
            </select>
            <select
              value={auditConfidenceFilter}
              onChange={(event) => setAuditConfidenceFilter(event.target.value as OpportunitySourceProvenanceConfidence | 'all')}
              data-field-evidence-audit-confidence
            >
              <option value="all">All confidence</option>
              {auditView.confidences.map((auditConfidence) => (
                <option key={auditConfidence} value={auditConfidence}>{auditConfidence}</option>
              ))}
            </select>
          </div>
          <div className="field-evidence-audit-list">
            {auditView.entries.map((entry) => (
              <div
                key={entry.id}
                className={`field-evidence-audit-entry ${entry.status}`}
                data-field-evidence-audit-entry={entry.status}
                data-field-evidence-audit-current={entry.currentStatus}
              >
                <div>
                  <strong>{entry.label}</strong>
                  <p>
                    {entry.field} · {entry.source} · {entry.confidence}
                    {entry.reason ? ` · ${entry.reason}` : entry.note ? ` · ${entry.note}` : ''}
                  </p>
                </div>
                <div className="field-evidence-audit-actions">
                  <span>{entry.status}</span>
                  {onRestoreEvidence && entry.canRestore && (
                    <button
                      type="button"
                      className="field-evidence-invalidate-button"
                      title="Restore evidence"
                      aria-label={`Restore ${entry.label}`}
                      data-field-evidence-restore={entry.evidenceId}
                      onClick={() => {
                        setRestoreTargetId(entry.evidenceId);
                        setRestoreReason(`Manual review restored evidence for ${entry.field}.`);
                        setLocalError(null);
                        setFeedback(null);
                      }}
                      disabled={recording}
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {auditView.hiddenCount > 0 && (
              <div className="field-evidence-more">+{auditView.hiddenCount} more audit events</div>
            )}
          </div>
        </div>
      )}

      {onRestoreEvidence && restoreTarget && (
        <div className="field-evidence-invalidate" data-field-evidence-restore-form>
          <div className="field-evidence-record-head">
            <span><RotateCcw size={12} /> Restore evidence</span>
            <em>{restoreTarget.field}</em>
          </div>
          <textarea
            value={restoreReason}
            onChange={(event) => setRestoreReason(event.target.value)}
            rows={2}
            data-field-evidence-restore-reason
          />
          <div className="field-evidence-record-actions">
            {localError && <small>{localError}</small>}
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setRestoreTargetId(null)}
              disabled={recording}
            >
              取消
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleRestoreEvidence()}
              disabled={recording}
              data-field-evidence-restore-submit
            >
              <RotateCcw size={13} />
              {recording ? '恢复中...' : '确认恢复'}
            </button>
          </div>
        </div>
      )}

      {onRecordEvidence && (
        <div className="field-evidence-record" data-field-evidence-form>
          <div className="field-evidence-record-head">
            <span><PlusCircle size={12} /> Add evidence</span>
            {feedback && <em data-field-evidence-feedback>{feedback}</em>}
          </div>
          <div className="field-evidence-registry" data-field-registry-editor={selectedField}>
            <div className="field-evidence-registry-head">
              <span>Registry defaults</span>
              <em>
                {registryLoading
                  ? 'loading'
                  : selectedRegistryEntry?.overriddenFields.length
                    ? `override: ${selectedRegistryEntry.overriddenFields.join(', ')}`
                    : 'base defaults'}
              </em>
            </div>
            <div className="field-evidence-record-grid">
              <label>
                <span>Default label</span>
                <input
                  value={registryLabel}
                  onChange={(event) => setRegistryLabel(event.target.value)}
                  data-field-registry-label
                />
              </label>
              <label>
                <span>Default source</span>
                <input
                  value={registrySource}
                  onChange={(event) => setRegistrySource(event.target.value)}
                  data-field-registry-source
                />
              </label>
              <label>
                <span>Default kind</span>
                <select
                  value={registryKind || 'source'}
                  onChange={(event) => setRegistryKind(event.target.value as RecordOpportunityFieldEvidenceInput['kind'])}
                  data-field-registry-kind
                >
                  <option value="record">record</option>
                  <option value="profile">profile</option>
                  <option value="score">score</option>
                  <option value="source">source</option>
                  <option value="mission">mission</option>
                  <option value="event">event</option>
                </select>
              </label>
              <label>
                <span>Default confidence</span>
                <select
                  value={registryConfidence || 'unknown'}
                  onChange={(event) => setRegistryConfidence(event.target.value as RecordOpportunityFieldEvidenceInput['confidence'])}
                  data-field-registry-confidence
                >
                  <option value="confirmed">confirmed</option>
                  <option value="inferred">inferred</option>
                  <option value="placeholder">placeholder</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
            </div>
            <textarea
              value={registryNote}
              onChange={(event) => setRegistryNote(event.target.value)}
              placeholder="说明为什么调整这个字段的默认来源、可信度或标签"
              rows={2}
              data-field-registry-note
            />
            <div className="field-evidence-record-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleResetRegistryOverride()}
                disabled={registrySaving || !selectedRegistryEntry?.overriddenFields.length}
                data-field-registry-reset
              >
                重置默认
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleSaveRegistryOverride()}
                disabled={registrySaving}
                data-field-registry-save
              >
                {registrySaving ? '保存中...' : '保存字段默认'}
              </button>
            </div>
            <div className="field-evidence-registry-history" data-field-registry-history={selectedField}>
              <div className="field-evidence-registry-history-head">
                <span>Registry history</span>
                <em>{registryHistoryLoading ? 'loading' : `${registryHistory.length} recent`}</em>
              </div>
              {registryHistory.length > 0 ? (
                <div className="field-evidence-registry-history-list">
                  {registryHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={`field-evidence-registry-history-row ${entry.action}`}
                      data-field-registry-history-row={entry.id}
                    >
                      <strong>{entry.action === 'delete' ? 'Reset' : 'Update'}</strong>
                      <p>{registryAuditSummary(entry)}</p>
                      <small>
                        {entry.updatedBy || 'system'} · {new Date(entry.updatedAt).toLocaleDateString()}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="field-evidence-registry-empty">
                  {registryHistoryLoading ? 'Loading registry audit trail.' : 'No registry changes recorded for this field.'}
                </p>
              )}
            </div>
          </div>
          <div className="field-evidence-record-grid">
            <label>
              <span>Field</span>
              <select
                value={selectedField}
                onChange={(event) => setField(event.target.value)}
                data-field-evidence-field-select
              >
                {fieldOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label} · {option.value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Source</span>
              <input value={source} onChange={(event) => setSource(event.target.value)} />
            </label>
            <label>
              <span>Value</span>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                data-field-evidence-value
              />
            </label>
            <label>
              <span>Confidence</span>
              <select
                value={confidence}
                onChange={(event) => setConfidence(event.target.value as RecordOpportunityFieldEvidenceInput['confidence'])}
              >
                <option value="confirmed">confirmed</option>
                <option value="inferred">inferred</option>
                <option value="placeholder">placeholder</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录证据来源、观察结果或需要复核的判断"
            rows={2}
            data-field-evidence-note
          />
          <div className="field-evidence-record-actions">
            {localError && <small>{localError}</small>}
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleRecordEvidence()}
              disabled={recording}
              data-field-evidence-submit
            >
              <PlusCircle size={13} />
              {recording ? '记录中...' : '记录证据'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
