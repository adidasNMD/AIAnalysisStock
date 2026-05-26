import { getDb } from '../db';
import type { StreamEnvelope, StreamSourceService } from './types';

interface StreamEventRow {
  id: string;
  stream: StreamEnvelope<unknown>['stream'];
  type: string;
  version: number;
  entityId: string | null;
  occurredAt: string;
  payload: string;
  source: string;
  runId: string | null;
}

function parseSource(value: string): StreamEnvelope<unknown>['source'] {
  try {
    const parsed = JSON.parse(value) as Partial<StreamEnvelope<unknown>['source']>;
    const service = parsed.service || 'system';
    return {
      service,
      ...(parsed.runId ? { runId: parsed.runId } : {}),
    } as StreamEnvelope<unknown>['source'];
  } catch {
    return { service: 'system' };
  }
}

function rowToEnvelope<TPayload>(row: StreamEventRow): StreamEnvelope<TPayload> {
  return {
    id: row.id,
    stream: row.stream,
    type: row.type,
    version: 1,
    occurredAt: row.occurredAt,
    ...(row.entityId ? { entityId: row.entityId } : {}),
    payload: JSON.parse(row.payload) as TPayload,
    source: parseSource(row.source),
  };
}

export function getRuntimeEventSourceService(): StreamSourceService {
  if (process.env.OPENCLAW_WORKER_BOOTSTRAP === '1') return 'daemon';
  return 'api';
}

export async function appendStreamEvent<TPayload>(envelope: StreamEnvelope<TPayload>): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO stream_events (
      id, stream, type, version, entityId, occurredAt, payload, source, runId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      stream = excluded.stream,
      type = excluded.type,
      version = excluded.version,
      entityId = excluded.entityId,
      occurredAt = excluded.occurredAt,
      payload = excluded.payload,
      source = excluded.source,
      runId = excluded.runId`,
    envelope.id,
    envelope.stream,
    envelope.type,
    envelope.version,
    envelope.entityId || null,
    envelope.occurredAt,
    JSON.stringify(envelope.payload),
    JSON.stringify(envelope.source),
    envelope.source.runId || null,
  );
}

export async function getLatestStreamEventId(
  stream: StreamEnvelope<unknown>['stream'],
): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ id: string }>(
    `SELECT id FROM stream_events
     WHERE stream = ?
     ORDER BY occurredAt DESC, id DESC
     LIMIT 1`,
    stream,
  );
  return row?.id || null;
}

export async function listStreamEventsAfter<TPayload>(
  stream: StreamEnvelope<unknown>['stream'],
  cursorId: string,
  limit = 100,
): Promise<StreamEnvelope<TPayload>[]> {
  const db = await getDb();
  const cursor = await db.get<StreamEventRow>(
    'SELECT * FROM stream_events WHERE id = ? AND stream = ?',
    cursorId,
    stream,
  );
  if (!cursor) return [];

  const rows = await db.all<StreamEventRow[]>(
    `SELECT * FROM stream_events
     WHERE stream = ?
       AND (occurredAt > ? OR (occurredAt = ? AND id > ?))
     ORDER BY occurredAt ASC, id ASC
     LIMIT ?`,
    stream,
    cursor.occurredAt,
    cursor.occurredAt,
    cursor.id,
    limit,
  );

  return rows.map(rowToEnvelope<TPayload>);
}

export async function listStreamEventsSince<TPayload>(
  stream: StreamEnvelope<unknown>['stream'],
  occurredAfter: string,
  limit = 100,
): Promise<StreamEnvelope<TPayload>[]> {
  const db = await getDb();
  const rows = await db.all<StreamEventRow[]>(
    `SELECT * FROM stream_events
     WHERE stream = ? AND occurredAt > ?
     ORDER BY occurredAt ASC, id ASC
     LIMIT ?`,
    stream,
    occurredAfter,
    limit,
  );

  return rows.map(rowToEnvelope<TPayload>);
}
