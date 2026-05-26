import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../utils/telegram', () => ({
  sendStopLossAlert: vi.fn(),
  sendAlertBatch: vi.fn(),
  sendEntrySignal: vi.fn(),
  sendReportSummary: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('../tools/market-data', () => ({
  scanTicker: vi.fn(),
  generateTechSnapshot: vi.fn(),
}));
vi.mock('../utils/task-queue', () => ({
  taskQueue: { enqueue: vi.fn(), recover: vi.fn().mockResolvedValue(0), onProcess: vi.fn(), processNext: vi.fn() },
}));
vi.mock('../tools/rss-monitor', () => ({ pollAllFeeds: vi.fn(), alertsToContext: vi.fn() }));
vi.mock('../tools/edgar-monitor', () => ({ watchIPO: vi.fn(), filingsToContext: vi.fn() }));
vi.mock('../agents/trend/trend-radar', () => ({ TrendRadar: vi.fn().mockImplementation(() => ({ scan: vi.fn(), formatForTelegram: vi.fn() })) }));
vi.mock('../tools/sector-scanner', () => ({ scanAllSectorETFs: vi.fn(), generateSectorOverview: vi.fn() }));
vi.mock('../utils/dynamic-watchlist', () => ({ getActiveTickers: vi.fn().mockReturnValue([]), promoteTicker: vi.fn(), generateDynamicWatchlistOverview: vi.fn().mockReturnValue('') }));
vi.mock('../agents/telegram/interactive-bot', () => ({ startInteractiveBot: vi.fn() }));
vi.mock('../agents/macro/macro-context', () => ({ MacroContextEngine: vi.fn().mockImplementation(() => ({ analyze: vi.fn(), formatForReport: vi.fn().mockReturnValue('') })) }));
vi.mock('../utils/performance-tracker', () => ({ updatePerformance: vi.fn(), formatPerformanceReport: vi.fn().mockReturnValue('') }));
vi.mock('../agents/lifecycle/engine', () => ({ NarrativeLifecycleEngine: vi.fn().mockImplementation(() => ({ evaluateAllActiveNarratives: vi.fn().mockResolvedValue({ messages: [] }) })) }));
vi.mock('../utils/health-monitor', () => ({ healthMonitor: { checkConnectivity: vi.fn(), recordSuccess: vi.fn(), recordFailure: vi.fn() } }));
vi.mock('../server/app', () => ({ startServer: vi.fn() }));
vi.mock('../workflows', () => ({ dispatchMission: vi.fn() }));
vi.mock('../utils/event-bus', () => ({ eventBus: { emitSystem: vi.fn() } }));
vi.mock('../workflows/swarm-pipeline', () => ({ AgentSwarmOrchestrator: vi.fn().mockImplementation(() => ({ executeMission: vi.fn() })) }));
vi.mock('../db', () => ({ getDb: vi.fn().mockResolvedValue({ get: vi.fn(), run: vi.fn(), all: vi.fn().mockResolvedValue([]) }) }));

import { shouldAlert, cleanupCooldown, alertCooldown } from '../worker';

describe('T1 cooldown deduplication', () => {
  beforeEach(() => {
    alertCooldown.clear();
  });

  it('first alert passes', () => {
    expect(shouldAlert('AAOI')).toBe(true);
  });

  it('cooldown blocks repeat', () => {
    shouldAlert('AAOI');
    expect(shouldAlert('AAOI')).toBe(false);
  });

  it('different ticker not blocked', () => {
    shouldAlert('AAOI');
    expect(shouldAlert('NVDA')).toBe(true);
  });

  it('expires after cooldown period', () => {
    const oldTimestamp = Date.now() - 31 * 60 * 1000; // 31 minutes ago — past default 30min cooldown
    alertCooldown.set('AAOI', oldTimestamp);
    expect(shouldAlert('AAOI')).toBe(true);
  });

  it('cleanup removes entries older than 2 hours', () => {
    const veryOldTimestamp = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
    alertCooldown.set('AAOI', veryOldTimestamp);
    alertCooldown.set('NVDA', Date.now()); // fresh entry — should survive

    cleanupCooldown();

    expect(alertCooldown.has('AAOI')).toBe(false);
    expect(alertCooldown.has('NVDA')).toBe(true);
  });
});
