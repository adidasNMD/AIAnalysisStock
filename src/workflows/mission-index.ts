import { getDb } from '../db';
import { logger } from '../utils/logger';
import type { MissionEvidenceRecord, UnifiedMission } from './types';
import type { MissionEventRecord } from './mission-events';

interface MissionIndexRow {
  id: string;
  artifactPath: string;
}

interface MissionEventRow {
  id: string;
  missionId: string;
  timestamp: string;
  type: MissionEventRecord['type'];
  status: MissionEventRecord['status'] | null;
  phase: MissionEventRecord['phase'] | null;
  message: string;
  meta: string | null;
}

interface MissionEvidenceRefRow {
  id: string;
  artifactPath: string;
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function logIndexError(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`[MissionIndex] ${action} failed: ${message}`);
}

export async function upsertMissionIndex(mission: UnifiedMission, artifactPath: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO missions_index (
      id, status, mode, query, source, depth, opportunityId, createdAt, updatedAt,
      inputPayload, artifactPath
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      mode = excluded.mode,
      query = excluded.query,
      source = excluded.source,
      depth = excluded.depth,
      opportunityId = excluded.opportunityId,
      updatedAt = excluded.updatedAt,
      inputPayload = excluded.inputPayload,
      artifactPath = excluded.artifactPath`,
    mission.id,
    mission.status,
    mission.input.mode,
    mission.input.query,
    mission.input.source || null,
    mission.input.depth || null,
    mission.input.opportunityId || null,
    mission.createdAt,
    mission.updatedAt,
    JSON.stringify(mission.input),
    artifactPath,
  );
}

export async function deleteMissionIndex(missionId: string): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM missions_index WHERE id = ?', missionId);
  await db.run('DELETE FROM mission_events WHERE missionId = ?', missionId);
  await db.run('DELETE FROM mission_evidence_refs WHERE missionId = ?', missionId);
}

export async function getMissionArtifactPath(missionId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<MissionIndexRow>(
    'SELECT id, artifactPath FROM missions_index WHERE id = ?',
    missionId,
  );
  return row?.artifactPath || null;
}

export async function appendMissionEventIndex(record: MissionEventRecord, artifactPath: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO mission_events (
      id, missionId, timestamp, type, status, phase, message, meta, artifactPath
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      timestamp = excluded.timestamp,
      type = excluded.type,
      status = excluded.status,
      phase = excluded.phase,
      message = excluded.message,
      meta = excluded.meta,
      artifactPath = excluded.artifactPath`,
    record.id,
    record.missionId,
    record.timestamp,
    record.type,
    record.status || null,
    record.phase || null,
    record.message,
    serializeJson(record.meta),
    artifactPath,
  );
}

export async function listMissionEventsFromIndex(missionId: string): Promise<MissionEventRecord[]> {
  const db = await getDb();
  const rows = await db.all<MissionEventRow[]>(
    'SELECT * FROM mission_events WHERE missionId = ? ORDER BY timestamp ASC',
    missionId,
  );
  return rows.map((row) => ({
    id: row.id,
    missionId: row.missionId,
    timestamp: row.timestamp,
    type: row.type,
    message: row.message,
    ...(row.status ? { status: row.status } : {}),
    ...(row.phase ? { phase: row.phase } : {}),
    ...(row.meta ? { meta: JSON.parse(row.meta) as Record<string, unknown> } : {}),
  }));
}

export async function upsertMissionEvidenceRef(
  record: MissionEvidenceRecord,
  artifactPath: string,
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO mission_evidence_refs (
      id, missionId, runId, capturedAt, status, completeness, artifactPath
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      capturedAt = excluded.capturedAt,
      status = excluded.status,
      completeness = excluded.completeness,
      artifactPath = excluded.artifactPath`,
    record.id,
    record.missionId,
    record.runId,
    record.capturedAt,
    record.status,
    record.completeness,
    artifactPath,
  );
}

export async function getMissionEvidenceArtifactPath(runId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<MissionEvidenceRefRow>(
    'SELECT id, artifactPath FROM mission_evidence_refs WHERE runId = ? ORDER BY capturedAt DESC LIMIT 1',
    runId,
  );
  return row?.artifactPath || null;
}

export function indexMissionAsync(mission: UnifiedMission, artifactPath: string): void {
  void upsertMissionIndex(mission, artifactPath).catch((error) => logIndexError('upsert mission', error));
}

export function deleteMissionIndexAsync(missionId: string): void {
  void deleteMissionIndex(missionId).catch((error) => logIndexError('delete mission', error));
}

export function indexMissionEventAsync(record: MissionEventRecord, artifactPath: string): void {
  void appendMissionEventIndex(record, artifactPath).catch((error) => logIndexError('append event', error));
}

export function indexMissionEvidenceAsync(record: MissionEvidenceRecord, artifactPath: string): void {
  void upsertMissionEvidenceRef(record, artifactPath).catch((error) => logIndexError('upsert evidence ref', error));
}
