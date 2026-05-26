#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const bytesPerKb = 1024;

const defaultThresholds = {
  totalGzipBytes: 320 * bytesPerKb,
  totalJsGzipBytes: 245 * bytesPerKb,
  initialJsGzipBytes: 150 * bytesPerKb,
  largestJsGzipBytes: 90 * bytesPerKb,
  largestCssGzipBytes: 8 * bytesPerKb,
  reactVendorGzipBytes: 85 * bytesPerKb,
  markdownVendorGzipBytes: 55 * bytesPerKb,
  opportunityWorkbenchGzipBytes: 45 * bytesPerKb,
  assetCount: 80,
  trendTotalJsPercent: 10,
  trendTotalJsDeltaBytes: 20 * bytesPerKb,
  trendInitialJsPercent: 10,
  trendInitialJsDeltaBytes: 15 * bytesPerKb,
  trendTotalCssPercent: 15,
  trendTotalCssDeltaBytes: 8 * bytesPerKb,
  trendChunkPercent: 20,
  trendChunkDeltaBytes: 8 * bytesPerKb,
  trendAssetCountPercent: 20,
  trendAssetCountDelta: 8,
};
const lazyOnlyInitialLabels = new Set([
  'markdown-vendor',
  'OpportunityWorkbench',
  'CommandCenter',
  'MissionTimeline',
  'MissionViewer',
  'TrendRadarHub',
  'TrendRadarRaw',
  'Watchlist',
  'Settings',
  'workflow-shared',
]);

function parseArgs(argv) {
  const options = {
    distDir: 'dashboard/dist',
    outDir: 'out/dashboard-build-size',
    runBuild: true,
    trend: true,
    failOnWarning: false,
    thresholds: { ...defaultThresholds },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--dist-dir' && next) {
      options.distDir = next;
      index += 1;
    } else if (arg === '--out-dir' && next) {
      options.outDir = next;
      index += 1;
    } else if (arg === '--no-build') {
      options.runBuild = false;
    } else if (arg === '--no-trend') {
      options.trend = false;
    } else if (arg === '--fail-on-warning') {
      options.failOnWarning = true;
    } else if (arg === '--threshold-total-gzip-kb' && next) {
      options.thresholds.totalGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-total-js-gzip-kb' && next) {
      options.thresholds.totalJsGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-initial-js-gzip-kb' && next) {
      options.thresholds.initialJsGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-largest-js-gzip-kb' && next) {
      options.thresholds.largestJsGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-largest-css-gzip-kb' && next) {
      options.thresholds.largestCssGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-react-vendor-gzip-kb' && next) {
      options.thresholds.reactVendorGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-markdown-vendor-gzip-kb' && next) {
      options.thresholds.markdownVendorGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-opportunity-workbench-gzip-kb' && next) {
      options.thresholds.opportunityWorkbenchGzipBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-asset-count' && next) {
      options.thresholds.assetCount = number(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-js-percent' && next) {
      options.thresholds.trendTotalJsPercent = number(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-js-kb' && next) {
      options.thresholds.trendTotalJsDeltaBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-initial-js-percent' && next) {
      options.thresholds.trendInitialJsPercent = number(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-initial-js-kb' && next) {
      options.thresholds.trendInitialJsDeltaBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-css-percent' && next) {
      options.thresholds.trendTotalCssPercent = number(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-total-css-kb' && next) {
      options.thresholds.trendTotalCssDeltaBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-chunk-percent' && next) {
      options.thresholds.trendChunkPercent = number(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-chunk-kb' && next) {
      options.thresholds.trendChunkDeltaBytes = kb(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-asset-count-percent' && next) {
      options.thresholds.trendAssetCountPercent = number(arg, next);
      index += 1;
    } else if (arg === '--threshold-trend-asset-count-delta' && next) {
      options.thresholds.trendAssetCountDelta = number(arg, next);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function number(flag, value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative number. Received: ${value}`);
  }
  return parsed;
}

function kb(flag, value) {
  return Math.round(number(flag, value) * bytesPerKb);
}

function printHelp() {
  console.log(`Dashboard build size QA

Usage:
  npm run dashboard:build-size-check
  npm run dashboard:build-size-check -- --no-build

Options:
  --dist-dir <path>      Dashboard dist directory. Default: dashboard/dist
  --out-dir <path>       Report directory. Default: out/dashboard-build-size
  --no-build             Read an existing dist directory instead of running dashboard build.
  --no-trend             Skip comparison against the previous size snapshot.
  --fail-on-warning      Exit with code 1 when soft warnings are present.

Soft threshold overrides:
  --threshold-total-gzip-kb <n>                    Default: 320
  --threshold-total-js-gzip-kb <n>                 Default: 245
  --threshold-initial-js-gzip-kb <n>               Default: 150
  --threshold-largest-js-gzip-kb <n>               Default: 90
  --threshold-largest-css-gzip-kb <n>              Default: 8
  --threshold-react-vendor-gzip-kb <n>             Default: 85
  --threshold-markdown-vendor-gzip-kb <n>          Default: 55
  --threshold-opportunity-workbench-gzip-kb <n>    Default: 45
  --threshold-asset-count <n>                      Default: 80

Trend regression threshold overrides:
  --threshold-trend-total-js-percent <n>           Default: 10
  --threshold-trend-total-js-kb <n>                Default: 20
  --threshold-trend-initial-js-percent <n>         Default: 10
  --threshold-trend-initial-js-kb <n>              Default: 15
  --threshold-trend-total-css-percent <n>          Default: 15
  --threshold-trend-total-css-kb <n>               Default: 8
  --threshold-trend-chunk-percent <n>              Default: 20
  --threshold-trend-chunk-kb <n>                   Default: 8
  --threshold-trend-asset-count-percent <n>        Default: 20
  --threshold-trend-asset-count-delta <n>          Default: 8
`);
}

function runDashboardBuild() {
  const startedAt = performance.now();
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmBin, ['--prefix', 'dashboard', 'run', 'build'], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
  });

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      const durationMs = Math.round(performance.now() - startedAt);
      if (code === 0) {
        resolve({
          enabled: true,
          command: 'npm --prefix dashboard run build',
          durationMs,
          exitCode: code,
        });
        return;
      }
      reject(new Error(`Dashboard build failed with exit code ${code}`));
    });
  });
}

function listFiles(root) {
  const entries = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const fullPath = path.join(current, name);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        entries.push(fullPath);
      }
    }
  };
  walk(root);
  return entries;
}

function assetKind(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'js') return 'js';
  if (ext === 'css') return 'css';
  if (ext === 'html') return 'html';
  if (['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'].includes(ext)) return 'image';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) return 'font';
  return ext || 'other';
}

function chunkLabel(relativePath) {
  const stem = path.basename(relativePath).replace(/\.(?:js|css)$/, '').replace(/-+$/, '');
  return stem.replace(/-[A-Za-z0-9_]+$/, '');
}

function parseInitialResources(distDir) {
  const indexPath = path.join(distDir, 'index.html');
  if (!existsSync(indexPath)) return new Set();
  const html = readFileSync(indexPath, 'utf8');
  const resources = new Set();
  const pattern = /\b(?:src|href)="([^"]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    const resource = match[1].replace(/^\//, '');
    if (resource.startsWith('assets/') && /\.(?:js|css)$/.test(resource)) {
      resources.add(resource);
    }
    match = pattern.exec(html);
  }
  return resources;
}

function collectAssets(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`Dashboard dist directory not found: ${distDir}`);
  }
  const initialResources = parseInitialResources(distDir);
  return listFiles(distDir).map((filePath) => {
    const content = readFileSync(filePath);
    const relativePath = path.relative(distDir, filePath).split(path.sep).join('/');
    const kind = assetKind(filePath);
    return {
      path: relativePath,
      kind,
      label: kind === 'js' || kind === 'css' ? chunkLabel(relativePath) : path.basename(relativePath),
      sizeBytes: content.length,
      gzipBytes: gzipSync(content).length,
      initial: initialResources.has(relativePath),
    };
  });
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function largest(items, count = 5) {
  return [...items].sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, count);
}

function findChunk(assets, label, kind = 'js') {
  return assets.find((asset) => asset.kind === kind && asset.label === label) || null;
}

function buildSummary(assets) {
  const jsAssets = assets.filter((asset) => asset.kind === 'js');
  const cssAssets = assets.filter((asset) => asset.kind === 'css');
  const initialAssets = assets.filter((asset) => asset.initial);
  const initialJsAssets = initialAssets.filter((asset) => asset.kind === 'js');
  const initialCssAssets = initialAssets.filter((asset) => asset.kind === 'css');
  const trackedChunks = {
    index: findChunk(assets, 'index'),
    reactVendor: findChunk(assets, 'react-vendor'),
    markdownVendor: findChunk(assets, 'markdown-vendor'),
    opportunityWorkbench: findChunk(assets, 'OpportunityWorkbench'),
    commandCenter: findChunk(assets, 'CommandCenter'),
    missionViewer: findChunk(assets, 'MissionViewer'),
    trendRadarHub: findChunk(assets, 'TrendRadarHub'),
    trendRadarRaw: findChunk(assets, 'TrendRadarRaw'),
    watchlist: findChunk(assets, 'Watchlist'),
    settings: findChunk(assets, 'Settings'),
  };

  return {
    assetCount: assets.length,
    jsAssetCount: jsAssets.length,
    cssAssetCount: cssAssets.length,
    initialAssetCount: initialAssets.length,
    totalBytes: sum(assets, (asset) => asset.sizeBytes),
    totalGzipBytes: sum(assets, (asset) => asset.gzipBytes),
    totalJsBytes: sum(jsAssets, (asset) => asset.sizeBytes),
    totalJsGzipBytes: sum(jsAssets, (asset) => asset.gzipBytes),
    totalCssBytes: sum(cssAssets, (asset) => asset.sizeBytes),
    totalCssGzipBytes: sum(cssAssets, (asset) => asset.gzipBytes),
    initialJsBytes: sum(initialJsAssets, (asset) => asset.sizeBytes),
    initialJsGzipBytes: sum(initialJsAssets, (asset) => asset.gzipBytes),
    initialCssBytes: sum(initialCssAssets, (asset) => asset.sizeBytes),
    initialCssGzipBytes: sum(initialCssAssets, (asset) => asset.gzipBytes),
    largestJs: largest(jsAssets),
    largestCss: largest(cssAssets),
    initialAssets,
    trackedChunks,
  };
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return 'n/a';
  if (bytes >= bytesPerKb) return `${(bytes / bytesPerKb).toFixed(1)}KB`;
  return `${bytes}B`;
}

function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatDelta(value, suffix = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

function addWarning(warnings, id, metric, value, threshold, message, extra = {}) {
  warnings.push({
    id,
    severity: 'warning',
    metric,
    value,
    threshold,
    message,
    ...extra,
  });
}

function chunkWarning(warnings, summary, key, thresholdKey, label, thresholds) {
  const chunk = summary.trackedChunks[key];
  if (!chunk || chunk.gzipBytes <= thresholds[thresholdKey]) return;
  addWarning(
    warnings,
    `${key}-gzip-size`,
    `${key}.gzipBytes`,
    chunk.gzipBytes,
    thresholds[thresholdKey],
    `${label} gzip size is ${formatBytes(chunk.gzipBytes)}; soft threshold is ${formatBytes(thresholds[thresholdKey])}.`,
    { chunk },
  );
}

function evaluateAbsoluteWarnings(summary, thresholds) {
  const warnings = [];

  if (summary.totalGzipBytes > thresholds.totalGzipBytes) {
    addWarning(
      warnings,
      'total-gzip-size',
      'totalGzipBytes',
      summary.totalGzipBytes,
      thresholds.totalGzipBytes,
      `Total dist gzip size is ${formatBytes(summary.totalGzipBytes)}; soft threshold is ${formatBytes(thresholds.totalGzipBytes)}.`,
    );
  }
  if (summary.totalJsGzipBytes > thresholds.totalJsGzipBytes) {
    addWarning(
      warnings,
      'total-js-gzip-size',
      'totalJsGzipBytes',
      summary.totalJsGzipBytes,
      thresholds.totalJsGzipBytes,
      `Total JS gzip size is ${formatBytes(summary.totalJsGzipBytes)}; soft threshold is ${formatBytes(thresholds.totalJsGzipBytes)}.`,
    );
  }
  if (summary.initialJsGzipBytes > thresholds.initialJsGzipBytes) {
    addWarning(
      warnings,
      'initial-js-gzip-size',
      'initialJsGzipBytes',
      summary.initialJsGzipBytes,
      thresholds.initialJsGzipBytes,
      `Initial JS gzip size is ${formatBytes(summary.initialJsGzipBytes)}; soft threshold is ${formatBytes(thresholds.initialJsGzipBytes)}.`,
    );
  }
  const largestJs = summary.largestJs[0];
  if (largestJs && largestJs.gzipBytes > thresholds.largestJsGzipBytes) {
    addWarning(
      warnings,
      'largest-js-gzip-size',
      'largestJs.gzipBytes',
      largestJs.gzipBytes,
      thresholds.largestJsGzipBytes,
      `Largest JS chunk ${largestJs.path} is ${formatBytes(largestJs.gzipBytes)} gzip; soft threshold is ${formatBytes(thresholds.largestJsGzipBytes)}.`,
      { chunk: largestJs },
    );
  }
  const largestCss = summary.largestCss[0];
  if (largestCss && largestCss.gzipBytes > thresholds.largestCssGzipBytes) {
    addWarning(
      warnings,
      'largest-css-gzip-size',
      'largestCss.gzipBytes',
      largestCss.gzipBytes,
      thresholds.largestCssGzipBytes,
      `Largest CSS chunk ${largestCss.path} is ${formatBytes(largestCss.gzipBytes)} gzip; soft threshold is ${formatBytes(thresholds.largestCssGzipBytes)}.`,
      { chunk: largestCss },
    );
  }
  if (summary.assetCount > thresholds.assetCount) {
    addWarning(
      warnings,
      'asset-count',
      'assetCount',
      summary.assetCount,
      thresholds.assetCount,
      `Dist has ${summary.assetCount} assets; soft threshold is ${thresholds.assetCount}.`,
    );
  }

  for (const asset of summary.initialAssets) {
    if (!lazyOnlyInitialLabels.has(asset.label)) continue;
    addWarning(
      warnings,
      'lazy-only-initial-resource',
      'initialAssets',
      asset.gzipBytes,
      0,
      `${asset.label} is present in initial resources (${asset.path}); it should stay route-loaded or lazy-only.`,
      { chunk: asset },
    );
  }

  chunkWarning(warnings, summary, 'reactVendor', 'reactVendorGzipBytes', 'React vendor chunk', thresholds);
  chunkWarning(warnings, summary, 'markdownVendor', 'markdownVendorGzipBytes', 'Markdown vendor chunk', thresholds);
  chunkWarning(warnings, summary, 'opportunityWorkbench', 'opportunityWorkbenchGzipBytes', 'Opportunity Workbench chunk', thresholds);

  return warnings;
}

function readJson(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function slimAsset(asset) {
  if (!asset) return null;
  return {
    path: asset.path,
    kind: asset.kind,
    label: asset.label,
    sizeBytes: asset.sizeBytes,
    gzipBytes: asset.gzipBytes,
    initial: asset.initial,
  };
}

function snapshot(report) {
  const chunks = {};
  for (const asset of report.assets.filter((item) => item.kind === 'js' || item.kind === 'css')) {
    chunks[`${asset.kind}:${asset.label}`] = slimAsset(asset);
  }

  return {
    schemaVersion: 1,
    checkedAt: report.checkedAt,
    distDir: report.distDir,
    summary: {
      assetCount: report.summary.assetCount,
      jsAssetCount: report.summary.jsAssetCount,
      cssAssetCount: report.summary.cssAssetCount,
      totalGzipBytes: report.summary.totalGzipBytes,
      totalJsGzipBytes: report.summary.totalJsGzipBytes,
      totalCssGzipBytes: report.summary.totalCssGzipBytes,
      initialJsGzipBytes: report.summary.initialJsGzipBytes,
      initialCssGzipBytes: report.summary.initialCssGzipBytes,
    },
    chunks,
  };
}

function normalizeSnapshot(payload, sourcePath) {
  if (!payload?.summary || !payload?.chunks) return null;
  return {
    checkedAt: payload.checkedAt || null,
    sourcePath,
    summary: payload.summary,
    chunks: payload.chunks,
  };
}

function readPreviousSnapshot({ latestPath, reportPath }) {
  const latest = normalizeSnapshot(readJson(latestPath), latestPath);
  if (latest) return latest;
  const report = readJson(reportPath);
  return report ? normalizeSnapshot(snapshot(report), reportPath) : null;
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

function percentDelta(current, previous) {
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

function compareMetric(current, previous, metric) {
  const currentValue = current?.[metric] ?? null;
  const previousValue = previous?.[metric] ?? null;
  return {
    metric,
    current: currentValue,
    previous: previousValue,
    delta: numericDelta(currentValue, previousValue),
    percentDelta: percentDelta(currentValue, previousValue),
  };
}

function buildTrend(currentSnapshot, previousSnapshot) {
  if (!previousSnapshot) {
    return {
      available: false,
      reason: 'No previous dashboard build size snapshot found.',
    };
  }

  const summaryMetrics = [
    'totalGzipBytes',
    'totalJsGzipBytes',
    'initialJsGzipBytes',
    'totalCssGzipBytes',
    'assetCount',
  ].map((metric) => compareMetric(currentSnapshot.summary, previousSnapshot.summary, metric));

  const currentChunkKeys = new Set(Object.keys(currentSnapshot.chunks));
  const previousChunkKeys = new Set(Object.keys(previousSnapshot.chunks));
  const chunkComparisons = [];

  for (const key of currentChunkKeys) {
    const current = currentSnapshot.chunks[key];
    const previous = previousSnapshot.chunks[key];
    if (!previous) continue;
    chunkComparisons.push({
      key,
      label: current.label,
      kind: current.kind,
      path: current.path,
      previousPath: previous.path,
      gzipBytes: current.gzipBytes,
      previousGzipBytes: previous.gzipBytes,
      gzipBytesDelta: numericDelta(current.gzipBytes, previous.gzipBytes),
      gzipBytesPercentDelta: percentDelta(current.gzipBytes, previous.gzipBytes),
      sizeBytes: current.sizeBytes,
      previousSizeBytes: previous.sizeBytes,
      sizeBytesDelta: numericDelta(current.sizeBytes, previous.sizeBytes),
      sizeBytesPercentDelta: percentDelta(current.sizeBytes, previous.sizeBytes),
    });
  }

  return {
    available: true,
    previousCheckedAt: previousSnapshot.checkedAt,
    previousSource: previousSnapshot.sourcePath,
    addedChunks: [...currentChunkKeys].filter((key) => !previousChunkKeys.has(key)).length,
    removedChunks: [...previousChunkKeys].filter((key) => !currentChunkKeys.has(key)).length,
    summaryMetrics,
    chunkComparisons,
    largestChunkIncreases: chunkComparisons
      .filter((item) => typeof item.gzipBytesDelta === 'number' && item.gzipBytesDelta > 0)
      .sort((a, b) => b.gzipBytesDelta - a.gzipBytesDelta)
      .slice(0, 8),
  };
}

function exceedsRegression(delta, percent, absoluteThreshold, percentThreshold) {
  return typeof delta === 'number'
    && typeof percent === 'number'
    && delta > absoluteThreshold
    && percent > percentThreshold;
}

function trendMetricWarning(warnings, metric, trend, absoluteThreshold, percentThreshold, messageLabel) {
  const comparison = trend.summaryMetrics?.find((item) => item.metric === metric);
  if (!comparison || !exceedsRegression(comparison.delta, comparison.percentDelta, absoluteThreshold, percentThreshold)) return;
  addWarning(
    warnings,
    `trend-${metric}`,
    metric,
    comparison.current,
    { delta: absoluteThreshold, percent: percentThreshold },
    `${messageLabel} increased by ${formatBytes(comparison.delta)} (${formatPercent(comparison.percentDelta)}) from the previous build size snapshot.`,
    {
      previousValue: comparison.previous,
      delta: comparison.delta,
      percentDelta: comparison.percentDelta,
    },
  );
}

function evaluateTrendWarnings(trend, thresholds) {
  const warnings = [];
  if (!trend?.available) return warnings;

  trendMetricWarning(
    warnings,
    'totalJsGzipBytes',
    trend,
    thresholds.trendTotalJsDeltaBytes,
    thresholds.trendTotalJsPercent,
    'Total JS gzip size',
  );
  trendMetricWarning(
    warnings,
    'initialJsGzipBytes',
    trend,
    thresholds.trendInitialJsDeltaBytes,
    thresholds.trendInitialJsPercent,
    'Initial JS gzip size',
  );
  trendMetricWarning(
    warnings,
    'totalCssGzipBytes',
    trend,
    thresholds.trendTotalCssDeltaBytes,
    thresholds.trendTotalCssPercent,
    'Total CSS gzip size',
  );

  const assetCount = trend.summaryMetrics?.find((item) => item.metric === 'assetCount');
  if (assetCount && exceedsRegression(
    assetCount.delta,
    assetCount.percentDelta,
    thresholds.trendAssetCountDelta,
    thresholds.trendAssetCountPercent,
  )) {
    addWarning(
      warnings,
      'trend-asset-count',
      'assetCount',
      assetCount.current,
      {
        delta: thresholds.trendAssetCountDelta,
        percent: thresholds.trendAssetCountPercent,
      },
      `Asset count increased by ${formatDelta(assetCount.delta)} (${formatPercent(assetCount.percentDelta)}) from the previous build size snapshot.`,
      {
        previousValue: assetCount.previous,
        delta: assetCount.delta,
        percentDelta: assetCount.percentDelta,
      },
    );
  }

  for (const chunk of trend.chunkComparisons || []) {
    if (!exceedsRegression(
      chunk.gzipBytesDelta,
      chunk.gzipBytesPercentDelta,
      thresholds.trendChunkDeltaBytes,
      thresholds.trendChunkPercent,
    )) {
      continue;
    }
    addWarning(
      warnings,
      'trend-chunk-gzip-size',
      `${chunk.key}.gzipBytes`,
      chunk.gzipBytes,
      {
        delta: thresholds.trendChunkDeltaBytes,
        percent: thresholds.trendChunkPercent,
      },
      `${chunk.label} ${chunk.kind.toUpperCase()} gzip size increased by ${formatBytes(chunk.gzipBytesDelta)} (${formatPercent(chunk.gzipBytesPercentDelta)}) from the previous build size snapshot.`,
      {
        chunk,
        previousValue: chunk.previousGzipBytes,
        delta: chunk.gzipBytesDelta,
        percentDelta: chunk.gzipBytesPercentDelta,
      },
    );
  }

  return warnings;
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
    '# Dashboard Build Size Summary',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Build: ${report.build.enabled ? `${report.build.command} in ${report.build.durationMs}ms` : 'skipped'}`,
    `- Dist: ${report.distDir}`,
    `- Assets: ${report.summary.assetCount}`,
    `- Total gzip: ${formatBytes(report.summary.totalGzipBytes)}`,
    `- Total JS gzip: ${formatBytes(report.summary.totalJsGzipBytes)}`,
    `- Initial JS gzip: ${formatBytes(report.summary.initialJsGzipBytes)}`,
    `- Soft warnings: ${report.warnings.length}`,
    '',
    '## Soft Warnings',
    '',
  ];

  if (report.warnings.length) {
    for (const warning of report.warnings) {
      lines.push(`- ${warning.message}`);
    }
  } else {
    lines.push('_No soft warnings._');
  }

  lines.push('', '## Initial Resources', '');
  lines.push(...markdownRows(report.summary.initialAssets, [
    { label: 'Path', value: (item) => item.path },
    { label: 'Kind', value: (item) => item.kind },
    { label: 'Size', value: (item) => formatBytes(item.sizeBytes) },
    { label: 'Gzip', value: (item) => formatBytes(item.gzipBytes) },
  ]));

  lines.push('', '## Largest JS Chunks', '');
  lines.push(...markdownRows(report.summary.largestJs, [
    { label: 'Path', value: (item) => item.path },
    { label: 'Label', value: (item) => item.label },
    { label: 'Size', value: (item) => formatBytes(item.sizeBytes) },
    { label: 'Gzip', value: (item) => formatBytes(item.gzipBytes) },
    { label: 'Initial', value: (item) => (item.initial ? 'yes' : 'no') },
  ]));

  lines.push('', '## Largest CSS Chunks', '');
  lines.push(...markdownRows(report.summary.largestCss, [
    { label: 'Path', value: (item) => item.path },
    { label: 'Label', value: (item) => item.label },
    { label: 'Size', value: (item) => formatBytes(item.sizeBytes) },
    { label: 'Gzip', value: (item) => formatBytes(item.gzipBytes) },
    { label: 'Initial', value: (item) => (item.initial ? 'yes' : 'no') },
  ]));

  lines.push('', '## Tracked Chunks', '');
  lines.push(...markdownRows(Object.entries(report.summary.trackedChunks).map(([key, chunk]) => ({ key, chunk })).filter((item) => item.chunk), [
    { label: 'Key', value: (item) => item.key },
    { label: 'Path', value: (item) => item.chunk.path },
    { label: 'Size', value: (item) => formatBytes(item.chunk.sizeBytes) },
    { label: 'Gzip', value: (item) => formatBytes(item.chunk.gzipBytes) },
    { label: 'Initial', value: (item) => (item.chunk.initial ? 'yes' : 'no') },
  ]));

  const trend = report.trend;
  lines.push('', '## Trend', '');
  if (!trend?.available) {
    lines.push(`_Trend unavailable: ${trend?.reason || 'not enough data'}_`);
  } else {
    lines.push(
      `- Previous snapshot: ${trend.previousCheckedAt || 'unknown'} (${trend.previousSource || 'unknown source'})`,
      `- Added chunks: ${trend.addedChunks}`,
      `- Removed chunks: ${trend.removedChunks}`,
      '',
      '### Summary Deltas',
      '',
    );
    lines.push(...markdownRows(trend.summaryMetrics, [
      { label: 'Metric', value: (item) => item.metric },
      { label: 'Current', value: (item) => item.metric === 'assetCount' ? item.current : formatBytes(item.current) },
      { label: 'Previous', value: (item) => item.metric === 'assetCount' ? item.previous : formatBytes(item.previous) },
      { label: 'Delta', value: (item) => item.metric === 'assetCount' ? formatDelta(item.delta) : formatBytes(item.delta) },
      { label: 'Delta %', value: (item) => formatPercent(item.percentDelta) },
    ]));
    lines.push('', '### Largest Chunk Gzip Increases', '');
    lines.push(...markdownRows(trend.largestChunkIncreases, [
      { label: 'Chunk', value: (item) => item.label },
      { label: 'Kind', value: (item) => item.kind },
      { label: 'Current', value: (item) => formatBytes(item.gzipBytes) },
      { label: 'Previous', value: (item) => formatBytes(item.previousGzipBytes) },
      { label: 'Delta', value: (item) => formatBytes(item.gzipBytesDelta) },
      { label: 'Delta %', value: (item) => formatPercent(item.gzipBytesPercentDelta) },
    ]));
  }

  return `${lines.join('\n')}\n`;
}

async function runBuildSizeQa(options) {
  const distDir = path.resolve(repoRoot, options.distDir);
  const outDir = path.resolve(repoRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'report.json');
  const latestPath = path.join(outDir, 'latest.json');
  const summaryPath = path.join(outDir, 'summary.md');
  const previousSnapshot = options.trend ? readPreviousSnapshot({ latestPath, reportPath }) : null;
  const build = options.runBuild
    ? await runDashboardBuild()
    : { enabled: false, command: null, durationMs: 0, exitCode: null };

  const assets = collectAssets(distDir);
  const summary = buildSummary(assets);
  const currentReportBase = {
    checkedAt: new Date().toISOString(),
    distDir,
    outDir,
    build,
    thresholds: { ...options.thresholds },
    assets,
    summary,
  };
  const trend = options.trend
    ? buildTrend(snapshot({ ...currentReportBase, warnings: [], trend: null }), previousSnapshot)
    : { available: false, reason: 'Trend comparison disabled.' };
  const warnings = [
    ...evaluateAbsoluteWarnings(summary, options.thresholds),
    ...evaluateTrendWarnings(trend, options.thresholds),
  ];
  const report = {
    ...currentReportBase,
    trend,
    warnings,
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(snapshot(report), null, 2)}\n`, 'utf8');
  writeFileSync(summaryPath, buildMarkdownSummary(report), 'utf8');

  return { report, reportPath, latestPath, summaryPath };
}

function printSummary(report, reportPath, summaryPath) {
  console.log(`Dashboard build size QA completed: ${report.summary.assetCount} assets`);
  console.log(`Total gzip: ${formatBytes(report.summary.totalGzipBytes)}`);
  console.log(`Total JS gzip: ${formatBytes(report.summary.totalJsGzipBytes)}`);
  console.log(`Initial JS gzip: ${formatBytes(report.summary.initialJsGzipBytes)}`);
  const largestJs = report.summary.largestJs[0];
  if (largestJs) {
    console.log(`Largest JS: ${largestJs.path} ${formatBytes(largestJs.gzipBytes)} gzip`);
  }
  if (report.warnings.length) {
    console.warn(`Soft warnings: ${report.warnings.length}`);
    for (const warning of report.warnings.slice(0, 5)) {
      console.warn(`- ${warning.message}`);
    }
  } else {
    console.log('Soft warnings: 0');
  }
  if (report.trend?.available) {
    console.log(`Trend: compared with ${report.trend.previousCheckedAt || 'previous snapshot'}`);
    const largestIncrease = report.trend.largestChunkIncreases?.[0];
    if (largestIncrease) {
      console.log(`Largest chunk increase: ${largestIncrease.label} ${formatBytes(largestIncrease.gzipBytesDelta)} (${formatPercent(largestIncrease.gzipBytesPercentDelta)})`);
    }
  } else if (report.trend) {
    console.log(`Trend: ${report.trend.reason}`);
  }
  console.log(`Report: ${reportPath}`);
  console.log(`Summary: ${summaryPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { report, reportPath, summaryPath } = await runBuildSizeQa(options);
  printSummary(report, reportPath, summaryPath);
  process.exitCode = options.failOnWarning && report.warnings.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
