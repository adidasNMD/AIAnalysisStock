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

describe('opportunity field registry persistence', () => {
  it('records audit history for registry override updates and resets', async () => {
    const {
      deleteOpportunityFieldRegistryOverride,
      listOpportunityFieldRegistryAudit,
      upsertOpportunityFieldRegistryOverride,
    } = await import('../workflows/opportunities');

    const created = await upsertOpportunityFieldRegistryOverride({
      field: 'scores.relayScore',
      label: 'Relay momentum',
      source: 'manual_registry',
      confidence: 'confirmed',
      note: 'Desk naming preference.',
      updatedAt: '2026-05-09T01:00:00.000Z',
      updatedBy: 'dashboard',
    });
    expect(created.audit).toMatchObject({
      action: 'upsert',
      changedFields: ['label', 'source', 'confidence', 'note'],
      after: expect.objectContaining({
        field: 'scores.relayScore',
        label: 'Relay momentum',
      }),
    });

    const updated = await upsertOpportunityFieldRegistryOverride({
      field: 'scores.relayScore',
      label: 'Relay pressure',
      source: 'manual_registry',
      confidence: 'confirmed',
      note: 'Desk naming preference.',
      updatedAt: '2026-05-09T01:05:00.000Z',
      updatedBy: 'dashboard',
    });
    expect(updated.audit).toMatchObject({
      action: 'upsert',
      changedFields: ['label'],
      before: expect.objectContaining({ label: 'Relay momentum' }),
      after: expect.objectContaining({ label: 'Relay pressure' }),
    });

    const reset = await deleteOpportunityFieldRegistryOverride('scores.relayScore');
    expect(reset).toMatchObject({
      deleted: true,
      audit: expect.objectContaining({
        action: 'delete',
        changedFields: ['label', 'source', 'confidence', 'note'],
        before: expect.objectContaining({ label: 'Relay pressure' }),
      }),
    });

    const history = await listOpportunityFieldRegistryAudit({
      field: 'scores.relayScore',
      limit: 10,
    });
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.action)).toEqual(['delete', 'upsert', 'upsert']);
    expect(history[0]).toEqual(expect.objectContaining({
      action: 'delete',
      updatedBy: 'dashboard',
    }));
  });
});
