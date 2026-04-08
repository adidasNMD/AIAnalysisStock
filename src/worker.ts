import cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import { AgentSwarmOrchestrator } from './workflows/swarm-pipeline';
import { scanTicker, AlertSignal, generateTechSnapshot } from './tools/market-data';
import { sendAlertBatch, sendStopLossAlert, sendEntrySignal, sendReportSummary, sendMessage } from './utils/telegram';
import { pollAllFeeds, alertsToContext, RSSAlert } from './tools/rss-monitor';
import { watchIPO, filingsToContext } from './tools/edgar-monitor';
import { TrendRadar } from './agents/trend/trend-radar';
import { scanAllSectorETFs, generateSectorOverview } from './tools/sector-scanner';
import { getActiveTickers, promoteTicker, generateDynamicWatchlistOverview, DynamicTicker } from './utils/dynamic-watchlist';
import { startInteractiveBot } from './agents/telegram/interactive-bot';
import { MacroContextEngine } from './agents/macro/macro-context';
import { updatePerformance, formatPerformanceReport } from './utils/performance-tracker';
import { NarrativeLifecycleEngine } from './agents/lifecycle/engine';
import { healthMonitor } from './utils/health-monitor';
import { taskQueue } from './utils/task-queue';
import { startServer } from './server/app';
import { dispatchMission } from './workflows/mission-dispatcher';
import { eventBus } from './utils/event-bus';

// Latency cooldown for TrendRadar (T4) to avoid redundant work
const TREND_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const trendCooldown = new Map<string, number>();

// Simple string hash to identify unique TrendRadar outputs
// Task 3: 板块龙头列表（可配置）
const LEADER_TICKERS = ['NVDA', 'AVGO'];

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0; // convert to 32bit integer
  }
  return h.toString();
}

// ==========================================
// OPENCLAW V4 SENTINEL DAEMON
// 多级触发哨兵模式 + TrendRadar 趋势雷达 + 实时交互(Interactive Bot)
// ==========================================

console.log(`\n==================================================================`);
console.log(`⚡ OPENCLAW V4 SENTINEL DAEMON STARTED`);
console.log(`   Mode: Multi-trigger Watchlist Sentinel + TrendRadar + RAG Bot`);
console.log(`   Triggers: T1(5min 价量), T2(15min RSS/EDGAR), T3(08:30 日报), T4(15min 趋势雷达)`);
console.log(`==================================================================\n`);

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
  const recovered = await taskQueue.recover();
  if (recovered > 0) console.log(`[Sentinel] 🔄 恢复了 ${recovered} 个积压任务`);
  // 3. 注册队列处理器
  taskQueue.onProcess(async (task) => {
    try {
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
              taskQueue.updateProgress(task.id, progress);
            },
            async () => {
              const tasks = await taskQueue.getAll();
              const t = tasks.find((tx: any) => tx.id === task.id);
              return t?.status === 'canceled';
            },
            missionId
          );
          return typeof result === 'string' ? result : JSON.stringify(result);
        }
      );

      // 记录 Mission 共识到日志
      if (mission.consensus.length > 0) {
        const consensusSummary = mission.consensus
          .map(c => {
            const vetoNote = c.vetoed ? ` (vetoed: ${c.vetoReason ?? ''})` : '';
            return `${c.ticker}: OC=${c.openclawVerdict ?? '-'} TA=${c.taVerdict ?? '-'} → ${c.agreement}${vetoNote}`;
          })
          .join(' | ');
        eventBus.emitSystem('info', `📊 双大脑共识: ${consensusSummary}`);
      }

      healthMonitor.recordSuccess();
    } catch (e: any) {
      healthMonitor.recordFailure(e.message);
      throw e;
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
    console.error('[Sentinel] ❌ watchlist.json not found!');
    return { tickers: [], eventSources: [] };
  }
  return JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
}

// ==========================================
// TRIGGER 1: 价量异常已被用户要求禁用，因为产生过多重复噪声
// ==========================================
// cron.schedule('*/5 * * * *', async () => { ... });

// ==========================================
// TRIGGER 2: 媒体资讯与公告 (每小时的第30分钟触发)
// ==========================================
cron.schedule('30 * * * *', async () => {
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
          console.log(`[Sentinel] 🧠 高命中率事件排队分析: ${alert.title}`);
          // T2 事件驱动使用 'standard' 深度
          await taskQueue.enqueue(alert.title, 'standard', 'T2_RSS_Event', 50);
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
  const watchlist = loadWatchlist();
  console.log(`\n[Sentinel] 📊 执行每日全量技术面快照...`);

  let snapshot = '📊 *每日 Watchlist 技术面快照*\n\n';
  for (const ticker of watchlist.tickers) {
    try {
      const tech = await generateTechSnapshot(ticker.symbol);
      snapshot += `${tech}\n`;
    } catch (e: any) {
      snapshot += `[${ticker.symbol}] 数据获取失败\n`;
    }
  }

  // 新增：板块 ETF 概览
  try {
    const sectorSignals = await scanAllSectorETFs();
    snapshot += `\n${generateSectorOverview(sectorSignals)}`;
  } catch (e: any) {
    console.error(`[Sentinel] Sector scan failed: ${e.message}`);
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
  } catch (e: any) {
    console.error(`[Sentinel] Macro analysis failed: ${e.message}`);
  }

  try {
    const perfSummary = await updatePerformance();
    snapshot += `\n${formatPerformanceReport(perfSummary)}`;
  } catch (e: any) {
    console.error(`[Sentinel] Performance tracking failed: ${e.message}`);
  }

  try {
    const { messages, antiSellGuards } = await lifecycleEngine.evaluateAllActiveNarratives();
    if (messages.length > 0) {
      snapshot += `\n## 🛡️ 叙事生命周期干预引擎 (防卖飞/逃顶)\n\n`;
      messages.forEach(m => snapshot += `> ${m}\n\n`);
    }

    // Task 3: 叙事生命周期止损触发检测
    if (messages.length > 0) {
      for (const msg of messages) {
        if (msg.includes('STOP_LOSS_TRIGGER')) {
          const tickerMatch = msg.match(/龙头\s+(\$?[A-Z]{1,5})/);
          if (tickerMatch) {
            const ticker = tickerMatch[1]!.replace('$', '');
            await sendStopLossAlert(ticker, `叙事生命周期引擎警告:\n${msg}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.error(`[Sentinel] Lifecycle evaluation failed: ${e.message}`);
  }

  // Task 3: 龙头 SMA50 板块止损检测
  try {
    const { checkSMACross } = await import('./tools/market-data.js');
    for (const leader of LEADER_TICKERS) {
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
  } catch (e: any) {
    console.error(`[Sentinel] Leader SMA50 check failed: ${e.message}`);
  }

  await sendReportSummary('Watchlist 盘前扫描', snapshot);

  // 对每个赛道下发一次深度扫查任务
  const sectors = [...new Set(watchlist.tickers.map(t => t.sector))];
  for (const sector of sectors) {
    const sectorTickers = watchlist.tickers.filter(t => t.sector === sector);
    const narrative = sectorTickers[0]?.narrative || sector;
    console.log(`[Sentinel] 🧠 赛道每日深度分析排队: ${sector} — ${narrative}`);
    // T3 盘前日报使用 'deep' 深度，但不占用最高优先级
    await taskQueue.enqueue(narrative, 'deep', 'T3_Daily_Sector', 10);
  }
});

// ==========================================
// TRIGGER 4: 趋势雷达媒体扫描 (每小时的整点触发: 寻找新的交易机会)
// ==========================================
// Updated to run every 15 minutes to align with cooldown window
cron.schedule('*/15 * * * *', async () => {
  console.log(`\n[Sentinel] 📡 启动每小时媒体资讯扫描 (TrendRadar)...`);
  try {
    const analysis = await trendRadar.scan();

    // 推送趋势概览到 Telegram
    const telegramMsg = trendRadar.formatForTelegram(analysis);
    await sendMessage(telegramMsg);

    // 新版：如果趋势报告中提及了大量 ticker，自动排队触发分析
    if (analysis.mentionedTickers && analysis.mentionedTickers.length >= 5) {
      console.log(`[Sentinel] 🚀 趋势报告发现 ${analysis.mentionedTickers.length} 个标的，排队标准分析...`);
      const topicSummary = analysis.report.substring(0, 200).replace(/\n/g, ' ');
      // T4 趋势轮换使用 'standard' 深度
      // 引入去重/冷却逻辑，避免重复分析同一组标的
      const hash = simpleHash(analysis.report);
      const last = trendCooldown.get(hash);
      if (!last || Date.now() - last >= TREND_COOLDOWN_MS) {
        trendCooldown.set(hash, Date.now());
        await taskQueue.enqueue(`趋势雷达洞察 — ${topicSummary}`, 'standard', 'T4_Trend_Radar', 30);
      } else {
        console.log(`[Sentinel] T4 TrendRadar cooldown active for this report. Skipping enqueue.`);
      }
    }
  } catch (e: any) {
    console.error(`[Sentinel] TrendRadar scan failed: ${e.message}`);
  }
});

// ==========================================
// 手动触发模式
// ==========================================
if (process.argv.includes('--run-now')) {
  console.log(`[Sentinel] '--run-now' detected. Executing immediate Watchlist scan...\n`);

  (async () => {
    const watchlist = loadWatchlist();

    // 先执行一轮技术面快照
    console.log(`[Sentinel] 📊 技术面快照:`);
    for (const ticker of watchlist.tickers) {
      try {
        const tech = await generateTechSnapshot(ticker.symbol);
        console.log(`  ${tech}`);
      } catch (e: any) {
        console.log(`  [${ticker.symbol}] 数据获取失败: ${e.message}`);
      }
    }

    // 板块 ETF 概览
    console.log(`\n[Sentinel] 📊 板块 ETF 概览:`);
    try {
      const sectorSignals = await scanAllSectorETFs();
      console.log(generateSectorOverview(sectorSignals));
    } catch (e: any) {
      console.log(`  板块扫描失败: ${e.message}`);
    }

    // 再执行异动检测
    console.log(`\n[Sentinel] 🔍 价量异动扫描:`);
    for (const ticker of watchlist.tickers) {
      try {
        const alerts = await scanTicker(ticker.symbol, ticker.alerts);
        if (alerts.length > 0) {
          alerts.forEach(a => console.log(`  ⚡ ${a.details}`));
        } else {
          console.log(`  ✅ ${ticker.symbol}: 无异动`);
        }
      } catch (e: any) {
        console.log(`  ❌ ${ticker.symbol}: 扫描失败 — ${e.message}`);
      }
    }

    // 动态观察池概览
    const dynamicTickers = getActiveTickers();
    if (dynamicTickers.length > 0) {
      console.log(`\n[Sentinel] 📋 动态观察池 (${dynamicTickers.length} 只标的):`);
      for (const dt of dynamicTickers) {
        console.log(`  ${dt.status === 'focused' ? '🎯' : '👀'} ${dt.symbol} (${dt.name}) | ${dt.chainLevel} | 评分${dt.multibaggerScore} | 来源: ${dt.discoverySource}`);
      }
    } else {
      console.log(`\n[Sentinel] 📋 动态观察池为空（运行 --trend 触发标的发现）`);
    }

    // TrendRadar 扫描
    if (process.argv.includes('--trend')) {
      console.log(`\n[Sentinel] 📡 执行 TrendRadar 趋势扫描...`);
      try {
        const analysis = await trendRadar.scan();
        console.log(trendRadar.formatForTelegram(analysis));
      } catch (e: any) {
        console.log(`  TrendRadar 扫描失败: ${e.message}`);
      }
    }

    // 可选深度分析
    if (process.argv.includes('--deep')) {
      const query = process.argv[process.argv.indexOf('--deep') + 1] || watchlist.tickers[0]?.narrative || 'AI Infrastructure';
      console.log(`\n[Sentinel] 🧠 手动触发深度分析: ${query}`);
      await taskQueue.enqueue(query, 'deep', 'manual', 100);
    }
  })().catch(console.error);
}
