import type {
  OpportunityFieldEvidenceRef,
  OpportunitySourceProvenanceConfidence,
  OpportunitySourceProvenanceItem,
  OpportunitySummary,
} from '../../api';

export type SourceProvenanceFieldStatus = 'confirmed' | 'weak' | 'missing' | 'conflict';

export type SourceProvenanceFieldInspection = {
  field: string;
  label: string;
  status: SourceProvenanceFieldStatus;
  sourceCount: number;
  confidence: OpportunitySourceProvenanceConfidence;
  provenanceItems: OpportunitySourceProvenanceItem[];
  evidenceItems: OpportunityFieldEvidenceRef[];
  adoptedValue?: string;
  valueGroups: SourceProvenanceValueGroup[];
  valueCount: number;
  reviewHint: string;
};

export type SourceProvenanceValueGroup = {
  value: string;
  sources: string[];
  confidence: OpportunitySourceProvenanceConfidence;
  count: number;
  adopted: boolean;
};

export type SourceProvenanceInspection = {
  totalFields: number;
  confirmedFields: number;
  weakFields: number;
  missingFields: number;
  conflictFields: number;
  rows: SourceProvenanceFieldInspection[];
  hiddenCount: number;
};

const CONFIDENCE_ORDER: Record<OpportunitySourceProvenanceConfidence, number> = {
  confirmed: 0,
  inferred: 1,
  placeholder: 2,
  unknown: 3,
};

function compactValue(value?: string): string {
  return (value || '').trim();
}

function itemValue(item: { value?: string; note?: string }): string {
  return compactValue(item.value) || compactValue(item.note);
}

function bestConfidence(items: Array<{ confidence: OpportunitySourceProvenanceConfidence }>): OpportunitySourceProvenanceConfidence {
  return [...items]
    .map((item) => item.confidence)
    .sort((a, b) => CONFIDENCE_ORDER[a] - CONFIDENCE_ORDER[b])[0] || 'unknown';
}

function bestItem<T extends {
  confidence: OpportunitySourceProvenanceConfidence;
  value?: string;
  note?: string;
}>(items: T[]): T | undefined {
  return [...items]
    .filter((item) => itemValue(item))
    .sort((a, b) => {
      const confidenceDelta = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;
      return itemValue(a).localeCompare(itemValue(b));
    })[0];
}

function buildValueGroups(
  items: Array<OpportunitySourceProvenanceItem | OpportunityFieldEvidenceRef>,
  adoptedValue?: string,
): SourceProvenanceValueGroup[] {
  const adoptedKey = compactValue(adoptedValue).toLowerCase();
  const byValue = new Map<string, {
    value: string;
    sources: Set<string>;
    confidences: Set<OpportunitySourceProvenanceConfidence>;
    count: number;
  }>();

  for (const item of items) {
    const value = itemValue(item);
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
    .map(([key, group]) => {
      const confidence = [...group.confidences].sort((a, b) => CONFIDENCE_ORDER[a] - CONFIDENCE_ORDER[b])[0] || 'unknown';
      return {
        value: group.value,
        sources: [...group.sources].sort(),
        confidence,
        count: group.count,
        adopted: Boolean(adoptedKey) && key === adoptedKey,
      };
    })
    .sort((a, b) => {
      if (a.adopted !== b.adopted) return a.adopted ? -1 : 1;
      const confidenceDelta = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;
      return b.count - a.count;
    });
}

function fieldStatus(input: {
  confidence: OpportunitySourceProvenanceConfidence;
  valueCount: number;
  hasConcreteValue: boolean;
}): SourceProvenanceFieldStatus {
  if (input.valueCount > 1) return 'conflict';
  if (!input.hasConcreteValue) return 'missing';
  if (input.confidence !== 'confirmed') return 'weak';
  return 'confirmed';
}

export function sourceProvenanceStatusLabel(status: SourceProvenanceFieldStatus): string {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'conflict') return 'Conflict';
  if (status === 'missing') return 'Missing';
  return 'Weak';
}

export function sourceProvenanceReviewHint(status: SourceProvenanceFieldStatus): string {
  if (status === 'conflict') return 'Resolve competing values before using this field in sizing or timing.';
  if (status === 'missing') return 'Add a concrete value or source note before treating this field as evidence.';
  if (status === 'weak') return 'Confirm this source with filing, mission output, or manual evidence.';
  return 'Confirmed source chain is usable.';
}

export function buildSourceProvenanceInspection(
  opportunity: OpportunitySummary,
  limit = 4,
): SourceProvenanceInspection | null {
  const provenance = opportunity.sourceProvenance;
  const fieldEvidenceItems = opportunity.fieldEvidence?.items || [];
  if ((!provenance || provenance.total === 0) && fieldEvidenceItems.length === 0) return null;

  const evidenceByField = new Map<string, OpportunityFieldEvidenceRef[]>();
  for (const evidence of fieldEvidenceItems) {
    const items = evidenceByField.get(evidence.field) || [];
    items.push(evidence);
    evidenceByField.set(evidence.field, items);
  }

  const provenanceByField = new Map<string, OpportunitySourceProvenanceItem[]>();
  for (const item of provenance?.items || []) {
    const items = provenanceByField.get(item.field) || [];
    items.push(item);
    provenanceByField.set(item.field, items);
  }

  const fields = new Set<string>([
    ...provenanceByField.keys(),
    ...evidenceByField.keys(),
  ]);

  const rows = [...fields]
    .map((field): SourceProvenanceFieldInspection => {
      const provenanceItems = provenanceByField.get(field) || [];
      const evidenceItems = evidenceByField.get(field) || [];
      const allItems = [...provenanceItems, ...evidenceItems];
      const values = new Set(allItems.map(itemValue).filter(Boolean));
      const adopted = bestItem(allItems);
      const adoptedValue = adopted ? itemValue(adopted) : undefined;
      const confidence = bestConfidence(allItems);
      const sources = new Set(allItems.map((item) => item.source).filter(Boolean));
      const status = fieldStatus({
        confidence,
        valueCount: values.size,
        hasConcreteValue: values.size > 0,
      });
      return {
        field,
        label: provenanceItems[0]?.label || evidenceItems[0]?.label || field,
        status,
        sourceCount: sources.size,
        confidence,
        provenanceItems,
        evidenceItems,
        ...(adoptedValue ? { adoptedValue } : {}),
        valueGroups: buildValueGroups(allItems, adoptedValue),
        valueCount: values.size,
        reviewHint: sourceProvenanceReviewHint(status),
      };
    })
    .sort((a, b) => {
      const statusDelta = statusRank(a.status) - statusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      const confidenceDelta = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;
      return a.field.localeCompare(b.field);
    });

  return {
    totalFields: rows.length,
    confirmedFields: rows.filter((row) => row.status === 'confirmed').length,
    weakFields: rows.filter((row) => row.status === 'weak').length,
    missingFields: rows.filter((row) => row.status === 'missing').length,
    conflictFields: rows.filter((row) => row.status === 'conflict').length,
    rows: rows.slice(0, limit),
    hiddenCount: Math.max(0, rows.length - limit),
  };
}

function statusRank(status: SourceProvenanceFieldStatus): number {
  if (status === 'conflict') return 0;
  if (status === 'missing') return 1;
  if (status === 'weak') return 2;
  return 3;
}
