import { describe, expect, it } from 'vitest';
import {
  createOpportunityPayloadSchema,
  fieldEvidenceBatchPayloadSchema,
  fieldEvidenceBulkStatusPayloadSchema,
  fieldEvidenceInvalidationPayloadSchema,
  fieldEvidencePayloadSchema,
  fieldEvidenceRestorationPayloadSchema,
  fieldRegistryImportPayloadSchema,
  preTradeConfirmationPayloadSchema,
  updateOpportunityPayloadSchema,
} from '../server/validation';

function issuePaths(result: ReturnType<typeof createOpportunityPayloadSchema.safeParse>) {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('opportunity payload validation', () => {
  it('accepts a typed relay heat profile with bounded edges', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      type: 'relay_chain',
      title: 'AI Infra Relay',
      query: 'AI Infra relay chain',
      scores: {
        relayScore: 82,
        tradeabilityScore: 74,
      },
      heatProfile: {
        temperature: 'warming',
        bottleneckTickers: ['MU', 'AVGO'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 78,
        validationStatus: 'forming',
        edgeCount: 1,
        edges: [
          {
            from: 'CRWV',
            to: 'MU',
            weight: 72,
            kind: 'leader_to_bottleneck',
            reason: 'Leader confirmation is moving into memory bottlenecks.',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects malformed heat profiles before they reach persistence', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      type: 'relay_chain',
      title: 'Broken Relay',
      query: 'Broken relay',
      heatProfile: {
        temperature: 'boiling',
        validationStatus: 'validated',
        edges: [
          {
            from: 'CRWV',
            to: 'MU',
            weight: 120,
            kind: 'leader_to_bottleneck',
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(expect.arrayContaining([
      'heatProfile.temperature',
      'heatProfile.validationStatus',
      'heatProfile.edges.0.weight',
    ]));
  });

  it('accepts partial proxy profiles but rejects unknown profile keys', () => {
    const valid = createOpportunityPayloadSchema.safeParse({
      type: 'proxy_narrative',
      title: 'Policy Proxy',
      query: 'Policy proxy narrative',
      proxyProfile: {
        mappingTarget: 'AI policy theme',
        legitimacyScore: 77,
        ruleStatus: 'Named in filing review',
      },
    });

    const invalid = createOpportunityPayloadSchema.safeParse({
      type: 'proxy_narrative',
      title: 'Policy Proxy',
      query: 'Policy proxy narrative',
      proxyProfile: {
        legitimacyScore: 77,
        arbitraryNestedPayload: { unsafe: true },
      },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(issuePaths(invalid)).toContain('proxyProfile');
  });

  it('validates IPO profile evidence and retained stake ranges', () => {
    const valid = updateOpportunityPayloadSchema.safeParse({
      ipoProfile: {
        retainedStakePercent: 19.9,
        lockupDate: '2026-07-30',
        evidence: {
          retainedStakePercent: {
            source: 'S-1 filing',
            confidence: 'confirmed',
            observedAt: '2026-04-28T00:00:00.000Z',
          },
        },
      },
    });

    const invalid = updateOpportunityPayloadSchema.safeParse({
      ipoProfile: {
        retainedStakePercent: 150,
        evidence: {
          lockupDate: {
            source: 'Calendar scrape',
            confidence: 'certain',
          },
        },
      },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'ipoProfile.retainedStakePercent',
      'ipoProfile.evidence.lockupDate.confidence',
    ]));
  });

  it('rejects out-of-range top-level scores', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      title: 'Bad Score',
      query: 'Bad score',
      scores: {
        purityScore: 101,
      },
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('scores.purityScore');
  });

  it('rejects unknown top-level and catalyst fields', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      title: 'Unexpected Payload',
      query: 'Unexpected payload',
      unsafeField: true,
      catalystCalendar: [
        {
          label: 'Earnings',
          status: 'upcoming',
          arbitraryNestedPayload: { unsafe: true },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(expect.arrayContaining(['', 'catalystCalendar.0']));
  });

  it('requires title or query when creating opportunities', () => {
    const result = createOpportunityPayloadSchema.safeParse({
      thesis: 'No title or query should fail before persistence.',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('title');
  });

  it('validates pre-trade confirmation audit payloads', () => {
    const valid = preTradeConfirmationPayloadSchema.safeParse({
      itemId: 'catalyst_window',
      label: 'Catalyst window',
      status: 'block',
      completed: true,
      evidence: 'Company calendar pending',
      actionKind: 'fill_date',
      catalystUrgency: 'missing_date',
      readiness: 'blocked',
      score: 66,
    });
    const invalid = preTradeConfirmationPayloadSchema.safeParse({
      itemId: '',
      label: 'Risk/reward',
      status: 'bad',
      completed: 'yes',
      score: 120,
      unsafe: true,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'itemId',
      'status',
      'completed',
      'score',
      '',
    ]));
  });

  it('validates manual field evidence audit payloads', () => {
    const valid = fieldEvidencePayloadSchema.safeParse({
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Verified against latest mission evidence.',
    });
    const invalid = fieldEvidencePayloadSchema.safeParse({
      field: '',
      kind: 'unsafe',
      confidence: 'certain',
      extra: true,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'field',
      'kind',
      'confidence',
      '',
    ]));
  });

  it('validates manual field evidence batch payloads', () => {
    const valid = fieldEvidenceBatchPayloadSchema.safeParse({
      batchId: 'batch-1',
      items: [
        {
          clientId: 'draft-1',
          field: 'scores.relayScore',
          label: 'Relay score',
          kind: 'score',
          source: 'manual_review',
          confidence: 'confirmed',
          note: 'Verified against latest evidence.',
        },
      ],
    });
    const invalid = fieldEvidenceBatchPayloadSchema.safeParse({
      batchId: 'batch-2',
      items: [
        {
          clientId: 'draft-unsafe',
          field: '',
          confidence: 'certain',
          extra: true,
        },
      ],
    });
    const missingEvidence = fieldEvidenceBatchPayloadSchema.safeParse({
      items: [
        {
          clientId: 'draft-empty',
          field: 'scores.relayScore',
          confidence: 'confirmed',
        },
      ],
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'items.0.field',
      'items.0.confidence',
      'items.0',
    ]));
    expect(missingEvidence.success).toBe(false);
    expect(missingEvidence.success ? [] : missingEvidence.error.issues.map((issue) => issue.path.join('.'))).toContain(
      'items.0.note',
    );
  });

  it('validates manual field evidence invalidation payloads', () => {
    const valid = fieldEvidenceInvalidationPayloadSchema.safeParse({
      reason: 'Manual review superseded this evidence.',
      field: 'scores.relayScore',
      source: 'manual_review',
    });
    const invalid = fieldEvidenceInvalidationPayloadSchema.safeParse({
      reason: '',
      arbitraryNestedPayload: true,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'reason',
      '',
    ]));
  });

  it('validates manual field evidence restoration payloads', () => {
    const valid = fieldEvidenceRestorationPayloadSchema.safeParse({
      reason: 'Manual review restored this evidence.',
      field: 'scores.relayScore',
      source: 'manual_review',
    });
    const invalid = fieldEvidenceRestorationPayloadSchema.safeParse({
      reason: '',
      unsafe: true,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'reason',
      '',
    ]));
  });

  it('validates bulk field evidence status payloads', () => {
    const valid = fieldEvidenceBulkStatusPayloadSchema.safeParse({
      action: 'invalidate',
      reason: 'Batch review superseded selected evidence.',
      items: [
        {
          opportunityId: 'opp-1',
          evidenceId: 'evt-1',
          field: 'scores.relayScore',
          source: 'manual_review',
        },
      ],
    });
    const invalid = fieldEvidenceBulkStatusPayloadSchema.safeParse({
      action: 'delete',
      reason: '',
      items: [{ opportunityId: '', evidenceId: '', extra: true }],
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'action',
      'reason',
      'items.0.opportunityId',
      'items.0.evidenceId',
      'items.0',
    ]));
  });

  it('validates field registry import payloads', () => {
    const valid = fieldRegistryImportPayloadSchema.safeParse({
      dryRun: true,
      updatedBy: 'dashboard-import',
      items: [
        {
          field: 'scores.relayScore',
          label: 'Relay momentum score',
          kind: 'score',
          source: 'manual_registry',
          confidence: 'confirmed',
          note: 'Desk-reviewed default.',
          updatedAt: '2026-05-09T00:00:00.000Z',
        },
      ],
    });
    const invalid = fieldRegistryImportPayloadSchema.safeParse({
      items: [
        {
          field: '',
          kind: 'bad',
          unsafe: true,
        },
        {
          field: 'scores.policyScore',
        },
      ],
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.success ? [] : invalid.error.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining([
      'items.0.field',
      'items.0.kind',
      'items.0',
      'items.1.field',
    ]));
  });
});
