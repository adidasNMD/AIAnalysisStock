import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  attachRunId: vi.fn(),
  createMissionRecord: vi.fn(),
  deleteMission: vi.fn(),
  updateMissionRecord: vi.fn(),
  getMission: vi.fn(),
  appendMissionEvent: vi.fn(),
  createMissionRun: vi.fn(),
  linkMissionToOpportunity: vi.fn(),
  markOpportunityMissionQueued: vi.fn(),
}));

vi.mock('../utils/task-queue', () => ({
  taskQueue: {
    enqueue: mocks.enqueue,
    attachRunId: mocks.attachRunId,
  },
}));

vi.mock('../workflows/dispatch-engine', () => ({
  createMissionRecord: mocks.createMissionRecord,
  deleteMission: mocks.deleteMission,
  updateMissionRecord: mocks.updateMissionRecord,
  getMission: mocks.getMission,
}));

vi.mock('../workflows/mission-events', () => ({
  appendMissionEvent: mocks.appendMissionEvent,
}));

vi.mock('../workflows/mission-runs', () => ({
  createMissionRun: mocks.createMissionRun,
}));

vi.mock('../workflows/opportunities', () => ({
  linkMissionToOpportunity: mocks.linkMissionToOpportunity,
  markOpportunityMissionQueued: mocks.markOpportunityMissionQueued,
}));

describe('mission submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueue.mockResolvedValue({
      id: 'task-1',
      query: 'AI infrastructure review',
      depth: 'deep',
      source: 'opportunity_action',
      status: 'pending',
      priority: 100,
      createdAt: 1,
    });
    mocks.attachRunId.mockResolvedValue(undefined);
    mocks.createMissionRun.mockResolvedValue({ id: 'run-1', attempt: 1 });
    mocks.createMissionRecord.mockImplementation((input, _traceId, status = 'queued') => ({
      id: 'mission-1',
      input,
      status,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
    }));
  });

  it('passes the complete mission input into the queued task payload', async () => {
    const { createQueuedMission } = await import('../workflows/mission-submission');

    const mission = await createQueuedMission({
      mode: 'review',
      query: 'AI infrastructure review',
      tickers: ['NVDA', 'TSM'],
      depth: 'deep',
      source: 'opportunity_action',
      priority: 100,
      opportunityId: 'opp-1',
      date: '2026-04-26',
    });

    expect(mission?.id).toBe('mission-1');
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'AI infrastructure review',
      'deep',
      'opportunity_action',
      100,
      expect.objectContaining({
        missionId: 'mission-1',
        inputPayload: expect.any(String),
      }),
    );

    const options = mocks.enqueue.mock.calls[0][4] as { inputPayload: string };
    expect(JSON.parse(options.inputPayload)).toEqual({
      mode: 'review',
      query: 'AI infrastructure review',
      tickers: ['NVDA', 'TSM'],
      depth: 'deep',
      source: 'opportunity_action',
      opportunityId: 'opp-1',
      date: '2026-04-26',
    });
  });
});
