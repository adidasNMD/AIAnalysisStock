import { describe, expect, it } from 'vitest';
import type {
  OpportunityInboxItem,
  OpportunitySummary,
} from '../../dashboard/src/api';
import {
  mergeLiveInboxSnapshot,
  mergeLiveOpportunitySnapshot,
  removeLiveInboxItem,
} from '../../dashboard/src/queries/opportunity-live-store';

function opportunity(id: string, updatedAt: string, title = id): OpportunitySummary {
  return {
    id,
    title,
    updatedAt,
  } as OpportunitySummary;
}

function inboxItem(id: string, updatedAt: string, inboxScore = 1): OpportunityInboxItem {
  return {
    ...opportunity(id, updatedAt),
    inboxScore,
  } as OpportunityInboxItem;
}

describe('opportunity live store helpers', () => {
  it('keeps fresher streamed opportunities when polling returns a stale snapshot', () => {
    const current = [
      opportunity('op-1', '2026-04-28T10:02:00.000Z', 'Fresh streamed title'),
    ];
    const snapshot = [
      opportunity('op-1', '2026-04-28T10:01:00.000Z', 'Stale polled title'),
    ];

    expect(mergeLiveOpportunitySnapshot(current, snapshot, 10)[0]?.title).toBe(
      'Fresh streamed title',
    );
  });

  it('prepends streamed-only inbox rows ahead of the server snapshot while respecting limits', () => {
    const current = [
      inboxItem('op-streamed', '2026-04-28T10:05:00.000Z', 9),
      inboxItem('op-2', '2026-04-28T10:00:00.000Z', 2),
    ];
    const snapshot = [
      inboxItem('op-1', '2026-04-28T10:04:00.000Z', 8),
      inboxItem('op-2', '2026-04-28T10:03:00.000Z', 7),
      inboxItem('op-3', '2026-04-28T10:02:00.000Z', 6),
    ];

    expect(mergeLiveInboxSnapshot(current, snapshot, 3).map((item) => item.id)).toEqual([
      'op-streamed',
      'op-1',
      'op-2',
    ]);
  });

  it('removes inbox rows after the detail endpoint reports they no longer belong there', () => {
    const current = [
      inboxItem('op-keep', '2026-04-28T10:05:00.000Z'),
      inboxItem('op-remove', '2026-04-28T10:04:00.000Z'),
    ];

    expect(removeLiveInboxItem(current, 'op-remove').map((item) => item.id)).toEqual([
      'op-keep',
    ]);
  });
});
