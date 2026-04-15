import { taskQueue } from '../utils/task-queue';
import { createMissionRecord, deleteMission, getMission, updateMissionRecord } from './dispatch-engine';
import { appendMissionEvent } from './mission-events';
import { createMissionRun } from './mission-runs';
import { linkMissionToOpportunity, markOpportunityMissionQueued } from './opportunities';
import type { MissionInput, MissionMode, UnifiedMission } from './types';
import type { AnalysisDepth } from '../models/handoff';

export interface QueueMissionRequest {
  query: string;
  depth: AnalysisDepth;
  source: string;
  priority?: number;
  mode?: MissionMode;
  tickers?: string[];
  date?: string;
  opportunityId?: string;
}

function inferMissionMode(query: string, tickers?: string[]): MissionMode {
  if (tickers && tickers.length > 0) return 'analyze';
  return /^\$?[A-Z]{1,5}$/.test(query.trim()) ? 'analyze' : 'explore';
}

export function buildMissionInput(request: QueueMissionRequest): MissionInput {
  return {
    mode: request.mode || inferMissionMode(request.query, request.tickers),
    query: request.query,
    tickers: request.tickers || [],
    depth: request.depth,
    source: request.source,
    ...(request.date ? { date: request.date } : {}),
    ...(request.opportunityId ? { opportunityId: request.opportunityId } : {}),
  };
}

async function queueMissionRun(
  mission: UnifiedMission,
  request: QueueMissionRequest,
  queuedMessage: string,
): Promise<UnifiedMission | null> {
  const input = buildMissionInput(request);
  const task = await taskQueue.enqueue(
    input.query,
    input.depth || 'deep',
    input.source || 'manual',
    request.priority ?? 0,
    mission.id,
  );

  if (!task) {
    deleteMission(mission.id);
    return null;
  }

  const run = await createMissionRun({
    missionId: mission.id,
    taskId: task.id,
  });
  await taskQueue.attachRunId(task.id, run.id);

  if (input.opportunityId) {
    await linkMissionToOpportunity(input.opportunityId, mission.id, run.id);
  }

  appendMissionEvent(mission.id, mission.createdAt, {
    type: 'queued',
    status: mission.status,
    message: queuedMessage,
    meta: { source: request.source, taskId: task.id, runId: run.id, attempt: run.attempt },
  });

  if (input.opportunityId) {
    await markOpportunityMissionQueued(input.opportunityId, mission.id, run.id);
  }

  return mission;
}

export async function createQueuedMission(request: QueueMissionRequest): Promise<UnifiedMission | null> {
  const input = buildMissionInput(request);
  const mission = createMissionRecord(input, undefined, 'queued');
  appendMissionEvent(mission.id, mission.createdAt, {
    type: 'created',
    status: mission.status,
    message: `Mission created for query "${mission.input.query}"`,
    meta: { source: mission.input.source, mode: mission.input.mode, depth: mission.input.depth },
  });

  const queuedMission = await queueMissionRun(
    mission,
    request,
    `Mission queued with priority ${request.priority ?? 0}`,
  );
  if (!queuedMission) {
    deleteMission(mission.id);
  }
  return queuedMission;
}

export async function retryMissionRun(
  missionId: string,
  overrides: Partial<QueueMissionRequest> = {},
): Promise<UnifiedMission | null> {
  const existingMission = getMission(missionId);
  if (!existingMission) return null;

  const input = buildMissionInput({
    query: overrides.query || existingMission.input.query,
    depth: overrides.depth || existingMission.input.depth || 'deep',
    source: overrides.source || 'manual_retry',
    priority: overrides.priority ?? 90,
    mode: overrides.mode || existingMission.input.mode,
    tickers: overrides.tickers || existingMission.input.tickers || [],
    opportunityId: overrides.opportunityId || existingMission.input.opportunityId,
    ...((overrides.date || existingMission.input.date) ? { date: overrides.date || existingMission.input.date } : {}),
  });

  const queuedMission = updateMissionRecord(missionId, (currentMission) => ({
    ...currentMission,
    input,
    status: 'queued',
    updatedAt: new Date().toISOString(),
  }));
  if (!queuedMission) return null;

  const retriedMission = await queueMissionRun(
    queuedMission,
    {
      query: input.query,
      depth: input.depth || 'deep',
      source: input.source || 'manual_retry',
      priority: overrides.priority ?? 90,
      mode: input.mode,
      ...(input.tickers && input.tickers.length > 0 ? { tickers: input.tickers } : {}),
      ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
      ...(input.date ? { date: input.date } : {}),
    },
    `Retry queued with priority ${overrides.priority ?? 90}`,
  );

  if (!retriedMission) {
    updateMissionRecord(missionId, () => existingMission);
    return null;
  }

  return retriedMission;
}

export function findMissionForTask(task: { missionId?: string }): UnifiedMission | null {
  if (!task.missionId) return null;
  return getMission(task.missionId);
}
