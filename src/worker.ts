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

// ==========================================
// OPENCLAW V4 SENTINEL DAEMON
// 多级触发哨兵模式 + TrendRadar 趋势雷达
// ==========================================

console.log(`\n==================================================================`);
console.log(`⚡ OPENCLAW V4 SENTINEL DAEMON STARTED`);
console.log(`   Mode: Multi-trigger Watchlist Sentinel + TrendRadar`);
console.log(`   Triggers: T1(5min 价量), T2(15min RSS/EDGAR), T3(08:30 日报), T4(15min 趋势雷达)`);
console.log(`==================================================================\n`);

const orchestrator = new AgentSwarmOrchestrator();
const trendRadar = new TrendRadar();

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
// TRIGGER 1: 每 5 分钟 — Watchlist + 动态观察池 价量异动扫描
// ==========================================
cron.schedule('*/5 * * * *', async () => {
  const watchlist = loadWatchlist();
  const dynamicTickers = getActiveTickers();
  const totalCount = watchlist.tickers.length + dynamicTickers.length;
  console.log(`\n[Sentinel] 🔍 开始价量扫描 (静态 ${watchlist.tickers.length} + 动态 ${dynamicTickers.length} = ${totalCount} 只标的)...`);

  const allAlerts: AlertSignal[] = [];

  // 扫描静态 Watchlist
  for (const ticker of watchlist.tickers) {
    try {
      const alerts = await scanTicker(ticker.symbol, ticker.alerts);
      allAlerts.push(...alerts);
    } catch (e: any) {
      console.error(`[Sentinel] Scan failed for ${ticker.symbol}: ${e.message}`);
    }
  }

  // 扫描动态观察池（watching + focused）
  for (const dTicker of dynamicTickers) {
    try {
      const alerts = await scanTicker(dTicker.symbol, dTicker.alerts);
      allAlerts.push(...alerts);

      // 关键：动态标的出现入场级信号 → 自动升级为 focused 并触发深度分析
      const actionAlerts = alerts.filter(a => a.severity === 'action');
      if (actionAlerts.length > 0 && dTicker.status === 'watching') {
        promoteTicker(dTicker.symbol, `价量异动触发: ${actionAlerts.map(a => a.details).join('; ')}`);
        console.log(`[Sentinel] 🎯 动态标的 ${dTicker.symbol} 升级为 focused！触发深度分析...`);
        try {
          await orchestrator.executeMission(`${dTicker.trendName} — ${dTicker.symbol} ${dTicker.name} breakout analysis`);
        } catch (e: any) {
          console.error(`[Sentinel] Deep analysis failed for dynamic ${dTicker.symbol}: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.error(`[Sentinel] Dynamic scan failed for ${dTicker.symbol}: ${e.message}`);
    }
  }

  if (allAlerts.length > 0) {
    console.log(`[Sentinel] ⚡ 发现 ${allAlerts.length} 条异动信号！`);

    // 紧急止损信号单独推送
    const criticals = allAlerts.filter(a => a.severity === 'critical');
    for (const alert of criticals) {
      await sendStopLossAlert(alert.symbol, alert.details);
    }

    // 入场信号单独推送（静态 Watchlist 标的）
    const actions = allAlerts.filter(a => a.severity === 'action');
    for (const alert of actions) {
      await sendEntrySignal(alert.symbol, alert.details);

      // 入场级别信号自动触发深度分析流水线
      const ticker = watchlist.tickers.find(t => t.symbol === alert.symbol);
      if (ticker) {
        console.log(`[Sentinel] 🧠 异动信号触发深度分析: ${alert.symbol} — ${ticker.narrative}`);
        try {
          const report = await orchestrator.executeMission(`${ticker.narrative} — ${ticker.symbol} ${ticker.name} breakout analysis`);
          if (report) {
            await sendReportSummary(`${ticker.symbol} 深度异动分析`, report.substring(0, 500));
          }
        } catch (e: any) {
          console.error(`[Sentinel] Deep analysis failed for ${alert.symbol}: ${e.message}`);
        }
      }
    }

    // 信息级别汇总推送
    await sendAlertBatch(allAlerts);
  } else {
    console.log(`[Sentinel] ✅ 全部标的无异动，保持监控。`);
  }
});

// ==========================================
// TRIGGER 2: 每 15 分钟 — RSS 事件源 + SEC EDGAR 轮询
// ==========================================
cron.schedule('*/15 * * * *', async () => {
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

      // 高优先级事件自动触发深度分析
      for (const alert of rssAlerts) {
        if (alert.matchedKeywords.length >= 2) {
          console.log(`[Sentinel] 🧠 高命中率事件触发深度分析: ${alert.title}`);
          try {
            const context = alertsToContext([alert]);
            await orchestrator.executeMission(alert.title);
          } catch (e: any) {
            console.error(`[Sentinel] Event analysis failed: ${e.message}`);
          }
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

  await sendReportSummary('Watchlist 盘前扫描', snapshot);

  // 对每个赛道执行一次叙事级别的深度扫查
  const sectors = [...new Set(watchlist.tickers.map(t => t.sector))];
  for (const sector of sectors) {
    const sectorTickers = watchlist.tickers.filter(t => t.sector === sector);
    const narrative = sectorTickers[0]?.narrative || sector;
    console.log(`[Sentinel] 🧠 赛道深度分析: ${sector} — ${narrative}`);
    try {
      await orchestrator.executeMission(narrative);
    } catch (e: any) {
      console.error(`[Sentinel] Sector analysis failed for ${sector}: ${e.message}`);
    }
  }
});

// ==========================================
// TRIGGER 4: 每 15 分钟 — TrendRadar 趋势雷达扫描
// ==========================================
cron.schedule('7,22,37,52 * * * *', async () => {
  console.log(`\n[Sentinel] 📡 TrendRadar 趋势雷达启动...`);
  
  try {
    const analysis = await trendRadar.scan();
    
    // 推送趋势概览到 Telegram
    const telegramMsg = trendRadar.formatForTelegram(analysis);
    await sendMessage(telegramMsg);

    // 对高分加速趋势自动触发深度分析
    for (const topic of analysis.topics) {
      if (topic.momentum === 'accelerating' && topic.hasCatalyst && topic.score >= 70) {
        console.log(`[Sentinel] 🚀 高分趋势触发深度分析: ${topic.name} (${topic.score}分)`);
        try {
          await orchestrator.executeMission(`${topic.name} — 趋势主题深度分析`);
        } catch (e: any) {
          console.error(`[Sentinel] Trend deep analysis failed for ${topic.name}: ${e.message}`);
        }
      } else if (topic.momentum === 'decelerating' && topic.score < 30) {
        // 衰退趋势风险预警
        await sendMessage(`⚠️ *趋势衰退预警*: ${topic.name} 热度正在下降 (${topic.score}分)\n标的: ${topic.tickers.join(', ')}\n如已持仓，请注意风险控制。`);
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
      console.log(`\n[Sentinel] 🧠 触发深度分析: ${query}`);
      await orchestrator.executeMission(query);
    }
  })().catch(console.error);
}
