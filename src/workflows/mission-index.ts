import { getDb } from '../db';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { Database } from 'sqlite';
import type { MissionEvidenceRecord, MissionInput, MissionStatus, UnifiedMission } from './types';
import type { MissionEventRecord } from './mission-events';
import { hashMissionInput } from './mission-identity';

export type MissionArtifactKind = 'mission' | 'event_log' | 'evidence' | 'trace' | 'report';

export interface MissionArtifactRef {
  id: string;
  missionId: string;
  kind: MissionArtifactKind;
  artifactPath: string;
  createdAt: string;
  updatedAt: string;
  runId?: string;
  sha256?: string;
  sizeBytes?: number;
  contentType?: string;
  meta?: Record<string, unknown>;
}

export type MissionArtifactHealthStatus = 'ok' | 'warning' | 'degraded';
export type MissionArtifactHealthIssueCode =
  | 'missing'
  | 'unreadable'
  | 'integrity_missing'
  | 'checksum_mismatch'
  | 'size_mismatch';

export interface MissionArtifactHealthIssue {
  code: MissionArtifactHealthIssueCode;
  artifactId: string;
  missionId: string;
  kind: string;
  artifactPath: string;
  runId?: string;
  expectedSha256?: string;
  actualSha256?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
  message: string;
}

export interface MissionArtifactKindHealth {
  total: number;
  present: number;
  issues: number;
}

export interface MissionArtifactHealthDiagnostics {
  status: MissionArtifactHealthStatus;
  checkedAt: string;
  total: number;
  present: number;
  missing: number;
  unreadable: number;
  integrityMissing: number;
  checksumMismatch: number;
  sizeMismatch: number;
  byKind: Record<string, MissionArtifactKindHealth>;
  issues: MissionArtifactHealthIssue[];
}

export interface MissionArtifactBackfillResult {
  checkedAt: string;
  missionsScanned: number;
  missionArtifactsUpserted: number;
  eventRowsScanned: number;
  eventLogArtifactsUpserted: number;
  evidenceRefsScanned: number;
  evidenceArtifactsUpserted: number;
  totalArtifactsUpserted: number;
  filesPresent: number;
  filesMissing: number;
  filesUnreadable: number;
}

export interface MissionArtifactIntegrityRefreshOptions {
  overwriteMismatches?: boolean;
}

export interface MissionArtifactIntegrityRefreshResult {
  checkedAt: string;
  total: number;
  filesPresent: number;
  filesMissing: number;
  filesUnreadable: number;
  integrityMissing: number;
  checksumMismatches: number;
  sizeMismatches: number;
  refreshed: number;
  skippedMismatches: number;
  refreshedArtifactIds: string[];
}

export type MissionArtifactRepairPlanStatus = 'ok' | 'actionable' | 'blocked';
export type MissionArtifactRepairActionKind =
  | 'refresh_integrity'
  | 'verify_and_overwrite_integrity'
  | 'restore_artifact'
  | 'fix_permissions';
export type MissionArtifactRepairActionSafety = 'automatic' | 'manual_review' | 'blocked';

export interface MissionArtifactRepairAction {
  artifactId: string;
  missionId: string;
  kind: MissionArtifactKind;
  artifactPath: string;
  issueCode: MissionArtifactHealthIssueCode;
  action: MissionArtifactRepairActionKind;
  safety: MissionArtifactRepairActionSafety;
  reason: string;
  runId?: string;
  api?: {
    method: 'POST';
    path: string;
    body?: Record<string, unknown>;
  };
}

export interface MissionArtifactRepairPlan {
  status: MissionArtifactRepairPlanStatus;
  checkedAt: string;
  totalArtifacts: number;
  totalActions: number;
  automaticActions: number;
  manualReviewActions: number;
  blockedActions: number;
  sampledActions: MissionArtifactRepairAction[];
}

export interface MissionArtifactRepairOptions {
  artifactIds?: string[];
  includeManualReview?: boolean;
}

export interface MissionArtifactRepairResult {
  checkedAt: string;
  requestedArtifactIds: string[];
  notFoundArtifactIds: string[];
  totalArtifacts: number;
  totalActions: number;
  eligibleActions: number;
  applied: number;
  skippedHealthy: number;
  skippedManualReview: number;
  blocked: number;
  updatedArtifactIds: string[];
  skippedActions: MissionArtifactRepairAction[];
}

export interface MissionCanonicalBackfillResult {
  checkedAt: string;
  missionsScanned: number;
  inserted: number;
  refreshed: number;
  inputPayloadFallbacks: number;
  latestRunsLinked: number;
  latestEventsLinked: number;
  artifactIntegrityRecorded: number;
  filesPresent: number;
  filesMissing: number;
  filesUnreadable: number;
}

export type MissionCanonicalCoverageStatus = 'ok' | 'warning' | 'degraded';
export type MissionCanonicalCoverageIssueCode =
  | 'missing_canonical'
  | 'orphan_canonical'
  | 'stale_canonical'
  | 'artifact_path_mismatch'
  | 'artifact_missing'
  | 'artifact_unreadable'
  | 'integrity_missing'
  | 'checksum_mismatch'
  | 'size_mismatch';

export interface MissionCanonicalCoverageIssue {
  code: MissionCanonicalCoverageIssueCode;
  missionId: string;
  message: string;
  indexUpdatedAt?: string;
  canonicalUpdatedAt?: string;
  artifactPath?: string;
  expectedSha256?: string;
  actualSha256?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
}

export interface MissionCanonicalCoverageDiagnostics {
  status: MissionCanonicalCoverageStatus;
  checkedAt: string;
  indexTotal: number;
  canonicalTotal: number;
  covered: number;
  missingCanonical: number;
  orphanCanonical: number;
  staleCanonical: number;
  artifactPathMismatch: number;
  artifactMissing: number;
  artifactUnreadable: number;
  integrityMissing: number;
  checksumMismatch: number;
  sizeMismatch: number;
  issues: MissionCanonicalCoverageIssue[];
}

interface MissionIndexRow {
  id: string;
  status?: MissionStatus;
  mode?: MissionInput['mode'];
  query?: string;
  source?: string | null;
  depth?: MissionInput['depth'] | null;
  opportunityId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  inputPayload?: string;
  artifactPath: string;
}

interface MissionCanonicalRow {
  id: string;
  mode: MissionInput['mode'];
  query: string;
  tickers: string | null;
  depth: MissionInput['depth'] | null;
  source: string | null;
  opportunityId: string | null;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  inputPayload: string;
  inputHash: string;
  latestRunId: string | null;
  latestEventId: string | null;
  artifactPath: string | null;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
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
  artifactPath: string;
}

interface MissionEvidenceRefRow {
  id: string;
  missionId?: string;
  runId?: string;
  capturedAt?: string;
  status?: MissionEvidenceRecord['status'];
  completeness?: MissionEvidenceRecord['completeness'];
  artifactPath: string;
}

interface MissionArtifactRow {
  id: string;
  missionId: string;
  runId: string | null;
  kind: MissionArtifactKind;
  artifactPath: string;
  sha256: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  createdAt: string;
  updatedAt: string;
  meta: string | null;
}

interface MissionLatestRunRow {
  id: string;
  updatedAt: string | null;
}

interface MissionLatestEventRow {
  id: string;
  timestamp: string;
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function logIndexError(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`[MissionIndex] ${action} failed: ${message}`);
}

function missionArtifactId(missionId: string): string {
  return `mission:${missionId}`;
}

function eventLogArtifactId(missionId: string): string {
  return `event_log:${missionId}`;
}

function evidenceArtifactId(evidenceId: string): string {
  return `evidence:${evidenceId}`;
}

function parseArtifactMeta(row: MissionArtifactRow): Record<string, unknown> | undefined {
  if (!row.meta) return undefined;
  try {
    return JSON.parse(row.meta) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function inferArtifactContentType(artifactPath: string): string {
  const extension = path.extname(artifactPath).toLowerCase();
  if (extension === '.json') return 'application/json';
  if (extension === '.jsonl') return 'application/x-ndjson';
  if (extension === '.md' || extension === '.markdown') return 'text/markdown';
  if (extension === '.txt') return 'text/plain';
  return 'application/octet-stream';
}

function readArtifactIntegrity(artifactPath: string): Pick<MissionArtifactRef, 'sha256' | 'sizeBytes'> {
  if (!artifactPath || !fs.existsSync(artifactPath)) return {};

  try {
    const bytes = fs.readFileSync(artifactPath);
    return {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
    };
  } catch (error) {
    logIndexError(`read artifact integrity ${artifactPath}`, error);
    return {};
  }
}

function computeArtifactIntegrity(
  artifactPath: string,
): Pick<MissionArtifactRef, 'sha256' | 'sizeBytes' | 'contentType'> | null {
  if (!artifactPath || !fs.existsSync(artifactPath)) return null;
  const bytes = fs.readFileSync(artifactPath);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
    contentType: inferArtifactContentType(artifactPath),
  };
}

type ArtifactFileState = 'present' | 'missing' | 'unreadable';

function inspectArtifactFileState(artifactPath: string): ArtifactFileState {
  if (!artifactPath || !fs.existsSync(artifactPath)) return 'missing';
  try {
    fs.accessSync(artifactPath, fs.constants.R_OK);
    return 'present';
  } catch {
    return 'unreadable';
  }
}

function countArtifactFileState(result: MissionArtifactBackfillResult, artifactPath: string): void {
  const state = inspectArtifactFileState(artifactPath);
  if (state === 'present') {
    result.filesPresent += 1;
  } else if (state === 'missing') {
    result.filesMissing += 1;
  } else {
    result.filesUnreadable += 1;
  }
}

function countCanonicalArtifactFileState(result: MissionCanonicalBackfillResult, artifactPath: string): void {
  const state = inspectArtifactFileState(artifactPath);
  if (state === 'present') {
    result.filesPresent += 1;
    result.artifactIntegrityRecorded += 1;
  } else if (state === 'missing') {
    result.filesMissing += 1;
  } else {
    result.filesUnreadable += 1;
  }
}

function maxIsoTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps[timestamps.length - 1] || null;
}

function canonicalIssueMessage(
  code: MissionCanonicalCoverageIssueCode,
  missionId: string,
  artifactPath?: string,
): string {
  switch (code) {
    case 'missing_canonical':
      return `Mission ${missionId} exists in missions_index but is missing from missions`;
    case 'orphan_canonical':
      return `Mission ${missionId} exists in missions but not in missions_index`;
    case 'stale_canonical':
      return `Mission ${missionId} canonical row is older than missions_index`;
    case 'artifact_path_mismatch':
      return `Mission ${missionId} artifact path differs between missions and missions_index`;
    case 'artifact_missing':
      return `Mission ${missionId} artifact file is missing: ${artifactPath || 'unknown'}`;
    case 'artifact_unreadable':
      return `Mission ${missionId} artifact file cannot be read: ${artifactPath || 'unknown'}`;
    case 'integrity_missing':
      return `Mission ${missionId} canonical artifact integrity metadata is incomplete`;
    case 'checksum_mismatch':
      return `Mission ${missionId} canonical artifact sha256 no longer matches`;
    case 'size_mismatch':
      return `Mission ${missionId} canonical artifact size no longer matches`;
  }
}

function mapMissionArtifactRow(row: MissionArtifactRow): MissionArtifactRef {
  const meta = parseArtifactMeta(row);
  return {
    id: row.id,
    missionId: row.missionId,
    kind: row.kind,
    artifactPath: row.artifactPath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.runId ? { runId: row.runId } : {}),
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
    ...(row.sizeBytes !== null ? { sizeBytes: row.sizeBytes } : {}),
    ...(row.contentType ? { contentType: row.contentType } : {}),
    ...(meta ? { meta } : {}),
  };
}

function issueMessage(code: MissionArtifactHealthIssueCode, row: MissionArtifactRow): string {
  switch (code) {
    case 'missing':
      return `Artifact file is missing: ${row.artifactPath}`;
    case 'unreadable':
      return `Artifact file cannot be read: ${row.artifactPath}`;
    case 'integrity_missing':
      return `Artifact integrity metadata is incomplete: ${row.artifactPath}`;
    case 'checksum_mismatch':
      return `Artifact sha256 no longer matches indexed metadata: ${row.artifactPath}`;
    case 'size_mismatch':
      return `Artifact size no longer matches indexed metadata: ${row.artifactPath}`;
  }
}

function createArtifactHealthIssue(
  row: MissionArtifactRow,
  code: MissionArtifactHealthIssueCode,
  details: Partial<Omit<MissionArtifactHealthIssue, 'code' | 'artifactId' | 'missionId' | 'kind' | 'artifactPath' | 'message'>> = {},
): MissionArtifactHealthIssue {
  return {
    code,
    artifactId: row.id,
    missionId: row.missionId,
    kind: row.kind,
    artifactPath: row.artifactPath,
    message: issueMessage(code, row),
    ...(row.runId ? { runId: row.runId } : {}),
    ...details,
  };
}

function createArtifactRepairAction(
  row: MissionArtifactRow,
  issueCode: MissionArtifactHealthIssueCode,
): MissionArtifactRepairAction {
  const base = {
    artifactId: row.id,
    missionId: row.missionId,
    kind: row.kind,
    artifactPath: row.artifactPath,
    issueCode,
    ...(row.runId ? { runId: row.runId } : {}),
  };

  switch (issueCode) {
    case 'integrity_missing':
      return {
        ...base,
        action: 'refresh_integrity',
        safety: 'automatic',
        reason: 'File is readable, but indexed sha256/size/contentType metadata is incomplete.',
        api: {
          method: 'POST',
          path: '/api/diagnostics/mission-artifacts/refresh-integrity',
          body: { overwriteMismatches: false },
        },
      };
    case 'checksum_mismatch':
    case 'size_mismatch':
      return {
        ...base,
        action: 'verify_and_overwrite_integrity',
        safety: 'manual_review',
        reason: 'Indexed integrity no longer matches the file. Review the artifact before overwriting metadata.',
        api: {
          method: 'POST',
          path: '/api/diagnostics/mission-artifacts/refresh-integrity',
          body: { overwriteMismatches: true },
        },
      };
    case 'unreadable':
      return {
        ...base,
        action: 'fix_permissions',
        safety: 'manual_review',
        reason: 'Artifact path exists but cannot be read by the current process.',
      };
    case 'missing':
      return {
        ...base,
        action: 'restore_artifact',
        safety: 'blocked',
        reason: 'Artifact file is missing. Restore the file or regenerate the Mission artifact before refreshing metadata.',
      };
  }
}

function inspectArtifactRepairCandidate(
  row: MissionArtifactRow,
): { action: MissionArtifactRepairAction; integrity?: Pick<MissionArtifactRef, 'sha256' | 'sizeBytes' | 'contentType'> } | null {
  if (!fs.existsSync(row.artifactPath)) {
    return { action: createArtifactRepairAction(row, 'missing') };
  }

  let integrity: Pick<MissionArtifactRef, 'sha256' | 'sizeBytes' | 'contentType'> | null;
  try {
    integrity = computeArtifactIntegrity(row.artifactPath);
  } catch {
    return { action: createArtifactRepairAction(row, 'unreadable') };
  }

  if (!integrity?.sha256 || integrity.sizeBytes === undefined || !integrity.contentType) {
    return { action: createArtifactRepairAction(row, 'unreadable') };
  }

  if (!row.sha256 || row.sizeBytes === null || !row.contentType) {
    return { action: createArtifactRepairAction(row, 'integrity_missing'), integrity };
  }

  if (row.sha256 !== integrity.sha256) {
    return { action: createArtifactRepairAction(row, 'checksum_mismatch'), integrity };
  }

  if (row.sizeBytes !== integrity.sizeBytes) {
    return { action: createArtifactRepairAction(row, 'size_mismatch'), integrity };
  }

  return null;
}

function ensureKindHealth(
  byKind: Record<string, MissionArtifactKindHealth>,
  kind: string,
): MissionArtifactKindHealth {
  if (!byKind[kind]) {
    byKind[kind] = { total: 0, present: 0, issues: 0 };
  }
  return byKind[kind];
}

async function updateMissionArtifactIntegrityWithDb(
  db: Database,
  artifactId: string,
  integrity: Pick<MissionArtifactRef, 'sha256' | 'sizeBytes' | 'contentType'>,
  updatedAt: string,
): Promise<void> {
  await db.run(
    `UPDATE mission_artifacts
     SET sha256 = ?, sizeBytes = ?, contentType = ?, updatedAt = ?
     WHERE id = ?`,
    integrity.sha256,
    integrity.sizeBytes,
    integrity.contentType,
    updatedAt,
    artifactId,
  );
}

async function upsertMissionArtifactRefWithDb(
  db: Database,
  ref: MissionArtifactRef,
): Promise<void> {
  const integrity = {
    ...readArtifactIntegrity(ref.artifactPath),
    ...(ref.sha256 ? { sha256: ref.sha256 } : {}),
    ...(ref.sizeBytes !== undefined ? { sizeBytes: ref.sizeBytes } : {}),
  };
  const contentType = ref.contentType || inferArtifactContentType(ref.artifactPath);

  await db.run(
    `INSERT INTO mission_artifacts (
      id, missionId, runId, kind, artifactPath, sha256, sizeBytes, contentType, createdAt, updatedAt, meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      missionId = excluded.missionId,
      runId = excluded.runId,
      kind = excluded.kind,
      artifactPath = excluded.artifactPath,
      sha256 = excluded.sha256,
      sizeBytes = excluded.sizeBytes,
      contentType = excluded.contentType,
      updatedAt = excluded.updatedAt,
      meta = excluded.meta`,
    ref.id,
    ref.missionId,
    ref.runId || null,
    ref.kind,
    ref.artifactPath,
    integrity.sha256 || null,
    integrity.sizeBytes ?? null,
    contentType,
    ref.createdAt,
    ref.updatedAt,
    serializeJson(ref.meta),
  );
}

async function upsertMissionCanonicalWithDb(
  db: Database,
  mission: UnifiedMission,
  artifactPath: string,
): Promise<void> {
  const integrity = readArtifactIntegrity(artifactPath);
  await db.run(
    `INSERT INTO missions (
      id, mode, query, tickers, depth, source, opportunityId, status, createdAt, updatedAt,
      inputPayload, inputHash, latestRunId, latestEventId, artifactPath, artifactSha256, artifactSizeBytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mode = excluded.mode,
      query = excluded.query,
      tickers = excluded.tickers,
      depth = excluded.depth,
      source = excluded.source,
      opportunityId = excluded.opportunityId,
      status = excluded.status,
      updatedAt = excluded.updatedAt,
      inputPayload = excluded.inputPayload,
      inputHash = excluded.inputHash,
      latestRunId = COALESCE(excluded.latestRunId, missions.latestRunId),
      latestEventId = COALESCE(excluded.latestEventId, missions.latestEventId),
      artifactPath = excluded.artifactPath,
      artifactSha256 = COALESCE(excluded.artifactSha256, missions.artifactSha256),
      artifactSizeBytes = COALESCE(excluded.artifactSizeBytes, missions.artifactSizeBytes)`,
    mission.id,
    mission.input.mode,
    mission.input.query,
    JSON.stringify(mission.input.tickers || []),
    mission.input.depth || null,
    mission.input.source || null,
    mission.input.opportunityId || null,
    mission.status,
    mission.createdAt,
    mission.updatedAt,
    JSON.stringify(mission.input),
    hashMissionInput(mission.input),
    null,
    null,
    artifactPath,
    integrity.sha256 || null,
    integrity.sizeBytes ?? null,
  );
}

function parseMissionInputPayload(inputPayload?: string | null): MissionInput | null {
  if (inputPayload) {
    try {
      const parsed = JSON.parse(inputPayload) as Partial<MissionInput>;
      if (parsed.query && parsed.mode) {
        return {
          mode: parsed.mode,
          query: parsed.query,
          ...(parsed.tickers ? { tickers: parsed.tickers } : {}),
          ...(parsed.depth ? { depth: parsed.depth } : {}),
          ...(parsed.source ? { source: parsed.source } : {}),
          ...(parsed.date ? { date: parsed.date } : {}),
          ...(parsed.opportunityId ? { opportunityId: parsed.opportunityId } : {}),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parseTickerList(tickers?: string | null): string[] {
  if (!tickers) return [];
  try {
    const parsed = JSON.parse(tickers) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((ticker): ticker is string => typeof ticker === 'string' && ticker.trim().length > 0);
    }
  } catch {
    return [];
  }
  return [];
}

function parseMissionInput(row: MissionIndexRow): MissionInput {
  const parsedInput = parseMissionInputPayload(row.inputPayload);
  if (parsedInput) return parsedInput;

  return {
    mode: row.mode || 'explore',
    query: row.query || row.id,
    ...(row.depth ? { depth: row.depth } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.opportunityId ? { opportunityId: row.opportunityId } : {}),
  };
}

function parseCanonicalMissionInput(row: MissionCanonicalRow): MissionInput {
  const parsedInput = parseMissionInputPayload(row.inputPayload);
  if (parsedInput) return parsedInput;

  const tickers = parseTickerList(row.tickers);
  return {
    mode: row.mode || 'explore',
    query: row.query || row.id,
    ...(tickers.length > 0 ? { tickers } : {}),
    ...(row.depth ? { depth: row.depth } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.opportunityId ? { opportunityId: row.opportunityId } : {}),
  };
}

function buildMissionSkeleton(
  id: string,
  input: MissionInput,
  status: MissionStatus | undefined,
  createdAtValue: string | undefined,
  updatedAtValue: string | undefined,
): UnifiedMission {
  const createdAt = createdAtValue || new Date(0).toISOString();
  return {
    id,
    traceId: id,
    input,
    status: status || 'queued',
    createdAt,
    updatedAt: updatedAtValue || createdAt,
    openclawReport: null,
    openclawTickers: [],
    openclawDurationMs: 0,
    taResults: [],
    taDurationMs: 0,
    openbbData: [],
    macroData: null,
    consensus: [],
    totalDurationMs: 0,
  };
}

function buildMissionStub(row: MissionIndexRow): UnifiedMission {
  return buildMissionSkeleton(
    row.id,
    parseMissionInput(row),
    row.status,
    row.createdAt,
    row.updatedAt,
  );
}

function buildMissionCanonicalStub(row: MissionCanonicalRow): UnifiedMission {
  return buildMissionSkeleton(
    row.id,
    parseCanonicalMissionInput(row),
    row.status,
    row.createdAt,
    row.updatedAt,
  );
}

function readMissionArtifact(row: MissionIndexRow): UnifiedMission {
  if (!row.artifactPath || !fs.existsSync(row.artifactPath)) {
    return buildMissionStub(row);
  }

  try {
    return JSON.parse(fs.readFileSync(row.artifactPath, 'utf-8')) as UnifiedMission;
  } catch (error) {
    logIndexError(`read mission artifact ${row.id}`, error);
    return buildMissionStub(row);
  }
}

function readMissionCanonicalArtifact(row: MissionCanonicalRow): UnifiedMission {
  if (!row.artifactPath || !fs.existsSync(row.artifactPath)) {
    return buildMissionCanonicalStub(row);
  }

  try {
    return JSON.parse(fs.readFileSync(row.artifactPath, 'utf-8')) as UnifiedMission;
  } catch (error) {
    logIndexError(`read canonical mission artifact ${row.id}`, error);
    return buildMissionCanonicalStub(row);
  }
}

function readMissionEvidenceArtifact(row: MissionEvidenceRefRow): MissionEvidenceRecord | null {
  if (!row.artifactPath || !fs.existsSync(row.artifactPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(row.artifactPath, 'utf-8')) as MissionEvidenceRecord;
  } catch (error) {
    logIndexError(`read evidence artifact ${row.id}`, error);
    return null;
  }
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
  await upsertMissionCanonicalWithDb(db, mission, artifactPath);
  await upsertMissionArtifactRefWithDb(db, {
    id: missionArtifactId(mission.id),
    missionId: mission.id,
    kind: 'mission',
    artifactPath,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    meta: {
      status: mission.status,
      mode: mission.input.mode,
      query: mission.input.query,
      source: mission.input.source || null,
      opportunityId: mission.input.opportunityId || null,
    },
  });
}

export async function deleteMissionIndex(missionId: string): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM missions_index WHERE id = ?', missionId);
  await db.run('DELETE FROM mission_events WHERE missionId = ?', missionId);
  await db.run('DELETE FROM mission_evidence_refs WHERE missionId = ?', missionId);
  await db.run('DELETE FROM mission_artifacts WHERE missionId = ?', missionId);
  await db.run('DELETE FROM missions WHERE id = ?', missionId);
}

export async function upsertMissionArtifactRef(ref: MissionArtifactRef): Promise<void> {
  const db = await getDb();
  await upsertMissionArtifactRefWithDb(db, ref);
}

export async function listMissionArtifactRefs(missionId: string): Promise<MissionArtifactRef[]> {
  const db = await getDb();
  const rows = await db.all<MissionArtifactRow[]>(
    `SELECT * FROM mission_artifacts
     WHERE missionId = ?
     ORDER BY updatedAt DESC, createdAt DESC`,
    missionId,
  );
  return rows.map(mapMissionArtifactRow);
}

export async function getLatestMissionArtifactRef(
  missionId: string,
  kind: MissionArtifactKind,
  runId?: string,
): Promise<MissionArtifactRef | null> {
  const db = await getDb();
  const params = runId ? [missionId, kind, runId] : [missionId, kind];
  const row = runId
    ? await db.get<MissionArtifactRow>(
      `SELECT * FROM mission_artifacts
       WHERE missionId = ? AND kind = ? AND runId = ?
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT 1`,
      ...params,
    )
    : await db.get<MissionArtifactRow>(
      `SELECT * FROM mission_artifacts
       WHERE missionId = ? AND kind = ?
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT 1`,
      ...params,
    );
  return row ? mapMissionArtifactRow(row) : null;
}

export async function getLatestMissionArtifactRefForRun(
  runId: string,
  kind: MissionArtifactKind,
): Promise<MissionArtifactRef | null> {
  const db = await getDb();
  const row = await db.get<MissionArtifactRow>(
    `SELECT * FROM mission_artifacts
     WHERE runId = ? AND kind = ?
     ORDER BY updatedAt DESC, createdAt DESC
     LIMIT 1`,
    runId,
    kind,
  );
  return row ? mapMissionArtifactRow(row) : null;
}

export async function getMissionArtifactHealthDiagnostics(
  issueLimit = 25,
): Promise<MissionArtifactHealthDiagnostics> {
  const db = await getDb();
  const rows = await db.all<MissionArtifactRow[]>(
    'SELECT * FROM mission_artifacts ORDER BY updatedAt DESC, createdAt DESC',
  );
  const diagnostics: MissionArtifactHealthDiagnostics = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
    total: rows.length,
    present: 0,
    missing: 0,
    unreadable: 0,
    integrityMissing: 0,
    checksumMismatch: 0,
    sizeMismatch: 0,
    byKind: {},
    issues: [],
  };

  const recordIssue = (row: MissionArtifactRow, issue: MissionArtifactHealthIssue) => {
    ensureKindHealth(diagnostics.byKind, row.kind).issues += 1;
    if (diagnostics.issues.length < issueLimit) {
      diagnostics.issues.push(issue);
    }
  };

  for (const row of rows) {
    const kindHealth = ensureKindHealth(diagnostics.byKind, row.kind);
    kindHealth.total += 1;

    if (!fs.existsSync(row.artifactPath)) {
      diagnostics.missing += 1;
      recordIssue(row, createArtifactHealthIssue(row, 'missing'));
      continue;
    }

    diagnostics.present += 1;
    kindHealth.present += 1;

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(row.artifactPath);
    } catch {
      diagnostics.unreadable += 1;
      recordIssue(row, createArtifactHealthIssue(row, 'unreadable'));
      continue;
    }

    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    const actualSizeBytes = bytes.byteLength;

    if (!row.sha256 || row.sizeBytes === null || !row.contentType) {
      diagnostics.integrityMissing += 1;
      recordIssue(row, createArtifactHealthIssue(row, 'integrity_missing', {
        actualSha256,
        actualSizeBytes,
      }));
      continue;
    }

    if (row.sha256 !== actualSha256) {
      diagnostics.checksumMismatch += 1;
      recordIssue(row, createArtifactHealthIssue(row, 'checksum_mismatch', {
        expectedSha256: row.sha256,
        actualSha256,
      }));
    }

    if (row.sizeBytes !== actualSizeBytes) {
      diagnostics.sizeMismatch += 1;
      recordIssue(row, createArtifactHealthIssue(row, 'size_mismatch', {
        expectedSizeBytes: row.sizeBytes,
        actualSizeBytes,
      }));
    }
  }

  if (diagnostics.missing || diagnostics.unreadable || diagnostics.checksumMismatch || diagnostics.sizeMismatch) {
    diagnostics.status = 'degraded';
  } else if (diagnostics.integrityMissing) {
    diagnostics.status = 'warning';
  }

  return diagnostics;
}

export async function getMissionArtifactRepairPlan(
  actionLimit = 25,
): Promise<MissionArtifactRepairPlan> {
  const db = await getDb();
  const rows = await db.all<MissionArtifactRow[]>(
    'SELECT * FROM mission_artifacts ORDER BY updatedAt DESC, createdAt DESC',
  );
  const plan: MissionArtifactRepairPlan = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
    totalArtifacts: rows.length,
    totalActions: 0,
    automaticActions: 0,
    manualReviewActions: 0,
    blockedActions: 0,
    sampledActions: [],
  };

  const recordAction = (action: MissionArtifactRepairAction) => {
    plan.totalActions += 1;
    if (action.safety === 'automatic') {
      plan.automaticActions += 1;
    } else if (action.safety === 'manual_review') {
      plan.manualReviewActions += 1;
    } else {
      plan.blockedActions += 1;
    }

    if (plan.sampledActions.length < actionLimit) {
      plan.sampledActions.push(action);
    }
  };

  for (const row of rows) {
    if (!fs.existsSync(row.artifactPath)) {
      recordAction(createArtifactRepairAction(row, 'missing'));
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(row.artifactPath);
    } catch {
      recordAction(createArtifactRepairAction(row, 'unreadable'));
      continue;
    }

    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    const actualSizeBytes = bytes.byteLength;

    if (!row.sha256 || row.sizeBytes === null || !row.contentType) {
      recordAction(createArtifactRepairAction(row, 'integrity_missing'));
      continue;
    }

    if (row.sha256 !== actualSha256) {
      recordAction(createArtifactRepairAction(row, 'checksum_mismatch'));
      continue;
    }

    if (row.sizeBytes !== actualSizeBytes) {
      recordAction(createArtifactRepairAction(row, 'size_mismatch'));
    }
  }

  if (plan.blockedActions > 0) {
    plan.status = 'blocked';
  } else if (plan.automaticActions > 0 || plan.manualReviewActions > 0) {
    plan.status = 'actionable';
  }

  return plan;
}

export async function repairMissionArtifacts(
  options: MissionArtifactRepairOptions = {},
): Promise<MissionArtifactRepairResult> {
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  const requestedArtifactIds = Array.from(new Set(
    (options.artifactIds || []).map(id => id.trim()).filter(Boolean),
  ));
  const rows = requestedArtifactIds.length > 0
    ? await db.all<MissionArtifactRow[]>(
      `SELECT * FROM mission_artifacts
       WHERE id IN (${requestedArtifactIds.map(() => '?').join(', ')})
       ORDER BY updatedAt DESC, createdAt DESC`,
      ...requestedArtifactIds,
    )
    : await db.all<MissionArtifactRow[]>(
      'SELECT * FROM mission_artifacts ORDER BY updatedAt DESC, createdAt DESC',
    );
  const foundIds = new Set(rows.map(row => row.id));
  const result: MissionArtifactRepairResult = {
    checkedAt,
    requestedArtifactIds,
    notFoundArtifactIds: requestedArtifactIds.filter(id => !foundIds.has(id)),
    totalArtifacts: rows.length,
    totalActions: 0,
    eligibleActions: 0,
    applied: 0,
    skippedHealthy: 0,
    skippedManualReview: 0,
    blocked: 0,
    updatedArtifactIds: [],
    skippedActions: [],
  };

  for (const row of rows) {
    const candidate = inspectArtifactRepairCandidate(row);
    if (!candidate) {
      result.skippedHealthy += 1;
      continue;
    }

    result.totalActions += 1;
    if (candidate.action.safety === 'blocked') {
      result.blocked += 1;
      result.skippedActions.push(candidate.action);
      continue;
    }

    if (candidate.action.safety === 'manual_review' && !options.includeManualReview) {
      result.skippedManualReview += 1;
      result.skippedActions.push(candidate.action);
      continue;
    }

    if (!candidate.integrity) {
      result.blocked += 1;
      result.skippedActions.push(candidate.action);
      continue;
    }

    result.eligibleActions += 1;
    await updateMissionArtifactIntegrityWithDb(db, row.id, candidate.integrity, checkedAt);
    result.applied += 1;
    result.updatedArtifactIds.push(row.id);
  }

  return result;
}

export async function backfillMissionArtifactRefs(): Promise<MissionArtifactBackfillResult> {
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  const result: MissionArtifactBackfillResult = {
    checkedAt,
    missionsScanned: 0,
    missionArtifactsUpserted: 0,
    eventRowsScanned: 0,
    eventLogArtifactsUpserted: 0,
    evidenceRefsScanned: 0,
    evidenceArtifactsUpserted: 0,
    totalArtifactsUpserted: 0,
    filesPresent: 0,
    filesMissing: 0,
    filesUnreadable: 0,
  };

  const missionRows = await db.all<MissionIndexRow[]>(
    'SELECT * FROM missions_index ORDER BY updatedAt ASC',
  );
  result.missionsScanned = missionRows.length;
  for (const row of missionRows) {
    if (!row.artifactPath) continue;
    const createdAt = row.createdAt || row.updatedAt || checkedAt;
    await upsertMissionArtifactRefWithDb(db, {
      id: missionArtifactId(row.id),
      missionId: row.id,
      kind: 'mission',
      artifactPath: row.artifactPath,
      createdAt,
      updatedAt: row.updatedAt || createdAt,
      meta: {
        status: row.status || null,
        mode: row.mode || null,
        query: row.query || null,
        source: row.source || null,
        opportunityId: row.opportunityId || null,
        backfilledAt: checkedAt,
      },
    });
    countArtifactFileState(result, row.artifactPath);
    result.missionArtifactsUpserted += 1;
  }

  const eventRows = await db.all<MissionEventRow[]>(
    'SELECT * FROM mission_events ORDER BY timestamp ASC',
  );
  result.eventRowsScanned = eventRows.length;
  const eventLogs = new Map<string, {
    missionId: string;
    artifactPath: string;
    createdAt: string;
    updatedAt: string;
    eventCount: number;
    latestEventId: string;
    latestEventType: string;
    latestStatus: string | null;
    latestPhase: string | null;
  }>();

  for (const row of eventRows) {
    if (!row.artifactPath) continue;
    const existing = eventLogs.get(row.missionId);
    eventLogs.set(row.missionId, {
      missionId: row.missionId,
      artifactPath: row.artifactPath,
      createdAt: existing?.createdAt || row.timestamp || checkedAt,
      updatedAt: row.timestamp || existing?.updatedAt || checkedAt,
      eventCount: (existing?.eventCount || 0) + 1,
      latestEventId: row.id,
      latestEventType: row.type,
      latestStatus: row.status ?? null,
      latestPhase: row.phase ?? null,
    });
  }

  for (const eventLog of eventLogs.values()) {
    await upsertMissionArtifactRefWithDb(db, {
      id: eventLogArtifactId(eventLog.missionId),
      missionId: eventLog.missionId,
      kind: 'event_log',
      artifactPath: eventLog.artifactPath,
      createdAt: eventLog.createdAt,
      updatedAt: eventLog.updatedAt,
      meta: {
        eventCount: eventLog.eventCount,
        latestEventId: eventLog.latestEventId,
        latestEventType: eventLog.latestEventType,
        latestStatus: eventLog.latestStatus,
        latestPhase: eventLog.latestPhase,
        backfilledAt: checkedAt,
      },
    });
    countArtifactFileState(result, eventLog.artifactPath);
    result.eventLogArtifactsUpserted += 1;
  }

  const evidenceRows = await db.all<MissionEvidenceRefRow[]>(
    'SELECT * FROM mission_evidence_refs ORDER BY capturedAt ASC',
  );
  result.evidenceRefsScanned = evidenceRows.length;
  for (const row of evidenceRows) {
    if (!row.missionId || !row.runId || !row.artifactPath) continue;
    const capturedAt = row.capturedAt || checkedAt;
    await upsertMissionArtifactRefWithDb(db, {
      id: evidenceArtifactId(row.id),
      missionId: row.missionId,
      runId: row.runId,
      kind: 'evidence',
      artifactPath: row.artifactPath,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      meta: {
        status: row.status || null,
        completeness: row.completeness || null,
        backfilledAt: checkedAt,
      },
    });
    countArtifactFileState(result, row.artifactPath);
    result.evidenceArtifactsUpserted += 1;
  }

  result.totalArtifactsUpserted = result.missionArtifactsUpserted
    + result.eventLogArtifactsUpserted
    + result.evidenceArtifactsUpserted;

  return result;
}

export async function backfillCanonicalMissions(): Promise<MissionCanonicalBackfillResult> {
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  const result: MissionCanonicalBackfillResult = {
    checkedAt,
    missionsScanned: 0,
    inserted: 0,
    refreshed: 0,
    inputPayloadFallbacks: 0,
    latestRunsLinked: 0,
    latestEventsLinked: 0,
    artifactIntegrityRecorded: 0,
    filesPresent: 0,
    filesMissing: 0,
    filesUnreadable: 0,
  };

  const missionRows = await db.all<MissionIndexRow[]>(
    'SELECT * FROM missions_index ORDER BY updatedAt ASC',
  );
  result.missionsScanned = missionRows.length;

  for (const row of missionRows) {
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM missions WHERE id = ?',
      row.id,
    );
    const parsedInput = parseMissionInputPayload(row.inputPayload);
    if (!parsedInput) result.inputPayloadFallbacks += 1;

    const mission = readMissionArtifact(row);
    await upsertMissionCanonicalWithDb(db, mission, row.artifactPath);
    if (existing) {
      result.refreshed += 1;
    } else {
      result.inserted += 1;
    }

    if (row.artifactPath) {
      countCanonicalArtifactFileState(result, row.artifactPath);
    }

    const latestRun = await db.get<MissionLatestRunRow>(
      `SELECT id, COALESCE(completedAt, heartbeatAt, startedAt, createdAt) AS updatedAt
       FROM mission_runs
       WHERE missionId = ?
       ORDER BY createdAt DESC, id DESC
       LIMIT 1`,
      row.id,
    );
    const latestEvent = await db.get<MissionLatestEventRow>(
      `SELECT id, timestamp
       FROM mission_events
       WHERE missionId = ?
       ORDER BY timestamp DESC, id DESC
       LIMIT 1`,
      row.id,
    );
    if (latestRun?.id) result.latestRunsLinked += 1;
    if (latestEvent?.id) result.latestEventsLinked += 1;

    const latestAt = maxIsoTimestamp([
      mission.updatedAt,
      latestRun?.updatedAt,
      latestEvent?.timestamp,
    ]) || mission.updatedAt;
    await db.run(
      `UPDATE missions
       SET latestRunId = COALESCE(?, latestRunId),
           latestEventId = COALESCE(?, latestEventId),
           updatedAt = CASE
             WHEN updatedAt < ? THEN ?
             ELSE updatedAt
           END
       WHERE id = ?`,
      latestRun?.id || null,
      latestEvent?.id || null,
      latestAt,
      latestAt,
      row.id,
    );
  }

  return result;
}

export async function getMissionCanonicalCoverageDiagnostics(
  issueLimit = 25,
): Promise<MissionCanonicalCoverageDiagnostics> {
  const db = await getDb();
  const indexRows = await db.all<MissionIndexRow[]>(
    'SELECT * FROM missions_index ORDER BY updatedAt DESC',
  );
  const canonicalRows = await db.all<MissionCanonicalRow[]>(
    'SELECT * FROM missions ORDER BY updatedAt DESC',
  );
  const canonicalById = new Map(canonicalRows.map(row => [row.id, row]));
  const indexById = new Map(indexRows.map(row => [row.id, row]));
  const diagnostics: MissionCanonicalCoverageDiagnostics = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
    indexTotal: indexRows.length,
    canonicalTotal: canonicalRows.length,
    covered: 0,
    missingCanonical: 0,
    orphanCanonical: 0,
    staleCanonical: 0,
    artifactPathMismatch: 0,
    artifactMissing: 0,
    artifactUnreadable: 0,
    integrityMissing: 0,
    checksumMismatch: 0,
    sizeMismatch: 0,
    issues: [],
  };

  const recordIssue = (
    code: MissionCanonicalCoverageIssueCode,
    missionId: string,
    details: Omit<MissionCanonicalCoverageIssue, 'code' | 'missionId' | 'message'> = {},
  ) => {
    if (diagnostics.issues.length >= issueLimit) return;
    diagnostics.issues.push({
      code,
      missionId,
      message: canonicalIssueMessage(code, missionId, details.artifactPath),
      ...details,
    });
  };

  for (const row of indexRows) {
    const canonical = canonicalById.get(row.id);
    if (!canonical) {
      diagnostics.missingCanonical += 1;
      recordIssue('missing_canonical', row.id, {
        ...(row.updatedAt ? { indexUpdatedAt: row.updatedAt } : {}),
        artifactPath: row.artifactPath,
      });
      continue;
    }

    diagnostics.covered += 1;
    if (row.updatedAt && canonical.updatedAt && canonical.updatedAt < row.updatedAt) {
      diagnostics.staleCanonical += 1;
      recordIssue('stale_canonical', row.id, {
        indexUpdatedAt: row.updatedAt,
        canonicalUpdatedAt: canonical.updatedAt,
      });
    }

    if (row.artifactPath && canonical.artifactPath && row.artifactPath !== canonical.artifactPath) {
      diagnostics.artifactPathMismatch += 1;
      recordIssue('artifact_path_mismatch', row.id, {
        artifactPath: canonical.artifactPath,
      });
    }

    const artifactPath = canonical.artifactPath || row.artifactPath;
    if (!artifactPath || !fs.existsSync(artifactPath)) {
      diagnostics.artifactMissing += 1;
      recordIssue('artifact_missing', row.id, artifactPath ? { artifactPath } : {});
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(artifactPath);
    } catch {
      diagnostics.artifactUnreadable += 1;
      recordIssue('artifact_unreadable', row.id, { artifactPath });
      continue;
    }

    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    const actualSizeBytes = bytes.byteLength;
    if (!canonical.artifactSha256 || canonical.artifactSizeBytes === null) {
      diagnostics.integrityMissing += 1;
      recordIssue('integrity_missing', row.id, {
        artifactPath,
        actualSha256,
        actualSizeBytes,
      });
      continue;
    }

    if (canonical.artifactSha256 !== actualSha256) {
      diagnostics.checksumMismatch += 1;
      recordIssue('checksum_mismatch', row.id, {
        artifactPath,
        expectedSha256: canonical.artifactSha256,
        actualSha256,
      });
    }

    if (canonical.artifactSizeBytes !== actualSizeBytes) {
      diagnostics.sizeMismatch += 1;
      recordIssue('size_mismatch', row.id, {
        artifactPath,
        expectedSizeBytes: canonical.artifactSizeBytes,
        actualSizeBytes,
      });
    }
  }

  for (const row of canonicalRows) {
    if (indexById.has(row.id)) continue;
    diagnostics.orphanCanonical += 1;
    recordIssue('orphan_canonical', row.id, {
      canonicalUpdatedAt: row.updatedAt,
      ...(row.artifactPath ? { artifactPath: row.artifactPath } : {}),
    });
  }

  if (
    diagnostics.missingCanonical
    || diagnostics.staleCanonical
    || diagnostics.artifactPathMismatch
    || diagnostics.artifactMissing
    || diagnostics.artifactUnreadable
    || diagnostics.checksumMismatch
    || diagnostics.sizeMismatch
  ) {
    diagnostics.status = 'degraded';
  } else if (diagnostics.orphanCanonical || diagnostics.integrityMissing) {
    diagnostics.status = 'warning';
  }

  return diagnostics;
}

export async function refreshMissionArtifactIntegrity(
  options: MissionArtifactIntegrityRefreshOptions = {},
): Promise<MissionArtifactIntegrityRefreshResult> {
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  const result: MissionArtifactIntegrityRefreshResult = {
    checkedAt,
    total: 0,
    filesPresent: 0,
    filesMissing: 0,
    filesUnreadable: 0,
    integrityMissing: 0,
    checksumMismatches: 0,
    sizeMismatches: 0,
    refreshed: 0,
    skippedMismatches: 0,
    refreshedArtifactIds: [],
  };
  const rows = await db.all<MissionArtifactRow[]>(
    'SELECT * FROM mission_artifacts ORDER BY updatedAt DESC, createdAt DESC',
  );
  result.total = rows.length;

  for (const row of rows) {
    const fileState = inspectArtifactFileState(row.artifactPath);
    if (fileState === 'missing') {
      result.filesMissing += 1;
      continue;
    }
    if (fileState === 'unreadable') {
      result.filesUnreadable += 1;
      continue;
    }

    result.filesPresent += 1;

    let integrity: Pick<MissionArtifactRef, 'sha256' | 'sizeBytes' | 'contentType'> | null;
    try {
      integrity = computeArtifactIntegrity(row.artifactPath);
    } catch {
      result.filesUnreadable += 1;
      result.filesPresent -= 1;
      continue;
    }
    if (!integrity?.sha256 || integrity.sizeBytes === undefined || !integrity.contentType) {
      result.filesUnreadable += 1;
      result.filesPresent -= 1;
      continue;
    }

    const missingIntegrity = !row.sha256 || row.sizeBytes === null || !row.contentType;
    const checksumMismatch = Boolean(row.sha256 && row.sha256 !== integrity.sha256);
    const sizeMismatch = Boolean(row.sizeBytes !== null && row.sizeBytes !== integrity.sizeBytes);

    if (missingIntegrity) result.integrityMissing += 1;
    if (checksumMismatch) result.checksumMismatches += 1;
    if (sizeMismatch) result.sizeMismatches += 1;

    const hasMismatch = checksumMismatch || sizeMismatch;
    if (hasMismatch && !options.overwriteMismatches) {
      result.skippedMismatches += 1;
      continue;
    }
    if (!missingIntegrity && !hasMismatch) continue;

    await db.run(
      `UPDATE mission_artifacts
       SET sha256 = ?, sizeBytes = ?, contentType = ?, updatedAt = ?
       WHERE id = ?`,
      integrity.sha256,
      integrity.sizeBytes,
      integrity.contentType,
      checkedAt,
      row.id,
    );
    result.refreshed += 1;
    result.refreshedArtifactIds.push(row.id);
  }

  return result;
}

export async function getMissionArtifactPath(missionId: string): Promise<string | null> {
  const db = await getDb();
  const canonicalRow = await db.get<Pick<MissionCanonicalRow, 'id' | 'artifactPath'>>(
    'SELECT id, artifactPath FROM missions WHERE id = ?',
    missionId,
  );
  if (canonicalRow?.artifactPath) return canonicalRow.artifactPath;

  const row = await db.get<MissionIndexRow>(
    'SELECT id, artifactPath FROM missions_index WHERE id = ?',
    missionId,
  );
  return row?.artifactPath || null;
}

export async function getMissionFromCanonicalIndex(missionId: string): Promise<UnifiedMission | null> {
  const db = await getDb();
  const row = await db.get<MissionCanonicalRow>(
    'SELECT * FROM missions WHERE id = ?',
    missionId,
  );
  return row ? readMissionCanonicalArtifact(row) : null;
}

export async function listMissionsFromCanonicalIndex(limit = 50): Promise<UnifiedMission[]> {
  const db = await getDb();
  const rows = await db.all<MissionCanonicalRow[]>(
    'SELECT * FROM missions ORDER BY updatedAt DESC LIMIT ?',
    limit,
  );
  return rows.map(readMissionCanonicalArtifact);
}

export async function getMissionFromIndex(missionId: string): Promise<UnifiedMission | null> {
  const db = await getDb();
  const row = await db.get<MissionIndexRow>(
    'SELECT * FROM missions_index WHERE id = ?',
    missionId,
  );
  return row ? readMissionArtifact(row) : null;
}

export async function listMissionsFromIndex(limit = 50): Promise<UnifiedMission[]> {
  const db = await getDb();
  const rows = await db.all<MissionIndexRow[]>(
    'SELECT * FROM missions_index ORDER BY updatedAt DESC LIMIT ?',
    limit,
  );
  return rows.map(readMissionArtifact);
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
  await db.run(
    `UPDATE missions
     SET latestEventId = ?,
         updatedAt = CASE
           WHEN updatedAt < ? THEN ?
           ELSE updatedAt
         END
     WHERE id = ?`,
    record.id,
    record.timestamp,
    record.timestamp,
    record.missionId,
  );
  await upsertMissionArtifactRefWithDb(db, {
    id: eventLogArtifactId(record.missionId),
    missionId: record.missionId,
    kind: 'event_log',
    artifactPath,
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
    meta: {
      latestEventId: record.id,
      latestEventType: record.type,
      latestStatus: record.status || null,
      latestPhase: record.phase || null,
    },
  });
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
  await upsertMissionArtifactRefWithDb(db, {
    id: evidenceArtifactId(record.id),
    missionId: record.missionId,
    runId: record.runId,
    kind: 'evidence',
    artifactPath,
    createdAt: record.capturedAt,
    updatedAt: record.capturedAt,
    meta: {
      status: record.status,
      completeness: record.completeness,
    },
  });
}

export async function getMissionEvidenceArtifactPath(runId: string): Promise<string | null> {
  const db = await getDb();
  const artifactRef = await getLatestMissionArtifactRefForRun(runId, 'evidence');
  if (artifactRef) return artifactRef.artifactPath;

  const row = await db.get<MissionEvidenceRefRow>(
    'SELECT id, artifactPath FROM mission_evidence_refs WHERE runId = ? ORDER BY capturedAt DESC LIMIT 1',
    runId,
  );
  return row?.artifactPath || null;
}

export async function getMissionEvidenceFromIndex(runId: string): Promise<MissionEvidenceRecord | null> {
  const db = await getDb();
  const artifactRef = await getLatestMissionArtifactRefForRun(runId, 'evidence');
  if (artifactRef) {
    const artifact = readMissionEvidenceArtifact({
      id: artifactRef.id,
      missionId: artifactRef.missionId,
      runId,
      artifactPath: artifactRef.artifactPath,
    });
    if (artifact) return artifact;
  }

  const row = await db.get<MissionEvidenceRefRow>(
    'SELECT * FROM mission_evidence_refs WHERE runId = ? ORDER BY capturedAt DESC LIMIT 1',
    runId,
  );
  return row ? readMissionEvidenceArtifact(row) : null;
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
