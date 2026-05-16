import { describe, expect, it } from 'vitest';

import type { OpportunityFieldEvidenceRepairAction } from '../../dashboard/src/api';
import {
  evidenceRepairSearchSeed,
  evidenceRepairSearchUrl,
  isManualFieldEvidenceRepair,
  registryDraftField,
  registryDraftItem,
  registryDraftUrl,
} from '../../dashboard/src/utils/field-evidence-repair';

function repairAction(
  overrides: Partial<OpportunityFieldEvidenceRepairAction> = {},
): OpportunityFieldEvidenceRepairAction {
  return {
    evidenceId: 'evt missing field/1',
    issueCode: 'missing_field',
    action: 'repair_event_metadata',
    safety: 'manual_review',
    reason: 'Recorded field evidence event is missing field metadata.',
    opportunityId: 'opp-1',
    ...overrides,
  };
}

describe('field evidence repair links', () => {
  it('builds evidence center filter seeds and URLs from repair actions', () => {
    const action = repairAction({
      issueCode: 'status_mismatch',
      field: 'scores.relayScore',
      canonicalStatus: 'invalidated',
    });

    expect(evidenceRepairSearchSeed(action)).toEqual({
      q: 'evt missing field/1',
      field: 'scores.relayScore',
      status: 'invalidated',
    });
    expect(evidenceRepairSearchUrl(action)).toBe(
      '/evidence?q=evt+missing+field%2F1&field=scores.relayScore&status=invalidated',
    );
  });

  it('creates stable Field Registry import drafts for missing field metadata', () => {
    const action = repairAction();

    expect(registryDraftField(action)).toBe('custom.evt.missing.field.1');
    expect(registryDraftItem(action)).toMatchObject({
      field: 'custom.evt.missing.field.1',
      label: 'Recovered evidence field',
      kind: 'source',
      source: 'manual_event_repair',
      confidence: 'unknown',
      note: expect.stringContaining('Evidence: evt missing field/1.'),
    });

    const url = registryDraftUrl(action);
    const payload = JSON.parse(new URLSearchParams(url.split('?')[1]).get('importDraft') || '{}') as {
      items: Array<{ field: string; note: string }>;
    };

    expect(url.startsWith('/field-registry?importDraft=')).toBe(true);
    expect(payload.items[0]).toMatchObject({
      field: 'custom.evt.missing.field.1',
      note: expect.stringContaining('Opportunity: opp-1.'),
    });
  });

  it('uses known fields directly in registry drafts', () => {
    expect(registryDraftItem(repairAction({ field: 'policyStatus' }))).toMatchObject({
      field: 'policyStatus',
      label: 'policyStatus',
    });
  });

  it('classifies non-automatic and missing-field actions as manual repairs', () => {
    expect(isManualFieldEvidenceRepair(repairAction({ safety: 'manual_review' }))).toBe(true);
    expect(isManualFieldEvidenceRepair(repairAction({ safety: 'blocked' }))).toBe(true);
    expect(isManualFieldEvidenceRepair(repairAction({ safety: 'automatic', issueCode: 'missing_field' }))).toBe(true);
    expect(isManualFieldEvidenceRepair(repairAction({ safety: 'automatic', issueCode: 'missing_canonical' }))).toBe(false);
  });
});
