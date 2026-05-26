import { describe, expect, it } from 'vitest';
import { toOpportunityEventEnvelope } from '../workflows/opportunities';
import type { OpportunityEventRecord } from '../workflows/types';

describe('toOpportunityEventEnvelope', () => {
  it('wraps opportunity events in a versioned stream envelope', () => {
    const event: OpportunityEventRecord = {
      id: 'oevt_test_1',
      opportunityId: 'opp_test_1',
      type: 'relay_triggered',
      message: 'Relay confirmed',
      timestamp: '2026-04-26T10:00:00.000Z',
      meta: {
        runId: 'run_1',
        validationStatus: 'confirmed',
      },
    };

    const envelope = toOpportunityEventEnvelope(event, { service: 'daemon' });

    expect(envelope).toMatchObject({
      id: 'oevt_test_1',
      stream: 'opportunity',
      type: 'relay_triggered',
      version: 1,
      occurredAt: '2026-04-26T10:00:00.000Z',
      entityId: 'opp_test_1',
      payload: event,
      source: {
        service: 'daemon',
        runId: 'run_1',
      },
    });
  });
});
