import { useState, useEffect, useCallback, type DependencyList } from 'react';

export interface AgentLog {
  missionId: string;
  agentName: string;
  phase: string;
  content: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface OpportunityStreamEvent {
  id: string;
  opportunityId: string;
  type: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface StreamEnvelope<TPayload> {
  id: string;
  stream: 'mission' | 'opportunity' | 'system';
  type: string;
  version: 1;
  occurredAt: string;
  entityId?: string;
  payload: TPayload;
  source: {
    service: string;
    runId?: string;
  };
}

export function normalizeOpportunityStreamEvent(value: unknown): OpportunityStreamEvent | null {
  if (!value || typeof value !== 'object') return null;
  const maybeEnvelope = value as Partial<StreamEnvelope<OpportunityStreamEvent>>;
  if (maybeEnvelope.stream === 'opportunity' && maybeEnvelope.payload) {
    return maybeEnvelope.payload;
  }

  const maybeEvent = value as Partial<OpportunityStreamEvent>;
  if (
    typeof maybeEvent.id === 'string'
    && typeof maybeEvent.opportunityId === 'string'
    && typeof maybeEvent.type === 'string'
    && typeof maybeEvent.message === 'string'
    && typeof maybeEvent.timestamp === 'string'
  ) {
    return maybeEvent as OpportunityStreamEvent;
  }

  return null;
}

export type StreamAppendMode = 'start' | 'end';

export function getEnvelopeId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const maybeEnvelope = value as { id?: unknown };
  return typeof maybeEnvelope.id === 'string' ? maybeEnvelope.id : null;
}

export function getEventSourceUrl(
  path: string,
  {
    replaySince = false,
    lastEventId = null,
    origin = window.location.origin,
  }: {
    replaySince?: boolean;
    lastEventId?: string | null;
    origin?: string;
  } = {},
): string {
  const streamUrl = new URL(path, origin);
  if (replaySince && lastEventId) {
    streamUrl.searchParams.set('since', lastEventId);
  }
  return streamUrl.toString();
}

export function nextStreamLastEventId(
  parsed: unknown,
  eventLastEventId: string,
  itemId: string | null | undefined,
  currentLastEventId: string | null,
): string | null {
  return eventLastEventId || getEnvelopeId(parsed) || itemId || currentLastEventId;
}

export function mergeStreamItem<T>(
  previous: T[],
  item: T,
  {
    append,
    maxItems,
    getItemId,
  }: {
    append: StreamAppendMode;
    maxItems: number;
    getItemId?: (item: T) => string | null;
  },
): T[] {
  const itemId = getItemId?.(item);
  const base = itemId
    ? previous.filter((existing) => getItemId?.(existing) !== itemId)
    : previous;
  return (
    append === 'start'
      ? [item, ...base].slice(0, maxItems)
      : [...base, item].slice(-maxItems)
  );
}

export function nextReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

interface EventSourceStreamOptions<T> {
  path: string;
  maxItems: number;
  append: StreamAppendMode;
  replaySince?: boolean;
  normalize: (value: unknown, event: MessageEvent<string>) => T | null;
  getItemId?: (item: T) => string | null;
}

export interface EventSourceLike {
  onopen: ((event?: Event) => void) | null;
  onerror: ((event?: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  close: () => void;
}

interface EventSourceStreamControllerOptions<T> extends EventSourceStreamOptions<T> {
  origin?: string;
  eventSourceFactory?: (url: string) => EventSourceLike;
  onConnectionChange: (connected: boolean) => void;
  onItem: (item: T) => void;
  setReconnectTimeout?: typeof setTimeout;
  clearReconnectTimeout?: typeof clearTimeout;
}

export function createEventSourceStreamController<T>({
  path,
  replaySince = false,
  normalize,
  getItemId,
  origin,
  eventSourceFactory = (url: string) => new EventSource(url) as EventSourceLike,
  onConnectionChange,
  onItem,
  setReconnectTimeout = setTimeout,
  clearReconnectTimeout = clearTimeout,
}: EventSourceStreamControllerOptions<T>) {
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let retryCount = 0;
  let source: EventSourceLike | null = null;
  let lastEventId: string | null = null;

  function connect() {
    if (stopped) return;

    const streamUrl = getEventSourceUrl(path, {
      replaySince,
      lastEventId,
      ...(origin ? { origin } : {}),
    });
    const nextSource = eventSourceFactory(streamUrl);
    source = nextSource;

    nextSource.onopen = () => {
      onConnectionChange(true);
      retryCount = 0;
    };

    nextSource.onerror = () => {
      onConnectionChange(false);
      nextSource.close();
      if (source !== nextSource) return;
      source = null;

      if (stopped) return;
      const delay = nextReconnectDelay(retryCount);
      retryCount += 1;
      reconnectTimer = setReconnectTimeout(connect, delay);
    };

    nextSource.onmessage = (event) => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        const item = normalize(parsed, event);
        if (!item) return;
        const itemId = getItemId?.(item);
        lastEventId = nextStreamLastEventId(parsed, event.lastEventId, itemId, lastEventId);
        onItem(item);
      } catch {
        // Ignore heartbeats and malformed replay frames.
      }
    };
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) {
      clearReconnectTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    source?.close();
    source = null;
  }

  return {
    connect,
    stop,
    getLastEventId: () => lastEventId,
  };
}

function useEventSourceStream<T>({
  path,
  maxItems,
  append,
  replaySince = false,
  normalize,
  getItemId,
}: EventSourceStreamOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const controller = createEventSourceStreamController<T>({
      path,
      maxItems,
      append,
      replaySince,
      normalize,
      getItemId,
      onConnectionChange: setIsConnected,
      onItem: (item) => {
        setItems(prev => mergeStreamItem(prev, item, {
          append,
          maxItems,
          getItemId,
        }));
      },
    });

    controller.connect();

    return () => {
      controller.stop();
    };
  }, [append, getItemId, maxItems, normalize, path, replaySince]);

  const clearItems = useCallback(() => setItems([]), []);

  return { items, isConnected, clearItems };
}

function normalizeAgentLog(value: unknown): AgentLog | null {
  if (!value || typeof value !== 'object') return null;
  const maybeLog = value as Partial<AgentLog>;
  if (
    typeof maybeLog.missionId === 'string'
    && typeof maybeLog.agentName === 'string'
    && typeof maybeLog.phase === 'string'
    && typeof maybeLog.content === 'string'
    && typeof maybeLog.timestamp === 'number'
  ) {
    return maybeLog as AgentLog;
  }
  return null;
}

function agentLogNormalizer(value: unknown): AgentLog | null {
  return normalizeAgentLog(value);
}

function opportunityEventNormalizer(value: unknown): OpportunityStreamEvent | null {
  return normalizeOpportunityStreamEvent(value);
}

function opportunityEventId(event: OpportunityStreamEvent): string {
  return event.id;
}

/**
 * Hook for subscribing to Agent SSE stream
 * B1 fix: 手动重连逻辑，防止服务端断连后不恢复
 */
export function useAgentStream(maxLogs = 100) {
  const { items, isConnected, clearItems } = useEventSourceStream<AgentLog>({
    path: '/api/missions/stream',
    maxItems: maxLogs,
    append: 'end',
    normalize: agentLogNormalizer,
  });

  return { logs: items, isConnected, clearLogs: clearItems };
}

export function useOpportunityStream(maxEvents = 100) {
  const { items, isConnected, clearItems } = useEventSourceStream<OpportunityStreamEvent>({
    path: '/api/opportunities/stream',
    maxItems: maxEvents,
    append: 'start',
    replaySince: true,
    normalize: opportunityEventNormalizer,
    getItemId: opportunityEventId,
  });

  return { events: items, isConnected, clearEvents: clearItems };
}

/**
 * Hook for polling data at intervals
 * B2 fix: 统一错误处理（始终捕获并暴露错误文本）
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 5000,
  deps: DependencyList = []
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await fetcher();
        if (active) { setData(result); setError(null); setLoading(false); }
      } catch (e: unknown) {
        if (active) { setError(errorMessage(e)); setLoading(false); }
      }
    };
    poll();
    const interval = setInterval(poll, intervalMs);
    return () => { active = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
