import * as fs from 'fs';
import * as path from 'path';
import { getQuote } from '../tools/market-data';
import { loadDynamicWatchlist, expireTicker, DynamicTicker } from './dynamic-watchlist';

// ==========================================
// PerformanceTracker — 反馈闭环系统
// 追踪历史推荐标的表现，评估系统准确度
// ==========================================

const PERF_DATA_PATH = path.join(process.cwd(), 'data', 'performance.json');

export interface TickerPerformance {
  symbol: string;
  name: string;
  chainLevel: string;
  discoveredAt: string;
  discoverySource: string;
  priceAtDiscovery: number;
  currentPrice: number;
  changePercent: number;         // 发现至今涨跌幅
  peakPrice: number;             // 发现后最高价
  peakChangePercent: number;     // 最大涨幅
  maxDrawdown: number;           // 最大回撤
  daysTracked: number;
  lastUpdated: string;
  verdict: 'winner' | 'loser' | 'pending';  // 涨>20% winner, 跌>15% loser, 其他 pending
}

export interface PerformanceSummary {
  totalTracked: number;
  winners: number;
  losers: number;
  pending: number;
  winRate: number;
  avgReturn: number;
  bestPick: { symbol: string; changePercent: number } | null;
  worstPick: { symbol: string; changePercent: number } | null;
  byChainLevel: Record<string, { count: number; avgReturn: number; winRate: number }>;
}

/**
 * 加载绩效数据
 */
function loadPerformanceData(): TickerPerformance[] {
  try {
    if (fs.existsSync(PERF_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(PERF_DATA_PATH, 'utf-8'));
    }
  } catch (e: any) {
    console.error(`[PerformanceTracker] ⚠️ 加载失败: ${e.message}`);
  }
  return [];
}

function savePerformanceData(data: TickerPerformance[]): void {
  const dir = path.dirname(PERF_DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PERF_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 每日绩效检查 — 更新所有动态观察池标的的表现
 */
export async function updatePerformance(): Promise<PerformanceSummary> {
  console.log(`\n[PerformanceTracker] 📊 开始每日绩效检查...`);

  const watchlist = loadDynamicWatchlist();
  const perfData = loadPerformanceData();
  const now = new Date();
  const today = now.toISOString().split('T')[0] || '';

  // 更新或新增每个标的的绩效数据
  for (const ticker of watchlist) {
    if (ticker.status === 'expired') continue;
    if (ticker.priceAtDiscovery <= 0) continue;

    let perf = perfData.find(p => p.symbol === ticker.symbol);

    // 获取当前价格
    let currentPrice = 0;
    try {
      const quote = await getQuote(ticker.symbol);
      if (quote) currentPrice = quote.price;
    } catch (e: any) {
      console.error(`[PerformanceTracker] ${ticker.symbol} 报价失败: ${e.message}`);
      continue;
    }

    if (currentPrice <= 0) continue;

    const changePercent = ((currentPrice - ticker.priceAtDiscovery) / ticker.priceAtDiscovery) * 100;
    const discoveryDate = new Date(ticker.discoveredAt);
    const daysTracked = Math.floor((now.getTime() - discoveryDate.getTime()) / (1000 * 60 * 60 * 24));

    if (!perf) {
      // 新增绩效记录
      perf = {
        symbol: ticker.symbol,
        name: ticker.name,
        chainLevel: ticker.chainLevel,
        discoveredAt: ticker.discoveredAt,
        discoverySource: ticker.discoverySource,
        priceAtDiscovery: ticker.priceAtDiscovery,
        currentPrice,
        changePercent,
        peakPrice: Math.max(currentPrice, ticker.priceAtDiscovery),
        peakChangePercent: Math.max(changePercent, 0),
        maxDrawdown: Math.min(changePercent, 0),
        daysTracked,
        lastUpdated: today,
        verdict: 'pending',
      };
      perfData.push(perf);
    } else {
      // 更新绩效记录
      perf.currentPrice = currentPrice;
      perf.changePercent = changePercent;
      perf.daysTracked = daysTracked;
      perf.lastUpdated = today;

      if (currentPrice > perf.peakPrice) {
        perf.peakPrice = currentPrice;
        perf.peakChangePercent = ((currentPrice - ticker.priceAtDiscovery) / ticker.priceAtDiscovery) * 100;
      }
      if (changePercent < perf.maxDrawdown) {
        perf.maxDrawdown = changePercent;
      }
    }

    // 判定结果
    if (perf.changePercent >= 20) perf.verdict = 'winner';
    else if (perf.changePercent <= -15) perf.verdict = 'loser';
    else perf.verdict = 'pending';

    // 自动过期：30 天无表现（涨跌<5%）的标的
    if (daysTracked >= 30 && Math.abs(changePercent) < 5) {
      expireTicker(ticker.symbol, `30 天无显著表现 (涨跌幅 ${changePercent.toFixed(1)}%)`);
    }
  }

  savePerformanceData(perfData);

  // 生成汇总
  const summary = generateSummary(perfData);
  console.log(`[PerformanceTracker] ✅ 绩效更新完成: ${summary.totalTracked} 只标的 | 胜率 ${(summary.winRate * 100).toFixed(0)}% | 平均涨跌 ${summary.avgReturn.toFixed(1)}%`);

  return summary;
}

/**
 * 生成绩效汇总
 */
function generateSummary(data: TickerPerformance[]): PerformanceSummary {
  const active = data.filter(d => d.daysTracked > 0);
  const winners = active.filter(d => d.verdict === 'winner');
  const losers = active.filter(d => d.verdict === 'loser');
  const pending = active.filter(d => d.verdict === 'pending');

  const avgReturn = active.length > 0
    ? active.reduce((sum, d) => sum + d.changePercent, 0) / active.length
    : 0;

  const sorted = [...active].sort((a, b) => b.changePercent - a.changePercent);

  // 按 chainLevel 分组统计
  const byChainLevel: Record<string, { count: number; avgReturn: number; winRate: number }> = {};
  for (const d of active) {
    if (!byChainLevel[d.chainLevel]) {
      byChainLevel[d.chainLevel] = { count: 0, avgReturn: 0, winRate: 0 };
    }
    byChainLevel[d.chainLevel]!.count++;
  }
  for (const [level, stats] of Object.entries(byChainLevel)) {
    const group = active.filter(d => d.chainLevel === level);
    stats.avgReturn = group.reduce((s, d) => s + d.changePercent, 0) / group.length;
    stats.winRate = group.filter(d => d.verdict === 'winner').length / group.length;
  }

  return {
    totalTracked: active.length,
    winners: winners.length,
    losers: losers.length,
    pending: pending.length,
    winRate: active.length > 0 ? winners.length / active.length : 0,
    avgReturn,
    bestPick: sorted[0] ? { symbol: sorted[0].symbol, changePercent: sorted[0].changePercent } : null,
    worstPick: sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1]!.symbol, changePercent: sorted[sorted.length - 1]!.changePercent } : null,
    byChainLevel,
  };
}

/**
 * 格式化绩效报告
 */
export function formatPerformanceReport(summary: PerformanceSummary): string {
  let md = `## 📊 历史推荐绩效追踪\n\n`;

  if (summary.totalTracked === 0) {
    return md + `暂无绩效数据，等待动态观察池积累数据。\n`;
  }

  md += `| 指标 | 数值 |\n|------|------|\n`;
  md += `| 追踪标的 | ${summary.totalTracked} 只 |\n`;
  md += `| 胜率 (涨>20%) | ${(summary.winRate * 100).toFixed(0)}% |\n`;
  md += `| 平均涨跌幅 | ${summary.avgReturn > 0 ? '+' : ''}${summary.avgReturn.toFixed(1)}% |\n`;
  md += `| Winner | ${summary.winners} 只 |\n`;
  md += `| Loser | ${summary.losers} 只 |\n`;
  md += `| Pending | ${summary.pending} 只 |\n`;

  if (summary.bestPick) {
    md += `| 最佳推荐 | ${summary.bestPick.symbol} (+${summary.bestPick.changePercent.toFixed(1)}%) |\n`;
  }
  if (summary.worstPick) {
    md += `| 最差推荐 | ${summary.worstPick.symbol} (${summary.worstPick.changePercent.toFixed(1)}%) |\n`;
  }
  md += '\n';

  // 按标的类型分组
  if (Object.keys(summary.byChainLevel).length > 0) {
    md += `**按标的类型:**\n`;
    md += `| 类型 | 数量 | 平均涨跌 | 胜率 |\n|------|------|---------|------|\n`;
    for (const [level, stats] of Object.entries(summary.byChainLevel)) {
      md += `| ${level} | ${stats.count} | ${stats.avgReturn > 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}% | ${(stats.winRate * 100).toFixed(0)}% |\n`;
    }
  }

  return md;
}
