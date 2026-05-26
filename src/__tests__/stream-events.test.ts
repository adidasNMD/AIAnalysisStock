import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEnvelope } from '../workflows/types';

const getDbMock = vi.fn();

vi.mock('../db', () => ({
  getDb: getDbMock,
}));

function createDbMock() {
  const events = new Map<string, any>();

  return {
    __events: events,
    run: vi.fn().mockImplementation(async (_sql: string, ...params: any[]) => {
      if (_sql.includes('INSERT INTO stream_events')) {
        events.set(params[0], {
          id: params[0],
          stream: params[1],
          type: params[2],
          version: params[3],
          entityId: params[4],
          occurredAt: params[5],
          payload: params[6],
          source: params[7],
          runId: params[8],
        });
      }
      return { changes: 1 };
    }),
    get: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('ORDER BY occurredAt DESC')) {
        const [stream] = params;
        return Array.from(events.values())
          .filter((event) => event.stream === stream)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))[0];
      }
      if (sql.includes('SELECT * FROM stream_events WHERE id = ? AND stream = ?')) {
        const [id, stream] = params;
        const event = events.get(id);
        return event?.stream === stream ? event : undefined;
      }
      return undefined;
    }),
    all: vi.fn().mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('occurredAt > ? OR')) {
        const [stream, occurredAt, _sameOccurredAt, id, limit] = params;
        return Array.from(events.values())
          .filter((event) => (
            event.stream === stream
            && (event.occurredAt > occurredAt || (event.occurredAt === occurredAt && event.id > id))
          ))
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
          .slice(0, limit);
      }
      if (sql.includes('occurredAt > ?')) {
        const [stream, occurredAt, limit] = params;
        return Array.from(events.values())
          .filter((event) => event.stream === stream && event.occurredAt > occurredAt)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
          .slice(0, limit);
      }
      return [];
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stream events', () => {
  it('persists and replays durable stream envelopes after a cursor', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const { appendStreamEvent, listStreamEventsAfter } = await import('../workflows/stream-events');

    const first: StreamEnvelope<{ message: string }> = {
      id: 'event-1',
      stream: 'opportunity',
      type: 'created',
      version: 1,
      occurredAt: '2026-04-28T00:00:00.000Z',
      entityId: 'opp-1',
      payload: { message: 'first' },
      source: { service: 'daemon' },
    };
    const second: StreamEnvelope<{ message: string }> = {
      ...first,
      id: 'event-2',
      type: 'updated',
      occurredAt: '2026-04-28T00:00:01.000Z',
      payload: { message: 'second' },
      source: { service: 'daemon', runId: 'run-1' },
    };

    await appendStreamEvent(first);
    await appendStreamEvent(second);

    await expect(listStreamEventsAfter<{ message: string }>('opportunity', 'event-1')).resolves.toEqual([
      second,
    ]);
  });

  it('can tail future events from a connection timestamp when no cursor exists', async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db as any);
    const { appendStreamEvent, listStreamEventsSince } = await import('../workflows/stream-events');

    await appendStreamEvent({
      id: 'event-1',
      stream: 'opportunity',
      type: 'created',
      version: 1,
      occurredAt: '2026-04-28T00:00:00.000Z',
      entityId: 'opp-1',
      payload: { message: 'before' },
      source: { service: 'api' },
    });
    await appendStreamEvent({
      id: 'event-2',
      stream: 'opportunity',
      type: 'updated',
      version: 1,
      occurredAt: '2026-04-28T00:00:02.000Z',
      entityId: 'opp-1',
      payload: { message: 'after' },
      source: { service: 'daemon' },
    });

    const tailed = await listStreamEventsSince<{ message: string }>('opportunity', '2026-04-28T00:00:01.000Z');

    expect(tailed.map((event) => event.id)).toEqual(['event-2']);
  });
});
