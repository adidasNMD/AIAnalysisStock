import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollingQueryOptions<T> {
  queryKey: string;
  fetcher: () => Promise<T>;
  intervalMs?: number;
  initialData?: T | null;
  enabled?: boolean;
}

export interface PollingQueryResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<T | null>;
}

interface VersionedEntity {
  id: string;
  updatedAt?: string;
  latestEventAt?: string;
  timestamp?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function parseTime(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function entityVersion(value: VersionedEntity): number {
  return Math.max(
    parseTime(value.latestEventAt),
    parseTime(value.updatedAt),
    parseTime(value.timestamp),
  );
}

export function mergeSnapshotPreservingFresh<T extends VersionedEntity>(
  current: T[],
  snapshot: T[],
  limit = snapshot.length,
): T[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const snapshotIds = new Set(snapshot.map((item) => item.id));
  const mergedSnapshot = snapshot.map((item) => {
    const existing = currentById.get(item.id);
    if (!existing) return item;
    return entityVersion(existing) > entityVersion(item) ? existing : item;
  });
  const streamedOnly = current
    .filter((item) => !snapshotIds.has(item.id))
    .sort((a, b) => entityVersion(b) - entityVersion(a));

  return [...streamedOnly, ...mergedSnapshot].slice(0, limit);
}

export function usePollingQuery<T>({
  queryKey,
  fetcher,
  intervalMs = 5000,
  initialData = null,
  enabled = true,
}: PollingQueryOptions<T>): PollingQueryResult<T> {
  const fetcherRef = useRef(fetcher);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(initialData !== null);
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialData === null);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!hasLoadedRef.current) setLoading(true);

    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current || requestIdRef.current !== requestId) return result;
      hasLoadedRef.current = true;
      setData(result);
      setError(null);
      setLoading(false);
      return result;
    } catch (error) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setError(errorMessage(error));
        setLoading(false);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, intervalMs, queryKey, refresh]);

  return { data, error, loading, refresh };
}
