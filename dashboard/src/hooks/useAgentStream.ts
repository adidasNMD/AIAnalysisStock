import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react';

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

function getEventSourceUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function getEnvelopeId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const maybeEnvelope = value as { id?: unknown };
  return typeof maybeEnvelope.id === 'string' ? maybeEnvelope.id : null;
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
  append: 'start' | 'end';
  replaySince?: boolean;
  normalize: (value: unknown, event: MessageEvent<string>) => T | null;
  getItemId?: (item: T) => string | null;
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
  const retryCount = useRef(0);
  const sseRef = useRef<EventSource | null>(null);
  const lastEventId = useRef<string | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const streamUrl = new URL(getEventSourceUrl(path));
      if (replaySince && lastEventId.current) {
        streamUrl.searchParams.set('since', lastEventId.current);
      }
      const sse = new EventSource(streamUrl.toString());
      sseRef.current = sse;

      sse.onopen = () => {
        setIsConnected(true);
        retryCount.current = 0;
      };

      sse.onerror = () => {
        setIsConnected(false);
        sse.close();
        sseRef.current = null;

        if (unmounted) return;
        const delay = nextReconnectDelay(retryCount.current);
        retryCount.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      sse.onmessage = (e) => {
        try {
          const parsed: unknown = JSON.parse(e.data);
          const item = normalize(parsed, e);
          if (!item) return;
          const itemId = getItemId?.(item);
          lastEventId.current = e.lastEventId || getEnvelopeId(parsed) || itemId || lastEventId.current;
          setItems(prev => (
            append === 'start'
              ? [item, ...prev].slice(0, maxItems)
              : [...prev, item].slice(-maxItems)
          ));
        } catch {
          // Ignore heartbeats and malformed replay frames.
        }
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      sseRef.current?.close();
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
