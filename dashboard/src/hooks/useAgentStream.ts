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

function normalizeOpportunityStreamEvent(value: unknown): OpportunityStreamEvent | null {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

/**
 * Hook for subscribing to Agent SSE stream
 * B1 fix: 手动重连逻辑，防止服务端断连后不恢复
 */
export function useAgentStream(maxLogs = 100) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const retryCount = useRef(0);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      
      const sse = new EventSource(getEventSourceUrl('/api/missions/stream'));
      sseRef.current = sse;

      sse.onopen = () => {
        setIsConnected(true);
        retryCount.current = 0; // 重连成功后重置计数
      };

      sse.onerror = () => {
        setIsConnected(false);
        sse.close();
        sseRef.current = null;

        if (unmounted) return;
        // 指数退避重连: 1s, 2s, 4s, 8s, 最大 30s
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
        retryCount.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      sse.onmessage = (e) => {
        try {
          const log = JSON.parse(e.data) as AgentLog;
          setLogs(prev => [...prev, log].slice(-maxLogs));
        } catch { /* 忽略心跳等非 JSON 消息 */ }
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      sseRef.current?.close();
    };
  }, [maxLogs]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, isConnected, clearLogs };
}

export function useOpportunityStream(maxEvents = 100) {
  const [events, setEvents] = useState<OpportunityStreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const retryCount = useRef(0);
  const sseRef = useRef<EventSource | null>(null);
  const lastEventId = useRef<string | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const streamUrl = new URL(getEventSourceUrl('/api/opportunities/stream'));
      if (lastEventId.current) {
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
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
        retryCount.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      sse.onmessage = (e) => {
        try {
          const parsed: unknown = JSON.parse(e.data);
          const event = normalizeOpportunityStreamEvent(parsed);
          if (!event) return;
          lastEventId.current = e.lastEventId || getEnvelopeId(parsed) || event.id;
          setEvents((prev) => [event, ...prev].slice(0, maxEvents));
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
  }, [maxEvents]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, isConnected, clearEvents };
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
