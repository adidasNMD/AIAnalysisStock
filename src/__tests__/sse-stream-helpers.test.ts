import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEventSourceStreamController,
  type EventSourceLike,
  getEventSourceUrl,
  mergeStreamItem,
  nextReconnectDelay,
  nextStreamLastEventId,
  normalizeOpportunityStreamEvent,
  type OpportunityStreamEvent,
} from '../../dashboard/src/hooks/useAgentStream';

class FakeEventSource implements EventSourceLike {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  open() {
    this.onopen?.();
  }

  error() {
    this.onerror?.();
  }

  message(value: unknown, lastEventId = '') {
    this.onmessage?.({
      data: JSON.stringify(value),
      lastEventId,
    } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

function makeOpportunityEvent(id: string, type = 'mission_completed'): OpportunityStreamEvent {
  return {
    id,
    opportunityId: 'op-1',
    type,
    message: 'Mission updated',
    timestamp: '2026-04-28T10:00:00.000Z',
  };
}

describe('dashboard SSE stream helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('adds replay cursor to opportunity stream URLs only after an event id is known', () => {
    expect(getEventSourceUrl('/api/opportunities/stream', {
      replaySince: true,
      origin: 'http://localhost:5173',
    })).toBe('http://localhost:5173/api/opportunities/stream');

    expect(getEventSourceUrl('/api/opportunities/stream', {
      replaySince: true,
      lastEventId: 'evt-42',
      origin: 'http://localhost:5173',
    })).toBe('http://localhost:5173/api/opportunities/stream?since=evt-42');
  });

  it('dedupes replayed stream items by item id while preserving append direction', () => {
    const getItemId = (item: { id: string }) => item.id;
    const merged = mergeStreamItem(
      [
        { id: 'evt-2', label: 'older replay' },
        { id: 'evt-1', label: 'kept' },
      ],
      { id: 'evt-2', label: 'fresh replay' },
      {
        append: 'start',
        maxItems: 5,
        getItemId,
      },
    );

    expect(merged).toEqual([
      { id: 'evt-2', label: 'fresh replay' },
      { id: 'evt-1', label: 'kept' },
    ]);
  });

  it('uses browser event ids before envelope ids and item ids for replay cursors', () => {
    expect(nextStreamLastEventId({ id: 'env-1' }, 'browser-1', 'item-1', null)).toBe('browser-1');
    expect(nextStreamLastEventId({ id: 'env-1' }, '', 'item-1', null)).toBe('env-1');
    expect(nextStreamLastEventId({ type: 'legacy' }, '', 'item-1', null)).toBe('item-1');
    expect(nextStreamLastEventId({ type: 'heartbeat' }, '', null, 'previous')).toBe('previous');
  });

  it('reconnects opportunity streams with a replay cursor from the last browser event id', () => {
    const sources: FakeEventSource[] = [];
    const connectedStates: boolean[] = [];
    const items: OpportunityStreamEvent[] = [];
    const event = makeOpportunityEvent('evt-1');

    const controller = createEventSourceStreamController<OpportunityStreamEvent>({
      path: '/api/opportunities/stream',
      maxItems: 10,
      append: 'start',
      replaySince: true,
      origin: 'http://localhost:5173',
      normalize: (value) => normalizeOpportunityStreamEvent(value),
      getItemId: (item) => item.id,
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      onConnectionChange: (connected) => connectedStates.push(connected),
      onItem: (item) => items.push(item),
    });

    controller.connect();

    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe('http://localhost:5173/api/opportunities/stream');

    sources[0]?.open();
    expect(connectedStates).toEqual([true]);

    sources[0]?.message({
      id: 'env-1',
      stream: 'opportunity',
      type: 'event',
      version: 1,
      occurredAt: event.timestamp,
      payload: event,
      source: { service: 'opportunities' },
    }, 'browser-evt-1');
    expect(items).toEqual([event]);
    expect(controller.getLastEventId()).toBe('browser-evt-1');

    sources[0]?.error();
    expect(connectedStates).toEqual([true, false]);
    expect(sources[0]?.closed).toBe(true);

    vi.advanceTimersByTime(999);
    expect(sources).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
    expect(sources[1]?.url).toBe('http://localhost:5173/api/opportunities/stream?since=browser-evt-1');

    controller.stop();
  });

  it('cancels pending reconnect timers when the stream controller stops', () => {
    const sources: FakeEventSource[] = [];
    const controller = createEventSourceStreamController<OpportunityStreamEvent>({
      path: '/api/opportunities/stream',
      maxItems: 10,
      append: 'start',
      replaySince: true,
      origin: 'http://localhost:5173',
      normalize: (value) => normalizeOpportunityStreamEvent(value),
      getItemId: (item) => item.id,
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      onConnectionChange: () => undefined,
      onItem: () => undefined,
    });

    controller.connect();
    sources[0]?.error();
    controller.stop();

    vi.advanceTimersByTime(1000);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.closed).toBe(true);
  });
});
