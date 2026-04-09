import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../workflows/swarm-pipeline', () => ({
  AgentSwarmOrchestrator: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../tools/market-data', () => ({
  scanTicker: vi.fn(),
  generateTechSnapshot: vi.fn(),
  checkSMACross: vi.fn(),
}));
vi.mock('../utils/telegram', () => ({
  sendAlertBatch: vi.fn(),
  sendStopLossAlert: vi.fn(),
  sendReportSummary: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('../tools/rss-monitor', () => ({ pollAllFeeds: vi.fn().mockResolvedValue([]) }));
vi.mock('../tools/edgar-monitor', () => ({ watchIPO: vi.fn().mockResolvedValue([]) }));
vi.mock('../agents/trend/trend-radar', () => ({
  TrendRadar: vi.fn().mockImplementation(() => ({ scan: vi.fn() })),
}));
vi.mock('../tools/sector-scanner', () => ({
  scanAllSectorETFs: vi.fn(),
  generateSectorOverview: vi.fn(),
}));
vi.mock('../utils/dynamic-watchlist', () => ({
  getActiveTickers: vi.fn().mockReturnValue([]),
  generateDynamicWatchlistOverview: vi.fn().mockReturnValue(''),
}));
vi.mock('../agents/telegram/interactive-bot', () => ({
  startInteractiveBot: vi.fn(),
}));
vi.mock('../agents/macro/macro-context', () => ({
  MacroContextEngine: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../utils/performance-tracker', () => ({
  updatePerformance: vi.fn(),
  formatPerformanceReport: vi.fn(),
}));
vi.mock('../agents/lifecycle/engine', () => ({
  NarrativeLifecycleEngine: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../utils/health-monitor', () => ({
  healthMonitor: {
    checkConnectivity: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    shouldSkipAnalysis: vi.fn().mockReturnValue(false),
    getStatusSummary: vi.fn().mockReturnValue({}),
  },
}));
vi.mock('../utils/task-queue', () => ({
  taskQueue: {
    recover: vi.fn().mockResolvedValue(0),
    onProcess: vi.fn(),
    processNext: vi.fn(),
    getRunningCount: vi.fn().mockReturnValue(0),
    enqueue: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    getStatusSummary: vi.fn().mockResolvedValue({}),
    cancelTask: vi.fn(),
    updateTaskState: vi.fn(),
    updateProgress: vi.fn(),
  },
  TaskQueue: vi.fn(),
}));
vi.mock('../server/app', () => ({
  startServer: vi.fn(),
}));
vi.mock('../workflows', () => ({
  dispatchMission: vi.fn(),
}));
vi.mock('../utils/event-bus', () => ({
  eventBus: { on: vi.fn(), emit: vi.fn(), emitSystem: vi.fn(), emitLog: vi.fn(), removeListener: vi.fn() },
}));
vi.mock('../db', () => ({
  getDb: vi.fn().mockResolvedValue({ close: vi.fn() }),
}));
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

describe('worker shouldAlert and cooldown', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('shouldAlert returns true for fresh ticker', async () => {
    const { shouldAlert, alertCooldown } = await import('../worker.js');
    alertCooldown.clear();
    expect(shouldAlert('AAOI')).toBe(true);
  });

  it('shouldAlert returns false for recently alerted ticker', async () => {
    const { shouldAlert, alertCooldown } = await import('../worker.js');
    alertCooldown.clear();
    shouldAlert('AAOI');
    expect(shouldAlert('AAOI')).toBe(false);
  });

  it('cleanupCooldown removes expired entries', async () => {
    const { cleanupCooldown, alertCooldown } = await import('../worker.js');
    alertCooldown.clear();
    alertCooldown.set('OLD', Date.now() - 3 * 60 * 60 * 1000);
    alertCooldown.set('RECENT', Date.now());

    cleanupCooldown();

    expect(alertCooldown.has('OLD')).toBe(false);
    expect(alertCooldown.has('RECENT')).toBe(true);
  });
});
