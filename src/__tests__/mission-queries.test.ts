import { describe, expect, it } from 'vitest';

import type { MissionEvent, MissionSummary } from '../../dashboard/src/api';
import {
  buildMissionRecoveryAuditView,
  missionRecoveryEventFromMissionEvent,
  missionRecoveryAuditTone,
} from '../../dashboard/src/queries/mission-queries';

type RecoveryEvent = NonNullable<MissionSummary['latestRecoveryEvent']>;

function recoveryEvent(overrides: Partial<RecoveryEvent> = {}): RecoveryEvent {
  return {
    id: 'event-1',
    timestamp: '2026-05-13T10:00:00.000Z',
    action: 'queued_new_retry',
    label: '恢复任务已入队',
    reusedExistingRetry: false,
    ...overrides,
  };
}

describe('mission query helpers', () => {
  it('builds a changed audit view for newly queued recovery runs', () => {
    const view = buildMissionRecoveryAuditView(recoveryEvent({
      depth: 'deep',
      costHint: {
        tier: 'high',
        label: '高成本',
        estimate: 'LLM + TA',
        detail: 'deep recovery',
      },
      runId: 'run-1',
    }));

    expect(view).toEqual({
      tone: 'changed',
      label: '恢复任务已入队',
      action: 'queued_new_retry',
      meta: [
        { key: 'depth', label: 'deep 深度' },
        { key: 'cost', label: '高成本 · LLM + TA', tone: 'high' },
        { key: 'run', label: 'run run-1' },
      ],
    });
  });

  it('marks reused recovery retries as warning tone', () => {
    const event = recoveryEvent({
      action: 'reused_existing_retry',
      reusedExistingRetry: true,
    });

    expect(missionRecoveryAuditTone(event)).toBe('warning');
    expect(buildMissionRecoveryAuditView(event)?.tone).toBe('warning');
  });

  it('extracts recovery audit summaries from raw mission events', () => {
    const event: MissionEvent = {
      id: 'event-queue-recovery',
      missionId: 'mission-1',
      timestamp: '2026-05-13T10:05:00.000Z',
      type: 'queued',
      message: 'Retry queued with priority 90',
      status: 'queued',
      meta: {
        operation: 'mission_retry',
        recoveryAction: 'queued_new_retry',
        reusedExistingRetry: false,
        depth: 'quick',
        taskId: 'task-1',
        runId: 'run-2',
      },
    };

    const summary = missionRecoveryEventFromMissionEvent(event);

    expect(summary).toMatchObject({
      id: 'event-queue-recovery',
      action: 'queued_new_retry',
      label: '新建恢复',
      reusedExistingRetry: false,
      depth: 'quick',
      taskId: 'task-1',
      runId: 'run-2',
      costHint: {
        tier: 'low',
        estimate: '约 1-3 分钟',
      },
    });
    expect(buildMissionRecoveryAuditView(summary)?.meta).toEqual([
      { key: 'depth', label: 'quick 深度' },
      { key: 'cost', label: '低成本 · 约 1-3 分钟', tone: 'low' },
      { key: 'task', label: 'task task-1' },
      { key: 'run', label: 'run run-2' },
    ]);
  });
});
