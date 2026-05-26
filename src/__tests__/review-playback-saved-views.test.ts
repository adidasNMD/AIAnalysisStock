import { describe, expect, it } from 'vitest';

import {
  buildReviewPlaybackSavedViewLabel,
  normalizeReviewPlaybackFilterSnapshot,
  orderReviewPlaybackSavedViews,
  parseStoredReviewPlaybackSavedViews,
} from '../../dashboard/src/pages/review-playback-saved-views';

describe('review playback saved views', () => {
  it('normalizes filter snapshots and builds readable labels', () => {
    const snapshot = normalizeReviewPlaybackFilterSnapshot({
      q: '  timeout ',
      opportunityId: ' opp-1 ',
      category: 'mission',
      tone: 'negative',
      backtestTicker: ' $aaoi ',
      backtestStrategy: 'relay_chain',
      backtestFrom: '2026-05-01',
      backtestTo: '2026-05-03',
    });

    expect(snapshot).toEqual({
      q: 'timeout',
      opportunityId: 'opp-1',
      category: 'mission',
      tone: 'negative',
      backtestTicker: 'AAOI',
      backtestStrategy: 'relay_chain',
      backtestFrom: '2026-05-01',
      backtestTo: '2026-05-03',
    });
    expect(buildReviewPlaybackSavedViewLabel(snapshot)).toBe('Relay chain · AAOI · 2026-05-01 to 2026-05-03 · opp-1');
  });

  it('parses stored views, rejects malformed rows, and orders by updated time', () => {
    const raw = JSON.stringify([
      {
        id: 'old',
        label: 'Old',
        filters: { backtestTicker: 'crwv', backtestStrategy: 'proxy_narrative' },
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'new',
        label: '  New relay ',
        filters: { backtestTicker: 'aaoi', backtestStrategy: 'relay_chain' },
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
      { label: 'missing id' },
    ]);

    expect(parseStoredReviewPlaybackSavedViews(raw)).toEqual([
      expect.objectContaining({
        id: 'new',
        label: 'New relay',
        filters: expect.objectContaining({ backtestTicker: 'AAOI', backtestStrategy: 'relay_chain' }),
      }),
      expect.objectContaining({
        id: 'old',
        filters: expect.objectContaining({ backtestTicker: 'CRWV', backtestStrategy: 'proxy_narrative' }),
      }),
    ]);
  });

  it('limits saved views to the most recent ten', () => {
    const views = Array.from({ length: 12 }, (_, index) => ({
      id: `view-${index}`,
      label: `View ${index}`,
      filters: normalizeReviewPlaybackFilterSnapshot({ backtestTicker: `T${index}` }),
      createdAt: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      updatedAt: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));

    const ordered = orderReviewPlaybackSavedViews(views);

    expect(ordered).toHaveLength(10);
    expect(ordered[0]?.id).toBe('view-11');
    expect(ordered.at(-1)?.id).toBe('view-2');
  });
});
