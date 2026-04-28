import * as fs from 'fs';
import * as path from 'path';
import { indexMissionEvidenceAsync } from './mission-index';
import type { MissionEvidenceCompleteness, MissionEvidenceRecord, UnifiedMission } from './types';

const MISSIONS_DIR = path.join(process.cwd(), 'out', 'missions');

function ensureDateDir(createdAt: string): string {
  const dateDir = path.join(MISSIONS_DIR, createdAt.split('T')[0] || 'unknown');
  if (!fs.existsSync(dateDir)) {
    fs.mkdirSync(dateDir, { recursive: true });
  }
  return dateDir;
}

function evidenceFilePath(runId: string, createdAt: string): string {
  return path.join(ensureDateDir(createdAt), `${runId}.evidence.json`);
}

export function saveMissionEvidence(
  mission: UnifiedMission,
  runId: string,
  completeness: MissionEvidenceCompleteness,
): MissionEvidenceRecord {
  const record: MissionEvidenceRecord = {
    id: `evidence_${runId}`,
    missionId: mission.id,
    runId,
    capturedAt: new Date().toISOString(),
    status: mission.status,
    completeness,
    input: mission.input,
    openclawReport: mission.openclawReport,
    openclawTickers: mission.openclawTickers,
    openclawDurationMs: mission.openclawDurationMs,
    taResults: mission.taResults,
    taDurationMs: mission.taDurationMs,
    openbbData: mission.openbbData,
    macroData: mission.macroData,
    consensus: mission.consensus,
    ...(mission.discoveryRejections ? { discoveryRejections: mission.discoveryRejections } : {}),
    ...(mission.decisionTrail ? { decisionTrail: mission.decisionTrail } : {}),
    ...(mission.structuredVerdicts ? { structuredVerdicts: mission.structuredVerdicts } : {}),
    totalDurationMs: mission.totalDurationMs,
  };

  const filePath = evidenceFilePath(runId, mission.createdAt);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  indexMissionEvidenceAsync(record, filePath);

  return record;
}

export function getMissionEvidence(runId: string): MissionEvidenceRecord | null {
  if (!fs.existsSync(MISSIONS_DIR)) return null;

  const dateDirs = fs.readdirSync(MISSIONS_DIR)
    .filter((dir) => fs.statSync(path.join(MISSIONS_DIR, dir)).isDirectory())
    .sort((a, b) => b.localeCompare(a));

  for (const dateDir of dateDirs) {
    const filePath = path.join(MISSIONS_DIR, dateDir, `${runId}.evidence.json`);
    if (!fs.existsSync(filePath)) continue;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MissionEvidenceRecord;
  }

  return null;
}
