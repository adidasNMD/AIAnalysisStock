import { describe, expect, it } from 'vitest';
import type { OpportunityEvent } from '../../dashboard/src/api';
import type { OpportunityStreamEvent } from '../../dashboard/src/hooks/useAgentStream';
import {
  createOpportunityLiveRefreshPlan,
  opportunityInvalidationsForEvent,
} from '../../dashboard/src/queries/opportunity-live-updates';
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

  it('maps high-signal stream events to inbox, summary, and board invalidations', () => {
    expect(opportunityInvalidationsForEvent({
      ...event('mission-failed', '2026-04-28T10:02:00.000Z'),
      type: 'mission_failed',
    })).toEqual({
      inboxItem: true,
      opportunitySummary: true,
      boardHealth: true,
      queue: true,
      missionList: true,
    });
  });

  it('keeps generic updates out of the inbox while refreshing summary and board health', () => {
    expect(opportunityInvalidationsForEvent({
      ...event('updated', '2026-04-28T10:02:00.000Z'),
      type: 'updated',
    })).toEqual({
      inboxItem: false,
      opportunitySummary: true,
      boardHealth: true,
      queue: false,
      missionList: false,
    });
  });

  it('refreshes mission lists without touching queue when missions are linked', () => {
    expect(opportunityInvalidationsForEvent({
      ...event('mission-linked', '2026-04-28T10:02:00.000Z'),
      type: 'mission_linked',
    })).toEqual({
      inboxItem: false,
      opportunitySummary: true,
      boardHealth: true,
      queue: false,
      missionList: true,
    });
  });

  it('builds a deduped live refresh plan for a batch of stream events', () => {
    const processed = new Set<string>();
    const plan = createOpportunityLiveRefreshPlan([
      {
        ...event('queued-1', '2026-04-28T10:04:00.000Z'),
        id: 'evt-queued-1',
        opportunityId: 'op-shared',
        type: 'mission_queued',
      },
      {
        ...event('updated-1', '2026-04-28T10:03:00.000Z'),
        id: 'evt-updated-1',
        opportunityId: 'op-shared',
        type: 'updated',
      },
      {
        ...event('linked-1', '2026-04-28T10:02:00.000Z'),
        id: 'evt-linked-1',
        opportunityId: 'op-linked',
        type: 'mission_linked',
      },
    ], processed);

    expect(plan).toEqual({
      inboxIds: ['op-shared'],
      opportunityIds: ['op-shared', 'op-linked'],
      boardHealth: true,
      queue: true,
      missionList: true,
    });
  });

  it('does not plan refreshes for stream events it has already processed', () => {
    const processed = new Set<string>();
    const streamed = [{
      ...event('completed-1', '2026-04-28T10:04:00.000Z'),
      id: 'evt-completed-1',
      opportunityId: 'op-1',
      type: 'mission_completed',
    }];

    expect(createOpportunityLiveRefreshPlan(streamed, processed).opportunityIds).toEqual(['op-1']);
    expect(createOpportunityLiveRefreshPlan(streamed, processed)).toEqual({
      inboxIds: [],
      opportunityIds: [],
      boardHealth: false,
      queue: false,
      missionList: false,
    });
  });
});
