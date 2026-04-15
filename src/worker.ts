import cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import { AgentSwarmOrchestrator } from './workflows/swarm-pipeline';
import { scanTicker, AlertSignal, generateTechSnapshot } from './tools/market-data';
import { sendAlertBatch, sendStopLossAlert, sendReportSummary, sendMessage } from './utils/telegram';
import { pollAllFeeds } from './tools/rss-monitor';
import { watchIPO } from './tools/edgar-monitor';
import { TrendRadar } from './agents/trend/trend-radar';
import { scanAllSectorETFs, generateSectorOverview } from './tools/sector-scanner';
import { getActiveTickers, generateDynamicWatchlistOverview } from './utils/dynamic-watchlist';
import { startInteractiveBot } from './agents/telegram/interactive-bot';
import { MacroContextEngine } from './agents/macro/macro-context';
import { updatePerformance, formatPerformanceReport } from './utils/performance-tracker';
import { NarrativeLifecycleEngine } from './agents/lifecycle/engine';
import { healthMonitor } from './utils/health-monitor';
import { taskQueue } from './utils/task-queue';
import { startServer } from './server/app';
import {
  syncHeatTransferGraphOpportunities,
  syncNewCodeRadarOpportunities,
  dispatchMission,
  createQueuedMission,
  appendMissionEvent,
  getMission,
  markMissionCanceled,
  markMissionRunRunning,
  markMissionRunStage,
  touchMissionRunHeartbeat,
  completeMissionRun,
  failMissionRun,
  cancelMissionRun,
  requeueMissionRunsForTasks,
} from './workflows';
import { eventBus } from './utils/event-bus';
import { logger } from './utils/logger';
import { getDb } from './db';
import { T1_SENTINEL_ENABLED_DEFAULT, T1_COOLDOWN_MS, T4_INTERVAL_MS, DEFAULT_LEADER_TICKERS } from './config/constants';
import { getRuntimeConfig } from './config';

const TREND_COOLDOWN_MS = 30 * 60 * 1000;
const T4_CRON_EXPRESSION = T4_INTERVAL_MS === 15 * 60 * 1000
  ? '*/15 * * * *'
  : `*/${Math.max(1, Math.floor(T4_INTERVAL_MS / 60000))} * * * *`;
const trendCooldown = new Map<string, number>();

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[Shutdown] Received ${signal}, draining...`);

  const maxWait = 30_000;
  const pollInterval = 1_000;
  let waited = 0;
  while (taskQueue.getRunningCount() > 0 && waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;
  }

  if (taskQueue.getRunningCount() > 0) {
    logger.warn(`[Shutdown] Timed out waiting for ${taskQueue.getRunningCount()} tasks to drain`);
  } else {
    logger.info(`[Shutdown] All tasks drained`);
  }

  try {
    const db = await getDb();
    await db.close();
    logger.info(`[Shutdown] Database closed`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Shutdown] Error closing database: ${msg}`);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString();
}

function getLeaderTickers(): string[] {
  const runtimeTickers = getRuntimeConfig().leaderTickers;
  return runtimeTickers.length > 0 ? [...runtimeTickers] : [...DEFAULT_LEADER_TICKERS];
}

function normalizeRecoverResult(
  recovered: unknown,
): { totalRecovered: number; recoveredRunningTaskIds: string[] } {
  if (typeof recovered === 'number') {
    return {
      totalRecovered: recovered,
      recoveredRunningTaskIds: [],
    };
  }

  const totalRecovered = typeof (recovered as { totalRecovered?: unknown } | null)?.totalRecovered === 'number'
    ? (recovered as { totalRecovered: number }).totalRecovered
    : 0;
  const recoveredRunningTaskIds = Array.isArray(
    (recovered as { recoveredRunningTaskIds?: unknown } | null)?.recoveredRunningTaskIds,
  )
    ? (recovered as { recoveredRunningTaskIds: unknown[] }).recoveredRunningTaskIds
        .filter((taskId): taskId is string => typeof taskId === 'string')
    : [];

  return {
    totalRecovered,
    recoveredRunningTaskIds,
  };
}

// ==========================================
// OPENCLAW V4 SENTINEL DAEMON
// 多级触发哨兵模式 + TrendRadar 趋势雷达 + 实时交互(Interactive Bot)
// ==========================================

logger.info(`\n==================================================================`);
logger.info(`⚡ OPENCLAW V4 SENTINEL DAEMON STARTED`);
logger.info(`   Mode: Multi-trigger Watchlist Sentinel + TrendRadar + RAG Bot`);
logger.info(`   Triggers: T1(5min 价量), T2(15min RSS/EDGAR), T3(08:30 日报), T4(15min 趋势雷达)`);
logger.info(`==================================================================\n`);

const orchestrator = new AgentSwarmOrchestrator();
const trendRadar = new TrendRadar();
const macroEngine = new MacroContextEngine();
const lifecycleEngine = new NarrativeLifecycleEngine();

// ==========================================
// 初始化系统监控与任务队列
// ==========================================
(async () => {
  // 1. 检测大模型连通性
  await healthMonitor.checkConnectivity();
  // 2. 恢复积压的任务
  const recovered = normalizeRecoverResult(await taskQueue.recover());
  if (recovered.recoveredRunningTaskIds.length > 0) {
    const requeuedRuns = await requeueMissionRunsForTasks(recovered.recoveredRunningTaskIds);
    logger.info(`[Sentinel] 🔁 已将 ${requeuedRuns} 个 Mission run 重置为 queued`);
  }
  if (recovered.totalRecovered > 0) logger.info(`[Sentinel] 🔄 恢复了 ${recovered.totalRecovered} 个积压任务`);
  // 3. 注册队列处理器
  taskQueue.onProcess(async (task) => {
    const runId = task.runId;
    const workerLeaseId = `worker:${process.pid}:${task.id}`;
    const currentRunStage = () => {
      if (!task.progress) return 'dispatch' as const;
      return task.progress;
    };
    const shouldCancel = async () => {
      const currentTask = await taskQueue.getTask(task.id);
      return currentTask?.status === 'canceled';
    };
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      if (runId) {
        await markMissionRunRunning(runId, workerLeaseId);
        heartbeatTimer = setInterval(() => {
          void touchMissionRunHeartbeat(runId, currentRunStage());
        }, 15_000);
      }

      // === 使用 Mission Dispatcher 封装 OpenClaw + TA + OpenBB 并行执行 ===
      const isTicker = /^\$?[A-Z]{1,5}$/.test(task.query.trim());
      const mode = isTicker ? 'analyze' as const : 'explore' as const;

      const mission = await dispatchMission(
        {
          mode,
          query: task.query,
          tickers: isTicker ? [task.query.replace('$', '').toUpperCase()] : [],
          depth: task.depth,
          source: task.source,
        },
        // executeOpenClaw 回调: 调用原始 orchestrator
        async (query: string, depth: string, missionId: string) => {
          const result = await orchestrator.executeMission(
            query,
            depth as any,
            task.statePayload ? JSON.parse(task.statePayload) : null,
            async (state) => {
              await taskQueue.updateTaskState(task.id, JSON.stringify(state));
            },
            (progress) => {
              task.progress = progress;
              void taskQueue.updateProgress(task.id, progress);
              if (runId) {
                void markMissionRunStage(runId, progress);
              }
              if (task.missionId) {
                const currentMission = getMission(task.missionId);
                if (currentMission) {
                  appendMissionEvent(task.missionId, currentMission.createdAt, {
                    type: 'stage',
                    status: currentMission.status,
                    phase: progress,
                    message: `Mission entered ${progress} stage`,
                    ...(runId ? { meta: { runId } } : {}),
                  });
                }
              }
            },
            shouldCancel,
            missionId,
            runId
          );
          return typeof result === 'string' ? result : JSON.stringify(result);
        },
        task.missionId,
        shouldCancel,
        runId,
      );

      const latestTask = await taskQueue.getTask(task.id);
      if (latestTask?.status === 'canceled') {
        if (task.missionId) {
          markMissionCanceled(task.missionId, 'Canceled by user');
        }
        if (runId) {
          await cancelMissionRun(runId, 'Canceled by user');
        }
        return;
      }

      // 记录 Mission 共识到日志
      if (mission.consensus.length > 0) {
        const consensusSummary = mission.consensus
          .map(c => {
            const vetoed = 'vetoed' in (c as any) ? Boolean((c as any).vetoed) : false;
            const vetoReason = 'vetoReason' in (c as any) ? (c as any).vetoReason : '';
            const vetoNote = vetoed ? ` (vetoed: ${vetoReason ?? ''})` : '';
            return `${c.ticker}: OC=${c.openclawVerdict ?? '-'} TA=${c.taVerdict ?? '-'} → ${c.agreement}${vetoNote}`;
          })
          .join(' | ');
        eventBus.emitSystem('info', `📊 双大脑共识: ${consensusSummary}`);
      }

      if (runId) {
        const degradedFlags = mission.status === 'main_only' ? ['main_only'] : undefined;
        await completeMissionRun(runId, degradedFlags);
      }

      healthMonitor.recordSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const canceled = msg === 'Canceled by user';
      if (task.missionId && canceled) {
        markMissionCanceled(task.missionId, msg);
      }
      if (runId) {
        if (canceled) {
          await cancelMissionRun(runId, msg);
        } else {
          await failMissionRun(runId, msg);
        }
      }
      if (!canceled) {
        healthMonitor.recordFailure(msg);
      }
      throw e;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  });
  taskQueue.processNext(); // Trigger processing for recovered tasks
  // 4. 启动本地 API 供大屏使用
  startServer(3000);
})();

// 启动实时交互长轮询机器人
startInteractiveBot();

// 加载 Watchlist
interface WatchlistTicker {
  symbol: string;
  name: string;
  sector: string;
  narrative: string;
  role?: 'sector_leader' | 'target';
  alerts: {
    breakAboveSMA?: number[];
    breakBelowSMA?: number[];
    volumeSurgeMultiple?: number;
    edgarWatch?: boolean;
  };
  status: string;
}

interface WatchlistConfig {
  tickers: WatchlistTicker[];
  eventSources: Array<{ name: string; url: string; keywords: string[] }>;
  sectorETFs?: Array<{ symbol: string; name: string; sector: string }>;
  redditSources?: Array<{ subreddit: string; type: string; limit: number }>;
  googleNewsKeywords?: string[];
}

function loadWatchlist(): WatchlistConfig {
  const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
  if (!fs.existsSync(watchlistPath)) {
    logger.error('[Sentinel] ❌ watchlist.json not found!');
    return { tickers: [], eventSources: [] };
  }
  const config: WatchlistConfig = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
  config.tickers = config.tickers.map(t => ({
    ...t,
    role: t.role ?? 'target',
  }));
  return config;
}

// ==========================================
// TRIGGER 1: 价量哨兵 (每5分钟) — 含 Cooldown 去重
// ==========================================

// T1 开关
const T1_ENABLED = process.env.T1_ENABLED ? process.env.T1_ENABLED !== 'false' : T1_SENTINEL_ENABLED_DEFAULT;

// Cooldown 去重
export const alertCooldown = new Map<string, number>(); // ticker → lastAlertTimestamp
const COOLDOWN_MS = Number(process.env.T1_COOLDOWN_MS) || T1_COOLDOWN_MS;

export function shouldAlert(ticker: string): boolean {
  const lastAlert = alertCooldown.get(ticker);
  if (lastAlert && Date.now() - lastAlert < COOLDOWN_MS) {
    logger.info(`[T1] ⏳ ${ticker} 在冷却期内，跳过 (${Math.round((Date.now() - lastAlert) / 60000)}min ago)`);
    return false;
  }
  alertCooldown.set(ticker, Date.now());
  return true;
}

export function cleanupCooldown() {
  const expiry = Date.now() - 2 * 60 * 60 * 1000; // 2 小时
  for (const [ticker, ts] of alertCooldown.entries()) {
    if (ts < expiry) alertCooldown.delete(ticker);
  }
}

if (T1_ENABLED) {
  cron.schedule('*/5 * * * *', async () => {
    if (isShuttingDown) return;
    if (!getRuntimeConfig().t1Enabled) return;
    cleanupCooldown();
    const watchlist = loadWatchlist();
    const targets = watchlist.tickers.filter(t => t.role === 'target');
    const allAlerts: AlertSignal[] = [];

    for (const t of targets) {
      try {
        const alerts = await scanTicker(t.symbol, {
          breakAboveSMA: [20, 250],
          breakBelowSMA: [20],
          volumeSurgeMultiple: 2.0,
        });
        for (const alert of alerts) {
          if (shouldAlert(alert.symbol)) {
            allAlerts.push(alert);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`[T1] 扫描 ${t.symbol} 失败: ${msg}`);
      }
    }

    if (allAlerts.length > 0) {
      await sendAlertBatch(allAlerts.map(a => ({
        symbol: a.symbol,
        details: a.details,
        severity: a.severity,
      })));
      const critical = allAlerts.filter(a => a.severity === 'critical');
      for (const a of critical) {
        await createQueuedMission({
          query: `T1 异动: ${a.details}`,
          depth: 'quick',
          source: 'T1_PriceScan',
          priority: 80,
        });
      }
    }
  });
  logger.info('[Sentinel] ✅ T1 价量哨兵已启用 (每5分钟, cooldown=' + COOLDOWN_MS / 60000 + 'min)');
} else {
  logger.info('[Sentinel] ⏸️ T1 价量哨兵已禁用 (T1_ENABLED=false)');
}

// ==========================================
// TRIGGER 2: 媒体资讯与公告 (每小时的第30分钟触发)
// ==========================================
cron.schedule('30 * * * *', async () => {
  if (isShuttingDown) return;
  const watchlist = loadWatchlist();
  
  // RSS 政府公告轮询
  if (watchlist.eventSources && watchlist.eventSources.length > 0) {
    const rssAlerts = await pollAllFeeds(watchlist.eventSources);
    
    if (rssAlerts.length > 0) {
      // 推送事件通知
      let msg = `🏛️ *政府/政策事件警报* (${rssAlerts.length} 条)\n\n`;
      rssAlerts.forEach(a => {
        msg += `📌 *[${a.source}]* ${a.title}\n   关键词: ${a.matchedKeywords.join(', ')}\n\n`;
      });
      await sendMessage(msg);

      // 高优先级事件自动触发分析
      for (const alert of rssAlerts) {
        if (alert.matchedKeywords.length >= 2) {
          logger.info(`[Sentinel] 🧠 高命中率事件排队分析: ${alert.title}`);
          // T2 事件驱动使用 'standard' 深度
          await createQueuedMission({
            query: alert.title,
            depth: 'standard',
            source: 'T2_RSS_Event',
            priority: 50,
          });
        }
      }
    }
  }

  // SEC EDGAR IPO 监控
  const edgarWatchCompanies = watchlist.tickers
    .filter(t => t.alerts.edgarWatch)
    .map(t => t.name);
  
  if (edgarWatchCompanies.length > 0) {
    const filings = await watchIPO(edgarWatchCompanies);
    if (filings.length > 0) {
      const syncedOpportunities = await syncNewCodeRadarOpportunities(filings);
      logger.info(`[Sentinel] 🗓️ New Code Radar auto-synced ${syncedOpportunities.length} opportunity cards from EDGAR`);
      let msg = `📄 *SEC EDGAR 新文件* (${filings.length} 份)\n\n`;
      filings.forEach(f => {
        msg += `📌 *[${f.formType}]* ${f.companyName} — ${f.filedAt}\n   ${f.url}\n\n`;
      });
      await sendMessage(msg);
    }
  }
});

// ==========================================
// TRIGGER 3: 每天 08:30 AM — 全量 Watchlist 日报
// ==========================================
cron.schedule('30 08 * * 1-5', async () => {
  if (isShuttingDown) return;
  const watchlist = loadWatchlist();
  logger.info(`\n[Sentinel] 📊 执行每日全量技术面快照...`);

  let snapshot = '📊 *每日 Watchlist 技术面快照*\n\n';
  for (const ticker of watchlist.tickers) {
    try {
      const tech = await generateTechSnapshot(ticker.symbol);
      snapshot += `${tech}\n`;
    } catch (e: unknown) {
      snapshot += `[${ticker.symbol}] 数据获取失败\n`;
    }
  }

  // 新增：板块 ETF 概览
  try {
    const sectorSignals = await scanAllSectorETFs();
    snapshot += `\n${generateSectorOverview(sectorSignals)}`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Sentinel] Sector scan failed: ${msg}`);
  }

  // 新增：动态观察池概览
  snapshot += `\n${generateDynamicWatchlistOverview()}`;

  // ==========================================
  // [系统进阶集成]
  // 按照 Phase 4 架构挂载：宏观环境、历史绩效反馈、叙事生命周期防卖飞
  // ==========================================

  try {
    const macroAnalysis = await macroEngine.analyze();
    snapshot += `\n${macroEngine.formatForReport(macroAnalysis)}`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Sentinel] Macro analysis failed: ${msg}`);
  }

  try {
    const perfSummary = await updatePerformance();
    snapshot += `\n${formatPerformanceReport(perfSummary)}`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Sentinel] Performance tracking failed: ${msg}`);
  }

  try {
    const { messages, antiSellGuards } = await lifecycleEngine.evaluateAllActiveNarratives();
    if (messages.length > 0) {
      snapshot += `\n## 🛡️ 叙事生命周期干预引擎 (防卖飞/逃顶)\n\n`;
      messages.forEach(m => snapshot += `> ${m}\n\n`);
    }
    for (const msg of messages) {
      if (msg.includes('STOP_LOSS_TRIGGER')) {
        const tickerMatch = msg.match(/龙头\s+(\$?[A-Z]{1,5})/);
        if (tickerMatch) {
          const ticker = tickerMatch[1]!.replace('$', '');
          await sendStopLossAlert(ticker, `叙事生命周期引擎警告:\n${msg}`);
        }
      }
    }
    if (antiSellGuards && antiSellGuards.length > 0) {
      snapshot += `\n## 🚦 防卖飞守卫 (Anti-Sell Guards)\n\n`;
      antiSellGuards.forEach((g: any) => snapshot += `> ${typeof g === 'string' ? g : `${g.ticker}: ${g.reason}`}\n\n`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Sentinel] Lifecycle evaluation failed: ${msg}`);
  }

  try {
    const { checkSMACross } = await import('./tools/market-data.js');
    for (const leader of getLeaderTickers()) {
      const smaResults = await checkSMACross(leader, [50]);
      const sma50 = smaResults.find((r: any) => r.period === 50);
      if (sma50 && sma50.position === 'below') {
        const dropPercent = ((sma50.sma - sma50.price) / sma50.sma) * 100;
        if (dropPercent >= 5) {
          await sendStopLossAlert(leader,
            `🔴 [板块止损红线] 龙头 ${leader} 放量跌破 50日均线 ${dropPercent.toFixed(1)}%!\n` +
            `当前: $${sma50.price} | SMA50: $${sma50.sma}\n` +
            `画像纪律: 板块全线防御减仓！`
          );
        }
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Sentinel] Leader SMA50 check failed: ${msg}`);
  }

  await sendReportSummary('Watchlist 盘前扫描', snapshot);

  // 对每个赛道下发一次深度扫查任务
  const sectors = [...new Set(watchlist.tickers.map(t => t.sector))];
  for (const sector of sectors) {
    const sectorTickers = watchlist.tickers.filter(t => t.sector === sector);
    const narrative = sectorTickers[0]?.narrative || sector;
    logger.info(`[Sentinel] 🧠 赛道每日深度分析排队: ${sector} — ${narrative}`);
    // T3 盘前日报使用 'deep' 深度，但不占用最高优先级
    await createQueuedMission({
      query: narrative,
      depth: 'deep',
      source: 'T3_Daily_Sector',
      priority: 10,
    });
  }
});

// ==========================================
// TRIGGER 4: 趋势雷达媒体扫描 (每小时的整点触发: 寻找新的交易机会)
// ==========================================
cron.schedule(T4_CRON_EXPRESSION, async () => {
  if (isShuttingDown) return;
  logger.info(`\n[Sentinel] 📡 启动每小时媒体资讯扫描 (TrendRadar)...`);
  
  try {
    const analysis = await trendRadar.scan();
    const syncedGraphs = await syncHeatTransferGraphOpportunities(getActiveTickers());
    if (syncedGraphs.length > 0) {
      logger.info(`[Sentinel] 🔗 Heat Transfer Graph auto-synced ${syncedGraphs.length} relay opportunities`);
    }
    
    // 推送趋势概览到 Telegram
    const telegramMsg = trendRadar.formatForTelegram(analysis);
    await sendMessage(telegramMsg);

    // 新版：如果趋势报告中提及了大量 ticker，自动排队触发分析
    if (analysis.mentionedTickers && analysis.mentionedTickers.length >= 5) {
      logger.info(`[Sentinel] 🚀 趋势报告发现 ${analysis.mentionedTickers.length} 个标的，排队标准分析...`);
      const topicSummary = analysis.report.substring(0, 200).replace(/\n/g, ' ');
      const hash = simpleHash(analysis.report);
      const last = trendCooldown.get(hash);
      if (!last || Date.now() - last >= TREND_COOLDOWN_MS) {
        trendCooldown.set(hash, Date.now());
        await createQueuedMission({
          query: `趋势雷达洞察 — ${topicSummary}`,
          depth: 'standard',
          source: 'T4_Trend_Radar',
          priority: 30,
        });
      } else {
        logger.info(`[Sentinel] T4 TrendRadar cooldown active for this report. Skipping enqueue.`);
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Sentinel] TrendRadar scan failed: ${msg}`);
  }
});

// ==========================================
// 手动触发模式
// ==========================================
if (process.argv.includes('--run-now')) {
  logger.info(`[Sentinel] '--run-now' detected. Executing immediate Watchlist scan...\n`);

  (async () => {
    const watchlist = loadWatchlist();

    // 先执行一轮技术面快照
    logger.info(`[Sentinel] 📊 技术面快照:`);
    for (const ticker of watchlist.tickers) {
      try {
        const tech = await generateTechSnapshot(ticker.symbol);
        logger.info(`  ${tech}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.info(`  [${ticker.symbol}] 数据获取失败: ${msg}`);
      }
    }

    // 板块 ETF 概览
    logger.info(`\n[Sentinel] 📊 板块 ETF 概览:`);
    try {
      const sectorSignals = await scanAllSectorETFs();
      logger.info(generateSectorOverview(sectorSignals));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.info(`  板块扫描失败: ${msg}`);
    }

    // 再执行异动检测
    logger.info(`\n[Sentinel] 🔍 价量异动扫描:`);
    for (const ticker of watchlist.tickers) {
      try {
        const alerts = await scanTicker(ticker.symbol, ticker.alerts);
        if (alerts.length > 0) {
          alerts.forEach(a => logger.info(`  ⚡ ${a.details}`));
        } else {
          logger.info(`  ✅ ${ticker.symbol}: 无异动`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.info(`  ❌ ${ticker.symbol}: 扫描失败 — ${msg}`);
      }
    }

    // 动态观察池概览
    const dynamicTickers = getActiveTickers();
    if (dynamicTickers.length > 0) {
      logger.info(`\n[Sentinel] 📋 动态观察池 (${dynamicTickers.length} 只标的):`);
      for (const dt of dynamicTickers) {
        logger.info(`  ${dt.status === 'focused' ? '🎯' : '👀'} ${dt.symbol} (${dt.name}) | ${dt.chainLevel} | 评分${dt.multibaggerScore} | 来源: ${dt.discoverySource}`);
      }
    } else {
      logger.info(`\n[Sentinel] 📋 动态观察池为空（运行 --trend 触发标的发现）`);
    }

    // TrendRadar 扫描
    if (process.argv.includes('--trend')) {
      logger.info(`\n[Sentinel] 📡 执行 TrendRadar 趋势扫描...`);
      try {
        const analysis = await trendRadar.scan();
        logger.info(trendRadar.formatForTelegram(analysis));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.info(`  TrendRadar 扫描失败: ${msg}`);
      }
    }

    // 可选深度分析
    if (process.argv.includes('--deep')) {
      const query = process.argv[process.argv.indexOf('--deep') + 1] || watchlist.tickers[0]?.narrative || 'AI Infrastructure';
      logger.info(`\n[Sentinel] 🧠 手动触发深度分析: ${query}`);
      await createQueuedMission({
        query,
        depth: 'deep',
        source: 'manual',
        priority: 100,
      });
    }
  })().catch((e: unknown) => logger.error(e instanceof Error ? e.message : String(e)));
}
