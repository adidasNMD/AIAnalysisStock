#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaultBuildSizeReport = 'out/dashboard-build-size/report.json';
const defaultBuildSizeSummary = 'out/dashboard-build-size/summary.md';
const defaultViewportReport = 'out/viewport-qa/report.json';
const defaultViewportSummary = 'out/viewport-qa/summary.md';

function parseArgs(argv) {
  const options = {
    outDir: 'out/dashboard-quality',
    skipBuildSize: false,
    skipViewport: false,
    fromExisting: false,
    failOnWarning: false,
    noTrend: false,
    buildSizeNoBuild: false,
    viewportNoStart: false,
    viewportNoWarmup: false,
    viewportLiveApi: false,
    viewportBaseUrl: '',
    viewportWorkbenchDrawerDepth: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--out-dir' && next) {
      options.outDir = next;
      index += 1;
    } else if (arg === '--skip-build-size') {
      options.skipBuildSize = true;
    } else if (arg === '--skip-viewport') {
      options.skipViewport = true;
    } else if (arg === '--from-existing') {
      options.fromExisting = true;
      options.skipBuildSize = true;
      options.skipViewport = true;
    } else if (arg === '--fail-on-warning') {
      options.failOnWarning = true;
    } else if (arg === '--no-trend') {
      options.noTrend = true;
    } else if (arg === '--build-size-no-build') {
      options.buildSizeNoBuild = true;
    } else if (arg === '--viewport-no-start') {
      options.viewportNoStart = true;
    } else if (arg === '--viewport-no-warmup') {
      options.viewportNoWarmup = true;
    } else if (arg === '--viewport-live-api') {
      options.viewportLiveApi = true;
    } else if (arg === '--viewport-base-url' && next) {
      options.viewportBaseUrl = next;
      index += 1;
    } else if (arg === '--viewport-workbench-drawer-depth' && next) {
      options.viewportWorkbenchDrawerDepth = parseChoice(arg, next, ['smoke', 'deep', 'both']);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function parseChoice(flag, value, choices) {
  if (!choices.includes(value)) {
    throw new Error(`${flag} must be one of ${choices.join(', ')}. Received: ${value}`);
  }
  return value;
}

function printHelp() {
  console.log(`Dashboard quality check

Usage:
  npm run dashboard:quality-check
  npm run dashboard:quality-check -- --from-existing

Options:
  --out-dir <path>        Report directory. Default: out/dashboard-quality
  --from-existing         Do not run checks; aggregate existing build-size and viewport reports.
  --skip-build-size       Skip dashboard:build-size-check.
  --skip-viewport         Skip dashboard:viewport-check.
  --fail-on-warning       Exit with code 1 when aggregate warnings are present.
  --no-trend              Pass --no-trend to child checks.

Build size child options:
  --build-size-no-build   Pass --no-build to dashboard:build-size-check.

Viewport child options:
  --viewport-base-url <url>  Pass --base-url to dashboard:viewport-check.
  --viewport-no-start        Pass --no-start to dashboard:viewport-check.
  --viewport-no-warmup       Pass --no-warmup to dashboard:viewport-check.
  --viewport-live-api        Pass --live-api to dashboard:viewport-check.
  --viewport-workbench-drawer-depth <smoke|deep|both>
                             Pass --workbench-drawer-depth to dashboard:viewport-check.
`);
}

function npmCommand(script, args) {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return {
    label: `npm run ${script}${args.length ? ` -- ${args.join(' ')}` : ''}`,
    cmd: npmBin,
    args: ['run', script, ...(args.length ? ['--', ...args] : [])],
  };
}

function runCommand(command) {
  const startedAt = performance.now();
  const child = spawn(command.cmd, command.args, {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
  });

  return new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({
        label: command.label,
        exitCode: 1,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
    });
    child.on('exit', (code) => {
      resolve({
        label: command.label,
        exitCode: code ?? 1,
        durationMs: Math.round(performance.now() - startedAt),
        error: null,
      });
    });
  });
}

function readJson(relativePath) {
  const fullPath = path.resolve(repoRoot, relativePath);
  try {
    if (!existsSync(fullPath)) return { fullPath, data: null, error: 'missing' };
    return { fullPath, data: JSON.parse(readFileSync(fullPath, 'utf8')), error: null };
  } catch (error) {
    return {
      fullPath,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return 'n/a';
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)}`;
}

function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function viewportLabel(viewport) {
  if (!viewport?.width || !viewport?.height) return 'n/a';
  return `${viewport.width}x${viewport.height}`;
}

function commandStatus(result) {
  if (!result) return 'skipped';
  return result.exitCode === 0 ? 'passed' : 'failed';
}

function warningPreview(warnings, limit = 5) {
  return (warnings || []).slice(0, limit).map((warning) => warning.message || `${warning.id}: ${warning.metric}`);
}

function summarizeBuildSize(readResult, command) {
  const report = readResult.data;
  if (!report) {
    return {
      enabled: Boolean(command),
      command,
      reportPath: readResult.fullPath,
      summaryPath: path.resolve(repoRoot, defaultBuildSizeSummary),
      status: 'failed',
      error: readResult.error || 'report unavailable',
      warnings: [],
      warningPreview: [],
      metrics: null,
    };
  }

  return {
    enabled: true,
    command,
    reportPath: readResult.fullPath,
    summaryPath: path.resolve(repoRoot, defaultBuildSizeSummary),
    status: command?.exitCode === 0 || !command ? 'passed' : 'failed',
    error: command?.error || null,
    warnings: report.warnings || [],
    warningPreview: warningPreview(report.warnings),
    metrics: {
      assetCount: report.summary?.assetCount ?? null,
      totalGzipBytes: report.summary?.totalGzipBytes ?? null,
      totalJsGzipBytes: report.summary?.totalJsGzipBytes ?? null,
      initialJsGzipBytes: report.summary?.initialJsGzipBytes ?? null,
      largestJs: report.summary?.largestJs?.[0] || null,
      initialAssets: report.summary?.initialAssets || [],
    },
  };
}

function summarizeViewport(readResult, command) {
  const report = readResult.data;
  if (!report) {
    return {
      enabled: Boolean(command),
      command,
      reportPath: readResult.fullPath,
      summaryPath: path.resolve(repoRoot, defaultViewportSummary),
      status: 'failed',
      error: readResult.error || 'report unavailable',
      failed: [],
      warnings: [],
      environmentWarnings: [],
      warningPreview: [],
      metrics: null,
    };
  }

  return {
    enabled: true,
    command,
    reportPath: readResult.fullPath,
    summaryPath: path.resolve(repoRoot, defaultViewportSummary),
    status: command?.exitCode === 0 || !command ? 'passed' : 'failed',
    error: command?.error || null,
    failed: report.failed || [],
    warnings: report.warnings || [],
    environmentWarnings: report.environmentWarnings || [],
    warningPreview: warningPreview(report.warnings),
    metrics: {
      checks: report.results?.length ?? null,
      failedCount: report.failed?.length ?? 0,
      warningCount: report.warnings?.length ?? 0,
      environmentWarningCount: report.environmentWarnings?.length ?? 0,
      slowest: report.performanceSummary?.slowest?.[0] || null,
      topSlowest: report.performanceSummary?.slowest?.slice(0, 5) || [],
      largestDom: report.performanceSummary?.largestDom?.[0] || null,
      topLargestDom: report.performanceSummary?.largestDom?.slice(0, 5) || [],
      topTallestPages: report.performanceSummary?.tallestPages?.slice(0, 5) || [],
      trend: report.performanceSummary?.trend || null,
      warmup: report.warmup || null,
    },
  };
}

function aggregateStatus({ buildSize, viewport }) {
  const hardFailures = [
    buildSize.status === 'failed',
    viewport.status === 'failed',
    (viewport.failed?.length || 0) > 0,
  ].filter(Boolean).length;
  const warnings = (buildSize.warnings?.length || 0) + (viewport.warnings?.length || 0);
  if (hardFailures > 0) return 'failed';
  if (warnings > 0) return 'warning';
  return 'ok';
}

function markdownRows(items, columns) {
  if (!items?.length) return ['_No entries._'];
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...items.map((item) => `| ${columns.map((column) => column.value(item)).join(' | ')} |`),
  ];
}

function buildMarkdownSummary(report) {
  const lines = [
    '# Dashboard Quality Summary',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Status: ${report.status}`,
    `- Total warnings: ${report.totalWarnings}`,
    `- Hard failures: ${report.hardFailures}`,
    `- Artifacts: ${report.outDir}`,
    '',
    '## Commands',
    '',
    ...(report.commands.length
      ? markdownRows(report.commands, [
        { label: 'Command', value: (item) => item.label },
        { label: 'Status', value: (item) => commandStatus(item) },
        { label: 'Duration', value: (item) => `${item.durationMs}ms` },
      ])
      : ['_Aggregated from existing build-size and viewport reports._']),
    '',
    '## Build Size',
    '',
  ];

  if (report.buildSize.metrics) {
    lines.push(
      `- Status: ${report.buildSize.status}`,
      `- Assets: ${report.buildSize.metrics.assetCount}`,
      `- Total gzip: ${formatBytes(report.buildSize.metrics.totalGzipBytes)}`,
      `- Total JS gzip: ${formatBytes(report.buildSize.metrics.totalJsGzipBytes)}`,
      `- Initial JS gzip: ${formatBytes(report.buildSize.metrics.initialJsGzipBytes)}`,
      `- Warnings: ${report.buildSize.warnings.length}`,
      `- Report: ${report.buildSize.reportPath}`,
      '',
      '### Initial Resources',
      '',
    );
    lines.push(...markdownRows(report.buildSize.metrics.initialAssets, [
      { label: 'Path', value: (item) => item.path },
      { label: 'Kind', value: (item) => item.kind },
      { label: 'Gzip', value: (item) => formatBytes(item.gzipBytes) },
    ]));
  } else {
    lines.push(`_Build size report unavailable: ${report.buildSize.error || 'unknown'}_`);
  }

  lines.push('', '## Viewport', '');
  if (report.viewport.metrics) {
    const slowest = report.viewport.metrics.slowest;
    const largestDom = report.viewport.metrics.largestDom;
    lines.push(
      `- Status: ${report.viewport.status}`,
      `- Checks: ${report.viewport.metrics.checks}`,
      `- Failed: ${report.viewport.metrics.failedCount}`,
      `- Warnings: ${report.viewport.warnings.length}`,
      `- Environment pauses: ${report.viewport.environmentWarnings.length}`,
      `- Slowest: ${slowest ? `${slowest.route} ${slowest.viewport.width}px ${slowest.totalMs}ms` : 'n/a'}`,
      `- Largest DOM: ${largestDom ? `${largestDom.route} ${largestDom.viewport.width}px ${largestDom.nodeCount} nodes` : 'n/a'}`,
      `- Report: ${report.viewport.reportPath}`,
    );

    const trend = report.viewport.metrics.trend;
    if (trend?.available) {
      lines.push(
        `- Trend: compared ${trend.compared} checks with ${trend.previousCheckedAt}`,
        `- Route delta: +${trend.added || 0} added, -${trend.removed || 0} removed`,
      );
    }

    lines.push(
      '',
      '### Slowest Routes',
      '',
      ...markdownRows(report.viewport.metrics.topSlowest, [
        { label: 'Route', value: (item) => item.route },
        { label: 'Viewport', value: (item) => viewportLabel(item.viewport) },
        { label: 'Total', value: (item) => `${formatNumber(item.totalMs)}ms` },
        { label: 'DOM', value: (item) => formatNumber(item.nodeCount) },
        { label: 'Screenshot', value: (item) => formatBytes(item.screenshotBytes) },
      ]),
      '',
      '### Largest DOM',
      '',
      ...markdownRows(report.viewport.metrics.topLargestDom, [
        { label: 'Route', value: (item) => item.route },
        { label: 'Viewport', value: (item) => viewportLabel(item.viewport) },
        { label: 'Nodes', value: (item) => formatNumber(item.nodeCount) },
        { label: 'Visible', value: (item) => formatNumber(item.visibleNodeCount) },
        { label: 'Cards', value: (item) => formatNumber(item.renderedOpportunityCards) },
      ]),
      '',
      '### Tallest Pages',
      '',
      ...markdownRows(report.viewport.metrics.topTallestPages, [
        { label: 'Route', value: (item) => item.route },
        { label: 'Viewport', value: (item) => viewportLabel(item.viewport) },
        { label: 'Body Height', value: (item) => formatNumber(item.bodyHeight) },
        { label: 'Max Scroll', value: (item) => formatNumber(item.maxScrollY) },
        { label: 'Cards', value: (item) => formatNumber(item.renderedOpportunityCards) },
      ]),
    );

    if (trend?.available) {
      const comparisons = trend.comparisons || [];
      const topTimeDeltas = comparisons
        .filter((item) => item.totalMsDelta > 0)
        .sort((left, right) => right.totalMsDelta - left.totalMsDelta)
        .slice(0, 5);
      const topNodeDeltas = comparisons
        .filter((item) => item.nodeCountDelta > 0)
        .sort((left, right) => right.nodeCountDelta - left.nodeCountDelta)
        .slice(0, 5);
      lines.push(
        '',
        '### Trend Time Deltas',
        '',
        ...markdownRows(topTimeDeltas, [
          { label: 'Route', value: (item) => item.route },
          { label: 'Viewport', value: (item) => viewportLabel(item.viewport) },
          { label: 'Current', value: (item) => `${formatNumber(item.totalMs)}ms` },
          { label: 'Delta', value: (item) => `+${formatNumber(item.totalMsDelta)}ms` },
          { label: 'Percent', value: (item) => formatPercent(item.totalMsPercentDelta) },
        ]),
        '',
        '### Trend DOM Deltas',
        '',
        ...markdownRows(topNodeDeltas, [
          { label: 'Route', value: (item) => item.route },
          { label: 'Viewport', value: (item) => viewportLabel(item.viewport) },
          { label: 'Current', value: (item) => formatNumber(item.nodeCount) },
          { label: 'Delta', value: (item) => `+${formatNumber(item.nodeCountDelta)}` },
          { label: 'Percent', value: (item) => formatPercent(item.nodeCountPercentDelta) },
        ]),
      );
    }
  } else {
    lines.push(`_Viewport report unavailable: ${report.viewport.error || 'unknown'}_`);
  }

  lines.push('', '## Warning Preview', '');
  const warningLines = [
    ...report.buildSize.warningPreview.map((message) => `Build size: ${message}`),
    ...report.viewport.warningPreview.map((message) => `Viewport: ${message}`),
  ];
  if (warningLines.length) {
    for (const warning of warningLines) lines.push(`- ${warning}`);
  } else {
    lines.push('_No warnings._');
  }

  const environmentLines = report.viewport.environmentWarnings
    .slice(0, 5)
    .map((warning) => warning.message || `${warning.id}: ${warning.metric}`);
  lines.push('', '## Environment Preview', '');
  if (environmentLines.length) {
    for (const warning of environmentLines) lines.push(`- Viewport: ${warning}`);
  } else {
    lines.push('_No environment timer drift._');
  }

  lines.push('', '## Failure Preview', '');
  if (report.viewport.failed?.length) {
    for (const failure of report.viewport.failed.slice(0, 5)) {
      lines.push(`- ${failure.route} ${failure.viewport.width}px: ${failure.navigationError || 'layout/console issue'}`);
    }
  } else if (report.hardFailures > 0) {
    for (const command of report.commands.filter((item) => item.exitCode !== 0)) {
      lines.push(`- ${command.label}: exit ${command.exitCode}${command.error ? `, ${command.error}` : ''}`);
    }
  } else {
    lines.push('_No hard failures._');
  }

  return `${lines.join('\n')}\n`;
}

async function runQualityCheck(options) {
  const outDir = path.resolve(repoRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });

  const commands = [];

  if (!options.skipBuildSize) {
    const args = [];
    if (options.buildSizeNoBuild) args.push('--no-build');
    if (options.noTrend) args.push('--no-trend');
    const result = await runCommand(npmCommand('dashboard:build-size-check', args));
    commands.push(result);
  }

  if (!options.skipViewport) {
    const args = [];
    if (options.viewportBaseUrl) args.push('--base-url', options.viewportBaseUrl);
    if (options.viewportNoStart) args.push('--no-start');
    if (options.viewportNoWarmup) args.push('--no-warmup');
    if (options.viewportLiveApi) args.push('--live-api');
    if (options.viewportWorkbenchDrawerDepth) {
      args.push('--workbench-drawer-depth', options.viewportWorkbenchDrawerDepth);
    }
    if (options.noTrend) args.push('--no-trend');
    const result = await runCommand(npmCommand('dashboard:viewport-check', args));
    commands.push(result);
  }

  const buildSizeCommand = commands.find((command) => command.label.includes('dashboard:build-size-check')) || null;
  const viewportCommand = commands.find((command) => command.label.includes('dashboard:viewport-check')) || null;
  const buildSize = summarizeBuildSize(readJson(defaultBuildSizeReport), buildSizeCommand);
  const viewport = summarizeViewport(readJson(defaultViewportReport), viewportCommand);
  const hardFailures = [
    buildSize.status === 'failed',
    viewport.status === 'failed',
    (viewport.failed?.length || 0) > 0,
  ].filter(Boolean).length;
  const totalWarnings = (buildSize.warnings?.length || 0) + (viewport.warnings?.length || 0);
  const report = {
    checkedAt: new Date().toISOString(),
    status: aggregateStatus({ buildSize, viewport }),
    outDir,
    options,
    commands,
    hardFailures,
    totalWarnings,
    buildSize,
    viewport,
  };

  const reportPath = path.join(outDir, 'report.json');
  const summaryPath = path.join(outDir, 'summary.md');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(summaryPath, buildMarkdownSummary(report), 'utf8');

  return { report, reportPath, summaryPath };
}

function printSummary(report, reportPath, summaryPath) {
  console.log(`Dashboard quality status: ${report.status}`);
  console.log(`Hard failures: ${report.hardFailures}`);
  console.log(`Warnings: ${report.totalWarnings}`);
  if (report.buildSize.metrics) {
    console.log(`Build size: ${report.buildSize.metrics.assetCount} assets, initial JS ${formatBytes(report.buildSize.metrics.initialJsGzipBytes)}`);
  }
  if (report.viewport.metrics) {
    console.log(`Viewport: ${report.viewport.metrics.checks} checks, failed ${report.viewport.metrics.failedCount}`);
    if (report.viewport.environmentWarnings.length) {
      console.log(`Viewport environment pauses: ${report.viewport.environmentWarnings.length}`);
    }
  }
  console.log(`Report: ${reportPath}`);
  console.log(`Summary: ${summaryPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { report, reportPath, summaryPath } = await runQualityCheck(options);
  printSummary(report, reportPath, summaryPath);
  process.exitCode = report.status === 'failed' || (options.failOnWarning && report.totalWarnings > 0) ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
