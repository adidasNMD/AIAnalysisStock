import { describe, expect, it } from 'vitest';
import type { OpportunityEvent } from '../../dashboard/src/api';
import type { OpportunityStreamEvent } from '../../dashboard/src/hooks/useAgentStream';
import { mergeOpportunityEventFeed } from '../../dashboard/src/queries/opportunity-queries';

function event(
  id: string,
  timestamp: string,
): OpportunityStreamEvent {
  return {
    id,
    opportunityId: `op-${id}`,
    type: 'mission_completed',
    message: `${id} message`,
    timestamp,
  };
}

describe('opportunity query layer', () => {
  it('merges streamed and polled events by freshness while deduping streamed frames first', () => {
    const streamed = [
      event('shared', '2026-04-28T10:02:00.000Z'),
      event('stream-only', '2026-04-28T10:00:00.000Z'),
    ];
    const polled: OpportunityEvent[] = [
      event('polled-newer', '2026-04-28T10:05:00.000Z'),
      event('shared', '2026-04-28T10:04:00.000Z'),
    ];

    const merged = mergeOpportunityEventFeed(streamed, polled, 3);

    expect(merged.map((item) => item.id)).toEqual(['polled-newer', 'shared', 'stream-only']);
    expect(merged.find((item) => item.id === 'shared')?.timestamp).toBe('2026-04-28T10:02:00.000Z');
  });
});
