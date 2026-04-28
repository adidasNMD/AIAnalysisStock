import { describe, expect, it } from 'vitest';
import {
  nextReconnectDelay,
  normalizeOpportunityStreamEvent,
} from '../../dashboard/src/hooks/useAgentStream';

describe('dashboard SSE stream helpers', () => {
  it('normalizes opportunity stream envelopes and legacy event frames', () => {
    const event = {
      id: 'evt-1',
      opportunityId: 'op-1',
      type: 'mission_completed',
      message: 'Mission finished',
      timestamp: '2026-04-28T10:00:00.000Z',
    };

    expect(normalizeOpportunityStreamEvent({
      id: 'env-1',
      stream: 'opportunity',
      type: 'event',
      version: 1,
      occurredAt: '2026-04-28T10:00:00.000Z',
      payload: event,
      source: { service: 'opportunities' },
    })).toEqual(event);

    expect(normalizeOpportunityStreamEvent(event)).toEqual(event);
    expect(normalizeOpportunityStreamEvent({ type: 'heartbeat' })).toBeNull();
  });

  it('caps reconnect backoff at 30 seconds', () => {
    expect(nextReconnectDelay(0)).toBe(1000);
    expect(nextReconnectDelay(3)).toBe(8000);
    expect(nextReconnectDelay(10)).toBe(30000);
  });
});
