import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../../dashboard/src/lib/api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('dashboard api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds relative API URLs with query params and parses JSON responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api/');

    await expect(client.get<{ ok: boolean }>('/missions', {
      params: { limit: 25, skipped: null, q: 'AI infra' },
    })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/missions?limit=25&q=AI+infra', {
      method: 'GET',
      headers: expect.any(Headers),
    });
  });

  it('sends JSON request bodies for mutating calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'op-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.post<{ id: string }>('/opportunities', { title: 'AI infra' })).resolves.toEqual({
      id: 'op-1',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'AI infra' }));
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('throws ApiError with server-provided error text when no fallback is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid stage' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.patch('/opportunities/op-1', { stage: 'bad' })).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid stage',
      status: 400,
      body: { error: 'Invalid stage' },
    } satisfies Partial<ApiError>);
  });

  it('returns fallback values on non-ok responses and network failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'offline' }, 503))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.get<string[]>('/opportunities', { fallback: [] })).resolves.toEqual([]);
    await expect(client.get<string[]>('/opportunities', { fallback: [] })).resolves.toEqual([]);
  });

  it('returns false from putOk when the server rejects the update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad config' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.putOk('/config/models', { defaults: {} })).resolves.toBe(false);
  });
});
