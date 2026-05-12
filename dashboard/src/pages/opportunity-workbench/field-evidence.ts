import type {
  OpportunityEvent,
  OpportunityFieldEvidenceKind,
  OpportunityFieldEvidenceRef,
  OpportunityFieldEvidenceSummary,
  RecordOpportunityFieldEvidenceInput,
  OpportunitySourceProvenanceConfidence,
} from '../../api';

export type FieldEvidenceFilter = OpportunityFieldEvidenceKind | 'all';
export type FieldEvidenceAuditStatus = 'recorded' | 'invalidated' | 'restored';
export type FieldEvidenceAuditStatusFilter = FieldEvidenceAuditStatus | 'all';

export type FieldEvidenceFacet = {
  id: FieldEvidenceFilter;
  label: string;
  count: number;
};

export type FieldEvidenceView = {
  facets: FieldEvidenceFacet[];
  items: OpportunityFieldEvidenceRef[];
  hiddenCount: number;
  sourcePreview: string[];
};

export type FieldEvidenceFieldReviewItem = {
  field: string;
  label: string;
  adopted: OpportunityFieldEvidenceRef;
  adoptedValue: string;
  adoptedReason: string;
  alternatives: OpportunityFieldEvidenceRef[];
  conflictValues: FieldEvidenceConflictValue[];
  sourceCount: number;
  valueCount: number;
  hasConflict: boolean;
  reviewPriority: 'conflict' | 'low_confidence' | 'multi_source';
  reviewHint: string;
};

export type FieldEvidenceFieldReview = {
  items: FieldEvidenceFieldReviewItem[];
  hiddenCount: number;
  conflictCount: number;
  lowConfidenceCount: number;
};

export type FieldEvidenceBatchDraft = {
  id: string;
  selected: boolean;
  field: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  value?: string;
  note: string;
  reason: FieldEvidenceFieldReviewItem['reviewPriority'];
};

export type FieldEvidenceConflictValue = {
  value: string;
  sources: string[];
  confidences: OpportunitySourceProvenanceConfidence[];
  count: number;
  adopted: boolean;
};

export type FieldEvidenceAuditEntry = {
  id: string;
  eventId: string;
  evidenceId: string;
  status: FieldEvidenceAuditStatus;
  currentStatus: 'active' | 'invalidated';
  field: string;
  label: string;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  note?: string;
  reason?: string;
  observedAt: string;
  canRestore: boolean;
};

export type FieldEvidenceAuditView = {
  facets: Array<{ id: FieldEvidenceAuditStatusFilter; label: string; count: number }>;
  entries: FieldEvidenceAuditEntry[];
  fields: string[];
  sources: string[];
  confidences: OpportunitySourceProvenanceConfidence[];
  hiddenCount: number;
};

export type FieldEvidenceFieldOption = {
  value: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
};

const KIND_LABELS: Record<OpportunityFieldEvidenceKind, string> = {
  record: 'Record',
  profile: 'Profile',
  score: 'Score',
  source: 'Source',
  mission: 'Mission',
  event: 'Event',
};

const KIND_ORDER: Record<OpportunityFieldEvidenceKind, number> = {
  source: 0,
  score: 1,
  profile: 2,
  mission: 3,
  event: 4,
  record: 5,
};

const CONFIDENCE_ORDER: Record<OpportunityFieldEvidenceRef['confidence'], number> = {
  confirmed: 0,
  inferred: 1,
  placeholder: 2,
  unknown: 3,
};

const AUDIT_STATUS_LABELS: Record<FieldEvidenceAuditStatus, string> = {
  recorded: 'Recorded',
  invalidated: 'Invalidated',
  restored: 'Restored',
};

function auditStatusForEvent(event: OpportunityEvent): FieldEvidenceAuditStatus | null {
  if (event.type === 'field_evidence_recorded') return 'recorded';
  if (event.type === 'field_evidence_invalidated') return 'invalidated';
  if (event.type === 'field_evidence_restored') return 'restored';
  return null;
}

function textMeta(event: OpportunityEvent, key: string): string | undefined {
  const value = event.meta?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function confidenceMeta(event: OpportunityEvent): OpportunitySourceProvenanceConfidence {
  const value = textMeta(event, 'confidence');
  return (
    value === 'confirmed' ||
    value === 'inferred' ||
    value === 'placeholder' ||
    value === 'unknown'
  ) ? value : 'unknown';
}

export function fieldEvidenceFilterLabel(filter: FieldEvidenceFilter): string {
  if (filter === 'all') return 'All';
  return KIND_LABELS[filter];
}

export function sortFieldEvidenceItems(items: OpportunityFieldEvidenceRef[]): OpportunityFieldEvidenceRef[] {
  return [...items].sort((a, b) => {
    const confidenceDelta = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
    if (confidenceDelta !== 0) return confidenceDelta;
    const kindDelta = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindDelta !== 0) return kindDelta;
    return a.field.localeCompare(b.field);
  });
}

export function buildFieldEvidenceFieldOptions(
  summary: OpportunityFieldEvidenceSummary | undefined,
): FieldEvidenceFieldOption[] {
  const fields = new Map<string, FieldEvidenceFieldOption>();
  for (const item of sortFieldEvidenceItems(summary?.items || [])) {
    if (fields.has(item.field)) continue;
    fields.set(item.field, {
      value: item.field,
      label: item.label,
      kind: item.kind,
      source: item.source,
      confidence: item.confidence,
    });
  }

  return [...fields.values()].sort((a, b) => a.value.localeCompare(b.value));
}

export function buildFieldEvidenceView(
  summary: OpportunityFieldEvidenceSummary | undefined,
  filter: FieldEvidenceFilter,
  limit = 6,
): FieldEvidenceView {
  const allItems = sortFieldEvidenceItems(summary?.items || []);
  const counts = new Map<OpportunityFieldEvidenceKind, number>();
  for (const item of allItems) {
    counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
  }

  const facets: FieldEvidenceFacet[] = [
    { id: 'all', label: fieldEvidenceFilterLabel('all'), count: allItems.length },
    ...Object.entries(KIND_LABELS)
      .map(([id, label]) => ({
        id: id as OpportunityFieldEvidenceKind,
        label,
        count: counts.get(id as OpportunityFieldEvidenceKind) || 0,
      }))
      .filter((facet) => facet.count > 0),
  ];

  const effectiveFilter = filter !== 'all' && (counts.get(filter) || 0) === 0 ? 'all' : filter;
  const filtered = effectiveFilter === 'all'
    ? allItems
    : allItems.filter((item) => item.kind === effectiveFilter);

  return {
    facets,
    items: filtered.slice(0, limit),
    hiddenCount: Math.max(0, filtered.length - limit),
    sourcePreview: (summary?.sources || []).slice(0, 4),
  };
}

function reviewValue(item: OpportunityFieldEvidenceRef): string {
  return (item.value || item.note || '').trim();
}

function reviewValueKey(item: OpportunityFieldEvidenceRef): string {
  return reviewValue(item).toLowerCase();
}

function confidenceLabel(confidence: OpportunitySourceProvenanceConfidence): string {
  if (confidence === 'confirmed') return 'confirmed';
  if (confidence === 'inferred') return 'inferred';
  if (confidence === 'placeholder') return 'placeholder';
  return 'unknown';
}

function adoptionReason(item: OpportunityFieldEvidenceRef): string {
  const confidence = confidenceLabel(item.confidence);
  if (item.confidence === 'confirmed') {
    return `Adopted because ${item.source || item.kind} is confirmed evidence.`;
  }
  if (item.kind === 'score' || item.kind === 'profile') {
    return `Adopted from ${item.kind} snapshot; confidence is ${confidence}.`;
  }
  return `Adopted by current evidence priority from ${item.source || item.kind}; confidence is ${confidence}.`;
}

function reviewPriority(input: {
  adopted: OpportunityFieldEvidenceRef;
  hasConflict: boolean;
  alternatives: OpportunityFieldEvidenceRef[];
}): FieldEvidenceFieldReviewItem['reviewPriority'] {
  if (input.hasConflict) return 'conflict';
  if (input.adopted.confidence !== 'confirmed') return 'low_confidence';
  return 'multi_source';
}

function reviewHint(priority: FieldEvidenceFieldReviewItem['reviewPriority']): string {
  if (priority === 'conflict') {
    return 'Different sources disagree on the field value. Review before relying on this opportunity.';
  }
  if (priority === 'low_confidence') {
    return 'Multiple sources agree or provide context, but the adopted value is not confirmed yet.';
  }
  return 'Multiple sources support the same field value.';
}

function buildConflictValues(fieldItems: OpportunityFieldEvidenceRef[], adopted: OpportunityFieldEvidenceRef): FieldEvidenceConflictValue[] {
  const adoptedKey = reviewValueKey(adopted);
  const byValue = new Map<string, {
    value: string;
    sources: Set<string>;
    confidences: Set<OpportunitySourceProvenanceConfidence>;
    count: number;
  }>();

  for (const item of fieldItems) {
    const value = reviewValue(item);
    if (!value) continue;
    const key = value.toLowerCase();
    const current = byValue.get(key) || {
      value,
      sources: new Set<string>(),
      confidences: new Set<OpportunitySourceProvenanceConfidence>(),
      count: 0,
    };
    if (item.source) current.sources.add(item.source);
    current.confidences.add(item.confidence);
    current.count += 1;
    byValue.set(key, current);
  }

  return [...byValue.entries()]
    .map(([key, value]) => ({
      value: value.value,
      sources: [...value.sources].sort(),
      confidences: [...value.confidences].sort((a, b) => CONFIDENCE_ORDER[a] - CONFIDENCE_ORDER[b]),
      count: value.count,
      adopted: key === adoptedKey,
    }))
    .sort((a, b) => {
      if (a.adopted !== b.adopted) return a.adopted ? -1 : 1;
      const aConfidence = a.confidences[0] || 'unknown';
      const bConfidence = b.confidences[0] || 'unknown';
      const confidenceDelta = CONFIDENCE_ORDER[aConfidence] - CONFIDENCE_ORDER[bConfidence];
      if (confidenceDelta !== 0) return confidenceDelta;
      return b.count - a.count;
    });
}

export function buildFieldEvidenceFieldReview(
  summary: OpportunityFieldEvidenceSummary | undefined,
  limit = 4,
): FieldEvidenceFieldReview {
  const byField = new Map<string, OpportunityFieldEvidenceRef[]>();
  for (const item of sortFieldEvidenceItems(summary?.items || [])) {
    const bucket = byField.get(item.field) || [];
    bucket.push(item);
    byField.set(item.field, bucket);
  }

  const items = [...byField.entries()]
    .map(([field, fieldItems]): FieldEvidenceFieldReviewItem => {
      const values = new Set(fieldItems.map(reviewValue).filter(Boolean));
      const sources = new Set(fieldItems.map((item) => item.source).filter(Boolean));
      const adopted = fieldItems[0];
      const hasConflict = values.size > 1;
      const alternatives = fieldItems.slice(1);
      const priority = reviewPriority({ adopted, hasConflict, alternatives });
      return {
        field,
        label: adopted.label || field,
        adopted,
        adoptedValue: reviewValue(adopted) || adopted.source || adopted.field,
        adoptedReason: adoptionReason(adopted),
        alternatives,
        conflictValues: buildConflictValues(fieldItems, adopted),
        sourceCount: sources.size,
        valueCount: values.size,
        hasConflict,
        reviewPriority: priority,
        reviewHint: reviewHint(priority),
      };
    })
    .filter((item) => item.alternatives.length > 0 || item.reviewPriority === 'low_confidence')
    .sort((a, b) => {
      if (a.hasConflict !== b.hasConflict) return a.hasConflict ? -1 : 1;
      if (a.reviewPriority !== b.reviewPriority) {
        return a.reviewPriority === 'low_confidence' ? -1 : 1;
      }
      const confidenceDelta = CONFIDENCE_ORDER[a.adopted.confidence] - CONFIDENCE_ORDER[b.adopted.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;
      return a.field.localeCompare(b.field);
    });

  return {
    items: items.slice(0, limit),
    hiddenCount: Math.max(0, items.length - limit),
    conflictCount: items.filter((item) => item.hasConflict).length,
    lowConfidenceCount: items.filter((item) => item.reviewPriority === 'low_confidence').length,
  };
}

export function buildFieldEvidenceRecordDraftFromRef(
  item: OpportunityFieldEvidenceRef,
): RecordOpportunityFieldEvidenceInput {
  const value = reviewValue(item);
  return {
    field: item.field,
    label: item.label,
    kind: item.kind,
    source: item.source || 'manual_field_evidence',
    confidence: item.confidence,
    ...(item.value ? { value: item.value } : {}),
    ...(item.note
      ? { note: item.note }
      : value
        ? { note: `Reviewed ${item.source || 'source'} evidence for ${item.field}.` }
        : {}),
  };
}

export function buildFieldEvidenceBatchDrafts(
  reviewItems: FieldEvidenceFieldReviewItem[],
  limit = 6,
): FieldEvidenceBatchDraft[] {
  return reviewItems
    .filter((item) => item.reviewPriority === 'conflict' || item.reviewPriority === 'low_confidence')
    .slice(0, limit)
    .map((item) => {
      const adoptedValue = reviewValue(item.adopted) || item.adoptedValue;
      const alternativeSummary = item.conflictValues
        .filter((value) => !value.adopted)
        .slice(0, 3)
        .map((value) => `${value.value} (${value.sources.join(', ') || 'unknown source'})`)
        .join('; ');
      const note = item.reviewPriority === 'conflict'
        ? [
          `Manual review resolved conflicting evidence for ${item.field}.`,
          `Adopted: ${adoptedValue}.`,
          alternativeSummary ? `Alternatives: ${alternativeSummary}.` : '',
        ].filter(Boolean).join(' ')
        : `Manual review confirmed low-confidence evidence for ${item.field} from ${item.adopted.source || item.adopted.kind}.`;

      return {
        id: `batch:${item.field}`,
        selected: true,
        field: item.field,
        label: item.label,
        kind: item.adopted.kind,
        source: 'manual_review',
        confidence: 'confirmed',
        ...(adoptedValue ? { value: adoptedValue } : {}),
        note,
        reason: item.reviewPriority,
      };
    });
}

export function buildFieldEvidenceAuditView(
  events: OpportunityEvent[],
  filters: {
    status?: FieldEvidenceAuditStatusFilter;
    field?: string;
    source?: string;
    confidence?: OpportunitySourceProvenanceConfidence | 'all';
  } = {},
  limit = 8,
): FieldEvidenceAuditView {
  const relevantEvents = events
    .filter((event) => auditStatusForEvent(event))
    .sort((a, b) => {
      const timestampDelta = a.timestamp.localeCompare(b.timestamp);
      return timestampDelta !== 0 ? timestampDelta : a.id.localeCompare(b.id);
    });
  const recordedMeta = new Map<string, {
    field: string;
    label: string;
    source: string;
    confidence: OpportunitySourceProvenanceConfidence;
    note?: string;
  }>();
  const currentStatus = new Map<string, FieldEvidenceAuditEntry['currentStatus']>();

  for (const event of relevantEvents) {
    const status = auditStatusForEvent(event);
    if (!status) continue;
    if (status === 'recorded') {
      const field = textMeta(event, 'field') || 'unknown';
      recordedMeta.set(event.id, {
        field,
        label: textMeta(event, 'label') || field,
        source: textMeta(event, 'source') || 'manual_field_evidence',
        confidence: confidenceMeta(event),
        ...(textMeta(event, 'note') ? { note: textMeta(event, 'note') } : {}),
      });
      currentStatus.set(event.id, 'active');
      continue;
    }

    const evidenceId = textMeta(event, 'evidenceId');
    if (!evidenceId || !currentStatus.has(evidenceId)) continue;
    currentStatus.set(evidenceId, status === 'invalidated' ? 'invalidated' : 'active');
  }

  const entries = relevantEvents
    .map((event): FieldEvidenceAuditEntry | null => {
      const status = auditStatusForEvent(event);
      if (!status) return null;
      const evidenceId = status === 'recorded' ? event.id : textMeta(event, 'evidenceId');
      if (!evidenceId) return null;
      const base = recordedMeta.get(evidenceId);
      const field = textMeta(event, 'field') || base?.field || 'unknown';
      const source = textMeta(event, 'source') || base?.source || 'manual_field_evidence';
      const confidence = confidenceMeta(event) === 'unknown' && base?.confidence
        ? base.confidence
        : confidenceMeta(event);
      return {
        id: `${event.id}:${status}`,
        eventId: event.id,
        evidenceId,
        status,
        currentStatus: currentStatus.get(evidenceId) || 'active',
        field,
        label: textMeta(event, 'label') || base?.label || field,
        source,
        confidence,
        ...(textMeta(event, 'note') || base?.note ? { note: textMeta(event, 'note') || base?.note } : {}),
        ...(textMeta(event, 'reason') ? { reason: textMeta(event, 'reason') } : {}),
        observedAt: textMeta(event, 'observedAt') || event.timestamp,
        canRestore: status === 'invalidated' && currentStatus.get(evidenceId) === 'invalidated',
      };
    })
    .filter((entry): entry is FieldEvidenceAuditEntry => Boolean(entry));

  const status = filters.status || 'all';
  const field = filters.field || 'all';
  const source = filters.source || 'all';
  const confidence = filters.confidence || 'all';
  const filtered = entries
    .filter((entry) => status === 'all' || entry.status === status)
    .filter((entry) => field === 'all' || entry.field === field)
    .filter((entry) => source === 'all' || entry.source === source)
    .filter((entry) => confidence === 'all' || entry.confidence === confidence)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

  const counts = new Map<FieldEvidenceAuditStatus, number>();
  for (const entry of entries) {
    counts.set(entry.status, (counts.get(entry.status) || 0) + 1);
  }

  return {
    facets: [
      { id: 'all', label: 'All', count: entries.length },
      ...Object.entries(AUDIT_STATUS_LABELS).map(([id, label]) => ({
        id: id as FieldEvidenceAuditStatus,
        label,
        count: counts.get(id as FieldEvidenceAuditStatus) || 0,
      })).filter((facet) => facet.count > 0),
    ],
    entries: filtered.slice(0, limit),
    fields: [...new Set(entries.map((entry) => entry.field))].sort((a, b) => a.localeCompare(b)),
    sources: [...new Set(entries.map((entry) => entry.source))].sort((a, b) => a.localeCompare(b)),
    confidences: [...new Set(entries.map((entry) => entry.confidence))].sort((a, b) => CONFIDENCE_ORDER[a] - CONFIDENCE_ORDER[b]),
    hiddenCount: Math.max(0, filtered.length - limit),
  };
}
