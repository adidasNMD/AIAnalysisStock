import { describe, expect, it } from 'vitest';

import {
  listEffectiveOpportunityFieldRegistry,
  lookupOpportunityFieldRegistry,
  normalizeOpportunityFieldEvidenceDescriptor,
} from '../workflows/opportunity-field-registry';

describe('opportunity field registry', () => {
  it('normalizes score fields without relying on caller-provided labels', () => {
    expect(normalizeOpportunityFieldEvidenceDescriptor({
      field: 'scores.relayScore',
      source: 'manual_review',
      confidence: 'confirmed',
    })).toMatchObject({
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_review',
      confidence: 'confirmed',
      registryGroup: 'score',
    });
  });

  it('recognizes dynamic catalyst fields through the wildcard registry entry', () => {
    expect(lookupOpportunityFieldRegistry('catalystCalendar.2')).toMatchObject({
      field: 'catalystCalendar.*',
      label: 'Catalyst',
      kind: 'source',
      source: 'catalyst_calendar',
      group: 'catalyst',
    });
  });

  it('falls back to manual evidence semantics for unknown fields', () => {
    expect(normalizeOpportunityFieldEvidenceDescriptor({
      field: 'custom.reviewNote',
    })).toMatchObject({
      field: 'custom.reviewNote',
      label: 'custom.reviewNote',
      kind: 'source',
      source: 'manual_field_evidence',
      confidence: 'unknown',
    });
  });

  it('applies editable overrides to registry defaults while preserving explicit inputs', () => {
    const overrides = [{
      field: 'scores.relayScore',
      label: 'Relay momentum score',
      source: 'custom_score_registry',
      confidence: 'confirmed' as const,
      updatedAt: '2026-05-09T00:00:00.000Z',
    }];

    expect(lookupOpportunityFieldRegistry('scores.relayScore', overrides)).toMatchObject({
      field: 'scores.relayScore',
      label: 'Relay momentum score',
      kind: 'score',
      source: 'custom_score_registry',
      confidence: 'confirmed',
      group: 'score',
    });
    expect(normalizeOpportunityFieldEvidenceDescriptor({
      field: 'scores.relayScore',
      source: 'manual_review',
      overrides,
    })).toMatchObject({
      label: 'Relay momentum score',
      source: 'manual_review',
      confidence: 'confirmed',
      registryGroup: 'score',
    });
  });

  it('lists effective registry entries with override metadata', () => {
    const entries = listEffectiveOpportunityFieldRegistry([{
      field: 'custom.executionGate',
      label: 'Execution gate',
      kind: 'record',
      source: 'manual_checklist',
      confidence: 'unknown',
      note: 'Desk-specific checklist field',
      updatedAt: '2026-05-09T00:00:00.000Z',
    }]);

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'custom.executionGate',
        group: 'custom',
        overriddenFields: ['label', 'kind', 'source', 'confidence'],
        note: 'Desk-specific checklist field',
      }),
      expect.objectContaining({
        field: 'scores.relayScore',
        base: expect.objectContaining({
          label: 'Relay score',
          source: 'opportunity_scores',
        }),
      }),
    ]));
  });
});
