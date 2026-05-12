#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (error) {
  console.error('Missing playwright-core. Run npm install from the repository root before viewport QA.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const now = '2026-05-06T09:30:00.000Z';
const defaultViewports = [
  { width: 720, height: 900 },
  { width: 960, height: 900 },
  { width: 1440, height: 1000 },
];
const defaultRoutes = [
  { name: 'workbench', path: '/' },
  { name: 'workbench-empty', path: '/', scenario: 'workbench-empty' },
  { name: 'workbench-drawer', path: '/', action: 'open-workbench-drawer' },
  { name: 'workbench-recovery-action', path: '/', scenario: 'workbench-recovery', action: 'assert-workbench-recovery-action' },
  { name: 'workbench-recovery-failure', path: '/', scenario: 'workbench-recovery-failure', action: 'assert-workbench-recovery-failure' },
  { name: 'workbench-stress', path: '/', scenario: 'workbench-stress', action: 'scroll-workbench-stress' },
  { name: 'command-center', path: '/command-center' },
  { name: 'command-center-diagnostics', path: '/command-center', scenario: 'command-diagnostics', action: 'assert-command-diagnostics' },
  { name: 'mission-timeline', path: '/missions' },
  { name: 'mission-timeline-empty', path: '/missions', scenario: 'mission-empty' },
  { name: 'mission-timeline-recovery', path: '/missions', scenario: 'mission-failure', action: 'assert-mission-timeline-recovery' },
  { name: 'trend-radar', path: '/radar' },
  { name: 'trend-radar-empty', path: '/radar', scenario: 'trend-empty' },
  { name: 'trend-radar-stress', path: '/radar', scenario: 'trend-stress' },
  { name: 'trend-radar-raw', path: '/radar-raw' },
  { name: 'trend-radar-raw-empty', path: '/radar-raw', scenario: 'trend-raw-empty' },
  { name: 'trend-radar-raw-stress', path: '/radar-raw', scenario: 'trend-raw-stress', action: 'assert-trend-raw-stress' },
  { name: 'evidence-center', path: '/evidence' },
  { name: 'catalyst-reminders', path: '/catalysts', action: 'assert-catalyst-reminders' },
  { name: 'pretrade-audit', path: '/pretrade', action: 'assert-pretrade-audit' },
  { name: 'review-playback', path: '/review-playback', action: 'assert-review-playback' },
  { name: 'field-registry', path: '/field-registry', action: 'assert-field-registry' },
  {
    name: 'field-registry-draft',
    path: `/field-registry?importDraft=${encodeURIComponent(JSON.stringify({
      items: [{
        field: 'custom.unfieldedEvidence',
        label: 'Unfielded evidence',
        kind: 'source',
        source: 'manual_event_repair',
        confidence: 'unknown',
        note: 'Viewport QA import draft.',
      }],
    }))}`,
    action: 'assert-field-registry-draft',
  },
  { name: 'mission-viewer', path: '/missions/mission-demo' },
  { name: 'mission-viewer-running', path: '/missions/mission-demo', scenario: 'mission-running', action: 'assert-mission-viewer-running' },
  { name: 'mission-viewer-recovery', path: '/missions/mission-demo', scenario: 'mission-failure', action: 'assert-mission-viewer-recovery' },
  { name: 'watchlist', path: '/watchlist' },
  { name: 'watchlist-empty', path: '/watchlist', scenario: 'watchlist-empty' },
  { name: 'watchlist-stress', path: '/watchlist', scenario: 'watchlist-stress', action: 'assert-watchlist-stress' },
  { name: 'settings', path: '/settings' },
  { name: 'settings-error', path: '/settings', scenario: 'settings-error' },
];

const bytesPerMb = 1024 * 1024;
const defaultThresholds = {
  workbenchStressNodes: 10000,
  workbenchStressTotalMs: 5000,
  workbenchStressScreenshotBytes: 6 * bytesPerMb,
  workbenchStressRenderedOpportunityCards: 48,
  bodyHeight: 60000,
  trendTotalMsPercent: 30,
  trendTotalMsDelta: 1000,
  trendTotalMsCurrentMin: 5000,
  trendNodeCountPercent: 15,
  trendNodeCountDelta: 500,
  trendScreenshotBytesPercent: 30,
  trendScreenshotBytesDelta: Math.round(0.5 * bytesPerMb),
  trendBodyHeightPercent: 25,
  trendBodyHeightDelta: 2000,
};
const defaultStressOpportunityCount = 120;
const defaultStressExpandRounds = 0;
const navigationTimeoutMs = 60000;
const navigationMaxAttempts = 2;
const navigationRetryDelayMs = 750;
const screenshotTimeoutMs = 15000;
const screenshotMaxAttempts = 2;
const screenshotRetryDelayMs = 500;

function buildRoutes(options) {
  const routes = [...defaultRoutes];
  if (options.stressExpandRounds > 0) {
    routes.splice(4, 0, {
      name: 'workbench-stress-expand',
      path: '/',
      scenario: 'workbench-stress',
      action: 'expand-workbench-stress',
    });
  }
  return routes;
}

function parseArgs(argv) {
  const options = {
    baseUrl: '',
    chromePath: process.env.CHROME_PATH || '',
    host: '127.0.0.1',
    port: '5173',
    outDir: 'out/viewport-qa',
    liveApi: false,
    startServer: true,
    warmup: true,
    failOnWarning: false,
    trend: true,
    stressOpportunityCount: defaultStressOpportunityCount,
    stressExpandRounds: defaultStressExpandRounds,
    thresholds: { ...defaultThresholds },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--base-url' && next) {
      options.baseUrl = next.replace(/\/$/, '');
      options.startServer = false;
      index += 1;
    } else if (arg === '--chrome-path' && next) {
      options.chromePath = next;
      index += 1;
    } else if (arg === '--host' && next) {
      options.host = next;
      index += 1;
    } else if (arg === '--port' && next) {
      options.port = next;
      index += 1;
    } else if (arg === '--out-dir' && next) {
      options.outDir = next;
      index += 1;
    } else if (arg === '--live-api') {
      options.liveApi = true;
    } else if (arg === '--no-start') {
      options.startServer = false;
    } else if (arg === '--no-warmup') {
      options.warmup = false;
    } else if (arg === '--fail-on-warning') {
      options.failOnWarning = true;
    } else if (arg === '--no-trend') {
      options.trend = false;
    } else if (arg === '--stress-opportunities' && next) {
      options.stressOpportunityCount = parsePositiveInteger(arg, next);
      index += 1;
    } else if (arg === '--stress-expand-rounds' && next) {
      options.stressExpandRounds = parseNonNegativeInteger(arg, next);
      index += 1;
    } else if (arg === '--threshold-workbench-stress-nodes' && next) {
      options.thresholds.workbenchStressNodes = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-workbench-stress-total-ms' && next) {
      options.thresholds.workbenchStressTotalMs = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-workbench-stress-screenshot-mb' && next) {
      options.thresholds.workbenchStressScreenshotBytes = Math.round(parseNonNegativeNumber(arg, next) * bytesPerMb);
      index += 1;
    } else if (arg === '--threshold-workbench-stress-rendered-cards' && next) {
      options.thresholds.workbenchStressRenderedOpportunityCards = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-body-height' && next) {
      options.thresholds.bodyHeight = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-ms-percent' && next) {
      options.thresholds.trendTotalMsPercent = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-ms-delta' && next) {
      options.thresholds.trendTotalMsDelta = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-ms-current-min' && next) {
      options.thresholds.trendTotalMsCurrentMin = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-node-count-percent' && next) {
      options.thresholds.trendNodeCountPercent = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-node-count-delta' && next) {
      options.thresholds.trendNodeCountDelta = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-screenshot-percent' && next) {
      options.thresholds.trendScreenshotBytesPercent = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-screenshot-mb' && next) {
      options.thresholds.trendScreenshotBytesDelta = Math.round(parseNonNegativeNumber(arg, next) * bytesPerMb);
      index += 1;
    } else if (arg === '--threshold-trend-body-height-percent' && next) {
      options.thresholds.trendBodyHeightPercent = parseNonNegativeNumber(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-body-height-delta' && next) {
      options.thresholds.trendBodyHeightDelta = parseNonNegativeNumber(arg, next);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!options.baseUrl && !options.startServer) {
    options.baseUrl = `http://${options.host}:${options.port}`;
  }

  return options;
}

function parseNonNegativeNumber(flag, value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative number. Received: ${value}`);
  }
  return parsed;
}

function parsePositiveInteger(flag, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function parseNonNegativeInteger(flag, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer. Received: ${value}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Dashboard viewport QA

Usage:
  npm run dashboard:viewport-check
  npm run dashboard:viewport-check -- --base-url http://127.0.0.1:5174

Options:
  --base-url <url>      Use an already running dashboard server.
  --no-start            Do not start Vite; use --host/--port as the target.
  --host <host>         Host for auto-started Vite. Default: 127.0.0.1
  --port <port>         Preferred Vite port. Default: 5173
  --chrome-path <path>  Browser executable path. Defaults to CHROME_PATH or common Chrome paths.
  --out-dir <path>      Screenshot/report directory. Default: out/viewport-qa
  --live-api            Do not mock /api responses.
  --no-warmup           Skip route warm-up before measured checks.
  --no-trend            Skip comparison against the previous viewport snapshot.
  --fail-on-warning     Exit with code 1 when soft performance warnings are present.
  --stress-opportunities <n>
                        Opportunity count for the Workbench stress scenario. Default: 120
  --stress-expand-rounds <n>
                        Add a Workbench stress route that clicks visible "show more" buttons for n rounds. Default: 0

Soft threshold overrides:
  --threshold-workbench-stress-nodes <n>           Default: 10000
  --threshold-workbench-stress-total-ms <n>        Default: 5000
  --threshold-workbench-stress-screenshot-mb <n>   Default: 6
  --threshold-workbench-stress-rendered-cards <n>  Default: 48
  --threshold-body-height <n>                      Default: 60000

Trend regression threshold overrides:
  --threshold-trend-total-ms-percent <n>      Default: 30
  --threshold-trend-total-ms-delta <n>        Default: 1000
  --threshold-trend-total-ms-current-min <n>  Default: 5000
  --threshold-trend-node-count-percent <n>    Default: 15
  --threshold-trend-node-count-delta <n>      Default: 500
  --threshold-trend-screenshot-percent <n>    Default: 30
  --threshold-trend-screenshot-mb <n>         Default: 0.5
  --threshold-trend-body-height-percent <n>   Default: 25
  --threshold-trend-body-height-delta <n>     Default: 2000
`);
}

function findChromeExecutable(explicitPath) {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome/Chromium executable not found. Set CHROME_PATH or pass --chrome-path.');
  }
  return found;
}

function startDashboardServer({ host, port }) {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(
    npmBin,
    ['--prefix', 'dashboard', 'run', 'dev', '--', '--host', host, '--port', port],
    {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let resolved = false;
  let output = '';
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    rejectReady = reject;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error(`Timed out waiting for Vite dev server.\n${output}`));
      }
    }, 20000);

    const handleChunk = (chunk) => {
      output += chunk.toString();
      const localUrlMatch = output.match(/Local:\s+(http:\/\/[^\s]+)/);
      if (!resolved && localUrlMatch) {
        resolved = true;
        clearTimeout(timeout);
        resolve(localUrlMatch[1].replace(/\/$/, ''));
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);
  });

  child.on('exit', (code) => {
    if (!resolved && rejectReady) {
      rejectReady(new Error(`Vite dev server exited before ready with code ${code}.\n${output}`));
    }
  });

  return {
    child,
    ready,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null || child.killed) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve();
      }, 2500);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGINT');
    }),
  };
}

async function closeWithTimeout(label, closeFn, timeoutMs = 3000, onTimeout) {
  let timer;
  let timedOut = false;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      if (onTimeout) onTimeout();
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([
      Promise.resolve().then(closeFn),
      timeout,
    ]);
  } catch (error) {
    console.warn(`${label} close failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  if (timedOut) {
    console.warn(`${label} close timed out after ${timeoutMs}ms; continuing to write QA report.`);
  }
}

const pageInfo = (limit = 60) => ({ limit, nextCursor: null, hasMore: false });

const mockMission = {
  id: 'mission-demo',
  mode: 'analyze',
  query: 'Review NVDA AI infrastructure relay chain with an unusually long title to test responsive wrapping',
  source: 'viewport-qa',
  status: 'fully_enriched',
  createdAt: now,
  updatedAt: now,
  openclawTickers: ['NVDA', 'VRT', 'ETN', 'SMCI', 'ANET'],
  taCount: 2,
  consensus: [
    { ticker: 'NVDA', openclawVerdict: 'BUY', taVerdict: 'BUY', agreement: 'agree', openbbVerdict: 'PASS' },
    { ticker: 'VRT', openclawVerdict: 'HOLD', taVerdict: 'BUY', agreement: 'partial', openbbVerdict: 'WARN' },
  ],
  totalDurationMs: 126000,
  latestRun: {
    id: 'run-demo-2',
    missionId: 'mission-demo',
    taskId: 'task-demo',
    status: 'completed',
    stage: 'completed',
    attempt: 2,
    createdAt: now,
    startedAt: now,
    completedAt: now,
  },
  latestDiff: {
    currentRunId: 'run-demo-2',
    baselineRunId: 'run-demo-1',
    currentAttempt: 2,
    baselineAttempt: 1,
    changed: true,
    changeCount: 3,
    changedCategories: ['coverage', 'consensus'],
    highlights: ['VRT moved from watch to partial confirmation'],
    summary: 'Coverage expanded and one relay ticker changed stance.',
  },
};

const mockMissionFull = {
  id: mockMission.id,
  input: {
    mode: 'analyze',
    query: mockMission.query,
    tickers: mockMission.openclawTickers,
    depth: 'standard',
    source: 'viewport-qa',
    opportunityId: 'opp-relay-ai-power',
  },
  status: 'fully_enriched',
  createdAt: now,
  updatedAt: now,
  openclawReport: [
    '# AI relay chain review',
    '',
    'NVDA remains the leader signal. Power infrastructure and cooling names are the bottleneck layer. Watch whether breadth keeps expanding without crowding.',
  ].join('\n'),
  openclawTickers: mockMission.openclawTickers,
  openclawDurationMs: 52000,
  taResults: [
    {
      ticker: 'NVDA',
      date: '2026-05-06',
      status: 'completed',
      analystReports: { market: 'Strong trend', sentiment: 'Constructive', news: 'Capex cycle intact', fundamentals: 'High margin growth' },
      investmentDebate: { bullArguments: ['Demand visibility'], bearArguments: ['Valuation risk'], judgeDecision: 'BUY', rounds: 2 },
      traderPlan: 'Wait for pullback or breadth confirmation.',
      riskDebate: { aggressiveView: 'Add on strength', conservativeView: 'Scale slowly', neutralView: 'Monitor breadth', rounds: 2 },
      portfolioManagerDecision: { action: 'BUY', allocation: 'starter', stopLoss: '20-day low', confidence: 78, reasoning: 'Leader still validates the chain.' },
      duration: 38,
    },
  ],
  taDurationMs: 41000,
  openbbData: [
    {
      ticker: 'NVDA',
      core: { priceVsSma20: 'above', marketCap: 4200000000000 },
      auxiliary: { peRatio: 47, revenueGrowthYoY: 58 },
      background: { rsi14: 64 },
      verdict: 'PASS',
      verdictReason: 'Momentum and fundamentals remain aligned.',
    },
  ],
  macroData: {},
  consensus: mockMission.consensus,
  totalDurationMs: mockMission.totalDurationMs,
};

const mockRuns = [
  mockMission.latestRun,
  {
    id: 'run-demo-1',
    missionId: 'mission-demo',
    taskId: 'task-demo-prev',
    status: 'completed',
    stage: 'completed',
    attempt: 1,
    createdAt: '2026-05-05T09:30:00.000Z',
    startedAt: '2026-05-05T09:30:00.000Z',
    completedAt: '2026-05-05T09:31:50.000Z',
  },
];

const mockTrace = {
  traceId: 'trace-demo',
  missionId: 'mission-demo',
  runId: 'run-demo-2',
  query: mockMission.query,
  startedAt: now,
  completedAt: now,
  steps: [
    { agentName: 'DataScout', timestamp: now, phase: 'scout', input: {}, output: 'Found leader and bottleneck tickers.', durationMs: 1200 },
    { agentName: 'Strategist', timestamp: now, phase: 'strategist', input: {}, output: 'Relay remains valid while breadth is improving.', durationMs: 1800 },
  ],
};

const failedMission = {
  ...mockMission,
  status: 'failed',
  query: 'Recover failed TradingAgents run with very long trace evidence title covering OpenBB stale cache, TA timeout, and recovery suggestions for narrow viewport QA',
  totalDurationMs: 94000,
  latestRun: {
    id: 'run-failed-2',
    missionId: 'mission-demo',
    taskId: 'task-failed-demo',
    status: 'failed',
    stage: 'analyst',
    attempt: 2,
    createdAt: now,
    startedAt: now,
    completedAt: now,
    failureCode: 'TA_TIMEOUT',
    failureMessage: 'TradingAgents analyst stage timed out after waiting for a vendor response with stale OpenBB context.',
    degradedFlags: ['openbb_stale', 'ta_timeout', 'partial_evidence'],
  },
  latestDiff: {
    currentRunId: 'run-failed-2',
    baselineRunId: 'run-failed-1',
    currentAttempt: 2,
    baselineAttempt: 1,
    changed: true,
    changeCount: 5,
    changedCategories: ['execution', 'coverage', 'trace'],
    highlights: ['Analyst stage failed after scout completed', 'Evidence snapshot missing for baseline run'],
    summary: 'Run failed after partial evidence capture; recovery should favor quick retry or service diagnostics.',
  },
  latestRecoveryEvent: {
    id: 'evt-recovery-audit-1',
    timestamp: now,
    action: 'reused_active_retry',
    label: '复用恢复',
    reusedExistingRetry: true,
    message: 'Reused an active retry mission instead of queueing a duplicate recovery run.',
    depth: 'quick',
    costHint: {
      tier: 'low',
      label: '低成本',
      estimate: '约 1-3 分钟',
      detail: 'Quick retry keeps the recovery lightweight while checking service health.',
    },
    taskId: 'task-retry-existing',
    runId: 'run-retry-existing',
  },
};

const failedMissionFull = {
  ...mockMissionFull,
  status: 'failed',
  input: {
    ...mockMissionFull.input,
    query: failedMission.query,
    depth: 'deep',
    source: 'viewport-qa-failure',
  },
  openclawReport: [
    '# Partial recovery snapshot',
    '',
    'OpenClaw completed scout and strategist notes, but the downstream TradingAgents analyst timed out. The UI should keep this text readable on narrow screens while preserving the recovery controls.',
    '',
    '| Field | Status | Recovery note |',
    '| --- | --- | --- |',
    '| Trace | partial | inspect the latest trace before retry |',
    '| Evidence | missing baseline | do not compare blindly |',
    '| OpenBB | stale | check Command Center diagnostics |',
  ].join('\n'),
  taResults: [
    {
      ticker: 'NVDA',
      date: '2026-05-06',
      status: 'error',
      analystReports: { market: '', sentiment: '', news: '', fundamentals: '' },
      investmentDebate: { bullArguments: [], bearArguments: [], judgeDecision: 'UNKNOWN', rounds: 0 },
      traderPlan: '',
      riskDebate: { aggressiveView: '', conservativeView: '', neutralView: '', rounds: 0 },
      portfolioManagerDecision: { action: 'HOLD', allocation: '0%', stopLoss: 'N/A', confidence: 0, reasoning: '' },
      duration: 0,
      error: 'TA_TIMEOUT: analyst stage exceeded the configured lease heartbeat window.',
    },
  ],
  openbbData: [
    {
      ticker: 'NVDA',
      core: { priceVsSma20: 'above', marketCap: 4200000000000, insiderNetDirection: 'net_buy' },
      auxiliary: { peRatio: 47, revenueGrowthYoY: 58, freeCashFlow: 29.4 },
      background: { rsi14: 64 },
      verdict: 'WARN',
      verdictReason: 'OpenBB data loaded from stale cache; retry after diagnostics clears.',
    },
  ],
  consensus: [
    { ticker: 'NVDA', openclawVerdict: 'BUY', taVerdict: 'UNKNOWN', agreement: 'blocked', openbbVerdict: 'WARN' },
  ],
  totalDurationMs: failedMission.totalDurationMs,
};

const failedRuns = [
  failedMission.latestRun,
  {
    id: 'run-failed-1',
    missionId: 'mission-demo',
    taskId: 'task-failed-prev',
    status: 'failed',
    stage: 'scout',
    attempt: 1,
    createdAt: '2026-05-05T09:30:00.000Z',
    startedAt: '2026-05-05T09:30:00.000Z',
    completedAt: '2026-05-05T09:32:00.000Z',
    failureCode: 'EVIDENCE_MISSING',
    failureMessage: 'Baseline evidence was not captured before process shutdown.',
    degradedFlags: ['missing_evidence'],
  },
];

const failedTrace = {
  traceId: 'trace-failed-demo',
  missionId: 'mission-demo',
  runId: 'run-failed-2',
  query: failedMission.query,
  startedAt: now,
  completedAt: now,
  steps: Array.from({ length: 10 }, (_, index) => {
    const phases = ['scout', 'strategist', 'analyst', 'analyst', 'council'];
    const agents = ['DataScout', 'Strategist', 'TradingAgents', 'TradingAgents', 'InvestmentCouncil'];
    return {
      agentName: agents[index % agents.length],
      timestamp: now,
      phase: phases[index % phases.length],
      input: { step: index + 1, scenario: 'mission-failure' },
      output: [
        `Failure trace step ${index + 1}: this intentionally long paragraph checks that markdown output wraps inside the trace panel instead of forcing horizontal page overflow.`,
        'The recovery note references OpenBB stale cache, TradingAgents timeout, missing baseline evidence, replay cursor, heartbeat, lease, and retry depth so the text has enough density to stress narrow cards.',
        index % 3 === 0 ? '| Signal | Status | Note |\n| --- | --- | --- |\n| TA | failed | timeout before portfolio manager |\n| Evidence | partial | latest trace exists but baseline evidence is absent |' : '',
      ].filter(Boolean).join('\n\n'),
      durationMs: 1200 + index * 137,
    };
  }),
};

const runningMission = {
  ...mockMission,
  status: 'main_running',
  query: 'Live Mission cancellation QA with a long active run title, stale heartbeat, visible lease metadata, and direct cancel controls',
  totalDurationMs: 0,
  latestRun: {
    id: 'run-running-1',
    missionId: 'mission-demo',
    taskId: 'task-running-demo',
    status: 'running',
    stage: 'analyst',
    attempt: 1,
    workerLeaseId: 'lease-running-demo',
    createdAt: now,
    startedAt: now,
    heartbeatAt: '2026-05-06T09:25:00.000Z',
  },
  latestDiff: undefined,
};

const runningMissionFull = {
  ...mockMissionFull,
  status: 'main_running',
  input: {
    ...mockMissionFull.input,
    query: runningMission.query,
    depth: 'standard',
    source: 'viewport-qa-running',
  },
  openclawReport: [
    '# Live Mission still running',
    '',
    'The analyst stage is active. The UI should surface stale heartbeat context and direct cancellation without forcing the operator back to the queue page.',
  ].join('\n'),
  taResults: [],
  openbbData: [],
  consensus: [],
  totalDurationMs: 0,
};

const runningRuns = [runningMission.latestRun];

const runningTrace = {
  traceId: 'trace-running-demo',
  missionId: 'mission-demo',
  runId: 'run-running-1',
  query: runningMission.query,
  startedAt: now,
  steps: [
    { agentName: 'DataScout', timestamp: now, phase: 'scout', input: {}, output: 'Scout completed and handed off to analyst.', durationMs: 900 },
    { agentName: 'LeadAnalyst', timestamp: now, phase: 'analyst', input: {}, output: 'Analyst is still processing a long context window.', durationMs: 0 },
  ],
};

const mockOpportunity = {
  id: 'opp-relay-ai-power',
  type: 'relay_chain',
  stage: 'ready',
  status: 'ready',
  title: 'AI power infrastructure relay chain with cooling, grid equipment, and data-center bottlenecks',
  query: 'Track AI infrastructure relay from leader signal to bottleneck suppliers',
  thesis: 'A leader signal can transfer attention into constrained infrastructure suppliers.',
  summary: 'NVDA validates AI capex while VRT, ETN, SMCI, and ANET show bottleneck demand.',
  primaryTicker: 'VRT',
  leaderTicker: 'NVDA',
  relatedTickers: ['NVDA', 'VRT', 'ETN', 'SMCI', 'ANET'],
  relayTickers: ['VRT', 'ETN', 'ANET'],
  nextCatalystAt: '2026-05-20T13:30:00.000Z',
  supplyOverhang: 'Crowding risk if leader gaps up without supplier confirmation.',
  policyStatus: 'neutral',
  scores: {
    purityScore: 76,
    scarcityScore: 68,
    tradeabilityScore: 82,
    relayScore: 88,
    catalystScore: 71,
    policyScore: 54,
  },
  heatProfile: {
    temperature: 'hot',
    bottleneckTickers: ['VRT', 'ETN'],
    laggardTickers: ['ANET'],
    junkTickers: [],
    breadthScore: 72,
    validationStatus: 'confirmed',
    validationSummary: 'Leader strength is spreading into power and cooling suppliers.',
    edgeCount: 2,
    edges: [
      { id: 'edge-1', from: 'NVDA', to: 'VRT', weight: 0.82, kind: 'leader_to_bottleneck', reason: 'AI capex pulls cooling demand forward.' },
      { id: 'edge-2', from: 'VRT', to: 'ETN', weight: 0.64, kind: 'bottleneck_to_laggard', reason: 'Power equipment follows cooling constraints.' },
    ],
    leaderHealth: 'strong',
    transmissionNote: 'Breadth is positive but watch crowding.',
  },
  catalystCalendar: [
    { label: 'Supplier earnings window', dueAt: '2026-05-20T13:30:00.000Z', status: 'upcoming', note: 'Confirm margin resilience', source: 'qa', confidence: 'inferred' },
    { label: 'Coverage source date pending', status: 'upcoming', note: 'Exact coverage date still needs source confirmation', source: 'qa', confidence: 'placeholder' },
    { label: 'Initial supplier breadth observed', dueAt: '2026-05-05T13:30:00.000Z', status: 'observed', note: 'Breadth improved after leader signal', source: 'viewport-qa', confidence: 'confirmed' },
  ],
  latestMissionId: 'mission-demo',
  latestEventType: 'mission_completed',
  latestEventMessage: 'Mission completed with partial confirmation for VRT.',
  latestEventAt: now,
  createdAt: '2026-05-01T09:30:00.000Z',
  updatedAt: now,
  latestMission: { id: 'mission-demo', query: mockMission.query, status: 'fully_enriched', updatedAt: now, source: 'viewport-qa' },
  latestRun: mockMission.latestRun,
  latestDiff: mockMission.latestDiff,
  recentHeatHistory: [
    { snapshotId: 'heat-1', createdAt: '2026-05-03T09:30:00.000Z', relayScore: 74, breadthScore: 61, temperature: 'warming', validationStatus: 'forming', validationSummary: 'Early relay forming', leaderTicker: 'NVDA', bottleneckCount: 1, laggardCount: 1 },
    { snapshotId: 'heat-2', createdAt: now, relayScore: 88, breadthScore: 72, temperature: 'hot', validationStatus: 'confirmed', validationSummary: 'Relay confirmed', leaderTicker: 'NVDA', bottleneckCount: 2, laggardCount: 1 },
  ],
  heatInflection: {
    kind: 'confirmation',
    summary: 'Relay confirmed as supplier breadth expanded.',
    happenedAt: now,
    scoreDelta: 14,
    breadthDelta: 11,
    fromStatus: 'forming',
    toStatus: 'confirmed',
  },
  whyNowSummary: 'Leader capex momentum is moving into constrained supplier layers.',
  playbook: {
    title: 'Prepare relay entry',
    stance: 'prepare',
    objective: 'Wait for breadth confirmation before adding supplier exposure.',
    whyNow: 'Catalyst window is near and heat validation improved.',
    checklist: [
      { label: 'Leader trend intact', status: 'ready', note: 'NVDA above key moving averages' },
      { label: 'Supplier breadth', status: 'watch', note: 'Need one more confirmation day' },
    ],
    nextStep: 'Run standard review on VRT and ETN.',
  },
  suggestedMission: {
    id: 'mission-review-relay',
    label: 'Review relay confirmation',
    mode: 'review',
    query: 'Review VRT and ETN relay confirmation from AI infrastructure chain',
    tickers: ['VRT', 'ETN'],
    depth: 'standard',
    source: 'viewport-qa',
    whenToUse: 'Before sizing a trade',
    rationale: 'Validates whether supplier breadth is durable.',
  },
  suggestedMissions: [],
  recentActionTimeline: [
    { id: 'act-1', timestamp: now, kind: 'mission', category: 'execution', source: 'system', decision: 'review', driver: 'execution', label: 'Mission completed', detail: 'Latest mission produced partial confirmation.', tone: 'positive' },
  ],
  sourceProvenance: {
    total: 3,
    confirmed: 0,
    inferred: 1,
    placeholder: 0,
    unknown: 2,
    sources: ['qa', 'viewport-qa', 'opportunity_event'],
    latestObservedAt: now,
    items: [
      {
        id: 'catalyst:0:Supplier earnings window',
        kind: 'catalyst',
        field: 'catalystCalendar.0',
        label: 'Supplier earnings window',
        source: 'qa',
        confidence: 'inferred',
        value: 'upcoming · 2026-05-20T13:30:00.000Z',
        note: 'Confirm margin resilience',
        observedAt: '2026-05-20T13:30:00.000Z',
      },
      {
        id: 'mission:mission-demo',
        kind: 'mission',
        field: 'latestMission',
        label: 'Latest mission',
        source: 'viewport-qa',
        confidence: 'unknown',
        value: 'fully_enriched',
        note: mockMission.query,
        observedAt: now,
      },
      {
        id: 'event:mission_completed',
        kind: 'event',
        field: 'latestEvent',
        label: 'mission_completed',
        source: 'opportunity_event',
        confidence: 'unknown',
        value: 'mission_completed',
        note: 'Mission completed with partial confirmation for VRT.',
        observedAt: now,
      },
    ],
  },
  fieldEvidence: {
    total: 8,
    fields: 8,
    sources: ['heat_profile', 'opportunity_event', 'opportunity_scores', 'qa', 'viewport-qa'],
    latestObservedAt: now,
    items: [
      {
        id: 'field:source:catalyst:0',
        kind: 'source',
        field: 'catalystCalendar.0',
        label: 'Supplier earnings window',
        source: 'qa',
        confidence: 'inferred',
        value: 'upcoming · 2026-05-20T13:30:00.000Z',
        note: 'Confirm margin resilience',
        observedAt: '2026-05-20T13:30:00.000Z',
      },
      {
        id: 'field:score:relay',
        kind: 'score',
        field: 'scores.relayScore',
        label: 'Relay score',
        source: 'opportunity_scores',
        confidence: 'confirmed',
        value: '88',
        note: 'Score snapshot used by Workbench ranking',
        artifact: {
          missionId: 'mission-demo',
          runId: 'run-demo-1',
          kind: 'evidence',
          artifactId: 'artifact-evidence-demo',
          artifactPath: 'out/missions/mission-demo/evidence.json',
          href: '/missions/mission-demo?run=run-demo-1',
          label: 'Open evidence',
        },
      },
      {
        id: 'field:score:tradeability',
        kind: 'score',
        field: 'scores.tradeabilityScore',
        label: 'Tradeability score',
        source: 'opportunity_scores',
        confidence: 'unknown',
        value: '82',
      },
      {
        id: 'field:profile:validation',
        kind: 'profile',
        field: 'heatProfile.validationStatus',
        label: 'Heat validation',
        source: 'heat_profile',
        confidence: 'confirmed',
        value: 'confirmed',
        note: 'Leader strength is spreading into power and cooling suppliers.',
      },
      {
        id: 'field:profile:breadth',
        kind: 'profile',
        field: 'heatProfile.breadthScore',
        label: 'Heat breadth',
        source: 'heat_profile',
        confidence: 'unknown',
        value: '72',
      },
      {
        id: 'field:mission:mission-demo',
        kind: 'mission',
        field: 'latestMission',
        label: 'Latest mission',
        source: 'viewport-qa',
        confidence: 'unknown',
        value: 'fully_enriched',
        note: mockMission.query,
        observedAt: now,
        artifact: {
          missionId: 'mission-demo',
          kind: 'mission',
          artifactId: 'artifact-mission-demo',
          artifactPath: 'out/missions/mission-demo.json',
          href: '/missions/mission-demo',
          label: 'Open mission',
        },
      },
      {
        id: 'field:event:mission_completed',
        kind: 'event',
        field: 'latestEvent',
        label: 'mission_completed',
        source: 'opportunity_event',
        confidence: 'unknown',
        value: 'mission_completed',
        note: 'Mission completed with partial confirmation for VRT.',
        observedAt: now,
      },
      {
        id: 'field:record:thesis',
        kind: 'record',
        field: 'thesis',
        label: 'Thesis',
        source: 'opportunity_record',
        confidence: 'unknown',
        value: 'A leader signal can transfer attention into constrained infrastructure suppliers.',
      },
    ],
  },
};

const mockFieldEvidenceIndex = [
  ...mockOpportunity.fieldEvidence.items.slice(0, 6).map((item, index) => ({
  id: item.auditEventId || item.id,
  opportunityId: mockOpportunity.id,
  field: item.field,
  label: item.label,
  kind: item.kind,
  source: item.source,
  confidence: item.confidence,
  status: index === 5 ? 'invalidated' : 'active',
  ...(item.value ? { value: item.value } : {}),
  ...(item.note ? { note: item.note } : {}),
  ...(item.observedAt ? { observedAt: item.observedAt } : {}),
  recordedAt: item.observedAt || now,
  updatedAt: index === 5 ? '2026-05-04T09:30:00.000Z' : now,
  ...(item.auditEventId ? { createdEventId: item.auditEventId } : {}),
  opportunityTitle: mockOpportunity.title,
  opportunityType: mockOpportunity.type,
  opportunityStage: mockOpportunity.stage,
  opportunityStatus: mockOpportunity.status,
  opportunityPrimaryTicker: mockOpportunity.primaryTicker,
  opportunityLatestMissionId: mockOpportunity.latestMissionId,
  opportunityLatestEventAt: mockOpportunity.latestEventAt,
  })),
  {
    id: 'field-evidence-missing-unfielded',
    opportunityId: mockOpportunity.id,
    field: 'custom.fieldEvidenceMissing',
    label: 'Recovered evidence field',
    kind: 'source',
    source: 'manual_event_repair',
    confidence: 'unknown',
    status: 'active',
    note: 'Viewport QA diagnostic row for a missing field metadata repair path.',
    recordedAt: now,
    updatedAt: now,
    opportunityTitle: mockOpportunity.title,
    opportunityType: mockOpportunity.type,
    opportunityStage: mockOpportunity.stage,
    opportunityStatus: mockOpportunity.status,
    opportunityPrimaryTicker: mockOpportunity.primaryTicker,
    opportunityLatestMissionId: mockOpportunity.latestMissionId,
    opportunityLatestEventAt: mockOpportunity.latestEventAt,
  },
];

const mockCatalystReminderAudits = [
  {
    id: 'op-evt-catalyst-subscribe-1',
    eventId: 'op-evt-catalyst-subscribe-1',
    opportunityId: mockOpportunity.id,
    reminderId: 'opp-relay-ai-power:Coverage date pending:missing:0',
    catalystLabel: 'Coverage date pending',
    catalystStatus: 'upcoming',
    urgency: 'missing_date',
    actionKind: 'fill_date',
    preference: 'subscribe',
    subscriptionLeadDays: 3,
    note: 'Subscribed from viewport QA drawer',
    message: 'Catalyst reminder subscribed: Coverage date pending',
    timestamp: now,
    activeSubscription: true,
  },
  {
    id: 'op-evt-catalyst-snooze-1',
    eventId: 'op-evt-catalyst-snooze-1',
    opportunityId: mockOpportunity.id,
    reminderId: 'opp-relay-ai-power:Supplier earnings:2026-05-12:0',
    catalystLabel: 'Supplier earnings',
    catalystDueAt: '2026-05-12T13:00:00.000Z',
    catalystStatus: 'upcoming',
    urgency: 'soon',
    actionKind: 'prepare',
    preference: 'snooze',
    snoozedUntil: '2026-05-11T09:30:00.000Z',
    note: 'Snoozed from viewport QA drawer',
    message: 'Catalyst reminder snoozed: Supplier earnings',
    timestamp: '2026-05-06T08:30:00.000Z',
    activeSubscription: false,
  },
  {
    id: 'op-evt-catalyst-ack-1',
    eventId: 'op-evt-catalyst-ack-1',
    opportunityId: 'opp-radar-new-code',
    reminderId: 'opp-radar-new-code:Listing observed:2026-05-05:0',
    catalystLabel: 'Listing observed',
    catalystDueAt: '2026-05-05T13:00:00.000Z',
    catalystStatus: 'observed',
    urgency: 'observed',
    actionKind: 'review_observed',
    preference: 'acknowledge',
    note: 'Handled after review',
    message: 'Catalyst reminder acknowledged: Listing observed',
    timestamp: '2026-05-05T09:30:00.000Z',
    activeSubscription: false,
  },
];

const mockPreTradeAudits = [
  {
    id: 'op-evt-pretrade-block-1',
    eventId: 'op-evt-pretrade-block-1',
    opportunityId: mockOpportunity.id,
    category: 'pretrade',
    eventType: 'pretrade_confirmed',
    label: 'Catalyst window confirmed',
    detail: 'Status block · Readiness blocked · Action fill_date · Catalyst missing_date · Company calendar pending',
    timestamp: now,
    status: 'block',
    readiness: 'blocked',
    actionKind: 'fill_date',
    catalystUrgency: 'missing_date',
    evidence: 'Company calendar pending',
    message: 'Pre-trade check confirmed: Catalyst window',
  },
  {
    id: 'op-evt-pretrade-catalyst-blocker-1',
    eventId: 'op-evt-pretrade-catalyst-blocker-1',
    opportunityId: mockOpportunity.id,
    category: 'catalyst_blocker',
    eventType: 'catalyst_reminder_updated',
    label: 'Coverage date pending',
    detail: 'Urgency missing_date · Action fill_date · Preference subscribe · Need coverage date before sizing',
    timestamp: now,
    status: 'block',
    readiness: 'blocked',
    actionKind: 'fill_date',
    catalystUrgency: 'missing_date',
    evidence: 'Need coverage date before sizing',
    message: 'Catalyst reminder subscribed: Coverage date pending',
  },
  {
    id: 'op-evt-pretrade-evidence-1',
    eventId: 'op-evt-pretrade-evidence-1',
    opportunityId: mockOpportunity.id,
    category: 'evidence',
    eventType: 'field_evidence_recorded',
    label: 'Relay score',
    detail: 'Field scores.relayScore · Source manual_review · Confidence confirmed · Reviewed evidence packet',
    timestamp: '2026-05-06T08:45:00.000Z',
    status: 'recorded',
    field: 'scores.relayScore',
    source: 'manual_review',
    confidence: 'confirmed',
    evidence: 'Reviewed evidence packet',
    message: 'Field evidence recorded: Relay score',
  },
  {
    id: 'op-evt-pretrade-pass-1',
    eventId: 'op-evt-pretrade-pass-1',
    opportunityId: 'opp-radar-new-code',
    category: 'pretrade',
    eventType: 'pretrade_confirmed',
    label: 'Liquidity check confirmed',
    detail: 'Status pass · Readiness ready · Average volume acceptable',
    timestamp: '2026-05-05T09:30:00.000Z',
    status: 'pass',
    readiness: 'ready',
    evidence: 'Average volume acceptable',
    message: 'Pre-trade check confirmed: Liquidity check',
  },
];

const mockReviewPlaybackItems = [
  {
    id: 'op-evt-review-mission-failed-1',
    eventId: 'op-evt-review-mission-failed-1',
    opportunityId: mockOpportunity.id,
    opportunityTitle: mockOpportunity.title,
    opportunityType: mockOpportunity.type,
    timestamp: now,
    category: 'mission',
    tone: 'negative',
    eventType: 'mission_failed',
    label: 'Mission failed',
    detail: 'TradingAgents timeout during relay chain review.',
    chips: ['MISSION', 'NEGATIVE', 'relay_chain'],
    missionId: 'mission-demo',
    runId: 'run-failed',
  },
  {
    id: 'op-evt-review-pretrade-1',
    eventId: 'op-evt-review-pretrade-1',
    opportunityId: mockOpportunity.id,
    opportunityTitle: mockOpportunity.title,
    opportunityType: mockOpportunity.type,
    timestamp: '2026-05-06T08:58:00.000Z',
    category: 'pretrade',
    tone: 'negative',
    eventType: 'pretrade_confirmed',
    label: 'Catalyst window confirmed',
    detail: 'Company calendar pending before sizing.',
    chips: ['PRETRADE', 'NEGATIVE', 'block', 'blocked'],
    missionId: 'mission-demo',
    status: 'block',
    actionKind: 'fill_date',
    catalystUrgency: 'missing_date',
    evidence: 'Company calendar pending before sizing.',
  },
  {
    id: 'op-evt-review-catalyst-1',
    eventId: 'op-evt-review-catalyst-1',
    opportunityId: mockOpportunity.id,
    opportunityTitle: mockOpportunity.title,
    opportunityType: mockOpportunity.type,
    timestamp: '2026-05-06T08:52:00.000Z',
    category: 'catalyst',
    tone: 'negative',
    eventType: 'catalyst_reminder_updated',
    label: 'Coverage date pending',
    detail: 'Need coverage date before sizing.',
    chips: ['CATALYST', 'NEGATIVE', 'missing_date', 'subscribe'],
    actionKind: 'fill_date',
    catalystUrgency: 'missing_date',
    evidence: 'Need coverage date before sizing.',
  },
  {
    id: 'op-evt-review-evidence-1',
    eventId: 'op-evt-review-evidence-1',
    opportunityId: mockOpportunity.id,
    opportunityTitle: mockOpportunity.title,
    opportunityType: mockOpportunity.type,
    timestamp: '2026-05-06T08:45:00.000Z',
    category: 'evidence',
    tone: 'positive',
    eventType: 'field_evidence_recorded',
    label: 'Relay score',
    detail: 'Reviewed evidence packet.',
    chips: ['EVIDENCE', 'POSITIVE', 'manual_review', 'confirmed'],
    field: 'scores.relayScore',
    status: 'confirmed',
    evidence: 'Reviewed evidence packet.',
  },
  {
    id: 'op-evt-review-thesis-1',
    eventId: 'op-evt-review-thesis-1',
    opportunityId: 'opp-radar-new-code',
    opportunityTitle: 'New code radar coverage',
    opportunityType: 'ipo_spinout',
    timestamp: '2026-05-05T09:30:00.000Z',
    category: 'thesis',
    tone: 'warning',
    eventType: 'signal_changed',
    label: 'Signal changed',
    detail: 'First coverage moved but liquidity is still forming.',
    chips: ['THESIS', 'WARNING', 'ipo_spinout'],
  },
];

const mockInboxItem = {
  ...mockOpportunity,
  inboxScore: 94,
  inboxSummary: 'High priority because relay heat improved and catalyst window is near.',
  recommendedAction: 'review',
  inboxReasons: [
    { code: 'relay_ready', label: 'Relay ready', detail: 'Supplier breadth confirmed', priority: 95 },
    { code: 'catalyst_due', label: 'Catalyst due', detail: 'Earnings window is approaching', priority: 76 },
  ],
  actionLabel: 'Review now',
  actionDetail: 'Run a standard review before sizing.',
  actionDecision: 'review',
  actionDriver: 'heat',
  actionTimestamp: now,
};

const failedOpportunity = {
  ...mockOpportunity,
  stage: 'tracking',
  status: 'degraded',
  title: 'Failed recovery QA relay chain with visible retry feedback on board, inbox, and drawer surfaces',
  summary: 'Latest linked Mission failed in analyst stage and should expose Workbench recovery controls.',
  latestEventType: 'mission_failed',
  latestEventMessage: 'TradingAgents analyst timed out after OpenBB returned stale context; Quick retry is recommended.',
  latestMission: {
    id: 'mission-demo',
    query: failedMission.query,
    status: 'failed',
    updatedAt: now,
    source: 'viewport-qa-recovery',
  },
  latestRun: failedMission.latestRun,
  latestDiff: failedMission.latestDiff,
  recentActionTimeline: [
    {
      id: 'act-recovery-1',
      timestamp: now,
      kind: 'mission',
      category: 'execution',
      source: 'system',
      decision: 'review',
      driver: 'execution',
      label: 'Mission failed',
      detail: 'Analyst stage timed out; retry or inspect services before trusting the result.',
      tone: 'warning',
    },
  ],
};

const failedInboxItem = {
  ...mockInboxItem,
  ...failedOpportunity,
  inboxScore: 99,
  inboxSummary: 'Recovery is urgent because the latest linked Mission failed before analyst evidence completed.',
  recommendedAction: 'review',
  inboxReasons: [
    { code: 'mission_failed', label: 'Mission failed', detail: 'Latest run failed in analyst stage', priority: 100 },
    { code: 'recovery_ready', label: 'Recovery ready', detail: 'Original Mission input can be retried', priority: 92 },
  ],
  actionLabel: 'Recover failed mission',
  actionDetail: 'Use Quick retry first to confirm the execution chain is healthy.',
  actionDecision: 'review',
  actionDriver: 'execution',
  actionTimestamp: now,
};

function buildStressOpportunity(index) {
  const n = index + 1;
  const type = ['relay_chain', 'ipo_spinout', 'proxy_narrative'][index % 3];
  const stage = ['radar', 'framing', 'tracking', 'ready', 'active'][index % 5];
  const status = ['watching', 'ready', 'active', 'degraded'][index % 4];
  const primaryTicker = `QA${String(n).padStart(3, '0')}`;
  const leaderTicker = index % 3 === 0 ? 'NVDA' : `LEAD${index % 9}`;
  const proxyTicker = type === 'proxy_narrative' ? primaryTicker : undefined;
  const relayTickers = [`R${n}`, `B${n % 17}`, `L${n % 23}`];
  const catalystOffsetDays = (index % 18) + 1;

  return {
    ...mockOpportunity,
    id: `opp-stress-${n}`,
    type,
    stage,
    status,
    title: `${type} stress opportunity ${n}: extremely long title covering AI, power, cooling, policy, supply chain, and secondary ticker rotation`,
    query: `Stress QA query ${n} for ${primaryTicker} with leader ${leaderTicker} and a deliberately verbose research prompt`,
    thesis: `Stress thesis ${n}: validate whether this opportunity still deserves attention after list windowing, saved view filters, and multiple card sections render together.`,
    summary: `Stress summary ${n}: this record is generated for viewport and large-list layout QA.`,
    primaryTicker,
    leaderTicker,
    proxyTicker,
    relatedTickers: [primaryTicker, leaderTicker, ...relayTickers],
    relayTickers,
    nextCatalystAt: `2026-05-${String(Math.min(28, 6 + catalystOffsetDays)).padStart(2, '0')}T13:30:00.000Z`,
    scores: {
      purityScore: 45 + (index % 50),
      scarcityScore: 40 + ((index * 3) % 55),
      tradeabilityScore: 50 + ((index * 5) % 45),
      relayScore: 42 + ((index * 7) % 55),
      catalystScore: 38 + ((index * 11) % 58),
      policyScore: 35 + ((index * 13) % 60),
    },
    heatProfile: type === 'relay_chain'
      ? {
          ...mockOpportunity.heatProfile,
          temperature: ['warming', 'hot', 'crowded'][index % 3],
          bottleneckTickers: relayTickers.slice(0, 2),
          laggardTickers: relayTickers.slice(2),
          breadthScore: 45 + (index % 50),
          validationStatus: ['forming', 'confirmed', 'fragile'][index % 3],
          validationSummary: `Stress relay validation ${n}: breadth and bottleneck state are intentionally varied.`,
        }
      : undefined,
    proxyProfile: type === 'proxy_narrative'
      ? {
          mappingTarget: 'AI policy infrastructure theme',
          legitimacyScore: 55 + (index % 40),
          legibilityScore: 52 + ((index * 3) % 42),
          tradeabilityScore: 58 + ((index * 5) % 38),
          ruleStatus: 'Needs daily confirmation',
          identityNote: 'Generated proxy stress card',
          scarcityNote: 'Limited direct public market proxy set',
        }
      : undefined,
    ipoProfile: type === 'ipo_spinout'
      ? {
          officialTradingDate: `2026-05-${String(Math.min(28, 10 + (index % 12))).padStart(2, '0')}`,
          spinoutDate: '2026-04-15',
          retainedStakePercent: 72,
          lockupDate: '2026-11-15',
          greenshoeStatus: 'unknown',
          firstIndependentEarningsAt: '2026-08-10',
          firstCoverageAt: '2026-06-15',
        }
      : undefined,
    catalystCalendar: [
      {
        label: `Stress catalyst ${n}`,
        dueAt: `2026-05-${String(Math.min(28, 6 + catalystOffsetDays)).padStart(2, '0')}T13:30:00.000Z`,
        status: 'upcoming',
        note: 'Generated for viewport QA pressure testing',
        source: 'viewport-qa',
        confidence: index % 2 === 0 ? 'confirmed' : 'inferred',
      },
    ],
    latestMissionId: index % 4 === 0 ? 'mission-demo' : undefined,
    latestMission: index % 4 === 0
      ? {
          id: 'mission-demo',
          query: `Stress mission ${n} with a long query for timeline wrapping`,
          status: index % 8 === 0 ? 'failed' : 'fully_enriched',
          updatedAt: now,
          source: 'viewport-qa',
        }
      : undefined,
    latestRun: index % 4 === 0 ? mockMission.latestRun : undefined,
    latestDiff: index % 6 === 0 ? mockMission.latestDiff : undefined,
    latestOpportunityDiff: index % 5 === 0
      ? {
          currentSnapshotId: `stress-current-${n}`,
          baselineSnapshotId: `stress-base-${n}`,
          changed: true,
          changeCount: 2 + (index % 4),
          changedCategories: ['stage', 'heat'],
          highlights: ['Stress thesis moved'],
          summary: `Stress opportunity ${n} changed: stage, heat, or catalyst timing shifted and should wrap cleanly.`,
        }
      : undefined,
    latestEventType: index % 8 === 0 ? 'mission_failed' : 'updated',
    latestEventMessage: index % 8 === 0
      ? 'Generated failed mission event for recovery panel pressure testing.'
      : 'Generated update event for large-list pressure testing.',
    latestEventAt: now,
    whyNowSummary: `Stress why-now ${n}: generated item has enough copy to pressure compact card wrapping without causing overflow.`,
    playbook: {
      ...mockOpportunity.playbook,
      nextStep: `Stress next step ${n}: review the highest-ranked signal and keep action buttons stable.`,
    },
    suggestedMission: {
      ...mockOpportunity.suggestedMission,
      id: `stress-mission-${n}`,
      label: `Review stress ${n}`,
      query: `Review stress opportunity ${n} with long query and ticker basket ${primaryTicker}, ${leaderTicker}`,
      tickers: [primaryTicker, leaderTicker],
    },
    recentActionTimeline: [
      {
        id: `stress-action-${n}`,
        timestamp: now,
        kind: 'opportunity',
        category: 'signal',
        source: 'system',
        decision: index % 4 === 0 ? 'review' : 'monitor',
        driver: index % 3 === 0 ? 'heat' : 'calendar',
        label: `Stress action ${n}`,
        detail: 'Generated timeline detail for large-list viewport QA.',
        tone: index % 4 === 0 ? 'warning' : 'neutral',
      },
    ],
    createdAt: `2026-05-${String(1 + (index % 5)).padStart(2, '0')}T09:30:00.000Z`,
    updatedAt: now,
  };
}

let stressOpportunities = [];
let stressInboxItems = [];

function configureStressFixtures(stressOpportunityCount = defaultStressOpportunityCount) {
  stressOpportunities = Array.from(
    { length: stressOpportunityCount },
    (_, index) => buildStressOpportunity(index),
  );
  stressInboxItems = stressOpportunities.slice(0, 12).map((opportunity, index) => ({
    ...opportunity,
    inboxScore: 99 - index,
    inboxSummary: `Stress inbox item ${index + 1}: high-density action lane card should stay readable.`,
    recommendedAction: index % 3 === 0 ? 'analyze' : index % 3 === 1 ? 'review' : 'monitor',
    inboxReasons: [
      { code: index % 2 === 0 ? 'relay_ready' : 'watch', label: 'Stress reason', detail: 'Generated priority reason', priority: 90 - index },
    ],
    actionLabel: 'Stress review',
    actionDetail: 'Generated action detail for large-list QA.',
    actionDecision: index % 3 === 1 ? 'review' : 'monitor',
    actionDriver: index % 2 === 0 ? 'heat' : 'calendar',
    actionTimestamp: now,
  }));
}

configureStressFixtures();

function stressBoardHealth() {
  return {
    ipo_spinout: {
      type: 'ipo_spinout',
      headline: 'IPO stress board',
      summary: 'Large-list viewport QA includes many IPO/spinout cards.',
      metrics: [
        {
          key: 'window_open',
          label: 'Window open',
          value: stressOpportunities.filter((item) => item.type === 'ipo_spinout').length,
          tone: 'positive',
          opportunityIds: stressOpportunities.filter((item) => item.type === 'ipo_spinout').map((item) => item.id),
          explanation: 'Generated stress metric for IPO board.',
        },
      ],
    },
    relay_chain: {
      type: 'relay_chain',
      headline: 'Relay stress board',
      summary: 'Large-list viewport QA includes many relay cards.',
      metrics: [
        {
          key: 'relay_ready',
          label: 'Relay ready',
          value: stressOpportunities.filter((item) => item.type === 'relay_chain').length,
          tone: 'positive',
          opportunityIds: stressOpportunities.filter((item) => item.type === 'relay_chain').map((item) => item.id),
          explanation: 'Generated stress metric for relay board.',
        },
      ],
    },
    proxy_narrative: {
      type: 'proxy_narrative',
      headline: 'Proxy stress board',
      summary: 'Large-list viewport QA includes many proxy cards.',
      metrics: [
        {
          key: 'proxy_ignited',
          label: 'Proxy ignited',
          value: stressOpportunities.filter((item) => item.type === 'proxy_narrative').length,
          tone: 'warning',
          opportunityIds: stressOpportunities.filter((item) => item.type === 'proxy_narrative').map((item) => item.id),
          explanation: 'Generated stress metric for proxy board.',
        },
      ],
    },
  };
}

const boardHealth = {
  ipo_spinout: { type: 'ipo_spinout', headline: 'New code windows quiet', summary: 'No urgent IPO spinout setup in mock data.', metrics: [] },
  relay_chain: {
    type: 'relay_chain',
    headline: 'Relay breadth improving',
    summary: 'Leader to supplier chain has confirmed breadth.',
    metrics: [
      {
        key: 'ready',
        label: 'Ready setups',
        value: 1,
        tone: 'positive',
        opportunityIds: ['opp-relay-ai-power'],
        explanation: 'Relay score and breadth both improved.',
      },
    ],
  },
  proxy_narrative: { type: 'proxy_narrative', headline: 'Proxy narratives stable', summary: 'No urgent proxy action.', metrics: [] },
};

function makeTrendItems(count, stress = false) {
  const platforms = stress
    ? [
      'X social market narrative stream with extended platform label',
      'Reddit semiconductor infrastructure discussion',
      'Newswire global technology catalyst feed',
      'SEC filings and disclosure monitor',
      'Industry blog channel with very long platform name',
      'China hot search sector rotation board',
    ]
    : ['X', 'Reddit', 'News', 'SEC'];

  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: stress
      ? `AI infrastructure catalyst ${index + 1} with a deliberately long headline for wrap testing, ticker clusters, policy context, supplier relay signals, and repeated market narrative fragments`
      : `AI infrastructure catalyst ${index + 1} with a deliberately long headline for wrap testing`,
    url: 'https://example.com',
    rank: index + 1,
    first_crawl_time: `2026-05-06 ${String(9 + (index % 8)).padStart(2, '0')}:00:00`,
    last_crawl_time: `2026-05-06 ${String(10 + (index % 8)).padStart(2, '0')}:00:00`,
    crawl_count: stress ? 18 - (index % 11) : 10 - (index % 5),
    platform_name: platforms[index % platforms.length],
  }));
}

const trendItems = makeTrendItems(12);
const trendStressItems = makeTrendItems(72, true);

function makeRawTrendItems(count, stress = false) {
  const platforms = stress
    ? [
      'SEC RSS filings and disclosure monitor',
      'Weibo Hot search sector rotation board',
      'Reddit AI infrastructure discussion stream',
      'Newswire global macro technology feed',
      'Industry blog supply-chain longform source',
      'Exchange announcement surveillance lane',
    ]
    : ['SEC RSS', 'Weibo Hot', 'Reddit AI', 'Newswire'];

  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: stress
      ? `Raw market intelligence item ${index + 1} with very long underlying source title, ticker cluster, policy catalyst, supply chain context, and duplicate headline fragments for table overflow stress validation`
      : `Raw market intelligence item ${index + 1} with long underlying source title for table overflow testing`,
    url: 'https://example.com',
    first_crawl_time: `2026-05-06 ${String(8 + (index % 10)).padStart(2, '0')}:10:00`,
    last_crawl_time: `2026-05-06 ${String(9 + (index % 10)).padStart(2, '0')}:30:00`,
    platform_name: platforms[index % platforms.length],
    source_type: index % 3 === 0 ? 'rss' : 'hotlist',
    matched: [1, 0, -1][index % 3],
    matched_tag: index % 3 === 0 ? 'AI infrastructure' : index % 3 === 1 ? 'Rejected noise with extended classifier reason' : null,
  }));
}

const rawTrendItems = makeRawTrendItems(18);
const rawTrendStressItems = makeRawTrendItems(260, true);

const dynamicWatchlist = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation with AI leader signal and long display name',
    discoveredAt: now,
    trendName: 'AI infrastructure',
    chainLevel: 'sector_leader',
    multibaggerScore: 91,
    discoverySource: 'TrendRadar',
    reasoning: 'Leader signal remains strong.',
    status: 'focused',
    priceAtDiscovery: 820,
    currentPrice: 920,
    marketCap: 4200000000000,
  },
  {
    symbol: 'VRT',
    name: 'Vertiv Holdings',
    discoveredAt: now,
    trendName: 'Power and cooling bottlenecks',
    chainLevel: 'bottleneck',
    multibaggerScore: 84,
    discoverySource: 'Heat Transfer Graph',
    reasoning: 'Cooling demand follows AI capex.',
    status: 'watching',
    priceAtDiscovery: 75,
    currentPrice: 92,
    marketCap: 36000000000,
  },
  {
    symbol: 'ANET',
    name: 'Arista Networks',
    discoveredAt: now,
    trendName: 'Network laggard relay',
    chainLevel: 'hidden_gem',
    multibaggerScore: 72,
    discoverySource: 'Watchlist',
    reasoning: 'Network supplier may lag the leader move.',
    status: 'discovered',
    priceAtDiscovery: 290,
    currentPrice: 310,
    marketCap: 98000000000,
  },
];

const dynamicWatchlistStress = Array.from({ length: 84 }, (_, index) => {
  const symbols = ['NVDA', 'VRT', 'ANET', 'ETN', 'PWR', 'AVGO', 'TSM', 'MU', 'SMCI', 'DELL', 'CEG', 'NEE'];
  const status = ['focused', 'watching', 'discovered'][index % 3];
  const chainLevel = ['sector_leader', 'bottleneck', 'hidden_gem'][index % 3];
  const priceAtDiscovery = 50 + (index % 40);
  const currentPrice = priceAtDiscovery * (1 + ((index % 9) - 3) / 100);

  return {
    symbol: `${symbols[index % symbols.length]}${index}`,
    name: `Generated watchlist company ${index + 1} with very long legal name and market structure descriptor for responsive card stress testing`,
    discoveredAt: new Date(Date.parse(now) - index * 60 * 60 * 1000).toISOString(),
    trendName: `AI infrastructure relay theme ${index % 7} with long trend label`,
    chainLevel,
    multibaggerScore: 95 - (index % 55),
    discoverySource: index % 2 === 0 ? 'TrendRadar long-form source provenance' : 'Heat Transfer Graph generated stress lane',
    reasoning: `Generated reasoning ${index + 1}: leader heat may pass into suppliers, bottlenecks, power equipment, grid capacity, and overlooked laggard names.`,
    status,
    priceAtDiscovery,
    currentPrice,
    marketCap: 1000000000 * (index + 1),
  };
});

const modelsConfig = {
  defaults: {
    provider: 'openai',
    base_url: 'https://api.openai.com/v1',
  },
  models: {
    quick_think: {
      model: 'gpt-5.4-mini',
      temperature: 0.2,
      max_tokens: 4096,
    },
    deep_think: {
      model: 'gpt-5.4',
      temperature: 0.2,
      max_tokens: 12000,
    },
  },
  services: {
    openclaw: {
      scout: 'quick_think',
      strategist: 'deep_think',
      synthesizer: 'deep_think',
    },
    tradingAgents: {
      analyst: 'deep_think',
      risk: 'quick_think',
    },
  },
};

function json(payload, status = 200) {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function emptyBoardHealth() {
  return {
    ipo_spinout: { type: 'ipo_spinout', headline: 'No IPO setups', summary: 'Empty viewport scenario.', metrics: [] },
    relay_chain: { type: 'relay_chain', headline: 'No relay setups', summary: 'Empty viewport scenario.', metrics: [] },
    proxy_narrative: { type: 'proxy_narrative', headline: 'No proxy setups', summary: 'Empty viewport scenario.', metrics: [] },
  };
}

function apiPayload(pathname, method, url, scenario = 'default', requestBody = null) {
  const routePath = pathname.replace(/^\/api/, '');
  const isWorkbenchStress = scenario === 'workbench-stress';
  const isWorkbenchRecovery = scenario === 'workbench-recovery';
  const isWorkbenchRecoveryFailure = scenario === 'workbench-recovery-failure';
  const isWorkbenchRecoveryScenario = isWorkbenchRecovery || isWorkbenchRecoveryFailure;
  const isCommandDiagnostics = scenario === 'command-diagnostics';
  const isMissionFailure = scenario === 'mission-failure';
  const isMissionRunning = scenario === 'mission-running';

  if (routePath.endsWith('/stream')) {
    return {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: 'event: connected\ndata: {}\n\n',
    };
  }
  if (routePath === '/health') return json({ status: isCommandDiagnostics ? 'degraded' : 'ok', isDegraded: isCommandDiagnostics });
  if (routePath === '/queue') {
    return json(isMissionRunning ? {
      summary: '1 running task sampled',
      tasks: [
        {
          id: 'task-running-demo',
          missionId: 'mission-demo',
          runId: 'run-running-1',
          query: runningMission.query,
          depth: 'standard',
          priority: 100,
          source: 'viewport-qa-running',
          status: 'running',
          progress: 'analyst',
          createdAt: Date.parse(now),
          startedAt: Date.parse(now),
          heartbeatAt: Date.parse('2026-05-06T09:25:00.000Z'),
        },
      ],
    } : { summary: '1 task sampled', tasks: [] });
  }
  if (routePath === '/watchlist/dynamic') {
    const items = scenario === 'watchlist-empty'
      ? []
      : scenario === 'watchlist-stress'
        ? dynamicWatchlistStress
        : dynamicWatchlist;
    return json(items);
  }
  if (routePath === '/config/models') {
    return scenario === 'settings-error'
      ? json(null)
      : json(modelsConfig);
  }
  if (routePath === '/diagnostics') {
    if (isCommandDiagnostics) {
      return json({
        timestamp: now,
        probes: {
          llm: { status: 'ok', latency: 12, details: 'mock ok' },
          openbb: { status: 'degraded', latency: 238, details: 'OpenBB gateway returned stale fundamentals cache.' },
          tradingAgents: { status: 'warning', latency: 145, details: 'TradingAgents queue has one stale run.' },
          trendRadar: { status: 'ok', latency: 18, details: 'mock ok' },
        },
      });
    }
    const probe = { status: 'ok', latency: 12, details: 'mock ok' };
    return json({ timestamp: now, probes: { llm: probe, openbb: probe, tradingAgents: probe, trendRadar: probe } });
  }
  if (routePath === '/diagnostics/db-migrations') {
    return json(isCommandDiagnostics
      ? {
        status: 'degraded',
        total: 9,
        applied: 8,
        failed: 1,
        missing: 0,
        mismatched: 1,
        migrations: [
          {
            id: '008_mission_artifacts',
            description: 'Mission artifact registry',
            checksum: 'mock-old',
            appliedAt: now,
            durationMs: 12,
            status: 'applied',
            error: null,
            known: true,
            checksumMatches: false,
            expectedChecksum: 'mock-new',
          },
        ],
      }
      : { status: 'ok', total: 9, applied: 9, failed: 0, missing: 0, mismatched: 0, migrations: [] });
  }
  if (routePath === '/diagnostics/missions') {
    return json(isCommandDiagnostics ? {
      status: 'warning',
      checkedAt: now,
      indexTotal: 8,
      canonicalTotal: 6,
      covered: 5,
      missingCanonical: 2,
      orphanCanonical: 1,
      staleCanonical: 1,
      artifactPathMismatch: 0,
      artifactMissing: 1,
      artifactUnreadable: 0,
      integrityMissing: 3,
      checksumMismatch: 0,
      sizeMismatch: 1,
      issues: [
        { code: 'missing_canonical', missionId: 'mission-missing-1', message: 'Mission is present in index but missing canonical row.' },
        { code: 'integrity_missing', missionId: 'mission-integrity-1', message: 'Mission artifact is missing integrity metadata.' },
      ],
    } : {
      status: 'ok',
      checkedAt: now,
      indexTotal: 1,
      canonicalTotal: 1,
      covered: 1,
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
    });
  }
  if (routePath === '/diagnostics/mission-artifacts') {
    return json(isCommandDiagnostics ? {
      status: 'warning',
      checkedAt: now,
      total: 10,
      present: 8,
      missing: 1,
      unreadable: 0,
      integrityMissing: 4,
      checksumMismatch: 1,
      sizeMismatch: 0,
      byKind: {
        evidence: { total: 4, present: 4, issues: 2 },
        trace: { total: 3, present: 2, issues: 2 },
        report: { total: 3, present: 2, issues: 2 },
      },
      issues: [
        {
          code: 'integrity_missing',
          artifactId: 'artifact-integrity-1',
          missionId: 'mission-demo',
          kind: 'evidence',
          artifactPath: 'out/missions/mission-demo/evidence.json',
          message: 'Artifact is present but missing checksum/size metadata.',
        },
        {
          code: 'missing',
          artifactId: 'artifact-missing-1',
          missionId: 'mission-demo',
          kind: 'trace',
          artifactPath: 'out/missions/mission-demo/trace.jsonl',
          message: 'Trace artifact file is missing from disk.',
        },
      ],
    } : {
      status: 'ok',
      checkedAt: now,
      total: 2,
      present: 2,
      missing: 0,
      unreadable: 0,
      integrityMissing: 0,
      checksumMismatch: 0,
      sizeMismatch: 0,
      byKind: {},
      issues: [],
    });
  }
  if (routePath === '/diagnostics/mission-artifacts/repair-plan') {
    return json(isCommandDiagnostics ? {
      status: 'actionable',
      checkedAt: now,
      totalArtifacts: 10,
      totalActions: 6,
      automaticActions: 3,
      manualReviewActions: 2,
      blockedActions: 1,
      sampledActions: [
        {
          artifactId: 'artifact-integrity-1',
          missionId: 'mission-demo',
          kind: 'evidence',
          artifactPath: 'out/missions/mission-demo/evidence.json',
          issueCode: 'integrity_missing',
          action: 'refresh_integrity',
          safety: 'automatic',
          reason: 'File exists and can be hashed safely.',
          api: { method: 'POST', path: '/diagnostics/mission-artifacts/refresh-integrity' },
        },
      ],
    } : {
      status: 'ok',
      checkedAt: now,
      totalArtifacts: 2,
      totalActions: 0,
      automaticActions: 0,
      manualReviewActions: 0,
      blockedActions: 0,
      sampledActions: [],
    });
  }
  if (routePath === '/diagnostics/opportunity-field-evidence') {
    return json(isCommandDiagnostics ? {
      status: 'degraded',
      checkedAt: now,
      recordedEvents: 7,
      canonicalRows: 4,
      covered: 4,
      missingCanonical: 3,
      orphanCanonical: 1,
      statusMismatch: 1,
      missingField: 1,
      invalidatedEvents: 2,
      restoredEvents: 1,
      issues: [
        {
          code: 'missing_canonical',
          evidenceId: 'field-evidence-missing-1',
          opportunityId: 'opp-demo',
          field: 'scores.relayScore',
          eventStatus: 'active',
          message: 'Field evidence event has no canonical row.',
        },
        {
          code: 'missing_field',
          evidenceId: 'field-evidence-missing-unfielded',
          opportunityId: 'opp-relay-ai-power',
          message: 'Field evidence event is missing field metadata.',
        },
      ],
    } : {
      status: 'ok',
      checkedAt: now,
      recordedEvents: 1,
      canonicalRows: 1,
      covered: 1,
      missingCanonical: 0,
      orphanCanonical: 0,
      statusMismatch: 0,
      missingField: 0,
      invalidatedEvents: 0,
      restoredEvents: 0,
      issues: [],
    });
  }
  if (routePath === '/diagnostics/opportunity-field-evidence/repair-plan') {
    return json(isCommandDiagnostics ? {
      status: 'blocked',
      checkedAt: now,
      recordedEvents: 7,
      canonicalRows: 4,
      totalActions: 6,
      automaticActions: 3,
      manualReviewActions: 1,
      blockedActions: 2,
      sampledActions: [
        {
          evidenceId: 'field-evidence-missing-1',
          issueCode: 'missing_canonical',
          action: 'backfill_canonical',
          safety: 'automatic',
          opportunityId: 'opp-demo',
          field: 'scores.relayScore',
          eventStatus: 'active',
          reason: 'Recorded field evidence event has no canonical row.',
          api: { method: 'POST', path: '/diagnostics/opportunity-field-evidence/repair' },
        },
        {
          evidenceId: 'field-evidence-missing-unfielded',
          issueCode: 'missing_field',
          action: 'repair_event_metadata',
          safety: 'blocked',
          opportunityId: 'opp-relay-ai-power',
          eventStatus: 'active',
          reason: 'Recorded field evidence event is missing field metadata; review before choosing a field.',
        },
      ],
    } : {
      status: 'ok',
      checkedAt: now,
      recordedEvents: 1,
      canonicalRows: 1,
      totalActions: 0,
      automaticActions: 0,
      manualReviewActions: 0,
      blockedActions: 0,
      sampledActions: [],
    });
  }
  if (routePath === '/diagnostics/missions/backfill' && method === 'POST') {
    return json({
      checkedAt: now,
      missionsScanned: 8,
      inserted: 2,
      refreshed: 1,
      inputPayloadFallbacks: 0,
      latestRunsLinked: 3,
      latestEventsLinked: 4,
      artifactIntegrityRecorded: 5,
      filesPresent: 8,
      filesMissing: 1,
      filesUnreadable: 0,
    });
  }
  if (routePath === '/diagnostics/mission-artifacts/backfill' && method === 'POST') {
    return json({
      checkedAt: now,
      missionsScanned: 8,
      missionArtifactsUpserted: 2,
      eventRowsScanned: 12,
      eventLogArtifactsUpserted: 1,
      evidenceRefsScanned: 5,
      evidenceArtifactsUpserted: 2,
      totalArtifactsUpserted: 5,
      filesPresent: 8,
      filesMissing: 1,
      filesUnreadable: 0,
    });
  }
  if (routePath === '/diagnostics/mission-artifacts/refresh-integrity' && method === 'POST') {
    return json({
      checkedAt: now,
      total: 10,
      filesPresent: 8,
      filesMissing: 1,
      filesUnreadable: 0,
      integrityMissing: 4,
      checksumMismatches: 1,
      sizeMismatches: 0,
      refreshed: 3,
      skippedMismatches: 1,
      refreshedArtifactIds: ['artifact-integrity-1', 'artifact-integrity-2', 'artifact-integrity-3'],
    });
  }
  if (routePath === '/diagnostics/mission-artifacts/repair' && method === 'POST') {
    return json({
      checkedAt: now,
      requestedArtifactIds: [],
      notFoundArtifactIds: [],
      totalArtifacts: 10,
      totalActions: 6,
      eligibleActions: 3,
      applied: 3,
      skippedHealthy: 4,
      skippedManualReview: 2,
      blocked: 1,
      updatedArtifactIds: ['artifact-integrity-1', 'artifact-integrity-2', 'artifact-integrity-3'],
      skippedActions: [],
    });
  }
  if (routePath === '/diagnostics/opportunity-field-evidence/backfill' && method === 'POST') {
    return json({
      checkedAt: now,
      eventsScanned: 10,
      recordedEvents: 7,
      invalidatedEvents: 2,
      restoredEvents: 1,
      inserted: 3,
      refreshed: 4,
      invalidated: 2,
      restored: 1,
      skippedMissingField: 0,
    });
  }
  if (routePath === '/diagnostics/opportunity-field-evidence/repair' && method === 'POST') {
    return json({
      checkedAt: now,
      requestedEvidenceIds: [],
      notFoundEvidenceIds: [],
      totalEvidence: 8,
      totalActions: 5,
      eligibleActions: 3,
      applied: 3,
      skippedHealthy: 3,
      skippedManualReview: 1,
      blocked: 1,
      updatedEvidenceIds: ['field-evidence-missing-1', 'field-evidence-missing-2', 'field-evidence-mismatch-1'],
      skippedActions: [],
    });
  }
  if (routePath === '/opportunities/price-history/diagnostics') {
    return json(isCommandDiagnostics ? {
      generatedAt: now,
      cachePath: 'data/price-history.json',
      staleAfterHours: 24,
      trackedSymbols: ['AAOI', 'CRWV', 'SNDK'],
      cachedSymbols: ['AAOI', 'SNDK', 'ORPHAN'],
      metrics: {
        tracked: 3,
        cached: 3,
        fresh: 1,
        stale: 1,
        missing: 1,
        orphan: 1,
        totalPoints: 144,
        coveragePct: 66.7,
      },
      series: [
        { symbol: 'AAOI', status: 'fresh', pointCount: 80, updatedAt: now, source: 'openbb:yfinance' },
        { symbol: 'CRWV', status: 'missing', pointCount: 0 },
        { symbol: 'SNDK', status: 'stale', pointCount: 64, updatedAt: '2026-05-04T00:00:00.000Z', source: 'openbb:yfinance' },
        { symbol: 'ORPHAN', status: 'orphan', pointCount: 20, updatedAt: now, source: 'fixture' },
      ],
    } : {
      generatedAt: now,
      cachePath: 'data/price-history.json',
      staleAfterHours: 24,
      trackedSymbols: ['AAOI'],
      cachedSymbols: ['AAOI'],
      metrics: {
        tracked: 1,
        cached: 1,
        fresh: 1,
        stale: 0,
        missing: 0,
        orphan: 0,
        totalPoints: 80,
        coveragePct: 100,
      },
      series: [{ symbol: 'AAOI', status: 'fresh', pointCount: 80, updatedAt: now, source: 'openbb:yfinance' }],
    });
  }
  if (routePath === '/opportunities/price-history/refresh' && method === 'POST') {
    return json({
      success: true,
      generatedAt: now,
      cachePath: 'data/price-history.json',
      requestedSymbols: ['AAOI', 'CRWV', 'SNDK'],
      refreshed: 2,
      skippedFresh: 1,
      failed: 0,
      items: [
        { symbol: 'AAOI', status: 'skipped_fresh', fetchedPoints: 0, cachedPoints: 80, updatedAt: now },
        { symbol: 'CRWV', status: 'refreshed', fetchedPoints: 80, cachedPoints: 80, updatedAt: now },
        { symbol: 'SNDK', status: 'refreshed', fetchedPoints: 80, cachedPoints: 80, updatedAt: now },
      ],
      diagnostics: {
        generatedAt: now,
        cachePath: 'data/price-history.json',
        staleAfterHours: requestBody?.staleAfterHours || 24,
        trackedSymbols: ['AAOI', 'CRWV', 'SNDK'],
        cachedSymbols: ['AAOI', 'CRWV', 'SNDK'],
        metrics: {
          tracked: 3,
          cached: 3,
          fresh: 3,
          stale: 0,
          missing: 0,
          orphan: 0,
          totalPoints: 240,
          coveragePct: 100,
        },
        series: [],
      },
    }, 202);
  }

  if (routePath === '/missions') {
    if (method === 'POST') {
      return json({
        success: true,
        message: 'Mission queued from viewport QA recovery action.',
        missionId: isMissionFailure ? 'mission-demo' : 'mission-demo',
        runId: isMissionFailure ? 'run-retry-queued' : 'run-demo-queued',
      });
    }
    const items = scenario === 'mission-empty'
      ? []
      : [isMissionFailure ? failedMission : isMissionRunning ? runningMission : mockMission];
    return json({ items, pageInfo: pageInfo(Number(url.searchParams.get('limit') || 30)) });
  }
  if (routePath === '/missions/mission-demo') return json(isMissionFailure ? failedMissionFull : isMissionRunning ? runningMissionFull : mockMissionFull);
  if (routePath === '/missions/mission-demo/events') {
    return json(isMissionFailure ? [
      { id: 'evt-failed-1', missionId: 'mission-demo', timestamp: now, type: 'created', message: 'Mission created from Opportunity recovery workflow.', status: 'queued' },
      { id: 'evt-failed-2', missionId: 'mission-demo', timestamp: now, type: 'stage', message: 'OpenClaw scout completed with partial evidence.', status: 'main_running', phase: 'scout' },
      { id: 'evt-failed-3', missionId: 'mission-demo', timestamp: now, type: 'failed', message: 'TradingAgents analyst timed out; retry or inspect services before trusting the run.', status: 'failed', phase: 'analyst' },
      {
        id: 'evt-recovery-audit-1',
        missionId: 'mission-demo',
        timestamp: now,
        type: 'queued',
        message: 'Reused active recovery retry from Opportunity Workbench.',
        status: 'queued',
        meta: {
          operation: 'mission_retry',
          recoveryAction: 'reused_active_retry',
          reusedExistingRetry: true,
          depth: 'quick',
          costHint: {
            tier: 'low',
            label: '低成本',
            estimate: '约 1-3 分钟',
            detail: 'Quick retry keeps the recovery lightweight while checking service health.',
          },
          taskId: 'task-retry-existing',
          runId: 'run-retry-existing',
        },
      },
    ] : isMissionRunning ? [
      { id: 'evt-running-1', missionId: 'mission-demo', timestamp: now, type: 'created', message: 'Mission created for live cancellation QA.', status: 'queued' },
      { id: 'evt-running-2', missionId: 'mission-demo', timestamp: now, type: 'stage', message: 'Analyst stage is running with stale heartbeat.', status: 'main_running', phase: 'analyst' },
    ] : [
      { id: 'evt-1', missionId: 'mission-demo', timestamp: now, type: 'created', message: 'Mission created', status: 'queued' },
      { id: 'evt-2', missionId: 'mission-demo', timestamp: now, type: 'completed', message: 'Mission completed', status: 'fully_enriched', phase: 'synthesis' },
    ]);
  }
  if (routePath === '/missions/mission-demo/runs') return json(isMissionFailure ? failedRuns : isMissionRunning ? runningRuns : mockRuns);
  if (routePath === '/missions/mission-demo/recovery') {
    return json(isMissionFailure ? {
      missionId: 'mission-demo',
      recoverable: true,
      latestRun: failedRuns[0],
      summary: {
        label: 'Recovery needed',
        detail: 'Latest run failed in analyst stage after partial evidence capture. Inspect trace, retry quickly, or check service diagnostics.',
        severity: 'critical',
      },
      suggestedActions: [
        { id: 'inspect_trace', label: '查看 Trace', detail: 'Open the latest failed run trace before retrying.', kind: 'inspect', priority: 1 },
        { id: 'retry_quick', label: '快速重试', detail: 'Queue a quick retry using the original Mission input.', kind: 'retry_depth', depth: 'quick', priority: 2 },
        { id: 'review_recovery', label: '复盘任务', detail: 'Create a review mission linked to this failed run.', kind: 'review', depth: 'standard', priority: 3 },
        { id: 'check_services', label: '检查服务', detail: 'Open Command Center diagnostics before retrying.', kind: 'diagnostic', priority: 4 },
      ],
      reason: {
        status: 'failed',
        runStatus: 'failed',
        stage: 'analyst',
        failureCode: 'TA_TIMEOUT',
        failureMessage: 'TradingAgents analyst stage timed out.',
        degradedFlags: ['openbb_stale', 'ta_timeout', 'partial_evidence'],
      },
    } : isMissionRunning ? {
      missionId: 'mission-demo',
      recoverable: false,
      latestRun: runningRuns[0],
      summary: { label: 'Running', detail: 'Mission is still running and should expose active execution controls.', severity: 'info' },
      suggestedActions: [],
      reason: { status: 'main_running', runStatus: 'running', stage: 'analyst' },
    } : {
      missionId: 'mission-demo',
      recoverable: false,
      latestRun: mockRuns[0],
      summary: { label: 'Healthy', detail: 'Latest run completed.', severity: 'info' },
      suggestedActions: [],
      reason: { status: 'fully_enriched', runStatus: 'completed', stage: 'completed' },
    });
  }
  if (routePath === '/queue/task-running-demo' && method === 'DELETE') {
    return json({ success: true, message: 'Mission canceled from viewport QA.' });
  }
  if (routePath === '/missions/mission-demo/retry' && method === 'POST') {
    if (isWorkbenchRecoveryFailure) {
      return json({
        error: 'OpenBB upstream unavailable while retrying the Workbench recovery action.',
        code: 'upstream_unavailable',
      }, 503);
    }
    return json({
      success: true,
      message: 'Mission retry queued from viewport QA.',
      missionId: 'mission-demo',
      runId: isMissionFailure ? 'run-failed-retry' : isWorkbenchRecovery ? 'run-workbench-retry' : 'run-demo-retry',
    });
  }
  if (routePath === '/missions/mission-demo/runs/run-demo-1/evidence') {
    return json({ ...mockMissionFull, id: 'evidence-demo-1', runId: 'run-demo-1', missionId: 'mission-demo', capturedAt: now, completeness: 'full' });
  }
  if (routePath === '/missions/mission-demo/runs/run-failed-1/evidence') {
    return json(null);
  }
  if (routePath === '/traces/byMission/mission-demo' || routePath === '/traces/byMission/mission-demo/runs/run-demo-1') {
    return json({ content: isMissionFailure ? failedTrace : isMissionRunning ? runningTrace : mockTrace });
  }
  if (routePath === '/traces/byMission/mission-demo/runs/run-failed-1') return json({ content: failedTrace });
  if (routePath === '/traces') return json([]);

  if (routePath === '/opportunity-field-registry') {
    return json([
      {
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        kind: 'score',
        source: 'viewport_qa_registry',
        confidence: 'confirmed',
        group: 'score',
        base: {
          field: 'scores.relayScore',
          label: 'Relay score',
          kind: 'score',
          source: 'opportunity_scores',
          confidence: 'unknown',
          group: 'score',
        },
        overriddenFields: ['label', 'source', 'confidence'],
        note: 'QA override',
        updatedAt: now,
        updatedBy: 'viewport-qa',
      },
      {
        field: 'custom.executionGate',
        label: 'Execution gate',
        kind: 'record',
        source: 'manual_checklist',
        confidence: 'unknown',
        group: 'custom',
        overriddenFields: ['label', 'kind', 'source', 'confidence'],
        note: 'Custom desk field',
        updatedAt: now,
        updatedBy: 'viewport-qa',
      },
      {
        field: 'latestMission',
        label: 'Latest mission',
        kind: 'mission',
        source: 'mission',
        confidence: 'unknown',
        group: 'mission',
        base: {
          field: 'latestMission',
          label: 'Latest mission',
          kind: 'mission',
          source: 'mission',
          confidence: 'unknown',
          group: 'mission',
        },
        overriddenFields: [],
      },
    ]);
  }
  if (routePath === '/opportunity-field-registry/report') {
    return json({
      generatedAt: now,
      totalFields: 3,
      baseFields: 1,
      customFields: 1,
      overriddenFields: 2,
      overrideCoveragePercent: 66.7,
      byGroup: [
        { key: 'score', count: 1 },
        { key: 'custom', count: 1 },
        { key: 'mission', count: 1 },
      ],
      byKind: [
        { key: 'score', count: 1 },
        { key: 'record', count: 1 },
        { key: 'mission', count: 1 },
      ],
      byConfidence: [
        { key: 'confirmed', count: 1 },
        { key: 'unknown', count: 2 },
      ],
      changedFieldCounts: [
        { key: 'label', count: 2 },
        { key: 'source', count: 2 },
        { key: 'confidence', count: 1 },
      ],
      fields: [
        {
          field: 'scores.relayScore',
          label: 'Relay momentum score',
          group: 'score',
          kind: 'score',
          source: 'viewport_qa_registry',
          confidence: 'confirmed',
          changedFields: ['label', 'source', 'confidence'],
          note: 'QA override',
          updatedAt: now,
          updatedBy: 'viewport-qa',
        },
      ],
      recentAudit: [
        {
          id: 'registry-audit-1',
          field: 'scores.relayScore',
          action: 'upsert',
          changedFields: ['label', 'source'],
          updatedAt: now,
          updatedBy: 'viewport-qa',
        },
      ],
    });
  }
  if (routePath === '/opportunity-field-registry/export') {
    return json({
      version: 1,
      exportedAt: now,
      items: [
        {
          field: 'scores.relayScore',
          label: 'Relay momentum score',
          source: 'viewport_qa_registry',
          confidence: 'confirmed',
          note: 'QA override',
          updatedAt: now,
          updatedBy: 'viewport-qa',
        },
      ],
      registry: [],
      report: {
        generatedAt: now,
        totalFields: 3,
        baseFields: 1,
        customFields: 1,
        overriddenFields: 2,
        overrideCoveragePercent: 66.7,
        byGroup: [{ key: 'score', count: 1 }],
        byKind: [{ key: 'score', count: 1 }],
        byConfidence: [{ key: 'confirmed', count: 1 }],
        changedFieldCounts: [{ key: 'label', count: 2 }],
        fields: [],
        recentAudit: [],
      },
    });
  }
  if (routePath === '/opportunity-field-registry/import' && method === 'POST') {
    return json({
      checkedAt: now,
      dryRun: true,
      total: 1,
      created: 0,
      updated: 1,
      unchanged: 0,
      failed: 0,
      items: [
        {
          index: 0,
          field: 'scores.relayScore',
          status: 'updated',
          changedFields: ['label', 'source', 'confidence'],
          effective: {
            field: 'scores.relayScore',
            label: 'Relay QA score',
            kind: 'score',
            source: 'viewport_qa_registry',
            confidence: 'confirmed',
            group: 'score',
            overriddenFields: ['label', 'source', 'confidence'],
            updatedAt: now,
          },
        },
      ],
      registry: [],
      report: {
        generatedAt: now,
        totalFields: 3,
        baseFields: 1,
        customFields: 1,
        overriddenFields: 2,
        overrideCoveragePercent: 66.7,
        byGroup: [{ key: 'score', count: 1 }],
        byKind: [{ key: 'score', count: 1 }],
        byConfidence: [{ key: 'confirmed', count: 1 }],
        changedFieldCounts: [{ key: 'label', count: 2 }],
        fields: [],
        recentAudit: [],
      },
    });
  }
  if (routePath === '/opportunity-field-evidence') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const status = url.searchParams.get('status');
    const confidence = url.searchParams.get('confidence');
    const kind = url.searchParams.get('kind');
    const field = url.searchParams.get('field');
    const source = url.searchParams.get('source');
    const items = mockFieldEvidenceIndex.filter((item) => {
      if (status && item.status !== status) return false;
      if (confidence && item.confidence !== confidence) return false;
      if (kind && item.kind !== kind) return false;
      if (field && item.field !== field) return false;
      if (source && item.source !== source) return false;
      if (!q) return true;
      return [
        item.field,
        item.id,
        item.label,
        item.source,
        item.value,
        item.note,
        item.opportunityTitle,
        item.opportunityPrimaryTicker,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
    return json({ items, pageInfo: pageInfo(Number(url.searchParams.get('limit') || 50)) });
  }
  if (routePath === '/opportunity-catalyst-reminders') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const preference = url.searchParams.get('preference');
    const opportunityId = url.searchParams.get('opportunityId');
    const activeOnly = ['1', 'true', 'active'].includes(url.searchParams.get('activeOnly') || '');
    const items = mockCatalystReminderAudits.filter((item) => {
      if (preference && item.preference !== preference) return false;
      if (opportunityId && item.opportunityId !== opportunityId) return false;
      if (activeOnly && !item.activeSubscription) return false;
      if (!q) return true;
      return [
        item.opportunityId,
        item.reminderId,
        item.catalystLabel,
        item.preference,
        item.note,
        item.message,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
    return json({
      generatedAt: now,
      metrics: {
        total: items.length,
        acknowledged: items.filter((item) => item.preference === 'acknowledge').length,
        snoozed: items.filter((item) => item.preference === 'snooze').length,
        reopened: items.filter((item) => item.preference === 'reopen').length,
        subscribed: items.filter((item) => item.preference === 'subscribe').length,
        unsubscribed: items.filter((item) => item.preference === 'unsubscribe').length,
        activeSubscriptions: items.filter((item) => item.activeSubscription).length,
      },
      items,
    });
  }
  if (routePath === '/opportunity-pretrade-audit') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const category = url.searchParams.get('category');
    const status = url.searchParams.get('status');
    const opportunityId = url.searchParams.get('opportunityId');
    const items = mockPreTradeAudits.filter((item) => {
      if (category && item.category !== category) return false;
      if (opportunityId && item.opportunityId !== opportunityId) return false;
      if (status && item.status !== status && item.readiness !== status) return false;
      if (!q) return true;
      return [
        item.opportunityId,
        item.category,
        item.eventType,
        item.label,
        item.detail,
        item.status,
        item.readiness,
        item.actionKind,
        item.catalystUrgency,
        item.evidence,
        item.field,
        item.source,
        item.confidence,
        item.message,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
    return json({
      generatedAt: now,
      metrics: {
        total: items.length,
        confirmations: items.filter((item) => item.eventType === 'pretrade_confirmed').length,
        reopened: items.filter((item) => item.eventType === 'pretrade_unconfirmed').length,
        blockers: items.filter((item) => item.category === 'catalyst_blocker').length,
        evidence: items.filter((item) => item.category === 'evidence').length,
        blocked: items.filter((item) => item.status === 'block' || item.readiness === 'blocked').length,
        ready: items.filter((item) => item.status === 'pass' || item.readiness === 'ready').length,
      },
      items,
    });
  }
  if (routePath === '/opportunity-review-playback') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const category = url.searchParams.get('category');
    const tone = url.searchParams.get('tone');
    const opportunityId = url.searchParams.get('opportunityId');
    const backtestTicker = (url.searchParams.get('backtestTicker') || '').trim().toUpperCase();
    const backtestStrategy = url.searchParams.get('backtestStrategy') || '';
    const backtestFrom = url.searchParams.get('backtestFrom') || '';
    const backtestTo = url.searchParams.get('backtestTo') || '';
    const backtestStrategyLabels = {
      ipo_spinout: 'IPO / spinout',
      relay_chain: 'Relay chain',
      proxy_narrative: 'Proxy narrative',
      ad_hoc: 'Ad hoc',
    };
    const backtestStrategyLabel = backtestStrategyLabels[backtestStrategy] || backtestStrategy;
    const backtestFilterLabel = [
      backtestStrategyLabel ? `Strategy ${backtestStrategyLabel}` : undefined,
      backtestTicker ? `Ticker ${backtestTicker}` : undefined,
      backtestFrom ? `From ${backtestFrom}` : undefined,
      backtestTo ? `To ${backtestTo}` : undefined,
    ].filter(Boolean).join(' · ') || 'All history';
    const items = mockReviewPlaybackItems.filter((item) => {
      if (category && item.category !== category) return false;
      if (tone && item.tone !== tone) return false;
      if (opportunityId && item.opportunityId !== opportunityId) return false;
      if (!q) return true;
      return [
        item.opportunityId,
        item.opportunityTitle,
        item.opportunityType,
        item.category,
        item.tone,
        item.eventType,
        item.label,
        item.detail,
        item.missionId,
        item.runId,
        item.field,
        item.status,
        item.actionKind,
        item.catalystUrgency,
        item.evidence,
        ...(item.chips || []),
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
    const metrics = {
      total: items.length,
      missions: items.filter((item) => item.category === 'mission').length,
      pretrade: items.filter((item) => item.category === 'pretrade').length,
      evidence: items.filter((item) => item.category === 'evidence').length,
      catalysts: items.filter((item) => item.category === 'catalyst').length,
      risks: items.filter((item) => item.tone === 'negative').length,
      positives: items.filter((item) => item.tone === 'positive').length,
      warnings: items.filter((item) => item.tone === 'warning').length,
    };
    const blockers = items.filter((item) => (
      (item.category === 'pretrade' || item.category === 'catalyst') && item.tone === 'negative'
    )).length;
    const failedMissions = items.filter((item) => item.eventType === 'mission_failed').length;
    const completedMissions = items.filter((item) => item.eventType === 'mission_completed').length;
    const evidenceRecorded = items.filter((item) => item.eventType === 'field_evidence_recorded').length;
    const evidenceInvalidated = items.filter((item) => item.eventType === 'field_evidence_invalidated').length;
    const opportunityCount = new Set(items.map((item) => item.opportunityId)).size;
    const entrySignal = items.find((item) => item.tone === 'positive');
    const exitSignal = items.find((item) => item.tone === 'negative');
    const triggeredCatalysts = items.filter((item) => item.category === 'catalyst' && item.tone !== 'negative').length;
    const performanceStatus = opportunityCount > 1
      ? 'multi_opportunity'
      : blockers > 0 || exitSignal
        ? 'risk_hit'
        : entrySignal
          ? 'positive_follow_through'
          : 'insufficient_data';
    return json({
      generatedAt: now,
      metrics,
      outcome: {
        status: blockers > 0 ? 'blocked' : failedMissions > 0 ? 'review' : items.length > 0 ? 'ready' : 'quiet',
        headline: blockers > 0 ? `${blockers} 个执行前阻塞` : failedMissions > 0 ? `${failedMissions} 个 Mission 需要复核` : '复盘链路偏正向',
        detail: `Mission 失败 ${failedMissions} 条，执行前阻塞 ${blockers} 条，已记录 evidence ${evidenceRecorded} 条。`,
        nextStep: blockers > 0 ? '先解除 pre-trade 或催化阻塞，再复核 Mission 失败。' : '继续查看时间线并进入策略复盘。',
        score: blockers > 0 ? 64 : failedMissions > 0 ? 25 : 0,
        blockers,
        failedMissions,
        completedMissions,
        evidenceRecorded,
        evidenceInvalidated,
        latestRiskAt: items.find((item) => item.tone === 'negative')?.timestamp,
        latestPositiveAt: items.find((item) => item.tone === 'positive')?.timestamp,
      },
      performance: {
        status: performanceStatus,
        headline: performanceStatus === 'multi_opportunity'
          ? '选择单个 Opportunity 查看交易复盘'
          : performanceStatus === 'risk_hit'
            ? '风险信号已命中'
            : '热度跟随偏正向',
        detail: 'Heat 72 → 64（-8），最大回撤代理 -21.1%；催化触发 0 条，风险事件 3 条。',
        nextStep: performanceStatus === 'risk_hit'
          ? '复核 exit/risk 事件，并把真实价格、收益率和回撤补进复盘。'
          : '补充 entry/exit price 后，把 heat 代理复盘升级为真实收益复盘。',
        opportunityCount: opportunityCount || 0,
        triggeredCatalysts,
        pretradeBlockHit: blockers > 0,
        pretradeBlockers: blockers,
        riskEvents: metrics.risks + metrics.warnings,
        dataQuality: 'heat_proxy',
        priceCache: opportunityCount > 1
          ? {
              status: 'unknown',
              staleAfterHours: 24,
              refreshPath: '/command-center',
            }
          : {
              status: 'stale',
              staleAfterHours: 24,
              symbol: 'AAOI',
              source: 'openbb:yfinance',
              updatedAt: '2026-05-08T00:00:00.000Z',
              ageHours: 48,
              pointCount: 42,
              oldestPointAt: '2026-04-01T00:00:00.000Z',
              newestPointAt: '2026-05-08T00:00:00.000Z',
              refreshPath: '/command-center',
            },
	        notes: ['Heat 变化和回撤是机会热度代理，不等同于真实交易收益。'],
	        position: opportunityCount > 1
	          ? {
	              closedLegs: 0,
	              partialLegs: 0,
	              openLegs: 0,
	              sizedLegs: 0,
	              notes: [],
	            }
	          : {
	              closedLegs: 0,
	              partialLegs: 1,
	              openLegs: 1,
	              sizedLegs: 2,
	              realizedReturnContributionPct: -0.4,
		              drawdownContributionPct: -0.8,
		              openExposurePct: 3,
		              exitAttributions: [{ kind: 'risk_reduction', label: 'Risk reduction', count: 1 }],
		              executionQuality: [
		                { status: 'early_exit', label: 'Early exit', count: 1 },
		                { status: 'open_position', label: 'Open position', count: 1 },
		              ],
		              planRepairSuggestions: [
		                { kind: 'add_stop_loss', label: 'Add stop loss', severity: 'blocker', count: 1 },
		                { kind: 'add_target_price', label: 'Add target price', severity: 'blocker', count: 1 },
		                { kind: 'add_risk_budget', label: 'Add risk budget', severity: 'warning', count: 1 },
		              ],
		              sizingRules: [
		                { status: 'open_exposure', label: 'Open exposure', severity: 'ok', count: 1 },
		                { status: 'scaled_down', label: 'Scaled down', severity: 'ok', count: 1 },
		              ],
		              notes: ['Viewport QA partial exit sizing.'],
	            },
	        strategyBacktest: opportunityCount > 1
	          ? {
	              status: 'ready',
	              headline: '2 个策略族已有回测样本',
	              detail: 'Best Relay chain: 1 priced，avg 12%，win 100%。 Weakest Proxy narrative: 1 priced，avg -12%，issues 3。',
	              filterLabel: backtestFilterLabel,
	              ...(backtestTicker ? { ticker: backtestTicker } : {}),
	              ...(backtestStrategy ? { strategy: backtestStrategy, strategyLabel: backtestStrategyLabel } : {}),
	              ...(backtestFrom ? { windowStart: backtestFrom } : {}),
	              ...(backtestTo ? { windowEnd: backtestTo } : {}),
	              totalStrategies: 2,
	              coveredStrategies: 2,
	              opportunityCount: 3,
	              pricedLegs: 2,
	              closedLegs: 2,
	              notes: ['2/3 个机会已有 priced closed/partial leg。'],
	              bestGroup: {
	                key: 'relay_chain',
	                label: 'Relay chain',
	                verdict: 'favorable',
	                verdictLabel: 'Favorable',
	                opportunityCount: 1,
	                sampleSize: 1,
	                closedLegs: 1,
	                pricedLegs: 1,
	                coveragePct: 100,
	                winRatePct: 100,
	                avgReturnPct: 12,
	                avgMaxDrawdownPct: 0,
	                oversizedLegs: 0,
	                planRepairLegs: 0,
	                executionIssueLegs: 0,
	              },
	              weakestGroup: {
	                key: 'proxy_narrative',
	                label: 'Proxy narrative',
	                verdict: 'unfavorable',
	                verdictLabel: 'Unfavorable',
	                opportunityCount: 1,
	                sampleSize: 1,
	                closedLegs: 1,
	                pricedLegs: 1,
	                coveragePct: 100,
	                winRatePct: 0,
	                avgReturnPct: -12,
	                avgMaxDrawdownPct: -12,
	                oversizedLegs: 1,
	                planRepairLegs: 1,
	                executionIssueLegs: 1,
	              },
	              groups: [
	                {
	                  key: 'relay_chain',
	                  label: 'Relay chain',
	                  verdict: 'favorable',
	                  verdictLabel: 'Favorable',
	                  opportunityCount: 1,
	                  sampleSize: 1,
	                  closedLegs: 1,
	                  pricedLegs: 1,
	                  coveragePct: 100,
	                  winRatePct: 100,
	                  avgReturnPct: 12,
	                  avgMaxDrawdownPct: 0,
	                  avgRiskBudgetUsedPct: 50,
	                  oversizedLegs: 0,
	                  planRepairLegs: 0,
	                  executionIssueLegs: 0,
	                },
	                {
	                  key: 'proxy_narrative',
	                  label: 'Proxy narrative',
	                  verdict: 'unfavorable',
	                  verdictLabel: 'Unfavorable',
	                  opportunityCount: 1,
	                  sampleSize: 1,
	                  closedLegs: 1,
	                  pricedLegs: 1,
	                  coveragePct: 100,
	                  winRatePct: 0,
	                  avgReturnPct: -12,
	                  avgMaxDrawdownPct: -12,
	                  avgRiskBudgetUsedPct: 200,
	                  oversizedLegs: 1,
	                  planRepairLegs: 1,
	                  executionIssueLegs: 1,
	                },
	              ],
	            }
	          : {
	              status: 'ready',
	              headline: '1 个策略族已有回测样本',
	              detail: 'Best Relay chain: 1 priced，avg -9%，win 0%。',
	              filterLabel: backtestFilterLabel,
	              ...(backtestTicker ? { ticker: backtestTicker } : {}),
	              ...(backtestStrategy ? { strategy: backtestStrategy, strategyLabel: backtestStrategyLabel } : {}),
	              ...(backtestFrom ? { windowStart: backtestFrom } : {}),
	              ...(backtestTo ? { windowEnd: backtestTo } : {}),
	              totalStrategies: 1,
	              coveredStrategies: 1,
	              opportunityCount: 1,
	              pricedLegs: 1,
	              closedLegs: 1,
	              notes: ['单机会策略回测样本。'],
	              bestGroup: {
	                key: 'relay_chain',
	                label: 'Relay chain',
	                verdict: 'unfavorable',
	                verdictLabel: 'Unfavorable',
	                opportunityCount: 1,
	                sampleSize: 2,
	                closedLegs: 1,
	                pricedLegs: 1,
	                coveragePct: 100,
	                winRatePct: 0,
	                avgReturnPct: -9,
	                avgMaxDrawdownPct: -21.1,
	                avgRiskBudgetUsedPct: 13.3,
	                oversizedLegs: 0,
	                planRepairLegs: 1,
	                executionIssueLegs: 0,
	              },
	              weakestGroup: {
	                key: 'relay_chain',
	                label: 'Relay chain',
	                verdict: 'unfavorable',
	                verdictLabel: 'Unfavorable',
	                opportunityCount: 1,
	                sampleSize: 2,
	                closedLegs: 1,
	                pricedLegs: 1,
	                coveragePct: 100,
	                winRatePct: 0,
	                avgReturnPct: -9,
	                avgMaxDrawdownPct: -21.1,
	                avgRiskBudgetUsedPct: 13.3,
	                oversizedLegs: 0,
	                planRepairLegs: 1,
	                executionIssueLegs: 0,
	              },
	              groups: [{
	                key: 'relay_chain',
	                label: 'Relay chain',
	                verdict: 'unfavorable',
	                verdictLabel: 'Unfavorable',
	                opportunityCount: 1,
	                sampleSize: 2,
	                closedLegs: 1,
	                pricedLegs: 1,
	                coveragePct: 100,
	                winRatePct: 0,
	                avgReturnPct: -9,
	                avgMaxDrawdownPct: -21.1,
	                avgRiskBudgetUsedPct: 13.3,
	                oversizedLegs: 0,
	                planRepairLegs: 1,
	                executionIssueLegs: 0,
	              }],
	            },
	        riskBacktest: opportunityCount > 1
	          ? {
	              verdict: 'unfavorable',
	              label: 'Unfavorable',
	              detail: '跨 3 个机会聚合 2/2 笔 priced closed/partial leg；风险收益不划算：2 priced legs，win rate 50%，avg return 0%，avg DD -6%。',
	              sampleSize: 2,
	              closedLegs: 2,
	              pricedLegs: 2,
	              opportunityCount: 3,
	              opportunitiesWithTrades: 2,
	              opportunitiesWithPricedTrades: 2,
	              oversizedLegs: 1,
	              planRepairLegs: 1,
	              executionIssueLegs: 1,
	              winRatePct: 50,
	              avgReturnPct: 0,
	              avgMaxDrawdownPct: -6,
	              avgRiskAtStopPct: 1.5,
	              avgRiskBudgetUsedPct: 125,
	              notes: ['跨 3 个机会聚合，2 个机会已有 priced closed/partial leg。'],
	              segments: [
	                {
	                  kind: 'opportunity_type',
	                  key: 'relay_chain',
	                  label: 'Relay chain',
	                  verdict: 'favorable',
	                  verdictLabel: 'Favorable',
	                  opportunityCount: 1,
	                  sampleSize: 1,
	                  closedLegs: 1,
	                  pricedLegs: 1,
	                  oversizedLegs: 0,
	                  planRepairLegs: 0,
	                  executionIssueLegs: 0,
	                  winRatePct: 100,
	                  avgReturnPct: 12,
	                  avgMaxDrawdownPct: 0,
	                },
	                {
	                  kind: 'opportunity_type',
	                  key: 'proxy_narrative',
	                  label: 'Proxy narrative',
	                  verdict: 'unfavorable',
	                  verdictLabel: 'Unfavorable',
	                  opportunityCount: 1,
	                  sampleSize: 1,
	                  closedLegs: 1,
	                  pricedLegs: 1,
	                  oversizedLegs: 1,
	                  planRepairLegs: 1,
	                  executionIssueLegs: 1,
	                  winRatePct: 0,
	                  avgReturnPct: -12,
	                  avgMaxDrawdownPct: -12,
	                },
	                {
	                  kind: 'stage',
	                  key: 'active',
	                  label: 'Active',
	                  verdict: 'mixed',
	                  verdictLabel: 'Mixed',
	                  opportunityCount: 2,
	                  sampleSize: 2,
	                  closedLegs: 2,
	                  pricedLegs: 2,
	                  oversizedLegs: 1,
	                  planRepairLegs: 1,
	                  executionIssueLegs: 1,
	                  winRatePct: 50,
	                  avgReturnPct: 0,
	                  avgMaxDrawdownPct: -6,
	                },
	              ],
	            }
	          : {
	              verdict: 'unfavorable',
	              label: 'Unfavorable',
	              detail: '风险收益不划算：1 priced leg，win rate 0%，avg return -9%，avg DD -21.1%。',
	              sampleSize: 2,
	              closedLegs: 1,
	              pricedLegs: 1,
	              oversizedLegs: 0,
	              planRepairLegs: 1,
	              executionIssueLegs: 0,
	              winRatePct: 0,
	              avgReturnPct: -9,
	              avgMaxDrawdownPct: -21.1,
	              avgRiskAtStopPct: 0.2,
	              avgRiskBudgetUsedPct: 13.3,
	              realizedReturnContributionPct: -0.4,
	              openExposurePct: 3,
	              notes: ['已用 1/1 笔 closed/partial leg 计算收益样本。'],
	            },
	        entrySignal: entrySignal ? {
          at: entrySignal.timestamp,
          label: entrySignal.label,
          eventId: entrySignal.eventId,
          category: entrySignal.category,
          confidence: 'observed',
        } : undefined,
        exitSignal: exitSignal ? {
          at: exitSignal.timestamp,
          label: exitSignal.label,
          eventId: exitSignal.eventId,
          category: exitSignal.category,
          confidence: 'observed',
        } : undefined,
        holdingDays: 4.2,
        heatStart: 72,
        heatEnd: 64,
        heatDelta: -8,
        heatHigh: 81,
        heatLow: 64,
        heatMaxDrawdownPct: -21.1,
        trades: opportunityCount > 1
	          ? []
	          : [{
	              id: 'evt-entry:evt-exit',
	              status: 'partial',
	              symbol: 'AAOI',
	              entry: {
                at: '2026-05-01T00:00:00.000Z',
                label: 'Relay triggered',
                eventId: 'evt-entry',
                category: 'signal',
                confidence: 'observed',
                price: 100,
              },
              exit: {
                at: now,
                label: 'Mission failed',
                eventId: 'evt-exit',
                category: 'mission',
                confidence: 'observed',
                price: 91,
	              },
	              holdingDays: 4.2,
	              entryQuantity: 100,
	              exitQuantity: 40,
	              remainingQuantity: 60,
	              closedPct: 40,
	              remainingPct: 60,
	              positionPct: 2,
	              notionalUsd: 4000,
	              returnPct: -9,
	              maxDrawdownPct: -21.1,
	              peakReturnPct: 8,
	              priceSource: 'event_meta',
		              dataQuality: 'price_confirmed',
		              exitAttribution: {
		                kind: 'risk_reduction',
		                label: 'Risk reduction',
		                detail: '本次是风险降仓，关闭原始仓位 40%。计划：stop 92 · target 125 · R/R 3.1。',
		                stopLossPrice: 92,
		                targetPrice: 125,
		                riskBudgetPct: 1.5,
		                stopDistancePct: -8,
		                targetUpsidePct: 25,
		                exitVsStopPct: -1.1,
		                exitVsTargetPct: -27.2,
		                riskRewardRatio: 3.1,
		              },
		              executionQuality: {
		                status: 'early_exit',
		                label: 'Early exit',
		                detail: '退出早于 stop/target 终局，属于提前降风险或人工复核动作。目标捕获 -36%。',
			                planCompleteness: 'complete',
			                priceTolerancePct: 2,
				                repairSuggestions: [],
				                targetCapturePct: -36,
				              },
				              sizingRule: {
				                status: 'scaled_down',
				                label: 'Scaled down',
				                severity: 'ok',
				                detail: 'Partial exit 已降低仓位，剩余敞口 3%，risk-at-stop 0.2%。',
				                hasSizing: true,
				                exposurePct: 2,
				                remainingExposurePct: 3,
				                notionalUsd: 4000,
				                riskBudgetPct: 1.5,
				                stopDistancePct: -8,
				                riskAtStopPct: 0.2,
				                riskBudgetUsedPct: 13.3,
				              },
			              riskReward: {
	                outcome: 'loss',
	                exposurePct: 2,
	                returnContributionPct: -0.2,
	                drawdownContributionPct: -0.4,
	                note: '仓位暴露 2%，收益贡献 -0.2%。',
	              },
	              notes: ['Viewport QA trade leg.'],
	            }, {
	              id: 'evt-entry:open',
	              status: 'open',
	              symbol: 'AAOI',
	              entry: {
	                at: '2026-05-01T00:00:00.000Z',
	                label: 'Relay triggered',
	                eventId: 'evt-entry',
	                category: 'signal',
	                confidence: 'observed',
	                price: 100,
	              },
	              entryQuantity: 100,
	              remainingQuantity: 60,
	              remainingPct: 60,
	              positionPct: 3,
	              notionalUsd: 6000,
		              dataQuality: 'price_confirmed',
		              executionQuality: {
		                status: 'open_position',
		                label: 'Open position',
			                detail: '仍有 open exposure，且缺少 stop/target 计划字段。',
			                planCompleteness: 'missing',
			                priceTolerancePct: 2,
			                repairSuggestions: [
			                  {
			                    kind: 'add_stop_loss',
			                    label: 'Add stop loss',
			                    detail: '补充 meta.stopLossPrice，复盘才能判断 stop loss、late exit 和 slippage。',
			                    field: 'meta.stopLossPrice',
			                    severity: 'blocker',
			                  },
			                  {
			                    kind: 'add_target_price',
			                    label: 'Add target price',
			                    detail: '补充 meta.targetPrice，复盘才能判断 target hit 和目标捕获率。',
			                    field: 'meta.targetPrice',
			                    severity: 'blocker',
			                  },
			                  {
			                    kind: 'add_risk_budget',
			                    label: 'Add risk budget',
			                    detail: '补充 meta.riskBudgetPct 或 meta.riskBudgetUsd，复盘才能评估这笔交易承担了多少计划内风险。',
			                    field: 'meta.riskBudgetPct',
			                    severity: 'warning',
			                  },
				                ],
				              },
				              sizingRule: {
				                status: 'open_exposure',
				                label: 'Open exposure',
				                severity: 'ok',
				                detail: '仍有 open exposure，risk-at-stop unknown，budget unknown，usage unknown。',
				                hasSizing: true,
				                exposurePct: 3,
				                remainingExposurePct: 3,
				                notionalUsd: 6000,
				              },
			              riskReward: {
	                outcome: 'unknown',
	                exposurePct: 3,
	                note: '仍有未关闭仓位，等待 exit/risk event 或最新价格确认。',
	              },
	              notes: ['Viewport QA open exposure.'],
	            }],
	      },
      items,
    });
  }
  if (routePath === '/opportunity-field-evidence/bulk-status' && method === 'POST') {
    return json({
      status: 'completed',
      action: 'invalidate',
      total: 1,
      invalidated: 1,
      restored: 0,
      notFound: 0,
      failed: 0,
      items: [{
        index: 0,
        opportunityId: 'opp-relay-ai-power',
        evidenceId: 'field:score:relay',
        action: 'invalidate',
        status: 'invalidated',
      }],
    }, 201);
  }
  if (routePath === '/opportunity-field-registry/history') {
    const field = url.searchParams.get('field') || 'scores.relayScore';
    return json([
      {
        id: 'registry-audit-1',
        field,
        action: 'upsert',
        changedFields: ['label', 'source'],
        after: {
          field,
          label: field === 'latestMission' ? 'Latest mission' : 'Relay score',
          source: 'viewport_qa_registry',
          confidence: 'unknown',
          updatedAt: now,
          updatedBy: 'viewport-qa',
        },
        updatedAt: now,
        updatedBy: 'viewport-qa',
      },
    ]);
  }
  if (routePath.startsWith('/opportunity-field-registry/') && method === 'PUT') {
    const field = decodeURIComponent(routePath.replace('/opportunity-field-registry/', ''));
    return json({
      override: {
        field,
        label: field,
        kind: 'source',
        source: 'manual_field_evidence',
        confidence: 'unknown',
        updatedAt: now,
      },
      effective: {
        field,
        label: 'Relay QA score',
        kind: 'score',
        source: 'viewport_qa_registry',
        confidence: 'confirmed',
        group: field.startsWith('scores.') ? 'score' : 'custom',
        base: field.startsWith('scores.') ? {
          field,
          label: 'Relay score',
          kind: 'score',
          source: 'opportunity_scores',
          confidence: 'unknown',
          group: 'score',
        } : undefined,
        overriddenFields: ['label', 'source', 'confidence'],
        updatedAt: now,
      },
      audit: {
        id: 'registry-audit-save',
        field,
        action: 'upsert',
        changedFields: ['label', 'kind', 'source', 'confidence'],
        updatedAt: now,
        updatedBy: 'viewport-qa',
      },
    });
  }
  if (routePath.startsWith('/opportunity-field-registry/') && method === 'DELETE') {
    return json({
      deleted: true,
      registry: [
        {
          field: decodeURIComponent(routePath.replace('/opportunity-field-registry/', '')),
          label: 'Relay score',
          kind: 'score',
          source: 'opportunity_scores',
          confidence: 'unknown',
          group: 'score',
          overriddenFields: [],
        },
      ],
      audit: {
        id: 'registry-audit-reset',
        field: decodeURIComponent(routePath.replace('/opportunity-field-registry/', '')),
        action: 'delete',
        changedFields: ['label', 'kind', 'source', 'confidence'],
        updatedAt: now,
        updatedBy: 'viewport-qa',
      },
    });
  }

  if (routePath === '/opportunities') {
    const items = scenario === 'workbench-empty'
      ? []
      : isWorkbenchStress
        ? stressOpportunities
        : [isWorkbenchRecoveryScenario ? failedOpportunity : mockOpportunity];
    return json({ items, pageInfo: pageInfo(Number(url.searchParams.get('limit') || 60)) });
  }
  if (routePath === '/opportunities/opp-relay-ai-power/pretrade-confirmations' && method === 'POST') {
    return json({
      event: {
        id: 'op-evt-pretrade-1',
        opportunityId: 'opp-relay-ai-power',
        type: 'pretrade_confirmed',
        message: 'Pre-trade check confirmed: Catalyst window for AI Power Relay',
        timestamp: now,
        meta: { source: 'pretrade_checklist' },
      },
      opportunity: isWorkbenchRecoveryScenario ? failedOpportunity : mockOpportunity,
    }, 201);
  }
  if (routePath === '/opportunities/opp-relay-ai-power/catalyst-reminders' && method === 'POST') {
    const body = requestBody && typeof requestBody === 'object' ? requestBody : {};
    return json({
      event: {
        id: 'op-evt-catalyst-reminder-1',
        opportunityId: 'opp-relay-ai-power',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder updated: viewport QA',
        timestamp: now,
        meta: { source: 'catalyst_reminder', ...body },
      },
      opportunity: isWorkbenchRecoveryScenario ? failedOpportunity : mockOpportunity,
    }, 201);
  }
  if (routePath === '/opportunities/opp-relay-ai-power/field-evidence/batch' && method === 'POST') {
    const batchEvent = {
      id: 'op-evt-field-evidence-batch-1',
      opportunityId: 'opp-relay-ai-power',
      type: 'field_evidence_recorded',
      message: 'Field evidence recorded: Batch QA for AI Power Relay',
      timestamp: now,
      meta: {
        field: 'scores.relayScore',
        label: 'Relay score',
        source: 'manual_review',
        confidence: 'confirmed',
        batchId: 'viewport-qa-batch',
        clientId: 'batch:scores.relayScore',
      },
    };
    return json({
      batchId: 'viewport-qa-batch',
      total: 1,
      recorded: 1,
      duplicates: 0,
      failed: 0,
      items: [{
        index: 0,
        clientId: 'batch:scores.relayScore',
        field: 'scores.relayScore',
        status: 'recorded',
        event: batchEvent,
      }],
      opportunity: mockOpportunity,
    }, 201);
  }
  if (routePath === '/opportunities/opp-relay-ai-power/field-evidence' && method === 'POST') {
    const manualEvidence = {
      id: 'op-evt-field-evidence-1',
      kind: 'score',
      field: 'scores.relayScore',
      label: 'Relay score',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Viewport QA manual evidence note',
      observedAt: now,
      auditEventId: 'op-evt-field-evidence-1',
    };
    return json({
      event: {
        id: 'op-evt-field-evidence-1',
        opportunityId: 'opp-relay-ai-power',
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded: Relay score for AI Power Relay',
        timestamp: now,
        meta: manualEvidence,
      },
      opportunity: {
        ...mockOpportunity,
        fieldEvidence: {
          ...mockOpportunity.fieldEvidence,
          total: mockOpportunity.fieldEvidence.total + 1,
          sources: [...new Set([...mockOpportunity.fieldEvidence.sources, 'manual_review'])],
          items: [manualEvidence, ...mockOpportunity.fieldEvidence.items],
        },
      },
    }, 201);
  }
  if (
    routePath === '/opportunities/opp-relay-ai-power/field-evidence/op-evt-field-evidence-1/invalidate'
    && method === 'POST'
  ) {
    return json({
      event: {
        id: 'op-evt-field-evidence-invalidated-1',
        opportunityId: 'opp-relay-ai-power',
        type: 'field_evidence_invalidated',
        message: 'Field evidence invalidated: Relay score for AI Power Relay',
        timestamp: now,
        meta: {
          evidenceId: 'op-evt-field-evidence-1',
          field: 'scores.relayScore',
          source: 'manual_review',
          reason: 'Viewport QA invalidated manual evidence',
        },
      },
      opportunity: {
        ...mockOpportunity,
        fieldEvidence: {
          ...mockOpportunity.fieldEvidence,
          invalidated: (mockOpportunity.fieldEvidence.invalidated || 0) + 1,
        },
      },
    }, 201);
  }
  if (
    routePath === '/opportunities/opp-relay-ai-power/field-evidence/op-evt-field-evidence-1/restore'
    && method === 'POST'
  ) {
    const manualEvidence = {
      id: 'op-evt-field-evidence-1',
      kind: 'score',
      field: 'scores.relayScore',
      label: 'Relay score',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Viewport QA manual evidence note',
      observedAt: now,
      auditEventId: 'op-evt-field-evidence-1',
    };
    return json({
      event: {
        id: 'op-evt-field-evidence-restored-1',
        opportunityId: 'opp-relay-ai-power',
        type: 'field_evidence_restored',
        message: 'Field evidence restored: Relay score for AI Power Relay',
        timestamp: now,
        meta: {
          evidenceId: 'op-evt-field-evidence-1',
          field: 'scores.relayScore',
          source: 'manual_review',
          reason: 'Viewport QA restored manual evidence',
        },
      },
      opportunity: {
        ...mockOpportunity,
        fieldEvidence: {
          ...mockOpportunity.fieldEvidence,
          total: mockOpportunity.fieldEvidence.total + 1,
          sources: [...new Set([...mockOpportunity.fieldEvidence.sources, 'manual_review'])],
          items: [manualEvidence, ...mockOpportunity.fieldEvidence.items],
        },
      },
    }, 201);
  }
  if (routePath === '/opportunities/opp-relay-ai-power/events') return json([]);
  if (routePath === '/opportunities/opp-relay-ai-power') return json(isWorkbenchRecoveryScenario ? failedOpportunity : mockOpportunity);
  if (routePath.startsWith('/opportunities/opp-stress-') && routePath.endsWith('/events')) return json([]);
  if (routePath.startsWith('/opportunities/opp-stress-')) {
    const item = stressOpportunities.find((opportunity) => routePath === `/opportunities/${opportunity.id}`);
    return item ? json(item) : json(null, 404);
  }
  if (routePath === '/opportunities/inbox') {
    return json(scenario === 'workbench-empty'
      ? []
      : isWorkbenchStress
        ? stressInboxItems
        : [isWorkbenchRecoveryScenario ? failedInboxItem : mockInboxItem]);
  }
  if (routePath === '/opportunities/inbox/opp-relay-ai-power') return json(isWorkbenchRecoveryScenario ? failedInboxItem : mockInboxItem);
  if (routePath.startsWith('/opportunities/inbox/opp-stress-')) {
    const item = stressInboxItems.find((opportunity) => routePath === `/opportunities/inbox/${opportunity.id}`)
      || stressOpportunities.find((opportunity) => routePath === `/opportunities/inbox/${opportunity.id}`);
    return item ? json(item) : json(null, 404);
  }
  if (routePath === '/opportunities/board-health') {
    return json(scenario === 'workbench-empty'
      ? emptyBoardHealth()
      : isWorkbenchStress
        ? stressBoardHealth()
        : boardHealth);
  }
  if (routePath === '/opportunity-events') {
    if (scenario === 'workbench-empty') return json([]);
    if (isWorkbenchStress) {
      return json(stressOpportunities.slice(0, 24).map((opportunity, index) => ({
        id: `stress-event-${index + 1}`,
        opportunityId: opportunity.id,
        type: index % 5 === 0 ? 'mission_failed' : 'updated',
        message: `Stress event ${index + 1}: generated event detail should wrap inside event feed without overflow.`,
        timestamp: now,
        meta: {},
      })));
    }
    return json(isWorkbenchRecoveryScenario
      ? [
        { id: 'op-evt-recovery-1', opportunityId: 'opp-relay-ai-power', type: 'mission_failed', message: 'Mission failed and is ready for recovery', timestamp: now, meta: {} },
      ]
      : [
        { id: 'op-evt-1', opportunityId: 'opp-relay-ai-power', type: 'mission_completed', message: 'Review mission completed', timestamp: now, meta: {} },
      ]);
  }
  if (routePath === '/opportunities/graphs/heat-transfer') {
    if (scenario === 'workbench-empty') return json([]);
    if (isWorkbenchStress) {
      return json(stressOpportunities
        .filter((opportunity) => opportunity.type === 'relay_chain')
        .slice(0, 8)
        .map((opportunity, index) => ({
          id: `stress-graph-${index + 1}`,
          theme: opportunity.title,
          leaderTicker: opportunity.leaderTicker,
          leaderScore: 70 + index,
          bottleneckTickers: opportunity.heatProfile?.bottleneckTickers || [],
          laggardTickers: opportunity.heatProfile?.laggardTickers || [],
          junkTickers: [],
          breadthScore: opportunity.heatProfile?.breadthScore || 50,
          relayScore: opportunity.scores.relayScore,
          temperature: opportunity.heatProfile?.temperature || 'warming',
          validationStatus: opportunity.heatProfile?.validationStatus || 'forming',
          validationSummary: opportunity.heatProfile?.validationSummary || 'Stress graph validation.',
          edgeCount: 1,
          edges: [
            {
              id: `stress-edge-${index + 1}`,
              from: opportunity.leaderTicker || 'NVDA',
              to: opportunity.primaryTicker || `QA${index}`,
              weight: 0.6,
              kind: 'leader_to_bottleneck',
              reason: 'Generated stress graph edge.',
            },
          ],
          transmissionSummary: 'Generated stress graph for viewport QA.',
          linkedOpportunityId: opportunity.id,
        })));
    }
    return json([
      {
        id: 'graph-1',
        theme: 'AI infrastructure relay',
        leaderTicker: 'NVDA',
        leaderScore: 92,
        bottleneckTickers: ['VRT', 'ETN'],
        laggardTickers: ['ANET'],
        junkTickers: [],
        breadthScore: 72,
        relayScore: 88,
        temperature: 'hot',
        validationStatus: 'confirmed',
        validationSummary: 'Breadth confirmed in mock data.',
        edgeCount: 2,
        edges: mockOpportunity.heatProfile.edges,
        transmissionSummary: 'Leader heat transmitted into suppliers.',
        linkedOpportunityId: 'opp-relay-ai-power',
      },
    ]);
  }

  if (routePath === '/trendradar/latest') {
    const items = scenario === 'trend-empty'
      ? []
      : scenario === 'trend-stress'
        ? trendStressItems
        : trendItems;
    return json({ date: '2026-05-06', items });
  }
  if (routePath === '/trendradar/dates') return json(['2026-05-06', '2026-05-05']);
  if (routePath === '/trendradar/raw') {
    const items = scenario === 'trend-raw-empty'
      ? []
      : scenario === 'trend-raw-stress'
        ? rawTrendStressItems
        : rawTrendItems;
    return json({ date: '2026-05-06', items });
  }
  if (routePath === '/trendradar/reports') {
    return json(scenario === 'trend-empty' ? [] : [{ date: '2026-05-06', filename: 'report.html', time: '09:30' }]);
  }
  if (routePath === '/trendradar/reports/2026-05-06/report.html') {
    return {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>Mock TrendRadar report</h1><p>Viewport QA report body.</p></body></html>',
    };
  }

  return json({ error: `Unhandled mock API: ${method} ${routePath}` }, 404);
}

async function installApiMocks(page, scenario, liveApi) {
  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/css' },
      body: '',
    });
  });
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await route.abort();
  });

  if (liveApi) return;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestBody = request.method() === 'GET'
      ? null
      : (() => {
        try {
          return request.postDataJSON();
        } catch {
          return null;
        }
      })();
    await route.fulfill(apiPayload(
      url.pathname,
      request.method(),
      url,
      scenario || 'default',
      requestBody,
    ));
  });
}

async function gotoWithRetry(page, url, attempts) {
  let lastError = null;

  for (let attempt = 1; attempt <= navigationMaxAttempts; attempt += 1) {
    const startedAt = performance.now();
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeoutMs,
      });
      attempts.push({
        attempt,
        status: 'ok',
        durationMs: roundMs(performance.now() - startedAt),
      });
      return;
    } catch (error) {
      lastError = error;
      attempts.push({
        attempt,
        status: 'failed',
        durationMs: roundMs(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < navigationMaxAttempts) {
        await page.goto('about:blank', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(navigationRetryDelayMs);
      }
    }
  }

  throw lastError;
}

async function screenshotWithRetry(page, screenshot, attempts) {
  let lastError = null;

  for (let attempt = 1; attempt <= screenshotMaxAttempts; attempt += 1) {
    const startedAt = performance.now();
    try {
      await page.screenshot({
        path: screenshot,
        fullPage: true,
        timeout: screenshotTimeoutMs,
      });
      attempts.push({
        attempt,
        status: 'ok',
        durationMs: roundMs(performance.now() - startedAt),
      });
      return;
    } catch (error) {
      lastError = error;
      attempts.push({
        attempt,
        status: 'failed',
        durationMs: roundMs(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < screenshotMaxAttempts) {
        await page.waitForTimeout(screenshotRetryDelayMs);
      }
    }
  }

  throw lastError;
}

async function warmDashboardRoutes(browser, options, routes) {
  const startedAt = performance.now();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const paths = [...new Set(routes.map((routeDef) => routeDef.path))];
  const issues = [];

  try {
    for (const routePath of paths) {
      const page = await context.newPage();
      await installApiMocks(page, 'default', options.liveApi);
      const attempts = [];
      try {
        await gotoWithRetry(page, `${options.baseUrl}${routePath}`, attempts);
        await page.waitForTimeout(250);
      } catch (error) {
        issues.push({
          path: routePath,
          message: error instanceof Error ? error.message : String(error),
          attempts,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  return {
    enabled: true,
    routeCount: paths.length,
    durationMs: roundMs(performance.now() - startedAt),
    issues,
  };
}

async function applyRouteAction(page, action, options, result) {
  if (!action) return;

  if (action === 'open-workbench-drawer') {
    await assertWorkbenchDrawerFocus(page, result);
    await page.waitForTimeout(900);
    return;
  }

  if (action === 'assert-workbench-recovery-action') {
    await assertWorkbenchRecoveryAction(page, result);
    return;
  }

  if (action === 'assert-workbench-recovery-failure') {
    await assertWorkbenchRecoveryFailure(page, result);
    return;
  }

  if (action === 'scroll-workbench-stress') {
    await page.locator('.op-board-window-status').first().waitFor({ timeout: 5000 });
    await assertWorkbenchVirtualListInteractions(page, result);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.45, behavior: 'instant' }));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.78, behavior: 'instant' }));
    await page.waitForTimeout(500);
    return;
  }

  if (action === 'expand-workbench-stress') {
    await expandWorkbenchStress(page, options.stressExpandRounds, result);
    return;
  }

  if (action === 'assert-watchlist-stress') {
    await assertWatchlistStressInteractions(page, result);
    return;
  }

  if (action === 'assert-trend-raw-stress') {
    await assertTrendRawStressInteractions(page, result);
    return;
  }

  if (action === 'assert-command-diagnostics') {
    await assertCommandDiagnosticsInteractions(page, result);
    return;
  }

  if (action === 'assert-field-registry') {
    await assertFieldRegistryInteractions(page, result);
    return;
  }

  if (action === 'assert-catalyst-reminders') {
    await assertCatalystRemindersInteractions(page, result);
    return;
  }

  if (action === 'assert-pretrade-audit') {
    await assertPreTradeAuditInteractions(page, result);
    return;
  }

  if (action === 'assert-review-playback') {
    await assertReviewPlaybackInteractions(page, result);
    return;
  }

  if (action === 'assert-field-registry-draft') {
    await assertFieldRegistryDraft(page, result);
    return;
  }

  if (action === 'assert-mission-timeline-recovery') {
    await assertMissionTimelineRecovery(page, result);
    return;
  }

  if (action === 'assert-mission-viewer-recovery') {
    await assertMissionViewerRecovery(page, result);
    return;
  }

  if (action === 'assert-mission-viewer-running') {
    await assertMissionViewerRunning(page, result);
    return;
  }

  throw new Error(`Unknown route action: ${action}`);
}

async function activeElementSnapshot(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    return {
      tagName: active.tagName.toLowerCase(),
      className: typeof active.className === 'string' ? active.className : '',
      text: (active.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      action: active.dataset.opportunityAction || null,
      opportunityId: active.closest('[data-opportunity-id]')?.getAttribute('data-opportunity-id') || null,
      ariaLabel: active.getAttribute('aria-label'),
    };
  });
}

async function assertWorkbenchDrawerFocus(page, result) {
  await assertOpportunityDrawerFocus(page, result, {
    detailsButton: page.locator('[data-opportunity-action="details"]').first(),
    idPrefix: 'workbench-drawer',
    leaveOpen: true,
  });

  const startedAt = performance.now();
  const provenance = await page.evaluate(() => {
    const block = document.querySelector('[data-source-provenance]');
    const items = Array.from(document.querySelectorAll('[data-source-provenance-item]')).map((item) => ({
      kind: item.getAttribute('data-source-provenance-item'),
      text: (item.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    return {
      exists: Boolean(block),
      text: (block?.textContent || '').trim().replace(/\s+/g, ' '),
      items,
    };
  });
  if (!provenance.exists || !provenance.text.includes('Source provenance') || !provenance.text.includes('qa')) {
    throw new Error(`workbench drawer should expose source provenance, got ${JSON.stringify(provenance)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-source-provenance',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: provenance,
  });

  const scoreStartedAt = performance.now();
  const scoreEvidence = await page.evaluate(() => {
    const factors = Array.from(document.querySelectorAll('[data-score-factor]')).map((factor) => ({
      id: factor.getAttribute('data-score-factor'),
      text: (factor.textContent || '').trim().replace(/\s+/g, ' '),
      evidenceText: (factor.querySelector('[data-score-factor-evidence]')?.textContent || '').trim().replace(/\s+/g, ' '),
      contributionText: (factor.querySelector('[data-score-factor-contribution]')?.textContent || '').trim().replace(/\s+/g, ' '),
      contributionDirection: Array.from(factor.querySelector('[data-score-factor-contribution]')?.classList || [])
        .find((className) => ['positive', 'negative', 'neutral'].includes(className)) || null,
    }));
    return {
      factorCount: factors.length,
      evidenceCount: document.querySelectorAll('[data-score-factor-evidence]').length,
      contributionCount: document.querySelectorAll('[data-score-factor-contribution]').length,
      factors: factors.filter((factor) => factor.evidenceText),
      contributionFactors: factors.filter((factor) => factor.contributionText),
    };
  });
  if (
    scoreEvidence.evidenceCount < 2
    || !scoreEvidence.factors.some((factor) => factor.evidenceText.includes('viewport-qa'))
    || scoreEvidence.contributionCount < 3
    || !scoreEvidence.contributionFactors.some((factor) => (
      factor.contributionDirection === 'positive' && factor.contributionText.includes('+')
    ))
  ) {
    throw new Error(`workbench drawer should expose score factor evidence refs, got ${JSON.stringify(scoreEvidence)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-score-evidence',
    status: 'passed',
    durationMs: roundMs(performance.now() - scoreStartedAt),
    after: scoreEvidence,
  });

  const fieldEvidenceStartedAt = performance.now();
  const fieldEvidence = await page.evaluate(() => {
    const block = document.querySelector('[data-field-evidence]');
    const filters = Array.from(document.querySelectorAll('[data-field-evidence-filter]')).map((filter) => ({
      id: filter.getAttribute('data-field-evidence-filter'),
      text: (filter.textContent || '').trim().replace(/\s+/g, ' '),
      active: filter.classList.contains('active'),
    }));
    const items = Array.from(document.querySelectorAll('[data-field-evidence-item]')).map((item) => ({
      kind: item.getAttribute('data-field-evidence-item'),
      field: item.getAttribute('data-field-evidence-field'),
      text: (item.textContent || '').trim().replace(/\s+/g, ' '),
      artifactKind: item.querySelector('[data-field-evidence-artifact]')?.getAttribute('data-field-evidence-artifact') || null,
      artifactHref: item.querySelector('[data-field-evidence-artifact]')?.getAttribute('href') || null,
    }));
    return {
      exists: Boolean(block),
      text: (block?.textContent || '').trim().replace(/\s+/g, ' '),
      filters,
      items,
    };
  });
  if (
    !fieldEvidence.exists
    || !fieldEvidence.text.includes('Field evidence')
    || !fieldEvidence.filters.some((filter) => filter.id === 'score')
    || !fieldEvidence.items.some((item) => item.field === 'scores.relayScore')
  ) {
    throw new Error(`workbench drawer should expose field evidence drilldown, got ${JSON.stringify(fieldEvidence)}.`);
  }
  await page.click('[data-field-evidence-filter="score"]');
  const scoreFieldEvidence = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[data-field-evidence-item]')).map((item) => ({
      kind: item.getAttribute('data-field-evidence-item'),
      field: item.getAttribute('data-field-evidence-field'),
      text: (item.textContent || '').trim().replace(/\s+/g, ' '),
      artifactKind: item.querySelector('[data-field-evidence-artifact]')?.getAttribute('data-field-evidence-artifact') || null,
      artifactHref: item.querySelector('[data-field-evidence-artifact]')?.getAttribute('href') || null,
    }));
    return {
      active: document.querySelector('[data-field-evidence-filter="score"]')?.classList.contains('active') || false,
      items,
    };
  });
  if (
    !scoreFieldEvidence.active
    || scoreFieldEvidence.items.length === 0
    || !scoreFieldEvidence.items.every((item) => item.kind === 'score')
    || !scoreFieldEvidence.items.some((item) => item.artifactKind === 'evidence' && item.artifactHref?.includes('/missions/mission-demo?run=run-demo-1'))
  ) {
    throw new Error(`workbench drawer field evidence score filter should narrow refs, got ${JSON.stringify(scoreFieldEvidence)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-field-evidence',
    status: 'passed',
    durationMs: roundMs(performance.now() - fieldEvidenceStartedAt),
    after: scoreFieldEvidence,
  });

  const fieldEvidenceBatchStartedAt = performance.now();
  await page.click('[data-field-evidence-batch-generate]');
  await page.waitForSelector('[data-field-evidence-batch-row]', { timeout: 5000 });
  const fieldEvidenceBatch = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-field-evidence-batch-row]')).map((row) => ({
      field: row.getAttribute('data-field-evidence-batch-row'),
      selected: row.querySelector('input[type="checkbox"]')?.checked || false,
      source: row.querySelector('[data-field-evidence-batch-source]')?.value || '',
      text: (row.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    const submit = document.querySelector('[data-field-evidence-batch-submit]');
    return {
      rowCount: rows.length,
      selectedCount: rows.filter((row) => row.selected).length,
      rows,
      submitDisabled: submit?.hasAttribute('disabled') || false,
    };
  });
  if (
    fieldEvidenceBatch.rowCount === 0
    || fieldEvidenceBatch.selectedCount === 0
    || fieldEvidenceBatch.submitDisabled
    || !fieldEvidenceBatch.rows.some((row) => row.source === 'manual_review')
  ) {
    throw new Error(`workbench drawer should generate batch field evidence drafts, got ${JSON.stringify(fieldEvidenceBatch)}.`);
  }
  await page.click('[data-field-evidence-batch-clear]');

  result.actionChecks.push({
    id: 'workbench-drawer-field-evidence-batch-drafts',
    status: 'passed',
    durationMs: roundMs(performance.now() - fieldEvidenceBatchStartedAt),
    after: fieldEvidenceBatch,
  });

  const fieldEvidenceRecordStartedAt = performance.now();
  await page.selectOption('[data-field-evidence-field-select]', 'scores.relayScore');
  await page.fill('[data-field-evidence-note]', 'Viewport QA manual evidence note');
  await page.click('[data-field-evidence-submit]');
  await page.waitForSelector('[data-field-evidence-feedback]', { timeout: 5000 });
  const fieldEvidenceRecord = await page.evaluate(() => ({
    feedback: (document.querySelector('[data-field-evidence-feedback]')?.textContent || '').trim(),
    firstItem: (document.querySelector('[data-field-evidence-item]')?.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  if (
    !fieldEvidenceRecord.feedback.includes('recorded')
    || !fieldEvidenceRecord.firstItem.includes('manual_review')
  ) {
    throw new Error(`workbench drawer should record manual field evidence, got ${JSON.stringify(fieldEvidenceRecord)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-field-evidence-record',
    status: 'passed',
    durationMs: roundMs(performance.now() - fieldEvidenceRecordStartedAt),
    after: fieldEvidenceRecord,
  });

  const fieldEvidenceInvalidateStartedAt = performance.now();
  await page.click('[data-field-evidence-invalidate="op-evt-field-evidence-1"]');
  await page.fill('[data-field-evidence-invalidate-reason]', 'Viewport QA invalidated manual evidence');
  await page.click('[data-field-evidence-invalidate-submit]');
  await page.waitForFunction(() => (
    (document.querySelector('[data-field-evidence-feedback]')?.textContent || '').includes('invalidated')
  ), null, { timeout: 5000 });
  const fieldEvidenceInvalidate = await page.evaluate(() => ({
    feedback: (document.querySelector('[data-field-evidence-feedback]')?.textContent || '').trim(),
    hasManualEvidence: Array.from(document.querySelectorAll('[data-field-evidence-item]')).some((item) => (
      (item.textContent || '').includes('manual_review')
    )),
    header: (document.querySelector('.field-evidence-head strong')?.textContent || '').trim(),
  }));
  if (
    !fieldEvidenceInvalidate.feedback.includes('invalidated')
    || fieldEvidenceInvalidate.hasManualEvidence
    || !fieldEvidenceInvalidate.header.includes('invalidated')
  ) {
    throw new Error(`workbench drawer should invalidate manual field evidence, got ${JSON.stringify(fieldEvidenceInvalidate)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-field-evidence-invalidate',
    status: 'passed',
    durationMs: roundMs(performance.now() - fieldEvidenceInvalidateStartedAt),
    after: fieldEvidenceInvalidate,
  });

  const fieldEvidenceRestoreStartedAt = performance.now();
  await page.click('[data-field-evidence-audit-filter="invalidated"]');
  await page.click('[data-field-evidence-restore="op-evt-field-evidence-1"]');
  await page.fill('[data-field-evidence-restore-reason]', 'Viewport QA restored manual evidence');
  await page.click('[data-field-evidence-restore-submit]');
  await page.waitForFunction(() => (
    (document.querySelector('[data-field-evidence-feedback]')?.textContent || '').includes('restored')
  ), null, { timeout: 5000 });
  const fieldEvidenceRestore = await page.evaluate(() => ({
    feedback: (document.querySelector('[data-field-evidence-feedback]')?.textContent || '').trim(),
    firstItem: (document.querySelector('[data-field-evidence-item]')?.textContent || '').trim().replace(/\s+/g, ' '),
    restoredEntry: Array.from(document.querySelectorAll('[data-field-evidence-audit-entry]')).some((item) => (
      item.getAttribute('data-field-evidence-audit-entry') === 'restored'
    )),
  }));
  if (
    !fieldEvidenceRestore.feedback.includes('restored')
    || !fieldEvidenceRestore.firstItem.includes('manual_review')
  ) {
    throw new Error(`workbench drawer should restore manual field evidence, got ${JSON.stringify(fieldEvidenceRestore)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-field-evidence-restore',
    status: 'passed',
    durationMs: roundMs(performance.now() - fieldEvidenceRestoreStartedAt),
    after: fieldEvidenceRestore,
  });

  const catalystStartedAt = performance.now();
  const catalystActions = await page.evaluate(() => {
    const reminders = Array.from(document.querySelectorAll('[data-catalyst-reminder]')).map((reminder) => ({
      opportunityId: reminder.getAttribute('data-catalyst-reminder'),
      urgency: reminder.getAttribute('data-catalyst-urgency'),
      action: reminder.getAttribute('data-catalyst-action'),
      text: (reminder.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    return {
      reminderCount: reminders.length,
      reminders,
    };
  });
  if (
    catalystActions.reminderCount < 1
    || !catalystActions.reminders.some((reminder) => reminder.action === 'fill_date' && reminder.text.includes('补日期'))
    || !catalystActions.reminders.some((reminder) => reminder.action === 'review_observed' && reminder.text.includes('复盘观察'))
  ) {
    throw new Error(`workbench drawer should expose catalyst reminder next actions, got ${JSON.stringify(catalystActions)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-catalyst-actions',
    status: 'passed',
    durationMs: roundMs(performance.now() - catalystStartedAt),
    after: catalystActions,
  });

  const catalystSubscriptionStartedAt = performance.now();
  await page.click('.opportunity-drawer [data-catalyst-reminder-subscribe]');
  await page.waitForFunction(() => (
    Boolean(document.querySelector('.opportunity-drawer [data-catalyst-subscription="subscribed"]'))
    && Boolean(document.querySelector('.opportunity-drawer [data-catalyst-audit-trail]'))
  ), null, { timeout: 3000 });
  const catalystSubscription = await page.evaluate(() => {
    const drawer = document.querySelector('.opportunity-drawer');
    const subscribedReminder = drawer?.querySelector('[data-catalyst-subscription="subscribed"]');
    const auditTrail = drawer?.querySelector('[data-catalyst-audit-trail]');
    const subscribedEntry = Array.from(drawer?.querySelectorAll('[data-catalyst-audit-entry]') || [])
      .find((entry) => entry.getAttribute('data-catalyst-audit-preference') === 'subscribe');
    return {
      subscription: subscribedReminder?.getAttribute('data-catalyst-subscription') || null,
      reminderText: (subscribedReminder?.textContent || '').trim().replace(/\s+/g, ' '),
      feedback: (drawer?.querySelector('[data-catalyst-preference-status]')?.textContent || '').trim(),
      auditCount: auditTrail?.getAttribute('data-catalyst-audit-count') || null,
      subscribedCount: auditTrail?.getAttribute('data-catalyst-audit-subscribed') || null,
      auditPreference: subscribedEntry?.getAttribute('data-catalyst-audit-preference') || null,
      auditText: (subscribedEntry?.textContent || '').trim().replace(/\s+/g, ' '),
    };
  });
  if (
    catalystSubscription.subscription !== 'subscribed'
    || catalystSubscription.subscribedCount !== '1'
    || catalystSubscription.auditPreference !== 'subscribe'
    || !catalystSubscription.feedback.includes('订阅已进入事件流')
    || !catalystSubscription.reminderText.includes('3d lead')
    || !catalystSubscription.auditText.includes('Lead 3d')
  ) {
    throw new Error(`workbench drawer should audit catalyst reminder subscriptions, got ${JSON.stringify(catalystSubscription)}.`);
  }
  await page.click('.opportunity-drawer [data-catalyst-reminder-unsubscribe]');
  await page.waitForFunction(() => (
    (document.querySelector('.opportunity-drawer [data-catalyst-preference-status]')?.textContent || '').includes('取消订阅')
    && Boolean(document.querySelector('.opportunity-drawer [data-catalyst-subscription="none"]'))
  ), null, { timeout: 3000 });

  result.actionChecks.push({
    id: 'workbench-drawer-catalyst-subscription-audit',
    status: 'passed',
    durationMs: roundMs(performance.now() - catalystSubscriptionStartedAt),
    after: catalystSubscription,
  });

  const catalystPreferenceStartedAt = performance.now();
  await page.click('.opportunity-drawer [data-catalyst-reminder-acknowledge]');
  await page.waitForFunction(() => (
    document.querySelector('.opportunity-drawer [data-catalyst-preference-status]')
      ?.getAttribute('data-catalyst-preference-status') === 'synced'
  ), null, { timeout: 3000 });
  const handledReminderVisible = await page.evaluate(() => (
    Boolean(document.querySelector('.opportunity-drawer [data-catalyst-preference="acknowledge"]'))
  ));
  if (!handledReminderVisible) {
    await page.click('.opportunity-drawer [data-catalyst-reminder-toggle-suppressed]');
    await page.waitForFunction(() => (
      Boolean(document.querySelector('.opportunity-drawer [data-catalyst-preference="acknowledge"]'))
    ), null, { timeout: 3000 });
  }
  const catalystPreference = await page.evaluate(() => {
    const drawer = document.querySelector('.opportunity-drawer');
    const suppressed = drawer?.querySelector('[data-catalyst-preference="acknowledge"]');
    return {
      feedback: (drawer?.querySelector('[data-catalyst-preference-status]')?.textContent || '').trim(),
      suppressedPreference: suppressed?.getAttribute('data-catalyst-preference') || null,
      suppressedText: (suppressed?.textContent || '').trim().replace(/\s+/g, ' '),
      reopenVisible: Boolean(drawer?.querySelector('[data-catalyst-reminder-reopen]')),
    };
  });
  if (
    catalystPreference.suppressedPreference !== 'acknowledge'
    || !catalystPreference.feedback.includes('已进入事件流')
    || !catalystPreference.reopenVisible
  ) {
    throw new Error(`workbench drawer should audit catalyst reminder preferences, got ${JSON.stringify(catalystPreference)}.`);
  }
  await page.click('.opportunity-drawer [data-catalyst-reminder-reopen]');
  await page.waitForFunction(() => (
    (document.querySelector('.opportunity-drawer [data-catalyst-preference-status]')?.textContent || '').includes('恢复')
  ), null, { timeout: 3000 });

  result.actionChecks.push({
    id: 'workbench-drawer-catalyst-preference-audit',
    status: 'passed',
    durationMs: roundMs(performance.now() - catalystPreferenceStartedAt),
    after: catalystPreference,
  });

  const pretradeStartedAt = performance.now();
  const pretradeCatalyst = await page.evaluate(() => {
    const drawer = document.querySelector('.opportunity-drawer');
    const item = drawer?.querySelector('[data-pretrade-item="catalyst_window"]');
    return {
      status: item?.getAttribute('data-pretrade-status') || null,
      action: item?.getAttribute('data-pretrade-action') || null,
      urgency: item?.getAttribute('data-catalyst-urgency') || null,
      text: (item?.textContent || '').trim().replace(/\s+/g, ' '),
    };
  });
  if (
    pretradeCatalyst.status !== 'block'
    || pretradeCatalyst.action !== 'fill_date'
    || pretradeCatalyst.urgency !== 'missing_date'
    || !pretradeCatalyst.text.includes('补日期')
  ) {
    throw new Error(`workbench drawer should link catalyst action into pre-trade checklist, got ${JSON.stringify(pretradeCatalyst)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-pretrade-catalyst-link',
    status: 'passed',
    durationMs: roundMs(performance.now() - pretradeStartedAt),
    after: pretradeCatalyst,
  });

  const pretradeConfirmStartedAt = performance.now();
  await page.click('.opportunity-drawer [data-pretrade-toggle="catalyst_window"]');
  await page.waitForFunction(() => (
    document.querySelector('.opportunity-drawer [data-pretrade-audit="catalyst_window"]')
      ?.getAttribute('data-pretrade-audit-status') === 'synced'
  ), null, { timeout: 3000 });
  await page.fill('.opportunity-drawer [data-pretrade-evidence="catalyst_window"]', 'viewport QA source confirmed date pending');
  const pretradeProgress = await page.evaluate(() => {
    const drawer = document.querySelector('.opportunity-drawer');
    const item = drawer?.querySelector('[data-pretrade-item="catalyst_window"]');
    const summary = drawer?.querySelector('[data-pretrade-progress-summary]');
    const evidence = drawer?.querySelector('[data-pretrade-evidence="catalyst_window"]');
    const audit = drawer?.querySelector('[data-pretrade-audit="catalyst_window"]');
    const auditTrail = drawer?.querySelector('[data-pretrade-audit-trail]');
    const auditEntry = drawer?.querySelector('[data-pretrade-audit-entry]');
    return {
      confirmed: item?.getAttribute('data-pretrade-confirmed') || null,
      completed: summary?.getAttribute('data-pretrade-completed') || null,
      remaining: summary?.getAttribute('data-pretrade-remaining') || null,
      evidence: evidence instanceof HTMLInputElement ? evidence.value : '',
      audit: audit?.getAttribute('data-pretrade-audit-status') || null,
      auditCount: auditTrail?.getAttribute('data-pretrade-audit-count') || null,
      auditType: auditEntry?.getAttribute('data-pretrade-audit-type') || null,
      auditText: auditTrail?.textContent || '',
      text: (summary?.textContent || '').trim().replace(/\s+/g, ' '),
    };
  });
  if (
    pretradeProgress.confirmed !== 'true'
    || pretradeProgress.completed !== '1'
    || pretradeProgress.remaining !== '0'
    || pretradeProgress.audit !== 'synced'
    || pretradeProgress.auditCount !== '1'
    || pretradeProgress.auditType !== 'pretrade_confirmed'
    || !pretradeProgress.auditText.includes('已进入 Opportunity 事件流')
    || !pretradeProgress.evidence.includes('viewport QA source')
    || !pretradeProgress.text.includes('1/1 confirmed')
  ) {
    throw new Error(`workbench drawer should persist manual pre-trade catalyst confirmation, got ${JSON.stringify(pretradeProgress)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-drawer-pretrade-manual-confirmation',
    status: 'passed',
    durationMs: roundMs(performance.now() - pretradeConfirmStartedAt),
    after: pretradeProgress,
  });
}

async function collectWorkbenchRecoverySnapshot(page, expectedInlineText = '') {
  return page.evaluate((expectedText) => {
    const normalize = (value) => (value || '').trim().replace(/\s+/g, ' ');
    const opportunityNodes = Array.from(document.querySelectorAll('[data-opportunity-id="opp-relay-ai-power"]'));
    const recoveryPanels = Array.from(document.querySelectorAll('.mission-recovery-panel'));
    const quickButtons = Array.from(document.querySelectorAll('.mission-recovery-actions button'))
      .filter((button) => normalize(button.textContent).includes('Quick 重跑'));
    const actionCostTexts = Array.from(document.querySelectorAll('.mission-recovery-action-cost'))
      .map((node) => normalize(node.textContent));
    const topFeedback = document.querySelector('.mission-recovery-feedback');
    const inlineFeedbacks = opportunityNodes.flatMap((node) => (
      Array.from(node.querySelectorAll('.mission-recovery-inline-feedback'))
    ));
    const inlineFeedback = inlineFeedbacks.find((feedback) => (
      expectedText && normalize(feedback.textContent).includes(expectedText)
    )) || inlineFeedbacks[0];
    const opportunityWithFeedback = inlineFeedback?.closest('[data-opportunity-id="opp-relay-ai-power"]')
      || opportunityNodes[0];
    const viewTaskButtons = Array.from(document.querySelectorAll('.mission-recovery-feedback button, .mission-recovery-inline-feedback button'))
      .filter((button) => normalize(button.textContent).includes('查看任务'));

    return {
      opportunityNodeCount: opportunityNodes.length,
      recoveryPanelCount: recoveryPanels.length,
      quickButtonCount: quickButtons.length,
      firstQuickButtonText: normalize(quickButtons[0]?.textContent),
      actionCostTexts,
      topFeedbackText: normalize(topFeedback?.textContent),
      topFeedbackClass: topFeedback?.className || '',
      inlineFeedbackText: normalize(inlineFeedback?.textContent),
      inlineFeedbackClass: inlineFeedback?.className || '',
      inlineFeedbackCount: inlineFeedbacks.length,
      viewTaskButtonCount: viewTaskButtons.length,
      opportunityCardText: normalize(opportunityWithFeedback?.textContent).slice(0, 240),
    };
  }, expectedInlineText);
}

async function assertWorkbenchRecoveryAction(page, result) {
  const startedAt = performance.now();
  const opportunityPanel = page.locator('[data-opportunity-id="opp-relay-ai-power"] .mission-recovery-panel').first();
  const quickRetryButton = page
    .locator('[data-opportunity-id="opp-relay-ai-power"] .mission-recovery-actions button', { hasText: 'Quick 重跑' })
    .first();

  await opportunityPanel.waitFor({ timeout: 5000 });
  const before = await collectWorkbenchRecoverySnapshot(page);
  if (before.recoveryPanelCount < 1 || before.quickButtonCount < 1) {
    throw new Error(`workbench recovery scenario should expose recovery controls, got ${JSON.stringify(before)}.`);
  }
  if (!before.firstQuickButtonText.includes('低成本') || !before.firstQuickButtonText.includes('约 1-3 分钟')) {
    throw new Error(`workbench recovery quick action should expose cost and duration hints, got ${JSON.stringify(before)}.`);
  }
  if (!before.actionCostTexts.some((text) => text.includes('高成本') && text.includes('约 8-15 分钟'))) {
    throw new Error(`workbench recovery deep action should expose high-cost duration hints, got ${JSON.stringify(before)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-recovery-controls-visible',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before,
  });

  const retryRequests = [];
  page.on('request', (request) => {
    if (
      request.url().includes('/api/missions/mission-demo/retry')
      && request.method() === 'POST'
    ) {
      retryRequests.push(request.url());
    }
  });
  const retryResponse = page.waitForResponse((response) => (
    response.url().includes('/api/missions/mission-demo/retry')
    && response.request().method() === 'POST'
  ), { timeout: 5000 });
  await quickRetryButton.evaluate((button) => {
    button.click();
    button.click();
  });
  const response = await retryResponse;
  if (!response.ok()) {
    throw new Error(`workbench recovery retry request failed with ${response.status()}.`);
  }

  await page.locator('.mission-recovery-feedback.success', { hasText: 'Quick 重跑已提交' }).waitFor({ timeout: 5000 });
  await page
    .locator('[data-opportunity-id="opp-relay-ai-power"] .mission-recovery-inline-feedback.success', { hasText: 'Quick 重跑已提交' })
    .first()
    .waitFor({ timeout: 5000 });

  const after = await collectWorkbenchRecoverySnapshot(page, 'Quick 重跑已提交');
  if (!after.topFeedbackText.includes('run-workbench-retry') || !after.topFeedbackText.includes('查看任务')) {
    throw new Error(`workbench recovery top feedback should include retry result and task entry, got ${JSON.stringify(after)}.`);
  }
  if (!after.inlineFeedbackText.includes('Quick 重跑已提交') || !after.inlineFeedbackText.includes('run-workbench-retry')) {
    throw new Error(`workbench recovery card feedback should include retry result, got ${JSON.stringify(after)}.`);
  }
  await page.waitForTimeout(150);
  if (retryRequests.length !== 1) {
    throw new Error(`workbench recovery duplicate clicks should submit exactly one retry request, got ${retryRequests.length}.`);
  }

  result.actionChecks.push({
    id: 'workbench-recovery-top-feedback',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before,
    after,
  });
  result.actionChecks.push({
    id: 'workbench-recovery-inline-feedback',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after,
  });
  result.actionChecks.push({
    id: 'workbench-recovery-view-task-entry',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: {
      viewTaskButtonCount: after.viewTaskButtonCount,
      topFeedbackText: after.topFeedbackText,
      inlineFeedbackText: after.inlineFeedbackText,
    },
  });
  result.actionChecks.push({
    id: 'workbench-recovery-duplicate-click-guard',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: {
      retryRequestCount: retryRequests.length,
      topFeedbackText: after.topFeedbackText,
    },
  });
}

async function assertWorkbenchRecoveryFailure(page, result) {
  const startedAt = performance.now();
  const opportunityPanel = page.locator('[data-opportunity-id="opp-relay-ai-power"] .mission-recovery-panel').first();
  const quickRetryButton = page
    .locator('[data-opportunity-id="opp-relay-ai-power"] .mission-recovery-actions button', { hasText: 'Quick 重跑' })
    .first();

  await opportunityPanel.waitFor({ timeout: 5000 });
  const before = await collectWorkbenchRecoverySnapshot(page);
  if (before.recoveryPanelCount < 1 || before.quickButtonCount < 1) {
    throw new Error(`workbench recovery failure scenario should expose recovery controls, got ${JSON.stringify(before)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-recovery-failure-controls-visible',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before,
  });

  const retryResponse = page.waitForResponse((response) => (
    response.url().includes('/api/missions/mission-demo/retry')
    && response.request().method() === 'POST'
  ), { timeout: 5000 });
  await quickRetryButton.click({ timeout: 4000 });
  const response = await retryResponse;
  if (response.status() !== 503) {
    throw new Error(`workbench recovery failure should receive 503, got ${response.status()}.`);
  }

  await page.locator('.mission-recovery-feedback.error', { hasText: 'Quick 重跑失败' }).waitFor({ timeout: 5000 });
  await page.locator('.mission-recovery-feedback.error', { hasText: '先检查服务' }).waitFor({ timeout: 5000 });
  await page
    .locator('[data-opportunity-id="opp-relay-ai-power"] .mission-recovery-inline-feedback.error', { hasText: '先检查服务' })
    .first()
    .waitFor({ timeout: 5000 });

  const after = await collectWorkbenchRecoverySnapshot(page, '先检查服务');
  if (!after.topFeedbackText.includes('先检查服务') || !after.topFeedbackText.includes('Command Center')) {
    throw new Error(`workbench recovery failure top feedback should include service advice, got ${JSON.stringify(after)}.`);
  }
  if (!after.inlineFeedbackText.includes('先检查服务') || !after.inlineFeedbackText.includes('Quick 重跑')) {
    throw new Error(`workbench recovery failure inline feedback should include retry advice, got ${JSON.stringify(after)}.`);
  }
  if (after.viewTaskButtonCount !== 0) {
    throw new Error(`workbench recovery failure should not show a feedback view-task entry, got ${JSON.stringify(after)}.`);
  }

  result.actionChecks.push({
    id: 'workbench-recovery-failure-top-feedback',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before,
    after,
  });
  result.actionChecks.push({
    id: 'workbench-recovery-failure-inline-feedback',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after,
  });
  result.actionChecks.push({
    id: 'workbench-recovery-failure-no-task-entry',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: {
      viewTaskButtonCount: after.viewTaskButtonCount,
      topFeedbackText: after.topFeedbackText,
      inlineFeedbackText: after.inlineFeedbackText,
    },
  });
}

async function assertOpportunityDrawerFocus(page, result, {
  detailsButton,
  idPrefix,
  leaveOpen = false,
}) {
  const startedAt = performance.now();
  await detailsButton.waitFor({ timeout: 5000 });
  await detailsButton.click({ timeout: 4000 });
  await page.locator('[role="dialog"][aria-label="机会详情"]').waitFor({ timeout: 5000 });
  await page.waitForFunction(() => (
    document.activeElement instanceof HTMLElement
    && document.activeElement.getAttribute('aria-label') === '关闭详情'
  ), null, { timeout: 3000 });

  const focusedInDrawer = await activeElementSnapshot(page);
  if (focusedInDrawer?.ariaLabel !== '关闭详情') {
    throw new Error(`workbench drawer should focus the close button after open, got ${JSON.stringify(focusedInDrawer)}.`);
  }

  result.actionChecks.push({
    id: `${idPrefix}-initial-focus`,
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: focusedInDrawer,
  });

  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"][aria-label="机会详情"]').waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForFunction(() => (
    document.activeElement instanceof HTMLElement
    && document.activeElement.dataset.opportunityAction === 'details'
    && Boolean(document.activeElement.closest('[data-opportunity-id]'))
  ), null, { timeout: 3000 });

  const restoredFocus = await activeElementSnapshot(page);
  if (restoredFocus?.action !== 'details' || !restoredFocus.opportunityId) {
    throw new Error(`workbench drawer should restore focus to the details trigger, got ${JSON.stringify(restoredFocus)}.`);
  }

  result.actionChecks.push({
    id: `${idPrefix}-focus-restoration`,
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: restoredFocus,
  });

  if (leaveOpen) {
    await detailsButton.click({ timeout: 4000 });
    await page.locator('[role="dialog"][aria-label="机会详情"]').waitFor({ timeout: 5000 });
  }
}

async function collectVirtualListSnapshot(listLocator) {
  return listLocator.evaluate((node) => {
    const board = node.closest('.op-board');
    const statusText = (board?.querySelector('.op-board-virtual-status')?.textContent || '')
      .trim()
      .replace(/\s+/g, ' ');
    const rangeMatch = statusText.match(/范围\s+(\d+)-(\d+)/);
    const progressMatch = statusText.match(/进度\s+(\d+)%/);
    const activeMatch = statusText.match(/定位\s+(\d+)\/(\d+)/);
    const firstRow = node.querySelector('.op-board-virtual-row');
    const rowEstimateStyle = firstRow
      ? window.getComputedStyle(firstRow).getPropertyValue('--op-card-intrinsic-size')
      : '';
    const rowEstimate = rowEstimateStyle ? Number.parseFloat(rowEstimateStyle) : null;
    const firstRowHeight = firstRow ? Math.round(firstRow.getBoundingClientRect().height) : null;

    return {
      scrollTop: Math.round(node.scrollTop),
      scrollHeight: Math.round(node.scrollHeight),
      clientHeight: Math.round(node.clientHeight),
      renderedOpportunityCards: node.querySelectorAll('.op-card').length,
      rowEstimate: Number.isFinite(rowEstimate) ? Math.round(rowEstimate) : null,
      firstRowHeight,
      activeDescendant: node.getAttribute('aria-activedescendant'),
      activePosition: activeMatch ? Number(activeMatch[1]) : null,
      activeTotal: activeMatch ? Number(activeMatch[2]) : null,
      statusText,
      rangeStart: rangeMatch ? Number(rangeMatch[1]) : null,
      rangeEnd: rangeMatch ? Number(rangeMatch[2]) : null,
      progress: progressMatch ? Number(progressMatch[1]) : null,
    };
  });
}

function assertVirtualListSnapshot(name, snapshot) {
  if (!snapshot || snapshot.clientHeight <= 0 || snapshot.scrollHeight <= snapshot.clientHeight) {
    throw new Error(`${name}: virtual list is not scrollable.`);
  }
  if (snapshot.renderedOpportunityCards <= 0) {
    throw new Error(`${name}: no opportunity cards are mounted in the virtual list.`);
  }
  if (!snapshot.statusText.includes('挂载') || !snapshot.statusText.includes('进度')) {
    throw new Error(`${name}: virtual list status text is missing mounted/progress details.`);
  }
}

async function assertWorkbenchVirtualListInteractions(page, result) {
  const board = page.locator('.op-board').filter({ has: page.locator('.op-board-virtual-list') }).first();
  const list = board.locator('.op-board-virtual-list').first();
  const metricButton = board.locator('.op-board-health-chips button:not([disabled])').first();
  const startedAt = performance.now();

  await list.waitFor({ timeout: 5000 });
  await assertOpportunityDrawerFocus(page, result, {
    detailsButton: list.locator('[data-opportunity-action="details"]').first(),
    idPrefix: 'workbench-virtual-drawer',
  });

  await list.focus();
  const beforeActiveNavigation = await collectVirtualListSnapshot(list);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  const afterActiveNavigation = await collectVirtualListSnapshot(list);
  if (
    !afterActiveNavigation.activeDescendant
    || !afterActiveNavigation.activePosition
    || (
      beforeActiveNavigation.activePosition
      && afterActiveNavigation.activePosition <= beforeActiveNavigation.activePosition
    )
  ) {
    throw new Error(`workbench virtual ArrowDown should move the active row, got ${JSON.stringify({
      before: beforeActiveNavigation,
      after: afterActiveNavigation,
    })}.`);
  }

  result.actionChecks.push({
    id: 'workbench-virtual-active-arrow-navigation',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: beforeActiveNavigation,
    after: afterActiveNavigation,
    delta: beforeActiveNavigation.activePosition
      ? afterActiveNavigation.activePosition - beforeActiveNavigation.activePosition
      : null,
  });

  await page.keyboard.press('Enter');
  await page.locator('[role="dialog"][aria-label="机会详情"]').waitFor({ timeout: 5000 });
  await page.waitForFunction(() => (
    document.activeElement instanceof HTMLElement
    && document.activeElement.getAttribute('aria-label') === '关闭详情'
  ), null, { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"][aria-label="机会详情"]').waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForFunction(() => (
    document.activeElement instanceof HTMLElement
    && document.activeElement.classList.contains('op-board-virtual-list')
  ), null, { timeout: 3000 });
  const afterEnterRestore = await activeElementSnapshot(page);

  result.actionChecks.push({
    id: 'workbench-virtual-enter-opens-drawer-and-restores-list',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: afterEnterRestore,
  });

  const beforeKeyboard = await collectVirtualListSnapshot(list);
  assertVirtualListSnapshot('workbench virtual list before keyboard scroll', beforeKeyboard);

  await list.focus();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(250);
  const afterKeyboard = await collectVirtualListSnapshot(list);
  const keyboardDelta = afterKeyboard.scrollTop - beforeKeyboard.scrollTop;
  if (keyboardDelta < Math.max(120, Math.round(beforeKeyboard.clientHeight * 0.4))) {
    throw new Error(`workbench virtual keyboard scroll moved only ${keyboardDelta}px.`);
  }
  if (afterKeyboard.rangeStart === beforeKeyboard.rangeStart && afterKeyboard.progress === beforeKeyboard.progress) {
    throw new Error('workbench virtual keyboard scroll did not update range/progress status.');
  }

  result.actionChecks.push({
    id: 'workbench-virtual-keyboard-scroll',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: beforeKeyboard,
    after: afterKeyboard,
    delta: keyboardDelta,
  });

  await metricButton.click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const afterFilter = await collectVirtualListSnapshot(list);
  assertVirtualListSnapshot('workbench virtual list after filter switch', afterFilter);
  if (afterFilter.scrollTop > 8) {
    throw new Error(`workbench virtual filter scope should start at top, got scrollTop=${afterFilter.scrollTop}.`);
  }

  result.actionChecks.push({
    id: 'workbench-virtual-filter-scope-reset',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: afterKeyboard,
    after: afterFilter,
  });

  await board.locator('.op-board-filter-bar button', { hasText: '清除' }).click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const afterRestore = await collectVirtualListSnapshot(list);
  assertVirtualListSnapshot('workbench virtual list after filter clear', afterRestore);
  const restoreDelta = Math.abs(afterRestore.scrollTop - afterKeyboard.scrollTop);
  const restoreTolerance = Math.max(
    24,
    Math.round((afterKeyboard.rowEstimate || beforeKeyboard.rowEstimate || 520) * 0.15),
  );
  if (restoreDelta > restoreTolerance) {
    throw new Error(`workbench virtual scroll restoration drifted by ${restoreDelta}px; tolerance is ${restoreTolerance}px.`);
  }

  result.actionChecks.push({
    id: 'workbench-virtual-scroll-restoration',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: afterFilter,
    after: afterRestore,
    restoredScrollTop: afterRestore.scrollTop,
    expectedScrollTop: afterKeyboard.scrollTop,
    delta: restoreDelta,
    threshold: restoreTolerance,
  });
}

async function expandWorkbenchStress(page, rounds, result) {
  await page.locator('.op-board-window-status').first().waitFor({ timeout: 5000 });
  result.actionMetrics.push({
    round: 0,
    label: 'initial',
    clickedButtons: 0,
    scrolledLists: 0,
    durationMs: 0,
    metrics: await collectDomMetrics(page),
  });

  for (let round = 1; round <= rounds; round += 1) {
    const buttons = await page.locator('.op-board-window-status button').all();
    const startedAt = performance.now();
    let clickedButtons = 0;
    let scrolledLists = 0;

    for (const button of buttons) {
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 3000 });
        clickedButtons += 1;
      }
    }

    if (clickedButtons === 0) {
      scrolledLists = await page.locator('.op-board-virtual-list').evaluateAll((nodes) => {
        let moved = 0;
        for (const node of nodes) {
          const before = node.scrollTop;
          const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
          const delta = Math.max(240, Math.round(node.clientHeight * 0.85));
          node.scrollTop = Math.min(maxScrollTop, before + delta);
          if (node.scrollTop > before + 2) moved += 1;
        }
        return moved;
      });
    }

    await page.waitForTimeout(400);
    result.actionMetrics.push({
      round,
      label: `expand-${round}`,
      clickedButtons,
      scrolledLists,
      durationMs: roundMs(performance.now() - startedAt),
      metrics: await collectDomMetrics(page),
    });

    if (clickedButtons === 0 && scrolledLists === 0) return;
  }
}

async function collectWatchlistSnapshot(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-watchlist-status]')).map((section) => ({
      status: section.getAttribute('data-watchlist-status'),
      title: (section.querySelector('.wl-section-title')?.textContent || '').trim().replace(/\s+/g, ' '),
      visibleCards: section.querySelectorAll('[data-watchlist-card-symbol]').length,
      hasToggle: Boolean(section.querySelector('[data-watchlist-group-toggle]')),
      toggleText: (section.querySelector('[data-watchlist-group-toggle]')?.textContent || '').trim().replace(/\s+/g, ' '),
      symbols: Array.from(section.querySelectorAll('[data-watchlist-card-symbol]')).map((node) => (
        node.getAttribute('data-watchlist-card-symbol')
      )),
    }));

    return {
      bodyHeight: Math.round(document.body.scrollHeight),
      cards: document.querySelectorAll('[data-watchlist-card-symbol]').length,
      sections,
      searchValue: document.querySelector('[data-watchlist-search]')?.value || '',
    };
  });
}

async function assertWatchlistStressInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-watchlist-card-symbol]').first().waitFor({ timeout: 5000 });

  const collapsed = await collectWatchlistSnapshot(page);
  if (collapsed.cards > 30) {
    throw new Error(`watchlist stress should start with grouped preview windows, got ${collapsed.cards} visible cards.`);
  }
  if (!collapsed.sections.length || collapsed.sections.some((section) => section.visibleCards > 9)) {
    throw new Error(`watchlist stress sections should show at most 9 cards while collapsed, got ${JSON.stringify(collapsed.sections)}.`);
  }
  if (!collapsed.sections.some((section) => section.hasToggle)) {
    throw new Error('watchlist stress should expose at least one group toggle.');
  }

  result.actionChecks.push({
    id: 'watchlist-stress-collapsed-preview',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: collapsed,
  });

  const search = page.locator('[data-watchlist-search]').first();
  await search.fill('NVDA0');
  await page.waitForTimeout(200);
  const filtered = await collectWatchlistSnapshot(page);
  if (filtered.cards !== 1 || filtered.sections.length !== 1 || filtered.sections[0].symbols[0] !== 'NVDA0') {
    throw new Error(`watchlist search should filter to NVDA0, got ${JSON.stringify(filtered)}.`);
  }

  result.actionChecks.push({
    id: 'watchlist-stress-search-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: collapsed,
    after: filtered,
  });

  await search.fill('');
  await page.waitForTimeout(200);
  const restored = await collectWatchlistSnapshot(page);
  if (restored.cards !== collapsed.cards) {
    throw new Error(`watchlist clearing search should restore collapsed card count ${collapsed.cards}, got ${restored.cards}.`);
  }

  const toggle = page.locator('[data-watchlist-group-toggle]').first();
  await toggle.click({ timeout: 3000 });
  await page.waitForTimeout(200);
  const expanded = await collectWatchlistSnapshot(page);
  if (expanded.cards <= restored.cards || expanded.bodyHeight < restored.bodyHeight) {
    throw new Error(`watchlist expand should increase visible cards without shrinking page height, got ${JSON.stringify({ restored, expanded })}.`);
  }
  if (!expanded.sections.some((section) => section.visibleCards > 9 && section.toggleText.includes('收起'))) {
    throw new Error(`watchlist expanded group should show more than 9 cards and a collapse label, got ${JSON.stringify(expanded.sections)}.`);
  }

  result.actionChecks.push({
    id: 'watchlist-stress-expand-group',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: restored,
    after: expanded,
    delta: expanded.cards - restored.cards,
  });

  await page.locator('[data-watchlist-group-toggle]').first().click({ timeout: 3000 });
  await page.waitForTimeout(200);
  const recollapsed = await collectWatchlistSnapshot(page);
  if (recollapsed.cards !== restored.cards || recollapsed.bodyHeight > expanded.bodyHeight + 12) {
    throw new Error(`watchlist collapse should restore visible cards without growing beyond expanded height, got ${JSON.stringify({ restored, recollapsed })}.`);
  }

  result.actionChecks.push({
    id: 'watchlist-stress-collapse-group',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: expanded,
    after: recollapsed,
    delta: recollapsed.cards - expanded.cards,
  });
}

async function collectTrendRawSnapshot(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-trend-raw-row]')).map((row) => ({
      id: row.getAttribute('data-trend-raw-id'),
      matched: Number(row.getAttribute('data-trend-raw-matched')),
      source: row.getAttribute('data-trend-raw-source'),
      platform: row.getAttribute('data-trend-raw-platform'),
      text: (row.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    }));
    const scroll = document.querySelector('[data-trend-raw-table-scroll]');
    const tableMetrics = scroll
      ? {
        scrollWidth: Math.round(scroll.scrollWidth),
        clientWidth: Math.round(scroll.clientWidth),
        scrollLeft: Math.round(scroll.scrollLeft),
        tabIndex: scroll.getAttribute('tabindex'),
      }
      : null;

    return {
      bodyHeight: Math.round(document.body.scrollHeight),
      rowCount: rows.length,
      rowIds: rows.map((row) => row.id),
      rows,
      summaryText: (document.querySelector('[data-trend-raw-page-summary]')?.textContent || '').trim().replace(/\s+/g, ' '),
      searchValue: document.querySelector('[data-trend-raw-search]')?.value || '',
      filterValue: document.querySelector('[data-trend-raw-filter]')?.value || '',
      prevDisabled: document.querySelector('[data-trend-raw-page-prev]')?.disabled ?? null,
      nextDisabled: document.querySelector('[data-trend-raw-page-next]')?.disabled ?? null,
      tableMetrics,
    };
  });
}

async function assertTrendRawStressInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-trend-raw-row]').first().waitFor({ timeout: 5000 });

  const initial = await collectTrendRawSnapshot(page);
  if (initial.rowCount !== 80 || !initial.summaryText.includes('1 - 80 / 260')) {
    throw new Error(`trend raw stress should start on the first 80-row page, got ${JSON.stringify(initial)}.`);
  }
  if (initial.prevDisabled !== true || initial.nextDisabled !== false) {
    throw new Error(`trend raw stress initial pagination state is wrong, got ${JSON.stringify(initial)}.`);
  }

  result.actionChecks.push({
    id: 'trend-raw-stress-initial-page',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: initial,
  });

  await page.locator('[data-trend-raw-search]').fill('item 260');
  await page.waitForTimeout(200);
  const searched = await collectTrendRawSnapshot(page);
  if (searched.rowCount !== 1 || searched.rowIds[0] !== '260' || !searched.summaryText.includes('1 - 1 / 1')) {
    throw new Error(`trend raw search should filter to item 260, got ${JSON.stringify(searched)}.`);
  }

  result.actionChecks.push({
    id: 'trend-raw-stress-search-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: initial,
    after: searched,
  });

  await page.locator('[data-trend-raw-search]').fill('');
  await page.locator('[data-trend-raw-filter]').selectOption('rejected');
  await page.waitForTimeout(200);
  const rejected = await collectTrendRawSnapshot(page);
  if (
    rejected.rowCount !== 80
    || !rejected.summaryText.includes('1 - 80 / 87')
    || rejected.rows.some((row) => row.matched !== 0)
  ) {
    throw new Error(`trend raw rejected filter should show the first rejected page only, got ${JSON.stringify(rejected)}.`);
  }

  result.actionChecks.push({
    id: 'trend-raw-stress-status-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: searched,
    after: rejected,
  });

  await page.locator('[data-trend-raw-filter]').selectOption('all');
  await page.waitForTimeout(200);
  await page.locator('[data-trend-raw-page-next]').click({ timeout: 3000 });
  await page.waitForTimeout(200);
  const nextPage = await collectTrendRawSnapshot(page);
  if (
    nextPage.rowCount !== 80
    || nextPage.rowIds[0] !== '81'
    || !nextPage.summaryText.includes('81 - 160 / 260')
    || nextPage.prevDisabled !== false
    || nextPage.nextDisabled !== false
  ) {
    throw new Error(`trend raw next page should move to rows 81-160, got ${JSON.stringify(nextPage)}.`);
  }

  result.actionChecks.push({
    id: 'trend-raw-stress-next-page',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: rejected,
    after: nextPage,
  });

  const tableScroll = page.locator('[data-trend-raw-table-scroll]').first();
  await tableScroll.focus();
  const tableBefore = await collectTrendRawSnapshot(page);
  await tableScroll.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await page.waitForTimeout(80);
  const tableAfter = await collectTrendRawSnapshot(page);
  const canScrollHorizontally = (tableBefore.tableMetrics?.scrollWidth || 0) > (tableBefore.tableMetrics?.clientWidth || 0) + 2;
  if (tableBefore.tableMetrics?.tabIndex !== '0') {
    throw new Error(`trend raw table should be keyboard focusable, got ${JSON.stringify(tableBefore.tableMetrics)}.`);
  }
  if (page.viewportSize()?.width <= 720 && (!canScrollHorizontally || (tableAfter.tableMetrics?.scrollLeft || 0) <= 0)) {
    throw new Error(`trend raw narrow table should scroll horizontally, got ${JSON.stringify({ before: tableBefore.tableMetrics, after: tableAfter.tableMetrics })}.`);
  }

  result.actionChecks.push({
    id: 'trend-raw-stress-table-scroll',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: tableBefore,
    after: tableAfter,
    delta: (tableAfter.tableMetrics?.scrollLeft || 0) - (tableBefore.tableMetrics?.scrollLeft || 0),
  });
}

async function collectCommandDiagnosticsSnapshot(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-command-service]')).map((card) => {
      const service = card.getAttribute('data-command-service');
      const actions = Array.from(card.querySelectorAll('[data-command-action]')).map((action) => (
        action.getAttribute('data-command-action')
      ));

      return {
        service,
        className: typeof card.className === 'string' ? card.className : '',
        title: card.getAttribute('title') || '',
        port: (card.querySelector('.service-port')?.textContent || '').trim().replace(/\s+/g, ' '),
        actionCount: actions.length,
        actions,
        text: (card.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      };
    });

    const actionOverlaps = [];
    for (const card of document.querySelectorAll('[data-command-service]')) {
      const service = card.getAttribute('data-command-service');
      const actions = Array.from(card.querySelectorAll('[data-command-action]'))
        .map((action) => {
          const rect = action.getBoundingClientRect();
          return {
            action: action.getAttribute('data-command-action'),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((rect) => rect.width > 0 && rect.height > 0);

      for (let index = 0; index < actions.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < actions.length; nextIndex += 1) {
          const current = actions[index];
          const next = actions[nextIndex];
          const overlaps = current.left < next.right
            && next.left < current.right
            && current.top < next.bottom
            && next.top < current.bottom;
          if (overlaps) {
            actionOverlaps.push({ service, current, next });
          }
        }
      }
    }

    return {
      cards,
      actionOverlaps,
      submitError: (document.querySelector('[data-command-submit-error]')?.textContent || '').trim().replace(/\s+/g, ' '),
      bodyHeight: Math.round(document.body.scrollHeight),
    };
  });
}

function commandCard(snapshot, service) {
  return snapshot.cards.find((card) => card.service === service);
}

async function clickCommandDiagnosticAction(page, result, action, before) {
  const startedAt = performance.now();
  const button = page.locator(`[data-command-action="${action}"]`).first();
  await button.waitFor({ timeout: 5000 });
  await button.click({ timeout: 4000 });
  await page.waitForTimeout(150);
  const after = await collectCommandDiagnosticsSnapshot(page);
  if (after.submitError) {
    throw new Error(`command diagnostics ${action} should not surface submitError, got "${after.submitError}".`);
  }

  result.actionChecks.push({
    id: `command-diagnostics-${action}-click`,
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before,
    after,
  });

  return after;
}

async function assertCommandDiagnosticsInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-command-service="mission-artifacts"]').waitFor({ timeout: 5000 });

  const initial = await collectCommandDiagnosticsSnapshot(page);
  const requiredServices = [
    'llm',
    'openbb',
    'tradingAgents',
    'trendRadar',
    'db-migrations',
    'mission-canonical',
    'mission-artifacts',
    'opportunity-field-evidence',
    'opportunity-price-history',
  ];
  const missingServices = requiredServices.filter((service) => !commandCard(initial, service));
  if (missingServices.length > 0) {
    throw new Error(`command diagnostics missing service cards: ${missingServices.join(', ')}`);
  }

  const dbMigrations = commandCard(initial, 'db-migrations');
  const canonical = commandCard(initial, 'mission-canonical');
  const artifacts = commandCard(initial, 'mission-artifacts');
  const fieldEvidence = commandCard(initial, 'opportunity-field-evidence');
  const priceHistory = commandCard(initial, 'opportunity-price-history');
  if (!dbMigrations?.className.includes('degraded') || dbMigrations.port !== '8/9') {
    throw new Error(`command diagnostics db migration card should expose degraded 8/9 status, got ${JSON.stringify(dbMigrations)}.`);
  }
  if (!canonical?.className.includes('warning') || !canonical.actions.includes('backfill-canonical')) {
    throw new Error(`command diagnostics canonical card should expose warning + backfill action, got ${JSON.stringify(canonical)}.`);
  }
  if (
    !artifacts?.className.includes('warning')
    || artifacts.port !== '3/6 fix'
    || !artifacts.actions.includes('repair-artifacts')
    || !artifacts.actions.includes('refresh-artifact-integrity')
  ) {
    throw new Error(`command diagnostics artifact card should expose warning + repair/refresh actions, got ${JSON.stringify(artifacts)}.`);
  }
  if (
    !fieldEvidence?.className.includes('degraded')
    || fieldEvidence.port !== '4/7'
    || !fieldEvidence.actions.includes('repair-field-evidence')
    || !fieldEvidence.actions.includes('backfill-field-evidence')
    || !fieldEvidence.actions.includes('inspect-field-evidence')
    || !fieldEvidence.actions.includes('draft-field-registry')
  ) {
    throw new Error(`command diagnostics field evidence card should expose degraded + repair/backfill/manual actions, got ${JSON.stringify(fieldEvidence)}.`);
  }
  if (
    !priceHistory?.className.includes('warning')
    || priceHistory.port !== '66.7%'
    || !priceHistory.actions.includes('refresh-price-history')
  ) {
    throw new Error(`command diagnostics price history card should expose warning coverage + refresh action, got ${JSON.stringify(priceHistory)}.`);
  }

  result.actionChecks.push({
    id: 'command-diagnostics-cards',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: initial,
  });

  if (initial.actionOverlaps.length > 0) {
    throw new Error(`command diagnostics actions should not overlap, got ${JSON.stringify(initial.actionOverlaps)}.`);
  }

  result.actionChecks.push({
    id: 'command-diagnostics-actions-layout',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: {
      actionOverlaps: initial.actionOverlaps,
      actionCards: initial.cards.filter((card) => card.actionCount > 0),
    },
  });

  const afterRepair = await clickCommandDiagnosticAction(page, result, 'repair-artifacts', initial);
  const afterRefresh = await clickCommandDiagnosticAction(page, result, 'refresh-artifact-integrity', afterRepair);
  const afterCanonical = await clickCommandDiagnosticAction(page, result, 'backfill-canonical', afterRefresh);
  const afterFieldRepair = await clickCommandDiagnosticAction(page, result, 'repair-field-evidence', afterCanonical);
  const afterFieldBackfill = await clickCommandDiagnosticAction(page, result, 'backfill-field-evidence', afterFieldRepair);
  await clickCommandDiagnosticAction(page, result, 'refresh-price-history', afterFieldBackfill);
}

async function collectFieldRegistrySnapshot(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-field-registry-row]')).map((row) => ({
      field: row.getAttribute('data-field-registry-row'),
      pressed: row.getAttribute('aria-pressed') === 'true',
      text: (row.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220),
    }));
    const metrics = (document.querySelector('[data-field-registry-metrics]')?.textContent || '').trim().replace(/\s+/g, ' ');
    const editor = document.querySelector('[data-field-registry-editor-page]');
    const diffText = (document.querySelector('[data-field-registry-diff]')?.textContent || '').trim().replace(/\s+/g, ' ');
    const historyRows = Array.from(document.querySelectorAll('[data-field-registry-history-row]')).map((row) => (
      (row.textContent || '').trim().replace(/\s+/g, ' ')
    ));
    return {
      rows,
      metrics,
      editorField: editor?.getAttribute('data-field-registry-editor-page') || '',
      diffText,
      historyRows,
      reportText: (document.querySelector('[data-field-registry-report]')?.textContent || '').trim().replace(/\s+/g, ' '),
      exportText: (document.querySelector('[data-field-registry-export-text]')?.value || '').trim(),
      importText: (document.querySelector('[data-field-registry-import-text]')?.value || '').trim(),
      importResult: (document.querySelector('[data-field-registry-import-result]')?.textContent || '').trim().replace(/\s+/g, ' '),
      bulkError: (document.querySelector('[data-field-registry-bulk-error]')?.textContent || '').trim().replace(/\s+/g, ' '),
      feedback: (document.querySelector('[data-field-registry-feedback]')?.textContent || '').trim().replace(/\s+/g, ' '),
      error: (document.querySelector('[data-field-registry-error]')?.textContent || '').trim().replace(/\s+/g, ' '),
      bodyHeight: Math.round(document.body.scrollHeight),
    };
  });
}

async function assertCatalystRemindersInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-catalyst-reminder-row]').first().waitFor({ timeout: 5000 });
  const initial = await page.evaluate(() => ({
    rowCount: document.querySelectorAll('[data-catalyst-reminder-row]').length,
    activeRows: document.querySelectorAll('[data-catalyst-reminder-active="true"]').length,
    metrics: (document.querySelector('[data-catalyst-reminder-metrics]')?.textContent || '').trim().replace(/\s+/g, ' '),
    exportHref: document.querySelector('[data-catalyst-calendar-export]')?.getAttribute('href') || '',
  }));
  if (
    initial.rowCount < 3
    || initial.activeRows < 1
    || !initial.metrics.includes('Active subscriptions')
    || !initial.exportHref.includes('/api/opportunity-catalyst-reminders.ics')
  ) {
    throw new Error(`catalyst reminders initial state should expose audits and calendar export, got ${JSON.stringify(initial)}.`);
  }

  await page.fill('[data-catalyst-reminder-search]', 'coverage');
  await page.selectOption('[data-catalyst-reminder-preference]', 'subscribe');
  await page.check('[data-catalyst-reminder-active-only]');
  await page.waitForFunction(() => document.querySelectorAll('[data-catalyst-reminder-row]').length === 1, null, { timeout: 5000 });
  const filtered = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-catalyst-reminder-row]')).map((row) => ({
      preference: row.getAttribute('data-catalyst-reminder-row'),
      active: row.getAttribute('data-catalyst-reminder-active'),
      text: (row.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    const href = document.querySelector('[data-catalyst-calendar-export]')?.getAttribute('href') || '';
    return { rows, href };
  });
  if (
    filtered.rows.length !== 1
    || filtered.rows[0]?.preference !== 'subscribe'
    || filtered.rows[0]?.active !== 'true'
    || !filtered.rows[0]?.text.toLowerCase().includes('coverage')
    || !filtered.href.includes('preference=subscribe')
    || !filtered.href.includes('activeOnly=1')
  ) {
    throw new Error(`catalyst reminders filters should narrow active subscriptions and update export URL, got ${JSON.stringify(filtered)}.`);
  }

  result.actionChecks.push({
    id: 'catalyst-reminders-filter-export',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: filtered,
  });
}

async function assertPreTradeAuditInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-pretrade-audit-row]').first().waitFor({ timeout: 5000 });
  const initial = await page.evaluate(() => ({
    rowCount: document.querySelectorAll('[data-pretrade-audit-row]').length,
    blockerRows: document.querySelectorAll('[data-pretrade-audit-row="catalyst_blocker"]').length,
    evidenceRows: document.querySelectorAll('[data-pretrade-audit-row="evidence"]').length,
    metrics: (document.querySelector('[data-pretrade-audit-metrics]')?.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  if (
    initial.rowCount < 4
    || initial.blockerRows < 1
    || initial.evidenceRows < 1
    || !initial.metrics.includes('Blockers')
    || !initial.metrics.includes('Evidence')
  ) {
    throw new Error(`pre-trade audit initial state should expose checks, blockers, evidence, and metrics, got ${JSON.stringify(initial)}.`);
  }

  await page.fill('[data-pretrade-audit-search]', 'coverage');
  await page.selectOption('[data-pretrade-audit-category]', 'catalyst_blocker');
  await page.selectOption('[data-pretrade-audit-status]', 'block');
  await page.waitForFunction(() => document.querySelectorAll('[data-pretrade-audit-row]').length === 1, null, { timeout: 5000 });
  const filtered = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-pretrade-audit-row]')).map((row) => ({
      category: row.getAttribute('data-pretrade-audit-row'),
      status: row.getAttribute('data-pretrade-audit-status'),
      text: (row.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    return {
      rows,
      metrics: (document.querySelector('[data-pretrade-audit-metrics]')?.textContent || '').trim().replace(/\s+/g, ' '),
    };
  });
  if (
    filtered.rows.length !== 1
    || filtered.rows[0]?.category !== 'catalyst_blocker'
    || filtered.rows[0]?.status !== 'block'
    || !filtered.rows[0]?.text.toLowerCase().includes('coverage')
    || !filtered.metrics.includes('Blockers')
  ) {
    throw new Error(`pre-trade audit filters should narrow blocker rows, got ${JSON.stringify(filtered)}.`);
  }

  result.actionChecks.push({
    id: 'pretrade-audit-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: filtered,
  });
}

async function assertReviewPlaybackInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-review-playback-row]').first().waitFor({ timeout: 5000 });
  const initial = await page.evaluate(() => ({
    rowCount: document.querySelectorAll('[data-review-playback-row]').length,
    missionRows: document.querySelectorAll('[data-review-playback-row="mission"]').length,
    evidenceRows: document.querySelectorAll('[data-review-playback-row="evidence"]').length,
    riskRows: document.querySelectorAll('[data-review-playback-tone="negative"]').length,
    outcome: document.querySelector('[data-review-playback-outcome]')?.getAttribute('data-review-playback-outcome') || '',
    outcomeText: (document.querySelector('[data-review-playback-outcome]')?.textContent || '').trim().replace(/\s+/g, ' '),
    performance: document.querySelector('[data-review-playback-performance]')?.getAttribute('data-review-playback-performance') || '',
    performanceText: (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' '),
    workspace: document.querySelector('[data-review-playback-backtest-workspace]')?.getAttribute('data-review-playback-backtest-workspace') || '',
    workspaceText: (document.querySelector('[data-review-playback-backtest-workspace]')?.textContent || '').trim().replace(/\s+/g, ' '),
    metrics: (document.querySelector('[data-review-playback-metrics]')?.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  if (
    initial.rowCount < 5
    || initial.missionRows < 1
    || initial.evidenceRows < 1
    || initial.riskRows < 3
    || initial.outcome !== 'blocked'
    || !initial.outcomeText.includes('执行前阻塞')
    || initial.performance !== 'multi_opportunity'
    || !initial.performanceText.includes('Performance / Risk')
    || !initial.performanceText.includes('选择单个 Opportunity')
    || !initial.performanceText.includes('Return')
    || !initial.performanceText.includes('Max DD proxy')
    || !initial.performanceText.includes('Price cache')
    || !initial.performanceText.includes('Strategy backtest')
    || !initial.performanceText.includes('All history')
    || !initial.performanceText.includes('Best strategy')
    || !initial.performanceText.includes('Proxy narrative')
    || !initial.performanceText.includes('Risk backtest')
    || !initial.performanceText.includes('Backtest slices')
    || !initial.performanceText.includes('Relay chain')
    || initial.workspace !== 'repair'
    || !initial.workspaceText.includes('Backtest Workspace')
    || !initial.workspaceText.includes('Readiness')
    || !initial.workspaceText.includes('Do not scale')
    || !initial.metrics.includes('Mission')
    || !initial.metrics.includes('Risk')
  ) {
    throw new Error(`review playback initial state should expose mission, evidence, risk rows, outcome, performance, and metrics, got ${JSON.stringify(initial)}.`);
  }

  await page.fill('[data-review-playback-backtest-ticker]', 'AAOI');
  await page.selectOption('[data-review-playback-backtest-strategy]', 'relay_chain');
  await page.fill('[data-review-playback-backtest-from]', '2026-05-01');
  await page.fill('[data-review-playback-backtest-to]', '2026-05-03');
  await page.waitForFunction(() => {
    const text = (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' ');
    return text.includes('Strategy Relay chain') && text.includes('Ticker AAOI') && text.includes('From 2026-05-01') && text.includes('To 2026-05-03');
  }, null, { timeout: 5000 });
  const backtestFiltered = await page.evaluate(() => ({
    performanceText: (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' '),
    workspaceText: (document.querySelector('[data-review-playback-backtest-workspace]')?.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  if (
    !backtestFiltered.performanceText.includes('Strategy backtest')
    || !backtestFiltered.performanceText.includes('Strategy Relay chain')
    || !backtestFiltered.performanceText.includes('Ticker AAOI')
    || !backtestFiltered.performanceText.includes('From 2026-05-01')
    || !backtestFiltered.performanceText.includes('To 2026-05-03')
    || !backtestFiltered.workspaceText.includes('Backtest Workspace')
    || !backtestFiltered.workspaceText.includes('Strategy Relay chain')
  ) {
    throw new Error(`review playback backtest filters should update strategy backtest summary, got ${JSON.stringify(backtestFiltered)}.`);
  }
  result.actionChecks.push({
    id: 'review-playback-backtest-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: backtestFiltered,
  });

  await page.fill('[data-review-playback-saved-view-label]', 'Relay AAOI May');
  await page.click('[data-review-playback-save-view]');
  await page.waitForFunction(() => (
    (document.querySelector('[data-review-playback-saved-view-feedback]')?.textContent || '').includes('已保存')
  ), null, { timeout: 5000 });
  await page.click('[data-review-playback-clear-filters]');
  await page.waitForFunction(() => {
    const text = (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' ');
    return text.includes('All history') && !text.includes('Strategy Relay chain');
  }, null, { timeout: 5000 });
  await page.click('[data-review-playback-apply-view]');
  await page.waitForFunction(() => {
    const text = (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' ');
    return text.includes('Strategy Relay chain') && text.includes('Ticker AAOI');
  }, null, { timeout: 5000 });
  await page.click('[data-review-playback-delete-view]');
  await page.waitForFunction(() => (
    (document.querySelector('[data-review-playback-saved-view-feedback]')?.textContent || '').includes('已删除')
  ), null, { timeout: 5000 });
  const savedViewState = await page.evaluate(() => ({
    feedback: (document.querySelector('[data-review-playback-saved-view-feedback]')?.textContent || '').trim(),
    optionCount: document.querySelectorAll('[data-review-playback-saved-view-select] option').length,
    performanceText: (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  if (
    !savedViewState.feedback.includes('已删除')
    || !savedViewState.performanceText.includes('Strategy Relay chain')
    || !savedViewState.performanceText.includes('Ticker AAOI')
  ) {
    throw new Error(`review playback saved view controls should save, clear, apply, and delete filters, got ${JSON.stringify(savedViewState)}.`);
  }
  result.actionChecks.push({
    id: 'review-playback-saved-view',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: savedViewState,
  });

  await page.fill('[data-review-playback-search]', 'timeout');
  await page.selectOption('[data-review-playback-category]', 'mission');
  await page.selectOption('[data-review-playback-tone]', 'negative');
  await page.waitForFunction(() => document.querySelectorAll('[data-review-playback-row]').length === 1, null, { timeout: 5000 });
  const filtered = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-review-playback-row]')).map((row) => ({
      category: row.getAttribute('data-review-playback-row'),
      tone: row.getAttribute('data-review-playback-tone'),
      text: (row.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    return {
      rows,
      performanceText: (document.querySelector('[data-review-playback-performance]')?.textContent || '').trim().replace(/\s+/g, ' '),
      metrics: (document.querySelector('[data-review-playback-metrics]')?.textContent || '').trim().replace(/\s+/g, ' '),
    };
  });
  if (
    filtered.rows.length !== 1
    || filtered.rows[0]?.category !== 'mission'
    || filtered.rows[0]?.tone !== 'negative'
    || !filtered.rows[0]?.text.toLowerCase().includes('timeout')
	    || !filtered.performanceText.includes('Stale')
	    || !filtered.performanceText.includes('刷新来源')
	    || !filtered.performanceText.includes('Strategy backtest')
	    || !filtered.performanceText.includes('Best strategy')
		    || !filtered.performanceText.includes('Position sizing')
		    || !filtered.performanceText.includes('Sizing rules')
		    || !filtered.performanceText.includes('Scaled down')
		    || !filtered.performanceText.includes('Open exposure')
		    || !filtered.performanceText.includes('Risk backtest')
		    || !filtered.performanceText.includes('Unfavorable')
		    || !filtered.performanceText.includes('Exit attribution')
	    || !filtered.performanceText.includes('Risk reduction')
		    || !filtered.performanceText.includes('Execution quality')
		    || !filtered.performanceText.includes('Early exit')
		    || !filtered.performanceText.includes('Plan repairs')
		    || !filtered.performanceText.includes('Add stop loss')
		    || !filtered.performanceText.includes('Trade legs')
	    || !filtered.performanceText.includes('Partial')
	    || !filtered.performanceText.includes('AAOI')
    || !filtered.metrics.includes('Mission')
  ) {
    throw new Error(`review playback filters should narrow mission risk rows, got ${JSON.stringify(filtered)}.`);
  }

  result.actionChecks.push({
    id: 'review-playback-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: filtered,
  });
}

async function assertFieldRegistryInteractions(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-field-registry-row]').first().waitFor({ timeout: 5000 });
  const initial = await collectFieldRegistrySnapshot(page);
  if (
    initial.rows.length < 3 ||
    !initial.metrics.includes('Overrides') ||
    !initial.diffText.includes('viewport_qa_registry') ||
    !initial.reportText.includes('Override coverage')
  ) {
    throw new Error(`field registry initial state should expose rows, metrics, override diff, and report, got ${JSON.stringify(initial)}.`);
  }

  await page.locator('[data-field-registry-export]').click();
  await page.waitForTimeout(80);
  const afterExport = await collectFieldRegistrySnapshot(page);
  if (!afterExport.exportText.includes('"version": 1') || !afterExport.exportText.includes('scores.relayScore')) {
    throw new Error(`field registry export should generate backup JSON, got ${JSON.stringify(afterExport)}.`);
  }

  await page.locator('[data-field-registry-import-sample]').click();
  await page.waitForTimeout(50);
  await page.locator('[data-field-registry-import-run]').click();
  await page.locator('[data-field-registry-import-result]').waitFor({ timeout: 5000 });
  const afterImport = await collectFieldRegistrySnapshot(page);
  if (!afterImport.importResult.includes('Dry-run') || !afterImport.importResult.includes('updated') || afterImport.bulkError) {
    throw new Error(`field registry import dry-run should show result without errors, got ${JSON.stringify(afterImport)}.`);
  }

  const search = page.locator('[data-field-registry-search]');
  await search.fill('custom.executionGate');
  await page.waitForTimeout(80);
  const searched = await collectFieldRegistrySnapshot(page);
  if (searched.rows.length !== 1 || searched.rows[0]?.field !== 'custom.executionGate') {
    throw new Error(`field registry search should isolate custom execution gate, got ${JSON.stringify(searched)}.`);
  }

  await search.fill('');
  await page.locator('[data-field-registry-scope-filter]').selectOption('overridden');
  await page.waitForTimeout(80);
  const overridden = await collectFieldRegistrySnapshot(page);
  if (overridden.rows.length < 2 || overridden.rows.some((row) => row.text.includes('base defaults'))) {
    throw new Error(`field registry overridden scope should only show override rows, got ${JSON.stringify(overridden)}.`);
  }

  await page.locator('[data-field-registry-row="scores.relayScore"]').click();
  await page.locator('[data-field-registry-label-page]').fill('Relay QA score');
  await page.locator('[data-field-registry-save-page]').click();
  await page.locator('[data-field-registry-feedback]').waitFor({ timeout: 5000 });
  const afterSave = await collectFieldRegistrySnapshot(page);
  if (!afterSave.feedback.includes('saved') || afterSave.error) {
    throw new Error(`field registry save should show success feedback, got ${JSON.stringify(afterSave)}.`);
  }

  await page.locator('[data-field-registry-reset-page]').click();
  await page.locator('[data-field-registry-feedback]').waitFor({ timeout: 5000 });
  const afterReset = await collectFieldRegistrySnapshot(page);
  if (!afterReset.feedback.includes('reset') || afterReset.error) {
    throw new Error(`field registry reset should show success feedback, got ${JSON.stringify(afterReset)}.`);
  }

  result.actionChecks.push({
    id: 'field-registry-interactions',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: initial,
    after: afterReset,
  });
}

async function assertFieldRegistryDraft(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-field-registry-import-text]').waitFor({ timeout: 5000 });
  const initial = await collectFieldRegistrySnapshot(page);
  if (!initial.importText.includes('custom.unfieldedEvidence') || !initial.importText.includes('manual_event_repair')) {
    throw new Error(`field registry draft route should hydrate import text from URL, got ${JSON.stringify(initial)}.`);
  }

  await page.locator('[data-field-registry-import-run]').click();
  await page.locator('[data-field-registry-import-result]').waitFor({ timeout: 5000 });
  const after = await collectFieldRegistrySnapshot(page);
  if (!after.importResult.includes('Dry-run') || after.bulkError) {
    throw new Error(`field registry draft dry-run should complete, got ${JSON.stringify(after)}.`);
  }

  result.actionChecks.push({
    id: 'field-registry-draft-import',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: initial,
    after,
  });
}

async function collectMissionTimelineSnapshot(page) {
  return page.evaluate(() => {
    const filters = Array.from(document.querySelectorAll('[data-mission-timeline-filter]')).map((filter) => ({
      id: filter.getAttribute('data-mission-timeline-filter'),
      pressed: filter.getAttribute('aria-pressed') === 'true',
      text: (filter.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    const items = Array.from(document.querySelectorAll('[data-mission-timeline-item]')).map((item) => {
      const recoveryAudit = item.querySelector('[data-mission-recovery-audit]');
      return {
        id: item.getAttribute('data-mission-id'),
        type: item.getAttribute('data-mission-type'),
        status: item.getAttribute('data-mission-status'),
        query: (item.querySelector('.tc-query')?.textContent || '').trim().replace(/\s+/g, ' '),
        meta: (item.querySelector('.tc-meta')?.textContent || '').trim().replace(/\s+/g, ' '),
        hasCompare: Boolean(item.querySelector('[data-mission-timeline-action="compare"]')),
        hasRecoveryAudit: Boolean(recoveryAudit),
        recoveryAuditAction: recoveryAudit?.getAttribute('data-mission-recovery-audit') || null,
        recoveryAuditText: (recoveryAudit?.textContent || '').trim().replace(/\s+/g, ' '),
        text: (item.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 260),
      };
    });

    return {
      itemCount: items.length,
      filters,
      items,
      failedItems: items.filter((item) => item.status === 'failed'),
      recoveryItems: items.filter((item) => item.hasRecoveryAudit),
      bodyHeight: Math.round(document.body.scrollHeight),
    };
  });
}

async function assertMissionTimelineRecovery(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-mission-timeline-item]').first().waitFor({ timeout: 5000 });

  const snapshot = await collectMissionTimelineSnapshot(page);
  const failed = snapshot.failedItems[0];
  if (!failed) {
    throw new Error(`mission timeline recovery scenario should expose a failed mission, got ${JSON.stringify(snapshot)}.`);
  }
  if (!failed.hasCompare || !failed.meta.includes('failed:analyst')) {
    throw new Error(`failed mission should expose compare action and run failure metadata, got ${JSON.stringify(failed)}.`);
  }
  if (!failed.hasRecoveryAudit || !failed.recoveryAuditText.includes('复用恢复') || !failed.recoveryAuditText.includes('低成本')) {
    throw new Error(`failed mission should expose the latest recovery audit and cost hint, got ${JSON.stringify(failed)}.`);
  }

  result.actionChecks.push({
    id: 'mission-timeline-failed-recovery-card',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: snapshot,
  });

  const filterStartedAt = performance.now();
  await page.locator('[data-mission-timeline-filter="recovery"]').click();
  const filteredSnapshot = await collectMissionTimelineSnapshot(page);
  const recoveryFilter = filteredSnapshot.filters.find((filter) => filter.id === 'recovery');
  if (!recoveryFilter?.pressed || filteredSnapshot.itemCount < 1 || filteredSnapshot.recoveryItems.length !== filteredSnapshot.itemCount) {
    throw new Error(`recovery filter should keep only recovery-audited missions, got ${JSON.stringify(filteredSnapshot)}.`);
  }

  result.actionChecks.push({
    id: 'mission-timeline-recovery-filter',
    status: 'passed',
    durationMs: roundMs(performance.now() - filterStartedAt),
    after: filteredSnapshot,
  });
}

async function collectMissionViewerSnapshot(page) {
  return page.evaluate(() => {
    const recoveryActions = Array.from(document.querySelectorAll('[data-mission-recovery-action]')).map((action) => ({
      id: action.getAttribute('data-mission-recovery-action'),
      kind: action.getAttribute('data-mission-recovery-kind'),
      text: (action.textContent || '').trim().replace(/\s+/g, ' '),
      disabled: action.disabled === true,
    }));
    const runs = Array.from(document.querySelectorAll('[data-mission-run]')).map((run) => ({
      id: run.getAttribute('data-mission-run'),
      status: run.getAttribute('data-run-status'),
      text: (run.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    const executionBanner = document.querySelector('[data-mission-execution-banner]');
    const executionActions = Array.from(document.querySelectorAll('[data-mission-viewer-action]')).map((action) => ({
      action: action.getAttribute('data-mission-viewer-action'),
      taskId: action.getAttribute('data-mission-task-id'),
      text: (action.textContent || '').trim().replace(/\s+/g, ' '),
      disabled: action.disabled === true,
    }));
    const traceOutputs = Array.from(document.querySelectorAll('[data-trace-output]')).map((output) => {
      const rect = output.getBoundingClientRect();
      return {
        textLength: (output.textContent || '').length,
        scrollWidth: Math.round(output.scrollWidth),
        clientWidth: Math.round(output.clientWidth),
        width: Math.round(rect.width),
      };
    });

    return {
      title: (document.querySelector('.viewer-title h1')?.textContent || '').trim().replace(/\s+/g, ' '),
      statusText: (document.querySelector('.status-pill')?.textContent || '').trim().replace(/\s+/g, ' '),
      recoveryVisible: Boolean(document.querySelector('[data-mission-recovery-banner]')),
      recoveryActions,
      executionVisible: Boolean(executionBanner),
      executionStatus: executionBanner?.getAttribute('data-mission-run-status') || null,
      executionStale: executionBanner?.getAttribute('data-mission-run-stale') || null,
      executionText: (executionBanner?.textContent || '').trim().replace(/\s+/g, ' '),
      executionActions,
      retryDisabled: document.querySelector('[data-mission-viewer-action="retry"]')?.disabled ?? null,
      runs,
      traceStepCount: document.querySelectorAll('[data-trace-step]').length,
      traceOutputs,
      compareError: (document.querySelector('[data-run-compare-error]')?.textContent || '').trim().replace(/\s+/g, ' '),
      actionError: (document.querySelector('[data-mission-action-error]')?.textContent || '').trim().replace(/\s+/g, ' '),
      urlPath: `${window.location.pathname}${window.location.search}`,
      bodyHeight: Math.round(document.body.scrollHeight),
    };
  });
}

async function assertMissionViewerRecovery(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-mission-recovery-banner]').waitFor({ timeout: 5000 });
  await page.locator('[data-trace-step]').first().waitFor({ timeout: 5000 });
  await page.locator('[data-run-compare-error]').waitFor({ timeout: 5000 });

  const initial = await collectMissionViewerSnapshot(page);
  const actionIds = initial.recoveryActions.map((action) => action.id);
  if (initial.statusText !== 'FAILED') {
    throw new Error(`mission viewer recovery scenario should render FAILED status, got ${JSON.stringify(initial)}.`);
  }
  if (!initial.recoveryVisible || !actionIds.includes('inspect_trace') || !actionIds.includes('retry_quick') || !actionIds.includes('check_services')) {
    throw new Error(`mission viewer recovery actions missing, got ${JSON.stringify(initial.recoveryActions)}.`);
  }
  if (!initial.runs.some((run) => run.status === 'failed') || initial.traceStepCount < 8 || !initial.compareError) {
    throw new Error(`mission viewer should show failed runs, long trace, and missing baseline evidence error, got ${JSON.stringify(initial)}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-recovery-surface',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: initial,
  });

  await page.locator('[data-mission-recovery-action="inspect_trace"]').click({ timeout: 4000 });
  await page.waitForTimeout(150);
  const afterInspect = await collectMissionViewerSnapshot(page);
  if (afterInspect.actionError) {
    throw new Error(`mission viewer inspect trace should not surface an action error, got ${afterInspect.actionError}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-inspect-trace-action',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: initial,
    after: afterInspect,
  });

  await page.locator('[data-mission-viewer-action="retry"]').click({ timeout: 4000 });
  await page.waitForTimeout(250);
  const afterRetry = await collectMissionViewerSnapshot(page);
  if (afterRetry.actionError) {
    throw new Error(`mission viewer retry button should not surface an action error, got ${afterRetry.actionError}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-retry-click',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: afterInspect,
    after: afterRetry,
  });

  await page.locator('[data-mission-recovery-action="check_services"]').click({ timeout: 4000 });
  await page.waitForURL('**/command-center', { timeout: 5000 });
  await page.locator('[data-command-service="db-migrations"]').waitFor({ timeout: 5000 });
  const afterDiagnostic = await collectCommandDiagnosticsSnapshot(page);
  if (!commandCard(afterDiagnostic, 'db-migrations')) {
    throw new Error(`mission viewer diagnostics action should navigate to Command Center, got ${JSON.stringify(afterDiagnostic)}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-diagnostics-navigation',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: afterDiagnostic,
  });
}

async function assertMissionViewerRunning(page, result) {
  const startedAt = performance.now();
  await page.locator('[data-mission-execution-banner]').waitFor({ timeout: 5000 });
  await page.locator('[data-mission-viewer-action="cancel-active-run"]').waitFor({ timeout: 5000 });

  const initial = await collectMissionViewerSnapshot(page);
  const cancelActions = initial.executionActions.filter((action) => action.action?.startsWith('cancel-active-run'));
  if (initial.statusText !== 'MAIN RUNNING') {
    throw new Error(`mission viewer running scenario should render MAIN RUNNING status, got ${JSON.stringify(initial)}.`);
  }
  if (!initial.executionVisible || initial.executionStatus !== 'running' || initial.executionStale !== 'true') {
    throw new Error(`mission viewer should expose stale running execution banner, got ${JSON.stringify(initial)}.`);
  }
  if (cancelActions.length < 2 || cancelActions.some((action) => action.taskId !== 'task-running-demo' || action.disabled)) {
    throw new Error(`mission viewer should expose enabled cancel controls with task id, got ${JSON.stringify(cancelActions)}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-running-cancel-surface',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: initial,
  });

  await page.locator('[data-mission-viewer-action="cancel-active-run-inline"]').click({ timeout: 4000 });
  await page.waitForTimeout(250);
  const afterCancel = await collectMissionViewerSnapshot(page);
  if (afterCancel.actionError) {
    throw new Error(`mission viewer cancel action should not surface an error, got ${afterCancel.actionError}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-running-cancel-click',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    before: initial,
    after: afterCancel,
  });

  await page.locator('[data-mission-viewer-action="open-command-center"]').click({ timeout: 4000 });
  await page.waitForURL('**/command-center', { timeout: 5000 });
  await page.locator('.today-summary').waitFor({ timeout: 5000 });
  const afterNavigation = {
    urlPath: await page.evaluate(() => window.location.pathname),
    hasCommandCenter: await page.locator('.today-summary').count(),
  };
  if (afterNavigation.urlPath !== '/command-center' || afterNavigation.hasCommandCenter === 0) {
    throw new Error(`mission viewer command-center action should navigate to queue controls, got ${JSON.stringify(afterNavigation)}.`);
  }

  result.actionChecks.push({
    id: 'mission-viewer-running-command-center-navigation',
    status: 'passed',
    durationMs: roundMs(performance.now() - startedAt),
    after: afterNavigation,
  });
}

async function inspectLayout(page, viewport) {
  return page.evaluate(({ width, height }) => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0
        && rect.bottom >= 0
        && rect.right >= 0
        && rect.top <= height
        && rect.left <= width;
    };

    const describe = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      };
    };

    const clippedByHorizontalScroller = (element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        const clipsInline = ['auto', 'scroll', 'hidden'].includes(style.overflowX);
        if (
          clipsInline
          && rect.left >= -2
          && rect.right <= width + 2
          && rect.width > 0
        ) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };

    const overflowing = Array.from(document.querySelectorAll('body *'))
      .filter(visible)
      .filter((element) => !clippedByHorizontalScroller(element))
      .map(describe)
      .filter((item) => item.left < -2 || item.right > width + 2)
      .slice(0, 12);

    const textOverflow = Array.from(document.querySelectorAll('button, a, .tc-query, .hit-title, .p-title, .opportunity-card-title, .op-card-title, h1, h2, h3'))
      .filter(visible)
      .map((element) => ({
        ...describe(element),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }))
      .filter((item) => item.scrollWidth > item.clientWidth + 3)
      .slice(0, 12);

    return {
      viewport: { width, height },
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > width + 2,
      overflowing,
      textOverflow,
    };
  }, viewport);
}

async function collectDomMetrics(page) {
  return page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('body *'));
    const visibleElements = allElements.filter((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    });

    return {
      nodeCount: document.querySelectorAll('*').length,
      bodyNodeCount: allElements.length,
      visibleNodeCount: visibleElements.length,
      documentHeight: Math.round(document.documentElement.scrollHeight),
      bodyHeight: Math.round(document.body.scrollHeight),
      maxScrollY: Math.round(Math.max(0, document.documentElement.scrollHeight - window.innerHeight)),
      renderedOpportunityCards: document.querySelectorAll('.op-card').length,
      renderedInboxCards: document.querySelectorAll('.today-card').length,
      boardWindowStatusCount: document.querySelectorAll('.op-board-window-status').length,
      buttons: document.querySelectorAll('button').length,
      links: document.querySelectorAll('a').length,
      inputs: document.querySelectorAll('input, select, textarea').length,
    };
  });
}

async function collectPageMetrics(page, screenshot) {
  const domMetrics = await collectDomMetrics(page);
  let screenshotBytes = 0;
  try {
    screenshotBytes = statSync(screenshot).size;
  } catch {
    screenshotBytes = 0;
  }

  return {
    ...domMetrics,
    screenshotBytes,
  };
}

function roundMs(value) {
  return Math.round(value);
}

function hasLayoutIssue(result) {
  return Boolean(
    result.navigationError
      || result.layout?.horizontalOverflow
      || result.layout?.overflowing?.length
      || result.layout?.textOverflow?.length
      || result.consoleIssues?.length,
  );
}

function filterExpectedConsoleIssues(routeName, consoleIssues) {
  if (routeName !== 'workbench-recovery-failure') return;
  const filtered = consoleIssues.filter((issue) => !(
    issue.includes('Failed to load resource')
    && issue.includes('503')
    && issue.includes('Service Unavailable')
  ));
  consoleIssues.splice(0, consoleIssues.length, ...filtered);
}

function buildPerformanceSummary(results) {
  const measured = results.filter((item) => item.performance && item.metrics);
  const byTotalMs = [...measured]
    .sort((a, b) => b.performance.totalMs - a.performance.totalMs)
    .slice(0, 5)
    .map((item) => ({
      route: item.route,
      viewport: item.viewport,
      totalMs: item.performance.totalMs,
      navigationMs: item.performance.navigationMs,
      screenshotMs: item.performance.screenshotMs,
      nodeCount: item.metrics.nodeCount,
      bodyHeight: item.metrics.bodyHeight,
      screenshotBytes: item.metrics.screenshotBytes,
    }));
  const byNodeCount = [...measured]
    .sort((a, b) => b.metrics.nodeCount - a.metrics.nodeCount)
    .slice(0, 5)
    .map((item) => ({
      route: item.route,
      viewport: item.viewport,
      nodeCount: item.metrics.nodeCount,
      visibleNodeCount: item.metrics.visibleNodeCount,
      renderedOpportunityCards: item.metrics.renderedOpportunityCards,
      renderedInboxCards: item.metrics.renderedInboxCards,
      totalMs: item.performance.totalMs,
    }));
  const byBodyHeight = [...measured]
    .sort((a, b) => b.metrics.bodyHeight - a.metrics.bodyHeight)
    .slice(0, 5)
    .map((item) => ({
      route: item.route,
      viewport: item.viewport,
      bodyHeight: item.metrics.bodyHeight,
      maxScrollY: item.metrics.maxScrollY,
      renderedOpportunityCards: item.metrics.renderedOpportunityCards,
      boardWindowStatusCount: item.metrics.boardWindowStatusCount,
    }));

  return {
    slowest: byTotalMs,
    largestDom: byNodeCount,
    tallestPages: byBodyHeight,
  };
}

function viewportLabel(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

function snapshotKey(item) {
  return `${item.route}@${viewportLabel(item.viewport)}`;
}

function formatBytes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (value >= bytesPerMb) return `${(value / bytesPerMb).toFixed(2)}MB`;
  if (value >= 1024) return `${Math.round(value / 1024)}KB`;
  return `${value}B`;
}

function formatDelta(value, suffix = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function addWarning(warnings, result, id, metric, value, threshold, message) {
  warnings.push({
    id,
    severity: 'warning',
    route: result.route,
    path: result.path,
    viewport: result.viewport,
    metric,
    value,
    threshold,
    message,
  });
}

function evaluatePerformanceWarnings(results, thresholds) {
  const warnings = [];

  for (const result of results) {
    if (!result.metrics || !result.performance) continue;

    if (result.metrics.bodyHeight > thresholds.bodyHeight) {
      addWarning(
        warnings,
        result,
        'page-body-height',
        'bodyHeight',
        result.metrics.bodyHeight,
        thresholds.bodyHeight,
        `Page body height ${result.metrics.bodyHeight}px is above the soft threshold ${thresholds.bodyHeight}px.`,
      );
    }

    if (!result.route.startsWith('workbench-stress')) continue;

    if (result.metrics.nodeCount > thresholds.workbenchStressNodes) {
      addWarning(
        warnings,
        result,
        'workbench-stress-dom-nodes',
        'nodeCount',
        result.metrics.nodeCount,
        thresholds.workbenchStressNodes,
        `Workbench stress DOM has ${result.metrics.nodeCount} nodes; soft threshold is ${thresholds.workbenchStressNodes}.`,
      );
    }
    if (result.performance.totalMs > thresholds.workbenchStressTotalMs) {
      addWarning(
        warnings,
        result,
        'workbench-stress-total-ms',
        'totalMs',
        result.performance.totalMs,
        thresholds.workbenchStressTotalMs,
        `Workbench stress check took ${result.performance.totalMs}ms; soft threshold is ${thresholds.workbenchStressTotalMs}ms.`,
      );
    }
    if (result.metrics.screenshotBytes > thresholds.workbenchStressScreenshotBytes) {
      addWarning(
        warnings,
        result,
        'workbench-stress-screenshot-size',
        'screenshotBytes',
        result.metrics.screenshotBytes,
        thresholds.workbenchStressScreenshotBytes,
        `Workbench stress screenshot is ${formatBytes(result.metrics.screenshotBytes)}; soft threshold is ${formatBytes(thresholds.workbenchStressScreenshotBytes)}.`,
      );
    }
    if (result.metrics.renderedOpportunityCards > thresholds.workbenchStressRenderedOpportunityCards) {
      addWarning(
        warnings,
        result,
        'workbench-stress-rendered-cards',
        'renderedOpportunityCards',
        result.metrics.renderedOpportunityCards,
        thresholds.workbenchStressRenderedOpportunityCards,
        `Workbench stress rendered ${result.metrics.renderedOpportunityCards} opportunity cards; soft threshold is ${thresholds.workbenchStressRenderedOpportunityCards}.`,
      );
    }
  }

  return warnings;
}

function addTrendWarning(warnings, comparison, id, metric, value, threshold, message) {
  warnings.push({
    id,
    severity: 'warning',
    route: comparison.route,
    path: comparison.path,
    viewport: comparison.viewport,
    metric,
    value,
    threshold,
    previousValue: comparison[`previous${metric[0].toUpperCase()}${metric.slice(1)}`] ?? null,
    delta: comparison[`${metric}Delta`] ?? null,
    percentDelta: comparison[`${metric}PercentDelta`] ?? null,
    message,
  });
}

function exceedsRegressionThreshold(delta, percentDelta, absoluteThreshold, percentThreshold) {
  return typeof delta === 'number'
    && typeof percentDelta === 'number'
    && delta > absoluteThreshold
    && percentDelta > percentThreshold;
}

function exceedsTimeRegressionThreshold(comparison, thresholds) {
  return typeof comparison.totalMs === 'number'
    && comparison.totalMs >= thresholds.trendTotalMsCurrentMin
    && exceedsRegressionThreshold(
      comparison.totalMsDelta,
      comparison.totalMsPercentDelta,
      thresholds.trendTotalMsDelta,
      thresholds.trendTotalMsPercent,
    );
}

function evaluateTrendWarnings(trend, thresholds) {
  const warnings = [];
  if (!trend?.available) return warnings;

  for (const comparison of trend.comparisons || []) {
    if (exceedsTimeRegressionThreshold(comparison, thresholds)) {
      addTrendWarning(
        warnings,
        comparison,
        'trend-total-ms-regression',
        'totalMs',
        comparison.totalMs,
        {
          delta: thresholds.trendTotalMsDelta,
          percent: thresholds.trendTotalMsPercent,
        },
        `Total check time increased by ${formatDelta(comparison.totalMsDelta, 'ms')} (${formatPercent(comparison.totalMsPercentDelta)}) from the previous snapshot and is now above ${thresholds.trendTotalMsCurrentMin}ms.`,
      );
    }

    if (exceedsRegressionThreshold(
      comparison.nodeCountDelta,
      comparison.nodeCountPercentDelta,
      thresholds.trendNodeCountDelta,
      thresholds.trendNodeCountPercent,
    )) {
      addTrendWarning(
        warnings,
        comparison,
        'trend-node-count-regression',
        'nodeCount',
        comparison.nodeCount,
        {
          delta: thresholds.trendNodeCountDelta,
          percent: thresholds.trendNodeCountPercent,
        },
        `DOM node count increased by ${formatDelta(comparison.nodeCountDelta)} (${formatPercent(comparison.nodeCountPercentDelta)}) from the previous snapshot.`,
      );
    }

    if (exceedsRegressionThreshold(
      comparison.screenshotBytesDelta,
      comparison.screenshotBytesPercentDelta,
      thresholds.trendScreenshotBytesDelta,
      thresholds.trendScreenshotBytesPercent,
    )) {
      addTrendWarning(
        warnings,
        comparison,
        'trend-screenshot-size-regression',
        'screenshotBytes',
        comparison.screenshotBytes,
        {
          delta: thresholds.trendScreenshotBytesDelta,
          percent: thresholds.trendScreenshotBytesPercent,
        },
        `Screenshot size increased by ${formatBytes(comparison.screenshotBytesDelta)} (${formatPercent(comparison.screenshotBytesPercentDelta)}) from the previous snapshot.`,
      );
    }

    if (exceedsRegressionThreshold(
      comparison.bodyHeightDelta,
      comparison.bodyHeightPercentDelta,
      thresholds.trendBodyHeightDelta,
      thresholds.trendBodyHeightPercent,
    )) {
      addTrendWarning(
        warnings,
        comparison,
        'trend-body-height-regression',
        'bodyHeight',
        comparison.bodyHeight,
        {
          delta: thresholds.trendBodyHeightDelta,
          percent: thresholds.trendBodyHeightPercent,
        },
        `Body height increased by ${formatDelta(comparison.bodyHeightDelta, 'px')} (${formatPercent(comparison.bodyHeightPercentDelta)}) from the previous snapshot.`,
      );
    }
  }

  return warnings;
}

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function slimResult(result) {
  return {
    route: result.route,
    path: result.path,
    viewport: result.viewport,
    metrics: result.metrics
      ? {
          nodeCount: result.metrics.nodeCount,
          visibleNodeCount: result.metrics.visibleNodeCount,
          bodyHeight: result.metrics.bodyHeight,
          maxScrollY: result.metrics.maxScrollY,
          renderedOpportunityCards: result.metrics.renderedOpportunityCards,
          renderedInboxCards: result.metrics.renderedInboxCards,
          boardWindowStatusCount: result.metrics.boardWindowStatusCount,
          screenshotBytes: result.metrics.screenshotBytes,
        }
      : null,
    performance: result.performance
      ? {
          navigationMs: result.performance.navigationMs,
          settleMs: result.performance.settleMs,
          actionMs: result.performance.actionMs,
          screenshotMs: result.performance.screenshotMs,
          inspectMs: result.performance.inspectMs,
          totalMs: result.performance.totalMs,
        }
      : null,
    navigationAttempts: result.navigationAttempts || [],
    screenshotAttempts: result.screenshotAttempts || [],
    actionMetrics: (result.actionMetrics || []).map((item) => ({
      round: item.round,
      label: item.label,
      clickedButtons: item.clickedButtons,
      scrolledLists: item.scrolledLists || 0,
      durationMs: item.durationMs,
      metrics: item.metrics
        ? {
            nodeCount: item.metrics.nodeCount,
            visibleNodeCount: item.metrics.visibleNodeCount,
            bodyHeight: item.metrics.bodyHeight,
            maxScrollY: item.metrics.maxScrollY,
            renderedOpportunityCards: item.metrics.renderedOpportunityCards,
            renderedInboxCards: item.metrics.renderedInboxCards,
            boardWindowStatusCount: item.metrics.boardWindowStatusCount,
        }
        : null,
    })),
    actionChecks: (result.actionChecks || []).map((item) => ({
      id: item.id,
      status: item.status,
      durationMs: item.durationMs,
      delta: item.delta ?? null,
      restoredScrollTop: item.restoredScrollTop ?? null,
      expectedScrollTop: item.expectedScrollTop ?? null,
      before: item.before
        ? {
            tagName: item.before.tagName,
            className: item.before.className,
            text: item.before.text,
            action: item.before.action,
            opportunityId: item.before.opportunityId,
            ariaLabel: item.before.ariaLabel,
            scrollTop: item.before.scrollTop,
            scrollHeight: item.before.scrollHeight,
            clientHeight: item.before.clientHeight,
            renderedOpportunityCards: item.before.renderedOpportunityCards,
            rowEstimate: item.before.rowEstimate,
            firstRowHeight: item.before.firstRowHeight,
            activeDescendant: item.before.activeDescendant,
            activePosition: item.before.activePosition,
            activeTotal: item.before.activeTotal,
            rangeStart: item.before.rangeStart,
            rangeEnd: item.before.rangeEnd,
            progress: item.before.progress,
          }
        : null,
      after: item.after
        ? {
            tagName: item.after.tagName,
            className: item.after.className,
            text: item.after.text,
            action: item.after.action,
            opportunityId: item.after.opportunityId,
            ariaLabel: item.after.ariaLabel,
            scrollTop: item.after.scrollTop,
            scrollHeight: item.after.scrollHeight,
            clientHeight: item.after.clientHeight,
            renderedOpportunityCards: item.after.renderedOpportunityCards,
            rowEstimate: item.after.rowEstimate,
            firstRowHeight: item.after.firstRowHeight,
            activeDescendant: item.after.activeDescendant,
            activePosition: item.after.activePosition,
            activeTotal: item.after.activeTotal,
            rangeStart: item.after.rangeStart,
            rangeEnd: item.after.rangeEnd,
            progress: item.after.progress,
        }
        : null,
    })),
  };
}

function normalizeViewportSnapshot(payload, sourcePath) {
  if (!payload || !Array.isArray(payload.results)) return null;
  return {
    schemaVersion: payload.schemaVersion || 1,
    checkedAt: payload.checkedAt || null,
    sourcePath,
    resultCount: payload.resultCount || payload.results.length,
    failedCount: payload.failedCount || payload.failed?.length || 0,
    warningCount: payload.warningCount || payload.warnings?.length || 0,
    results: payload.results.map(slimResult),
  };
}

function readPreviousViewportSnapshot({ latestPath, reportPath }) {
  const latest = normalizeViewportSnapshot(readJsonFile(latestPath), latestPath);
  if (latest) return latest;
  return normalizeViewportSnapshot(readJsonFile(reportPath), reportPath);
}

function buildLatestSnapshot(report) {
  return {
    schemaVersion: 1,
    checkedAt: report.checkedAt,
    baseUrl: report.baseUrl,
    liveApi: report.liveApi,
    stressOpportunityCount: report.stressOpportunityCount,
    stressExpandRounds: report.stressExpandRounds,
    warmup: report.warmup,
    resultCount: report.results.length,
    failedCount: report.failed.length,
    warningCount: report.warnings.length,
    thresholds: report.thresholds,
    performanceSummary: report.performanceSummary,
    results: report.results.map(slimResult),
  };
}

function numericDelta(current, previous) {
  if (
    typeof current !== 'number'
    || typeof previous !== 'number'
    || !Number.isFinite(current)
    || !Number.isFinite(previous)
  ) {
    return null;
  }
  return current - previous;
}

function percentageDelta(current, previous) {
  if (
    typeof current !== 'number'
    || typeof previous !== 'number'
    || !Number.isFinite(current)
    || !Number.isFinite(previous)
    || previous <= 0
  ) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function topIncreases(comparisons, deltaKey, currentKey, previousKey) {
  return comparisons
    .filter((item) => typeof item[deltaKey] === 'number' && item[deltaKey] > 0)
    .sort((a, b) => b[deltaKey] - a[deltaKey])
    .slice(0, 5)
    .map((item) => ({
      route: item.route,
      viewport: item.viewport,
      current: item[currentKey],
      previous: item[previousKey],
      delta: item[deltaKey],
      percentDelta: item[`${currentKey}PercentDelta`] ?? null,
    }));
}

function buildPerformanceTrend(currentSnapshot, previousSnapshot) {
  if (!previousSnapshot) {
    return {
      available: false,
      reason: 'No previous viewport QA snapshot found.',
    };
  }

  const previousByKey = new Map(previousSnapshot.results.map((item) => [snapshotKey(item), item]));
  const currentKeys = new Set(currentSnapshot.results.map(snapshotKey));
  const previousKeys = new Set(previousSnapshot.results.map(snapshotKey));
  const comparisons = [];

  for (const current of currentSnapshot.results) {
    const previous = previousByKey.get(snapshotKey(current));
    if (!previous) continue;
    comparisons.push({
      route: current.route,
      path: current.path,
      viewport: current.viewport,
      totalMs: current.performance?.totalMs ?? null,
      previousTotalMs: previous.performance?.totalMs ?? null,
      totalMsDelta: numericDelta(current.performance?.totalMs, previous.performance?.totalMs),
      totalMsPercentDelta: percentageDelta(current.performance?.totalMs, previous.performance?.totalMs),
      nodeCount: current.metrics?.nodeCount ?? null,
      previousNodeCount: previous.metrics?.nodeCount ?? null,
      nodeCountDelta: numericDelta(current.metrics?.nodeCount, previous.metrics?.nodeCount),
      nodeCountPercentDelta: percentageDelta(current.metrics?.nodeCount, previous.metrics?.nodeCount),
      screenshotBytes: current.metrics?.screenshotBytes ?? null,
      previousScreenshotBytes: previous.metrics?.screenshotBytes ?? null,
      screenshotBytesDelta: numericDelta(current.metrics?.screenshotBytes, previous.metrics?.screenshotBytes),
      screenshotBytesPercentDelta: percentageDelta(current.metrics?.screenshotBytes, previous.metrics?.screenshotBytes),
      bodyHeight: current.metrics?.bodyHeight ?? null,
      previousBodyHeight: previous.metrics?.bodyHeight ?? null,
      bodyHeightDelta: numericDelta(current.metrics?.bodyHeight, previous.metrics?.bodyHeight),
      bodyHeightPercentDelta: percentageDelta(current.metrics?.bodyHeight, previous.metrics?.bodyHeight),
    });
  }

  return {
    available: true,
    previousCheckedAt: previousSnapshot.checkedAt,
    previousSource: previousSnapshot.sourcePath,
    compared: comparisons.length,
    added: [...currentKeys].filter((key) => !previousKeys.has(key)).length,
    removed: [...previousKeys].filter((key) => !currentKeys.has(key)).length,
    comparisons,
    topIncreases: {
      totalMs: topIncreases(comparisons, 'totalMsDelta', 'totalMs', 'previousTotalMs'),
      nodeCount: topIncreases(comparisons, 'nodeCountDelta', 'nodeCount', 'previousNodeCount'),
      screenshotBytes: topIncreases(comparisons, 'screenshotBytesDelta', 'screenshotBytes', 'previousScreenshotBytes'),
      bodyHeight: topIncreases(comparisons, 'bodyHeightDelta', 'bodyHeight', 'previousBodyHeight'),
    },
  };
}

function markdownPerformanceRows(items, columns) {
  if (!items?.length) return ['_No entries._'];
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...items.map((item) => `| ${columns.map((column) => column.value(item)).join(' | ')} |`),
  ];
}

function formatActionCheckSnapshot(snapshot) {
  if (!snapshot) return '-';
  if (typeof snapshot.scrollTop === 'number') {
    const active = snapshot.activePosition ? ` / active ${snapshot.activePosition}` : '';
    return `${snapshot.scrollTop}px / ${snapshot.progress ?? '-'}%${active}`;
  }
  if (snapshot.ariaLabel) return snapshot.ariaLabel;
  if (snapshot.action) return `${snapshot.action}${snapshot.opportunityId ? `:${snapshot.opportunityId}` : ''}`;
  return snapshot.text || snapshot.tagName || '-';
}

function buildMarkdownSummary(report) {
  const lines = [
    '# Dashboard Viewport QA Summary',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- Warm-up: ${report.warmup.enabled ? `${report.warmup.routeCount} routes in ${report.warmup.durationMs}ms` : 'disabled'}`,
    `- Checks: ${report.results.length}`,
    `- Failed: ${report.failed.length}`,
    `- Soft warnings: ${report.warnings.length}`,
    `- Workbench stress opportunities: ${report.stressOpportunityCount}`,
    `- Workbench stress expand rounds: ${report.stressExpandRounds}`,
    `- Artifacts: ${report.outDir}`,
    '',
    '## Soft Warnings',
    '',
  ];

  if (report.warnings.length) {
    for (const warning of report.warnings) {
      lines.push(`- ${warning.route} ${warning.viewport.width}px: ${warning.message}`);
    }
  } else {
    lines.push('_No soft warnings._');
  }

  const retriedNavigations = report.results.filter((result) => (result.navigationAttempts?.length || 0) > 1);
  lines.push('', '## Navigation Retries', '');
  if (retriedNavigations.length) {
    for (const result of retriedNavigations) {
      const finalAttempt = result.navigationAttempts[result.navigationAttempts.length - 1];
      lines.push(`- ${result.route} ${result.viewport.width}px: ${result.navigationAttempts.length} attempts, final ${finalAttempt.status} in ${finalAttempt.durationMs}ms`);
    }
  } else {
    lines.push('_No retries._');
  }

  const retriedScreenshots = report.results.filter((result) => (result.screenshotAttempts?.length || 0) > 1);
  lines.push('', '## Screenshot Retries', '');
  if (retriedScreenshots.length) {
    for (const result of retriedScreenshots) {
      const finalAttempt = result.screenshotAttempts[result.screenshotAttempts.length - 1];
      lines.push(`- ${result.route} ${result.viewport.width}px: ${result.screenshotAttempts.length} attempts, final ${finalAttempt.status} in ${finalAttempt.durationMs}ms`);
    }
  } else {
    lines.push('_No retries._');
  }

  const interactionResults = report.results.filter((result) => result.actionMetrics?.length);
  lines.push('', '## Interaction Metrics', '');
  if (interactionResults.length) {
    for (const result of interactionResults) {
      lines.push(`### ${result.route} ${result.viewport.width}px`, '');
      lines.push(...markdownPerformanceRows(result.actionMetrics, [
        { label: 'Round', value: (item) => item.round },
        { label: 'Label', value: (item) => item.label },
        { label: 'Clicked', value: (item) => item.clickedButtons },
        { label: 'Scrolled', value: (item) => item.scrolledLists || 0 },
        { label: 'Duration', value: (item) => `${item.durationMs}ms` },
        { label: 'Nodes', value: (item) => item.metrics?.nodeCount ?? '-' },
        { label: 'Cards', value: (item) => item.metrics?.renderedOpportunityCards ?? '-' },
        { label: 'Window Controls', value: (item) => item.metrics?.boardWindowStatusCount ?? '-' },
      ]));
      lines.push('');
    }
  } else {
    lines.push('_No interaction metrics._');
  }

  const actionCheckResults = report.results.filter((result) => result.actionChecks?.length);
  lines.push('', '## Interaction Checks', '');
  if (actionCheckResults.length) {
    for (const result of actionCheckResults) {
      lines.push(`### ${result.route} ${result.viewport.width}px`, '');
      lines.push(...markdownPerformanceRows(result.actionChecks, [
        { label: 'Check', value: (item) => item.id },
        { label: 'Status', value: (item) => item.status },
        { label: 'Duration', value: (item) => `${item.durationMs}ms` },
        { label: 'Before', value: (item) => formatActionCheckSnapshot(item.before) },
        { label: 'After', value: (item) => formatActionCheckSnapshot(item.after) },
        { label: 'Estimate', value: (item) => item.after?.rowEstimate ? `${item.after.rowEstimate}px` : '-' },
        { label: 'Row', value: (item) => item.after?.firstRowHeight ? `${item.after.firstRowHeight}px` : '-' },
        { label: 'Delta', value: (item) => item.delta ?? '-' },
      ]));
      lines.push('');
    }
  } else {
    lines.push('_No interaction checks._');
  }

  lines.push('', '## Slowest Checks', '');
  lines.push(...markdownPerformanceRows(report.performanceSummary.slowest, [
    { label: 'Route', value: (item) => item.route },
    { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
    { label: 'Total', value: (item) => `${item.totalMs}ms` },
    { label: 'Nodes', value: (item) => item.nodeCount },
    { label: 'Screenshot', value: (item) => formatBytes(item.screenshotBytes) },
  ]));

  lines.push('', '## Largest DOM', '');
  lines.push(...markdownPerformanceRows(report.performanceSummary.largestDom, [
    { label: 'Route', value: (item) => item.route },
    { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
    { label: 'Nodes', value: (item) => item.nodeCount },
    { label: 'Visible', value: (item) => item.visibleNodeCount },
    { label: 'Cards', value: (item) => item.renderedOpportunityCards },
  ]));

  lines.push('', '## Tallest Pages', '');
  lines.push(...markdownPerformanceRows(report.performanceSummary.tallestPages, [
    { label: 'Route', value: (item) => item.route },
    { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
    { label: 'Height', value: (item) => `${item.bodyHeight}px` },
    { label: 'Max Scroll', value: (item) => `${item.maxScrollY}px` },
    { label: 'Cards', value: (item) => item.renderedOpportunityCards },
  ]));

  const trend = report.performanceSummary.trend;
  lines.push('', '## Trend', '');
  if (!trend?.available) {
    lines.push(`_Trend unavailable: ${trend?.reason || 'not enough data'}_`);
  } else {
    lines.push(
      `- Previous snapshot: ${trend.previousCheckedAt || 'unknown'} (${trend.previousSource || 'unknown source'})`,
      `- Compared: ${trend.compared}`,
      `- Added routes: ${trend.added}`,
      `- Removed routes: ${trend.removed}`,
      '',
      '### Largest Total Time Increases',
      '',
    );
    lines.push(...markdownPerformanceRows(trend.topIncreases.totalMs, [
      { label: 'Route', value: (item) => item.route },
      { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
      { label: 'Current', value: (item) => `${item.current}ms` },
      { label: 'Previous', value: (item) => `${item.previous}ms` },
      { label: 'Delta', value: (item) => formatDelta(item.delta, 'ms') },
      { label: 'Delta %', value: (item) => formatPercent(item.percentDelta) },
    ]));
    lines.push('', '### Largest DOM Increases', '');
    lines.push(...markdownPerformanceRows(trend.topIncreases.nodeCount, [
      { label: 'Route', value: (item) => item.route },
      { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
      { label: 'Current', value: (item) => item.current },
      { label: 'Previous', value: (item) => item.previous },
      { label: 'Delta', value: (item) => formatDelta(item.delta) },
      { label: 'Delta %', value: (item) => formatPercent(item.percentDelta) },
    ]));
    lines.push('', '### Largest Screenshot Increases', '');
    lines.push(...markdownPerformanceRows(trend.topIncreases.screenshotBytes, [
      { label: 'Route', value: (item) => item.route },
      { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
      { label: 'Current', value: (item) => formatBytes(item.current) },
      { label: 'Previous', value: (item) => formatBytes(item.previous) },
      { label: 'Delta', value: (item) => formatBytes(item.delta) },
      { label: 'Delta %', value: (item) => formatPercent(item.percentDelta) },
    ]));
    lines.push('', '### Largest Body Height Increases', '');
    lines.push(...markdownPerformanceRows(trend.topIncreases.bodyHeight, [
      { label: 'Route', value: (item) => item.route },
      { label: 'Viewport', value: (item) => `${item.viewport.width}px` },
      { label: 'Current', value: (item) => `${item.current}px` },
      { label: 'Previous', value: (item) => `${item.previous}px` },
      { label: 'Delta', value: (item) => formatDelta(item.delta, 'px') },
      { label: 'Delta %', value: (item) => formatPercent(item.percentDelta) },
    ]));
  }

  return `${lines.join('\n')}\n`;
}

async function runViewportQa(options) {
  configureStressFixtures(options.stressOpportunityCount);
  const routes = buildRoutes(options);

  const outDir = path.resolve(repoRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'report.json');
  const latestPath = path.join(outDir, 'latest.json');
  const summaryPath = path.join(outDir, 'summary.md');
  const previousSnapshot = options.trend
    ? readPreviousViewportSnapshot({ latestPath, reportPath })
    : null;

  const executablePath = findChromeExecutable(options.chromePath);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];
  const warmup = options.warmup
    ? await warmDashboardRoutes(browser, options, routes)
    : { enabled: false, routeCount: 0, durationMs: 0, issues: [] };

  try {
    for (const viewport of defaultViewports) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });

      for (const routeDef of routes) {
        const page = await context.newPage();
        await installApiMocks(page, routeDef.scenario || 'default', options.liveApi);
        const consoleIssues = [];
        page.on('console', (message) => {
          if (['error', 'warning'].includes(message.type())) {
            consoleIssues.push(`${message.type()}: ${message.text()}`);
          }
        });
        page.on('pageerror', (error) => {
          consoleIssues.push(`pageerror: ${error.message}`);
        });

        const screenshot = path.join(outDir, `${routeDef.name}-${viewport.width}.png`);
        const result = {
          route: routeDef.name,
          path: routeDef.path,
          viewport,
          screenshot,
          layout: null,
          metrics: null,
          performance: null,
          consoleIssues,
          navigationError: null,
          navigationAttempts: [],
          screenshotAttempts: [],
          actionMetrics: [],
          actionChecks: [],
        };

        try {
          const totalStart = performance.now();
          const navigationStart = performance.now();
          await gotoWithRetry(page, `${options.baseUrl}${routeDef.path}`, result.navigationAttempts);
          const navigationEnd = performance.now();
          const settleStart = performance.now();
          await page.waitForTimeout(1800);
          const settleEnd = performance.now();
          const actionStart = performance.now();
          await applyRouteAction(page, routeDef.action, options, result);
          const actionEnd = performance.now();
          const screenshotStart = performance.now();
          await screenshotWithRetry(page, screenshot, result.screenshotAttempts);
          const screenshotEnd = performance.now();
          const inspectStart = performance.now();
          result.layout = await inspectLayout(page, viewport);
          result.metrics = await collectPageMetrics(page, screenshot);
          const inspectEnd = performance.now();
          result.performance = {
            navigationMs: roundMs(navigationEnd - navigationStart),
            settleMs: roundMs(settleEnd - settleStart),
            actionMs: roundMs(actionEnd - actionStart),
            screenshotMs: roundMs(screenshotEnd - screenshotStart),
            inspectMs: roundMs(inspectEnd - inspectStart),
            totalMs: roundMs(inspectEnd - totalStart),
          };
        } catch (error) {
          result.navigationError = error instanceof Error ? error.message : String(error);
        }

        filterExpectedConsoleIssues(routeDef.name, consoleIssues);
        results.push(result);
        await closeWithTimeout(`Page ${routeDef.name} ${viewport.width}px`, () => page.close(), 1500);
      }

      await closeWithTimeout(`Browser context ${viewport.width}px`, () => context.close(), 3000);
    }
  } finally {
    await closeWithTimeout('Browser', () => browser.close(), 3000, () => {
      const process = typeof browser.process === 'function' ? browser.process() : null;
      if (process && !process.killed) process.kill('SIGKILL');
    });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    liveApi: options.liveApi,
    stressOpportunityCount: options.stressOpportunityCount,
    stressExpandRounds: options.stressExpandRounds,
    warmup,
    outDir,
    thresholds: { ...options.thresholds },
    results,
    failed: results.filter(hasLayoutIssue),
    warnings: [],
  };
  const performanceSummary = buildPerformanceSummary(results);
  const snapshotForTrend = buildLatestSnapshot({
    ...report,
    performanceSummary,
  });
  const trend = options.trend
    ? buildPerformanceTrend(snapshotForTrend, previousSnapshot)
    : { available: false, reason: 'Trend comparison disabled.' };
  report.warnings = [
    ...evaluatePerformanceWarnings(results, options.thresholds),
    ...evaluateTrendWarnings(trend, options.thresholds),
  ];
  report.performanceSummary = {
    ...performanceSummary,
    warningCount: report.warnings.length,
    thresholds: report.thresholds,
    trend,
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(buildLatestSnapshot(report), null, 2)}\n`, 'utf8');
  writeFileSync(summaryPath, buildMarkdownSummary(report), 'utf8');

  return { report, reportPath, latestPath, summaryPath };
}

function printSummary(report, reportPath, summaryPath) {
  const total = report.results.length;
  const failed = report.failed.length;
  if (failed === 0) {
    console.log(`Viewport QA passed: ${total}/${total} checks`);
  } else {
    console.error(`Viewport QA failed: ${failed}/${total} checks`);
    for (const item of report.failed) {
      const overflow = item.layout?.horizontalOverflow ? ' horizontal-overflow' : '';
      const elementOverflow = item.layout?.overflowing?.length ? ` element-overflow=${item.layout.overflowing.length}` : '';
      const textOverflow = item.layout?.textOverflow?.length ? ` text-overflow=${item.layout.textOverflow.length}` : '';
      const consoleIssues = item.consoleIssues?.length ? ` console=${item.consoleIssues.length}` : '';
      const navigation = item.navigationError ? ` navigation=${item.navigationError}` : '';
      console.error(`- ${item.route} ${item.viewport.width}px:${overflow}${elementOverflow}${textOverflow}${consoleIssues}${navigation}`);
    }
  }
  if (report.performanceSummary?.slowest?.length) {
    const slowest = report.performanceSummary.slowest[0];
    const largestDom = report.performanceSummary.largestDom[0];
    console.log(`Slowest: ${slowest.route} ${slowest.viewport.width}px ${slowest.totalMs}ms, nodes ${slowest.nodeCount}`);
    if (largestDom) {
      console.log(`Largest DOM: ${largestDom.route} ${largestDom.viewport.width}px ${largestDom.nodeCount} nodes`);
    }
  }
  if (report.warmup?.enabled) {
    const warmupSuffix = report.warmup.issues?.length ? `, issues ${report.warmup.issues.length}` : '';
    console.log(`Warm-up: ${report.warmup.routeCount} routes in ${report.warmup.durationMs}ms${warmupSuffix}`);
  }
  console.log(`Workbench stress opportunities: ${report.stressOpportunityCount}`);
  console.log(`Workbench stress expand rounds: ${report.stressExpandRounds}`);
  const interactionResults = report.results.filter((result) => result.actionMetrics?.length);
  if (interactionResults.length) {
    const preview = interactionResults
      .map((result) => {
        const last = result.actionMetrics[result.actionMetrics.length - 1];
        return `${result.route} ${result.viewport.width}px cards=${last.metrics?.renderedOpportunityCards ?? '-'} nodes=${last.metrics?.nodeCount ?? '-'} scrolled=${last.scrolledLists || 0}`;
      })
      .join('; ');
    console.log(`Interaction metrics: ${preview}`);
  }
  const actionCheckResults = report.results.filter((result) => result.actionChecks?.length);
  if (actionCheckResults.length) {
    const passed = actionCheckResults.reduce((total, result) => (
      total + result.actionChecks.filter((item) => item.status === 'passed').length
    ), 0);
    const total = actionCheckResults.reduce((sum, result) => sum + result.actionChecks.length, 0);
    console.log(`Interaction checks: ${passed}/${total} passed`);
  }
  if (report.warnings?.length) {
    console.warn(`Soft warnings: ${report.warnings.length}`);
    for (const warning of report.warnings.slice(0, 5)) {
      console.warn(`- ${warning.route} ${warning.viewport.width}px ${warning.metric}: ${warning.message}`);
    }
  } else {
    console.log('Soft warnings: 0');
  }
  const retriedNavigations = report.results.filter((result) => (result.navigationAttempts?.length || 0) > 1);
  if (retriedNavigations.length) {
    console.warn(`Navigation retries: ${retriedNavigations.length}`);
  }
  const retriedScreenshots = report.results.filter((result) => (result.screenshotAttempts?.length || 0) > 1);
  if (retriedScreenshots.length) {
    console.warn(`Screenshot retries: ${retriedScreenshots.length}`);
  }
  const trend = report.performanceSummary?.trend;
  if (trend?.available) {
    console.log(`Trend: compared ${trend.compared} checks with ${trend.previousCheckedAt || 'previous snapshot'}`);
    const totalMsIncrease = trend.topIncreases?.totalMs?.[0];
    if (totalMsIncrease) {
      console.log(`Largest time increase: ${totalMsIncrease.route} ${totalMsIncrease.viewport.width}px ${formatDelta(totalMsIncrease.delta, 'ms')}`);
    }
  } else if (trend) {
    console.log(`Trend: ${trend.reason}`);
  }
  console.log(`Report: ${reportPath}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(`Screenshots: ${report.outDir}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let server = null;

  try {
    if (options.startServer) {
      server = startDashboardServer(options);
      options.baseUrl = await server.ready;
    }
    const { report, reportPath, summaryPath } = await runViewportQa(options);
    printSummary(report, reportPath, summaryPath);
    process.exitCode = report.failed.length > 0 || (options.failOnWarning && report.warnings.length > 0) ? 1 : 0;
  } finally {
    if (server) {
      await server.stop();
    }
  }
  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
