import { createHash } from 'crypto';
import type { MissionInput } from './types';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }

  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key] as JsonValue)}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeTickers(tickers?: string[]): string[] {
  return [...new Set((tickers || [])
    .map((ticker) => ticker.trim().replace(/^\$/, '').toUpperCase())
    .filter(Boolean))]
    .sort();
}

export function hashMissionInput(input: MissionInput): string {
  return sha256(stableJson(input as unknown as JsonValue));
}

export function buildMissionTaskDedupeKey(input: MissionInput): string {
  const identity = {
    mode: input.mode,
    query: normalizeQuery(input.query),
    tickers: normalizeTickers(input.tickers),
    opportunityId: input.opportunityId?.trim() || null,
    source: input.source?.trim() || 'unknown',
    depth: input.depth || 'deep',
  };

  return `mission:v1:${sha256(stableJson(identity)).slice(0, 32)}`;
}
