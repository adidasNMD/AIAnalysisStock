import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityEventEnvelope } from '../workflows';
import {
  getOpportunitySseReplayCursor,
  writeOpportunitySseEnvelope,
} from '../server/services/opportunity-stream-service';

describe('opportunity stream service', () => {
  it('prefers query replay cursor over Last-Event-ID header', () => {
    const req = {
      query: { since: ' event-query ' },
      headers: { 'last-event-id': 'event-header' },
    } as Pick<Request, 'query' | 'headers'>;

    expect(getOpportunitySseReplayCursor(req)).toBe('event-query');
  });

  it('falls back to Last-Event-ID array headers', () => {
    const req = {
      query: {},
      headers: { 'last-event-id': [' event-array ', 'event-later'] },
    } as Pick<Request, 'query' | 'headers'>;

    expect(getOpportunitySseReplayCursor(req)).toBe('event-array');
  });

  it('writes SSE envelope id and data frames', () => {
    const write = vi.fn();
    const res = { write } as Pick<Response, 'write'>;
    const envelope: OpportunityEventEnvelope = {
      id: 'evt-1',
      stream: 'opportunity',
      type: 'updated',
      version: 1,
      occurredAt: '2026-04-30T00:00:00.000Z',
      entityId: 'opp-1',
      payload: {
        id: 'evt-1',
        opportunityId: 'opp-1',
        type: 'updated',
        message: 'Opportunity updated',
        timestamp: '2026-04-30T00:00:00.000Z',
      },
      source: { service: 'api' },
    };

    writeOpportunitySseEnvelope(res, envelope);

    expect(write).toHaveBeenNthCalledWith(1, 'id: evt-1\n');
    expect(write).toHaveBeenNthCalledWith(2, `data: ${JSON.stringify(envelope)}\n\n`);
  });
});
