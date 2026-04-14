import * as fs from 'fs';
import * as path from 'path';
import type { MissionStatus } from './types';

const MISSIONS_DIR = path.join(process.cwd(), 'out', 'missions');

export interface MissionEventRecord {
  id: string;
  missionId: string;
  timestamp: string;
  type: 'created' | 'queued' | 'started' | 'stage' | 'completed' | 'failed' | 'canceled';
  message: string;
  status?: MissionStatus;
  phase?: 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis';
  meta?: Record<string, unknown>;
}

function ensureDateDir(createdAt: string): string {
  const dateDir = path.join(MISSIONS_DIR, createdAt.split('T')[0] || 'unknown');
  if (!fs.existsSync(dateDir)) {
    fs.mkdirSync(dateDir, { recursive: true });
  }
  return dateDir;
}

function eventFilePath(missionId: string, createdAt: string): string {
  return path.join(ensureDateDir(createdAt), `${missionId}.events.jsonl`);
}

export function appendMissionEvent(
  missionId: string,
  createdAt: string,
  event: Omit<MissionEventRecord, 'id' | 'missionId' | 'timestamp'> & { timestamp?: string },
): MissionEventRecord {
  const record: MissionEventRecord = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    missionId,
    timestamp: event.timestamp || new Date().toISOString(),
    type: event.type,
    message: event.message,
    ...(event.status ? { status: event.status } : {}),
    ...(event.phase ? { phase: event.phase } : {}),
    ...(event.meta ? { meta: event.meta } : {}),
  };

  fs.appendFileSync(eventFilePath(missionId, createdAt), `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
}

export function listMissionEvents(missionId: string): MissionEventRecord[] {
  if (!fs.existsSync(MISSIONS_DIR)) return [];

  const dateDirs = fs.readdirSync(MISSIONS_DIR)
    .filter(d => fs.statSync(path.join(MISSIONS_DIR, d)).isDirectory())
    .sort((a, b) => b.localeCompare(a));

  for (const dateDir of dateDirs) {
    const filePath = path.join(MISSIONS_DIR, dateDir, `${missionId}.events.jsonl`);
    if (!fs.existsSync(filePath)) continue;

    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as MissionEventRecord)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  return [];
}
