import { getDb } from '../db';
import type { MissionRunRecord, MissionRunStage, MissionRunStatus } from './types';

interface MissionRunRow {
  id: string;
  missionId: string;
  taskId: string | null;
  status: MissionRunStatus;
  stage: MissionRunStage;
  attempt: number;
  workerLeaseId: string | null;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  failureMessage: string | null;
  cancelRequestedAt: string | null;
  failureCode: string | null;
  degradedFlags: string | null;
}

export interface CreateMissionRunInput {
  missionId: string;
  taskId?: string;
}

export interface UpdateMissionRunInput {
  status?: MissionRunStatus;
  stage?: MissionRunStage;
  workerLeaseId?: string;
  startedAt?: string;
  heartbeatAt?: string;
  completedAt?: string;
  failureMessage?: string;
  cancelRequestedAt?: string;
  failureCode?: string;
  degradedFlags?: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateMissionRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseDegradedFlags(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((flag): flag is string => typeof flag === 'string') : undefined;
  } catch {
    return undefined;
  }
}

function toMissionRunRecord(row: MissionRunRow): MissionRunRecord {
  const degradedFlags = parseDegradedFlags(row.degradedFlags);

  return {
    id: row.id,
    missionId: row.missionId,
    status: row.status,
    stage: row.stage,
    attempt: row.attempt,
    createdAt: row.createdAt,
    ...(row.taskId ? { taskId: row.taskId } : {}),
    ...(row.workerLeaseId ? { workerLeaseId: row.workerLeaseId } : {}),
    ...(row.startedAt ? { startedAt: row.startedAt } : {}),
    ...(row.heartbeatAt ? { heartbeatAt: row.heartbeatAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    ...(row.failureMessage ? { failureMessage: row.failureMessage } : {}),
    ...(row.cancelRequestedAt ? { cancelRequestedAt: row.cancelRequestedAt } : {}),
    ...(row.failureCode ? { failureCode: row.failureCode } : {}),
    ...(degradedFlags ? { degradedFlags } : {}),
  };
}

async function nextAttempt(missionId: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ maxAttempt?: number | null }>(
    'SELECT MAX(attempt) AS maxAttempt FROM mission_runs WHERE missionId = ?',
    missionId,
  );
  return Number(row?.maxAttempt || 0) + 1;
}

export async function createMissionRun(input: CreateMissionRunInput): Promise<MissionRunRecord> {
  const db = await getDb();
  const id = generateMissionRunId();
  const createdAt = nowIso();
  const attempt = await nextAttempt(input.missionId);

  await db.run(
    `INSERT INTO mission_runs (
      id, missionId, taskId, status, stage, attempt, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.missionId,
    input.taskId || null,
    'queued',
    'queued',
    attempt,
    createdAt,
  );

  return {
    id,
    missionId: input.missionId,
    status: 'queued',
    stage: 'queued',
    attempt,
    createdAt,
    ...(input.taskId ? { taskId: input.taskId } : {}),
  };
}

export async function getMissionRun(id: string): Promise<MissionRunRecord | null> {
  const db = await getDb();
  const row = await db.get<MissionRunRow>('SELECT * FROM mission_runs WHERE id = ?', id);
  return row ? toMissionRunRecord(row) : null;
}

export async function listMissionRuns(missionId: string): Promise<MissionRunRecord[]> {
  const db = await getDb();
  const rows = await db.all<MissionRunRow[]>(
    'SELECT * FROM mission_runs WHERE missionId = ? ORDER BY createdAt DESC',
    missionId,
  );
  return rows.map(toMissionRunRecord);
}

export async function getLatestMissionRun(missionId: string): Promise<MissionRunRecord | null> {
  const runs = await listMissionRuns(missionId);
  return runs[0] || null;
}

export async function updateMissionRun(id: string, updates: UpdateMissionRunInput): Promise<MissionRunRecord | null> {
  const current = await getMissionRun(id);
  if (!current) return null;

  const nextStatus = updates.status ?? current.status;
  const nextStage = updates.stage ?? current.stage;
  const nextWorkerLeaseId = updates.workerLeaseId ?? current.workerLeaseId ?? null;
  const nextStartedAt = updates.startedAt ?? current.startedAt ?? null;
  const nextHeartbeatAt = updates.heartbeatAt ?? current.heartbeatAt ?? null;
  const nextCompletedAt = updates.completedAt ?? current.completedAt ?? null;
  const nextFailureMessage = updates.failureMessage ?? current.failureMessage ?? null;
  const nextCancelRequestedAt = updates.cancelRequestedAt ?? current.cancelRequestedAt ?? null;
  const nextFailureCode = updates.failureCode ?? current.failureCode ?? null;
  const nextDegradedFlags = updates.degradedFlags ?? current.degradedFlags ?? null;

  const db = await getDb();
  await db.run(
    `UPDATE mission_runs
      SET status = ?, stage = ?, workerLeaseId = ?, startedAt = ?, heartbeatAt = ?,
          completedAt = ?, failureMessage = ?, cancelRequestedAt = ?, failureCode = ?, degradedFlags = ?
      WHERE id = ?`,
    nextStatus,
    nextStage,
    nextWorkerLeaseId,
    nextStartedAt,
    nextHeartbeatAt,
    nextCompletedAt,
    nextFailureMessage,
    nextCancelRequestedAt,
    nextFailureCode,
    nextDegradedFlags ? JSON.stringify(nextDegradedFlags) : null,
    id,
  );

  return getMissionRun(id);
}

export async function markMissionRunRunning(id: string, workerLeaseId?: string): Promise<MissionRunRecord | null> {
  const timestamp = nowIso();
  return updateMissionRun(id, {
    status: 'running',
    stage: 'dispatch',
    ...(workerLeaseId ? { workerLeaseId } : {}),
    startedAt: timestamp,
    heartbeatAt: timestamp,
  });
}

export async function markMissionRunStage(id: string, stage: MissionRunStage): Promise<MissionRunRecord | null> {
  return updateMissionRun(id, {
    status: 'running',
    stage,
    heartbeatAt: nowIso(),
  });
}

export async function touchMissionRunHeartbeat(id: string, stage?: MissionRunStage): Promise<MissionRunRecord | null> {
  return updateMissionRun(id, {
    ...(stage ? { stage } : {}),
    heartbeatAt: nowIso(),
  });
}

export async function completeMissionRun(id: string, degradedFlags?: string[]): Promise<MissionRunRecord | null> {
  const timestamp = nowIso();
  return updateMissionRun(id, {
    status: 'completed',
    stage: 'completed',
    heartbeatAt: timestamp,
    completedAt: timestamp,
    ...(degradedFlags ? { degradedFlags } : {}),
  });
}

export async function failMissionRun(id: string, failureMessage: string): Promise<MissionRunRecord | null> {
  const timestamp = nowIso();
  return updateMissionRun(id, {
    status: 'failed',
    stage: 'failed',
    heartbeatAt: timestamp,
    completedAt: timestamp,
    failureMessage,
    failureCode: 'execution_failed',
  });
}

export async function cancelMissionRun(id: string, failureMessage = 'Canceled'): Promise<MissionRunRecord | null> {
  const timestamp = nowIso();
  return updateMissionRun(id, {
    status: 'canceled',
    stage: 'canceled',
    heartbeatAt: timestamp,
    completedAt: timestamp,
    failureMessage,
    cancelRequestedAt: timestamp,
    failureCode: 'canceled',
  });
}

export async function requeueMissionRunsForTasks(taskIds: string[]): Promise<number> {
  if (taskIds.length === 0) return 0;

  const db = await getDb();
  const placeholders = taskIds.map(() => '?').join(', ');
  const result = await db.run(
    `UPDATE mission_runs
      SET status = 'queued',
          stage = 'queued',
          workerLeaseId = NULL,
          startedAt = NULL,
          heartbeatAt = ?,
          completedAt = NULL,
          failureMessage = NULL,
          cancelRequestedAt = NULL,
          failureCode = NULL
      WHERE taskId IN (${placeholders}) AND status = 'running'`,
    nowIso(),
    ...taskIds,
  );

  return result.changes || 0;
}
