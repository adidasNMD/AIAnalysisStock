import { describe, expect, it } from 'vitest';
import {
  buildApiError,
  buildOffsetPage,
  decodePageCursor,
  encodePageCursor,
  errorMessage,
  parsePaginationQuery,
  parsePositiveIntQuery,
} from '../server/route-helpers';

describe('route helpers', () => {
  it('normalizes unknown errors into response messages', () => {
    expect(errorMessage(new Error('network down'))).toBe('network down');
    expect(errorMessage('plain failure')).toBe('plain failure');
  });

  it('builds backward-compatible API error envelopes', () => {
    expect(buildApiError('not_found', 'Mission not found')).toEqual({
      error: 'Mission not found',
      code: 'not_found',
    });
    expect(buildApiError('validation_error', 'Invalid payload', [{ path: 'title' }])).toEqual({
      error: 'Invalid payload',
      code: 'validation_error',
      details: [{ path: 'title' }],
    });
  });

  it('parses positive integer query values and falls back for unsafe limits', () => {
    expect(parsePositiveIntQuery('12', 50)).toBe(12);
    expect(parsePositiveIntQuery(['7', '9'], 50)).toBe(7);
    expect(parsePositiveIntQuery(3.8, 50)).toBe(3);
    expect(parsePositiveIntQuery('0', 50)).toBe(50);
    expect(parsePositiveIntQuery('-1', 50)).toBe(50);
    expect(parsePositiveIntQuery('abc', 50)).toBe(50);
  });

  it('parses opt-in page envelopes with bounded cursor limits', () => {
    const cursor = encodePageCursor(20);
    expect(decodePageCursor(cursor)).toBe(20);
    expect(parsePaginationQuery({
      limit: '500',
      cursor,
      envelope: '1',
    }, {
      defaultLimit: 50,
      maxLimit: 100,
    })).toEqual({
      limit: 100,
      offset: 20,
      cursor,
      envelope: true,
    });
  });

  it('builds offset page envelopes with next cursors', () => {
    const page = buildOffsetPage(['a', 'b', 'c', 'd'], { limit: 2, offset: 1 });
    expect(page.items).toEqual(['b', 'c']);
    expect(page.pageInfo.limit).toBe(2);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(decodePageCursor(page.pageInfo.nextCursor)).toBe(3);
  });
});
