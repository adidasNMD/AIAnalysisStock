import { describe, expect, it } from 'vitest';
import {
  entityVersion,
  mergeSnapshotPreservingFresh,
} from '../../dashboard/src/queries/query-client';

describe('dashboard query client helpers', () => {
  it('uses the freshest known entity timestamp across update and event fields', () => {
    expect(entityVersion({
      id: 'op-1',
      updatedAt: '2026-04-28T09:00:00.000Z',
      latestEventAt: '2026-04-28T10:00:00.000Z',
    })).toBe(Date.parse('2026-04-28T10:00:00.000Z'));
  });

  it('does not let a stale polling snapshot overwrite a fresher streamed item', () => {
    const current = [
      {
        id: 'op-1',
        title: 'Fresh streamed title',
        updatedAt: '2026-04-28T10:01:00.000Z',
      },
    ];
    const snapshot = [
      {
        id: 'op-1',
        title: 'Older polled title',
        updatedAt: '2026-04-28T10:00:00.000Z',
      },
    ];

    expect(mergeSnapshotPreservingFresh(current, snapshot, 10)[0]?.title).toBe('Fresh streamed title');
  });

  it('keeps server ordering while prepending streamed-only fresh rows', () => {
    const current = [
      {
        id: 'op-streamed',
        title: 'Streamed only',
        updatedAt: '2026-04-28T10:05:00.000Z',
      },
      {
        id: 'op-2',
        title: 'Existing two',
        updatedAt: '2026-04-28T10:00:00.000Z',
      },
    ];
    const snapshot = [
      {
        id: 'op-1',
        title: 'Server one',
        updatedAt: '2026-04-28T10:04:00.000Z',
      },
      {
        id: 'op-2',
        title: 'Server two',
        updatedAt: '2026-04-28T10:03:00.000Z',
      },
    ];

    expect(mergeSnapshotPreservingFresh(current, snapshot, 3).map((item) => item.id)).toEqual([
      'op-streamed',
      'op-1',
      'op-2',
    ]);
  });
});
