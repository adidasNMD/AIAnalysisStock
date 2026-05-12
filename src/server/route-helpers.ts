import type { Response } from 'express';

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'internal_error';

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  details?: unknown;
}

export interface PaginationRequest {
  limit: number;
  offset: number;
  cursor?: string;
  envelope: boolean;
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PageEnvelope<T> {
  items: T[];
  pageInfo: PageInfo;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildApiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): ApiErrorResponse {
  return {
    error: message,
    code,
    ...(details !== undefined ? { details } : {}),
  };
}

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  return res.status(status).json(buildApiError(code, message, details));
}

export function sendBadRequest(res: Response, message: string, details?: unknown): Response {
  return sendApiError(res, 400, 'bad_request', message, details);
}

export function sendValidationApiError(res: Response, message: string, details?: unknown): Response {
  return sendApiError(res, 400, 'validation_error', message, details);
}

export function sendNotFound(res: Response, message: string, details?: unknown): Response {
  return sendApiError(res, 404, 'not_found', message, details);
}

export function sendConflict(res: Response, message: string, details?: unknown): Response {
  return sendApiError(res, 409, 'conflict', message, details);
}

export function sendInternalError(res: Response, error: unknown): Response {
  return sendApiError(res, 500, 'internal_error', errorMessage(error));
}

export function parsePositiveIntQuery(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'number'
    ? raw
    : typeof raw === 'string'
      ? Number.parseInt(raw, 10)
      : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function truthyQueryFlag(value: unknown): boolean {
  const raw = firstQueryValue(value);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'page', 'envelope'].includes(raw.trim().toLowerCase());
}

export function encodePageCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset: Math.max(0, Math.floor(offset)) })).toString('base64url');
}

export function decodePageCursor(cursor: unknown): number {
  const raw = firstQueryValue(cursor);
  if (typeof raw !== 'string' || !raw.trim()) return 0;

  try {
    const parsed = JSON.parse(Buffer.from(raw.trim(), 'base64url').toString('utf-8')) as { offset?: unknown };
    return typeof parsed.offset === 'number' && Number.isFinite(parsed.offset) && parsed.offset > 0
      ? Math.floor(parsed.offset)
      : 0;
  } catch {
    return 0;
  }
}

export function parsePaginationQuery(
  query: Record<string, unknown>,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): PaginationRequest {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 100;
  const requestedLimit = parsePositiveIntQuery(query.limit, defaultLimit);
  const limit = Math.min(requestedLimit, maxLimit);
  const cursor = typeof firstQueryValue(query.cursor) === 'string'
    ? String(firstQueryValue(query.cursor)).trim()
    : undefined;

  return {
    limit,
    offset: decodePageCursor(cursor),
    ...(cursor ? { cursor } : {}),
    envelope: Boolean(cursor)
      || truthyQueryFlag(query.envelope)
      || firstQueryValue(query.format) === 'page',
  };
}

export function offsetPageFetchLimit(pagination: Pick<PaginationRequest, 'limit' | 'offset'>): number {
  return pagination.offset + pagination.limit + 1;
}

export function buildOffsetPage<T>(
  rows: T[],
  pagination: Pick<PaginationRequest, 'limit' | 'offset'>,
): PageEnvelope<T> {
  const start = pagination.offset;
  const end = start + pagination.limit;
  const items = rows.slice(start, end);
  const hasMore = rows.length > end;

  return {
    items,
    pageInfo: {
      limit: pagination.limit,
      nextCursor: hasMore ? encodePageCursor(end) : null,
      hasMore,
    },
  };
}
