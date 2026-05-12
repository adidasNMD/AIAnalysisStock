import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db');
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

let db: Database | null = null;

beforeEach(async () => {
  vi.clearAllMocks();
  const { initDb } = await import('../db');
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });
  await initDb(db);
  mocks.getDb.mockResolvedValue(db);
});

afterEach(async () => {
  if (db) await db.close();
  db = null;
});

describe('opportunity field evidence backfill', () => {
  it('lists canonical field evidence across opportunities with filters', async () => {
    const {
      createOpportunity,
      listOpportunityFieldEvidenceIndex,
      recordOpportunityFieldEvidence,
    } = await import('../workflows/opportunities');
    const opportunity = await createOpportunity({
      type: 'relay_chain',
      title: 'AI power relay',
      primaryTicker: 'VRT',
      scores: { relayScore: 88 },
    });
    await recordOpportunityFieldEvidence({
      id: 'evidence-active',
      opportunityId: opportunity.id,
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_review',
      confidence: 'confirmed',
      value: '88',
      observedAt: '2026-05-08T09:30:00.000Z',
      recordedAt: '2026-05-08T09:31:00.000Z',
      createdEventId: 'event-active',
    });
    await recordOpportunityFieldEvidence({
      id: 'evidence-other',
      opportunityId: opportunity.id,
      field: 'thesis',
      label: 'Thesis',
      kind: 'record',
      source: 'opportunity_record',
      confidence: 'unknown',
      note: 'Baseline thesis.',
      recordedAt: '2026-05-07T09:31:00.000Z',
      createdEventId: 'event-other',
    });

    await expect(listOpportunityFieldEvidenceIndex({
      limit: 10,
      filters: {
        q: 'VRT',
        status: 'active',
        confidence: 'confirmed',
      },
    })).resolves.toEqual([
      expect.objectContaining({
        id: 'evidence-active',
        opportunityId: opportunity.id,
        opportunityTitle: 'AI power relay',
        opportunityPrimaryTicker: 'VRT',
        field: 'scores.relayScore',
        confidence: 'confirmed',
      }),
    ]);
    await expect(listOpportunityFieldEvidenceIndex({
      limit: 10,
      filters: { q: 'evidence-active' },
    })).resolves.toEqual([
      expect.objectContaining({
        id: 'evidence-active',
        field: 'scores.relayScore',
      }),
    ]);
    await expect(listOpportunityFieldEvidenceIndex({
      limit: 10,
      filters: { field: 'missing.field' },
    })).resolves.toEqual([]);
  });

  it('backfills legacy field evidence events into canonical rows and reports coverage', async () => {
    const {
      backfillOpportunityFieldEvidence,
      getOpportunityFieldEvidenceCoverageDiagnostics,
      listOpportunityFieldEvidence,
    } = await import('../workflows/opportunities');
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-record',
      'opp-1',
      '2026-04-28T03:00:00.000Z',
      'field_evidence_recorded',
      'Field evidence recorded',
      JSON.stringify({
        field: 'scores.relayScore',
        source: 'manual_review',
        confidence: 'confirmed',
        note: 'Legacy evidence.',
      }),
    );
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-invalidated',
      'opp-1',
      '2026-04-28T03:05:00.000Z',
      'field_evidence_invalidated',
      'Field evidence invalidated',
      JSON.stringify({ evidenceId: 'evt-record', reason: 'Superseded.' }),
    );
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-restored',
      'opp-1',
      '2026-04-28T03:10:00.000Z',
      'field_evidence_restored',
      'Field evidence restored',
      JSON.stringify({ evidenceId: 'evt-record', reason: 'Rechecked.' }),
    );

    await expect(getOpportunityFieldEvidenceCoverageDiagnostics()).resolves.toMatchObject({
      status: 'degraded',
      recordedEvents: 1,
      canonicalRows: 0,
      missingCanonical: 1,
    });

    await expect(backfillOpportunityFieldEvidence()).resolves.toMatchObject({
      eventsScanned: 3,
      recordedEvents: 1,
      invalidatedEvents: 1,
      restoredEvents: 1,
      inserted: 1,
      refreshed: 0,
      restored: 1,
      skippedMissingField: 0,
    });

    await expect(listOpportunityFieldEvidence('opp-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'evt-record',
        opportunityId: 'opp-1',
        field: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
        source: 'manual_review',
        confidence: 'confirmed',
        status: 'active',
        note: 'Legacy evidence.',
        createdEventId: 'evt-record',
        restoredEventId: 'evt-restored',
      }),
    ]);
    await expect(getOpportunityFieldEvidenceCoverageDiagnostics()).resolves.toMatchObject({
      status: 'ok',
      recordedEvents: 1,
      canonicalRows: 1,
      covered: 1,
      missingCanonical: 0,
      statusMismatch: 0,
    });
  });

  it('builds and applies safe field evidence repair actions', async () => {
    const {
      getOpportunityFieldEvidenceRepairPlan,
      listOpportunityFieldEvidence,
      recordOpportunityFieldEvidence,
      repairOpportunityFieldEvidence,
    } = await import('../workflows/opportunities');
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-missing-canonical',
      'opp-1',
      '2026-04-28T03:00:00.000Z',
      'field_evidence_recorded',
      'Field evidence recorded',
      JSON.stringify({
        field: 'scores.relayScore',
        source: 'manual_review',
        confidence: 'confirmed',
        value: '91',
      }),
    );
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-status-mismatch',
      'opp-1',
      '2026-04-28T03:10:00.000Z',
      'field_evidence_recorded',
      'Field evidence recorded',
      JSON.stringify({
        field: 'thesis',
        source: 'manual_review',
        confidence: 'confirmed',
        note: 'Needs invalidation.',
      }),
    );
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-status-invalidated',
      'opp-1',
      '2026-04-28T03:11:00.000Z',
      'field_evidence_invalidated',
      'Field evidence invalidated',
      JSON.stringify({ evidenceId: 'evt-status-mismatch', reason: 'Superseded.' }),
    );
    await db!.run(
      `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'evt-missing-field',
      'opp-1',
      '2026-04-28T03:12:00.000Z',
      'field_evidence_recorded',
      'Field evidence recorded',
      JSON.stringify({ source: 'manual_review', confidence: 'unknown' }),
    );
    await recordOpportunityFieldEvidence({
      id: 'evt-status-mismatch',
      opportunityId: 'opp-1',
      field: 'thesis',
      label: 'Thesis',
      kind: 'record',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Needs invalidation.',
      recordedAt: '2026-04-28T03:10:00.000Z',
      createdEventId: 'evt-status-mismatch',
    });
    await recordOpportunityFieldEvidence({
      id: 'canonical-orphan',
      opportunityId: 'opp-1',
      field: 'summary',
      label: 'Summary',
      kind: 'record',
      source: 'manual_review',
      confidence: 'unknown',
      note: 'No audit event.',
      recordedAt: '2026-04-28T03:13:00.000Z',
      createdEventId: 'canonical-orphan',
    });

    await expect(getOpportunityFieldEvidenceRepairPlan()).resolves.toMatchObject({
      status: 'blocked',
      recordedEvents: 3,
      canonicalRows: 2,
      totalActions: 4,
      automaticActions: 2,
      manualReviewActions: 1,
      blockedActions: 1,
      sampledActions: expect.arrayContaining([
        expect.objectContaining({
          evidenceId: 'evt-missing-canonical',
          action: 'backfill_canonical',
          safety: 'automatic',
        }),
        expect.objectContaining({
          evidenceId: 'evt-status-mismatch',
          action: 'sync_status',
          safety: 'automatic',
        }),
        expect.objectContaining({
          evidenceId: 'canonical-orphan',
          action: 'review_orphan',
          safety: 'manual_review',
        }),
        expect.objectContaining({
          evidenceId: 'evt-missing-field',
          action: 'repair_event_metadata',
          safety: 'blocked',
        }),
      ]),
    });

    await expect(repairOpportunityFieldEvidence()).resolves.toMatchObject({
      totalEvidence: 4,
      totalActions: 4,
      eligibleActions: 2,
      applied: 2,
      skippedManualReview: 1,
      blocked: 1,
      updatedEvidenceIds: expect.arrayContaining(['evt-missing-canonical', 'evt-status-mismatch']),
    });
    await expect(listOpportunityFieldEvidence('opp-1')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'evt-missing-canonical',
        field: 'scores.relayScore',
        status: 'active',
        value: '91',
      }),
      expect.objectContaining({
        id: 'evt-status-mismatch',
        field: 'thesis',
        status: 'invalidated',
        invalidatedEventId: 'evt-status-invalidated',
      }),
      expect.objectContaining({
        id: 'canonical-orphan',
        status: 'active',
      }),
    ]));
    await expect(repairOpportunityFieldEvidence({ evidenceIds: ['missing-id'] })).resolves.toMatchObject({
      requestedEvidenceIds: ['missing-id'],
      notFoundEvidenceIds: ['missing-id'],
      totalActions: 0,
      applied: 0,
    });
  });
});
