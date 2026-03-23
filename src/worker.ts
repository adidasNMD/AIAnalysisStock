import cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import { AgentSwarmOrchestrator } from './workflows/swarm-pipeline';
import { scanTicker, AlertSignal, generateTechSnapshot } from './tools/market-data';
import { sendAlertBatch, sendStopLossAlert, sendEntrySignal, sendReportSummary, sendMessage } from './utils/telegram';
import { pollAllFeeds, alertsToContext, RSSAlert } from './tools/rss-monitor';
import { watchIPO, filingsToContext } from './tools/edgar-monitor';

// ==========================================
// OPENCLAW V4 SENTINEL DAEMON
// 多级触发哨兵模式
// ==========================================

console.log(`\n==================================================================`);
console.log(`⚡ OPENCLAW V4 SENTINEL DAEMON STARTED`);
console.log(`   Mode: Multi-trigger Watchlist Sentinel`);
console.log(`==================================================================\n`);

const orchestrator = new AgentSwarmOrchestrator();

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
// TRIGGER 1: 每 5 分钟 — Watchlist 价量异动扫描
// ==========================================
cron.schedule('*/5 * * * *', async () => {
  const watchlist = loadWatchlist();
  console.log(`\n[Sentinel] 🔍 开始 Watchlist 价量扫描 (${watchlist.tickers.length} 只标的)...`);

  const allAlerts: AlertSignal[] = [];

  for (const ticker of watchlist.tickers) {
    try {
      const alerts = await scanTicker(ticker.symbol, ticker.alerts);
      allAlerts.push(...alerts);
    } catch (e: any) {
      console.error(`[Sentinel] Scan failed for ${ticker.symbol}: ${e.message}`);
    }
  }

  if (allAlerts.length > 0) {
    console.log(`[Sentinel] ⚡ 发现 ${allAlerts.length} 条异动信号！`);

    // 紧急止损信号单独推送
    const criticals = allAlerts.filter(a => a.severity === 'critical');
    for (const alert of criticals) {
      await sendStopLossAlert(alert.symbol, alert.details);
    }

    // 入场信号单独推送
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
    console.log(`[Sentinel] ✅ Watchlist 无异动，保持监控。`);
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

    // 可选深度分析
    if (process.argv.includes('--deep')) {
      const query = process.argv[process.argv.indexOf('--deep') + 1] || watchlist.tickers[0]?.narrative || 'AI Infrastructure';
      console.log(`\n[Sentinel] 🧠 触发深度分析: ${query}`);
      await orchestrator.executeMission(query);
    }
  })().catch(console.error);
}
