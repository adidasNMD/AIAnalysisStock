import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueTask } from '../utils/task-queue';
import type { MissionRunRecord, UnifiedMission } from '../workflows/types';

const mocks = vi.hoisted(() => ({
  getLatestMissionRun: vi.fn(),
  processNext: vi.fn(),
  recoverStaleRunning: vi.fn(),
  requeueMissionRunsForTasks: vi.fn(),
  requeueTask: vi.fn(),
  retryMissionRun: vi.fn(),
  getTask: vi.fn(),
}));

vi.mock('../utils/task-queue', () => ({
  taskQueue: {
    getTask: mocks.getTask,
    processNext: mocks.processNext,
    recoverStaleRunning: mocks.recoverStaleRunning,
    requeueTask: mocks.requeueTask,
  },
}));

vi.mock('../workflows', () => ({
  getLatestMissionRun: mocks.getLatestMissionRun,
  retryMissionRun: mocks.retryMissionRun,
  requeueMissionRunsForTasks: mocks.requeueMissionRunsForTasks,
}));

function makeTask(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: 'task-recovery-1',
    query: 'Recover AI infra task',
    depth: 'deep',
    priority: 80,
    source: 'opportunity_action',
    status: 'failed',
    createdAt: 1770000000000,
    ...overrides,
  };
}

function makeMission(overrides: Partial<UnifiedMission> = {}): UnifiedMission {
  const base: UnifiedMission = {
    id: 'mission-recovery-1',
    traceId: 'trace-recovery-1',
    input: {
      mode: 'review',
      query: 'Recover AI infra task',
      tickers: ['NVDA'],
      depth: 'deep',
      source: 'queue_recovery',
      opportunityId: 'opp-1',
    },
    status: 'queued',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:05:00.000Z',
    openclawReport: '',
    openclawTickers: [],
    openclawDurationMs: 0,
    taResults: [],
    taDurationMs: 0,
    openbbData: [],
    macroData: null,
    consensus: [],
    totalDurationMs: 0,
  };

  return {
    ...base,
    ...overrides,
    input: {
      ...base.input,
      ...overrides.input,
    },
  };
}

function makeRun(overrides: Partial<MissionRunRecord> = {}): MissionRunRecord {
  return {
    id: 'run-recovery-1',
    missionId: 'mission-recovery-1',
    taskId: 'task-recovery-retry',
    status: 'queued',
    stage: 'queued',
    attempt: 2,
    createdAt: '2026-04-28T00:05:00.000Z',
    ...overrides,
  };
}

describe('queue recovery service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLatestMissionRun.mockResolvedValue(makeRun());
    mocks.getTask.mockResolvedValue(null);
    mocks.processNext.mockResolvedValue(undefined);
    mocks.recoverStaleRunning.mockResolvedValue({
      totalRecovered: 0,
      recoveredRunningTaskIds: [],
      skippedActiveTaskIds: [],
      staleThresholdMs: 120000,
    });
    mocks.requeueMissionRunsForTasks.mockResolvedValue(0);
    mocks.requeueTask.mockResolvedValue(null);
    mocks.retryMissionRun.mockResolvedValue(null);
  });

  it('recovers stale queue tasks and requeues matching running mission runs', async () => {
    const { recoverStaleQueueTasksForApi } = await import('../server/services/queue-recovery-service');
    mocks.recoverStaleRunning.mockResolvedValue({
      totalRecovered: 2,
      recoveredRunningTaskIds: ['task-1', 'task-2'],
      skippedActiveTaskIds: ['task-active'],
      staleThresholdMs: 90000,
    });
    mocks.requeueMissionRunsForTasks.mockResolvedValue(1);

    const result = await recoverStaleQueueTasksForApi({ staleThresholdMs: '90000' });

    expect(mocks.recoverStaleRunning).toHaveBeenCalledWith(90000);
    expect(mocks.requeueMissionRunsForTasks).toHaveBeenCalledWith(['task-1', 'task-2']);
    expect(mocks.processNext).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      message: 'Stale tasks recovered',
      totalRecovered: 2,
      recoveredRunningTaskIds: ['task-1', 'task-2'],
      skippedActiveTaskIds: ['task-active'],
      staleThresholdMs: 90000,
      requeuedRuns: 1,
    });
  });

  it('uses the queue default stale threshold and does not process when nothing recovered', async () => {
    const { recoverStaleQueueTasksForApi } = await import('../server/services/queue-recovery-service');

    const result = await recoverStaleQueueTasksForApi({ staleThresholdMs: 'not-a-number' });

    expect(mocks.recoverStaleRunning).toHaveBeenCalledWith(undefined);
    expect(mocks.requeueMissionRunsForTasks).toHaveBeenCalledWith([]);
    expect(mocks.processNext).not.toHaveBeenCalled();
    expect(result.message).toBe('No stale tasks to recover');
  });

  it('queues a new mission run when a failed mission task is recovered', async () => {
    const { recoverQueueTaskForApi } = await import('../server/services/queue-recovery-service');
    const task = makeTask({ missionId: 'mission-recovery-1', priority: 70, depth: 'quick' });
    const mission = makeMission();
    const run = makeRun({ id: 'run-recovery-2', taskId: 'task-recovery-2' });
    mocks.getTask.mockResolvedValue(task);
    mocks.retryMissionRun.mockResolvedValue(mission);
    mocks.getLatestMissionRun.mockResolvedValue(run);

    const result = await recoverQueueTaskForApi('task-recovery-1');

    expect(mocks.retryMissionRun).toHaveBeenCalledWith('mission-recovery-1', {
      source: 'queue_recovery',
      priority: 70,
      depth: 'quick',
    });
    expect(mocks.requeueTask).not.toHaveBeenCalled();
    expect(mocks.processNext).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'queued',
      response: {
        success: true,
        message: 'Mission recovery queued',
        missionId: 'mission-recovery-1',
        runId: 'run-recovery-2',
        taskId: 'task-recovery-2',
      },
    });
  });

  it('requeues failed standalone tasks without creating a mission run', async () => {
    const { recoverQueueTaskForApi } = await import('../server/services/queue-recovery-service');
    const task = makeTask({ missionId: undefined });
    mocks.getTask.mockResolvedValue(task);
    mocks.requeueTask.mockResolvedValue(makeTask({ status: 'pending' }));

    const result = await recoverQueueTaskForApi('task-recovery-1');

    expect(mocks.retryMissionRun).not.toHaveBeenCalled();
    expect(mocks.requeueTask).toHaveBeenCalledWith('task-recovery-1');
    expect(mocks.processNext).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'queued',
      response: {
        success: true,
        message: 'Task recovered',
        taskId: 'task-recovery-1',
      },
    });
  });

  it('returns not_found when the task does not exist', async () => {
    const { recoverQueueTaskForApi } = await import('../server/services/queue-recovery-service');

    await expect(recoverQueueTaskForApi('missing-task')).resolves.toEqual({ status: 'not_found' });
    expect(mocks.retryMissionRun).not.toHaveBeenCalled();
    expect(mocks.requeueTask).not.toHaveBeenCalled();
  });

  it('rejects active or completed tasks as recovery conflicts', async () => {
    const { recoverQueueTaskForApi } = await import('../server/services/queue-recovery-service');
    mocks.getTask.mockResolvedValueOnce(makeTask({ status: 'running' }));
    await expect(recoverQueueTaskForApi('task-running')).resolves.toEqual({
      status: 'conflict',
      error: 'Task is already running',
    });

    mocks.getTask.mockResolvedValueOnce(makeTask({ status: 'done' }));
    await expect(recoverQueueTaskForApi('task-done')).resolves.toEqual({
      status: 'conflict',
      error: 'Completed task does not need recovery',
    });
  });
});
