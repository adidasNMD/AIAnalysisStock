import type {
  ImportOpportunityFieldRegistryItem,
  OpportunityFieldEvidenceRepairAction,
  OpportunityFieldEvidenceStatus,
} from '../api';

export interface EvidenceRepairSearchSeed {
  q?: string;
  field?: string;
  status?: OpportunityFieldEvidenceStatus;
}

export function evidenceRepairSearchSeed(
  action: OpportunityFieldEvidenceRepairAction,
): EvidenceRepairSearchSeed {
  return {
    ...(action.evidenceId ? { q: action.evidenceId } : {}),
    ...(action.field ? { field: action.field } : {}),
    ...(action.canonicalStatus ? { status: action.canonicalStatus } : {}),
  };
}

export function evidenceRepairSearchUrl(action: OpportunityFieldEvidenceRepairAction) {
  const seed = evidenceRepairSearchSeed(action);
  const params = new URLSearchParams();
  if (seed.q) params.set('q', seed.q);
  if (seed.field) params.set('field', seed.field);
  if (seed.status) params.set('status', seed.status);
  const query = params.toString();
  return query ? `/evidence?${query}` : '/evidence';
}

export function registryDraftField(action: OpportunityFieldEvidenceRepairAction) {
  const fallback = action.evidenceId || action.opportunityId || 'manual-field';
  const compact = fallback
    .replace(/[^a-zA-Z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48);
  return `custom.${compact || 'manualField'}`;
}

export function registryDraftItem(
  action: OpportunityFieldEvidenceRepairAction,
): ImportOpportunityFieldRegistryItem {
  return {
    field: action.field || registryDraftField(action),
    label: action.field || 'Recovered evidence field',
    kind: 'source',
    source: 'manual_event_repair',
    confidence: 'unknown',
    note: [
      `Diagnostic draft for ${action.issueCode}.`,
      action.evidenceId ? `Evidence: ${action.evidenceId}.` : '',
      action.opportunityId ? `Opportunity: ${action.opportunityId}.` : '',
      action.reason,
    ].filter(Boolean).join(' '),
  };
}

export function registryDraftUrl(action: OpportunityFieldEvidenceRepairAction) {
  const params = new URLSearchParams({
    importDraft: JSON.stringify({ items: [registryDraftItem(action)] }),
  });
  return `/field-registry?${params.toString()}`;
}

export function isManualFieldEvidenceRepair(action: OpportunityFieldEvidenceRepairAction) {
  return action.safety !== 'automatic' || action.issueCode === 'missing_field';
}
