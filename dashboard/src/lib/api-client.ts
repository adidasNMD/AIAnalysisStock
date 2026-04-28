export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface ApiRequestOptions<TFallback = never> {
  params?: QueryParams;
  body?: unknown;
  fallback?: TFallback;
  errorMessage?: string;
  headers?: HeadersInit;
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const nextPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${nextPath}`;
}

function withParams(url: string, params?: QueryParams): string {
  if (!params) return url;

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  });

  const serialized = query.toString();
  if (!serialized) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${serialized}`;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorBodyMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const maybeError = body as { error?: unknown; message?: unknown };
  if (typeof maybeError.error === 'string') return maybeError.error;
  if (typeof maybeError.message === 'string') return maybeError.message;
  return null;
}

function hasFallback<T>(options: ApiRequestOptions<T>): options is ApiRequestOptions<T> & { fallback: T } {
  return Object.prototype.hasOwnProperty.call(options, 'fallback');
}

export function createApiClient(baseUrl: string) {
  async function request<T, TFallback = never>(
    method: string,
    path: string,
    options: ApiRequestOptions<TFallback> = {},
  ): Promise<T | TFallback> {
    const url = withParams(joinUrl(baseUrl, path), options.params);
    const headers = new Headers(options.headers);
    const init: RequestInit = { method, headers };

    if (options.body !== undefined) {
      headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
      init.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, init);
      const body = await parseJson(response);

      if (!response.ok) {
        if (hasFallback(options)) return options.fallback;
        throw new ApiError(
          errorBodyMessage(body) || options.errorMessage || `Request failed (${response.status})`,
          response.status,
          body,
        );
      }

      return body as T;
    } catch (error) {
      if (hasFallback(options)) return options.fallback;
      throw error;
    }
  }

  return {
    get: <T>(path: string, options?: ApiRequestOptions<T>) => (
      request<T, T>('GET', path, options)
    ),
    post: <T>(path: string, body?: unknown, options: ApiRequestOptions<T> = {}) => (
      request<T, T>('POST', path, { ...options, body })
    ),
    patch: <T>(path: string, body?: unknown, options: ApiRequestOptions<T> = {}) => (
      request<T, T>('PATCH', path, { ...options, body })
    ),
    put: <T>(path: string, body?: unknown, options: ApiRequestOptions<T> = {}) => (
      request<T, T>('PUT', path, { ...options, body })
    ),
    deleteOk: async (path: string, options?: ApiRequestOptions<boolean>) => {
      try {
        const response = await fetch(withParams(joinUrl(baseUrl, path), options?.params), {
          method: 'DELETE',
          headers: options?.headers,
        });
        return response.ok;
      } catch {
        return options?.fallback ?? false;
      }
    },
    putOk: async (path: string, body?: unknown, options: ApiRequestOptions<boolean> = {}) => {
      try {
        await request<unknown>('PUT', path, {
          params: options.params,
          errorMessage: options.errorMessage,
          headers: options.headers,
          body,
        });
        return true;
      } catch {
        return options.fallback ?? false;
      }
    },
  };
}
