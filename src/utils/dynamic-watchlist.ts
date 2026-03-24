import * as fs from 'fs';
import * as path from 'path';
import { getQuote, calculateSMA } from '../tools/market-data';

// ==========================================
// DynamicWatchlist 动态观察池
// 发现池 → 观察池 → 聚焦池
// ==========================================

const DYNAMIC_WATCHLIST_PATH = path.join(process.cwd(), 'data', 'dynamic_watchlist.json');

export interface DynamicTicker {
  symbol: string;
  name: string;
  discoveredAt: string;
  discoverySource: string;       // "TrendRadar:CPO光模块"
  trendName: string;             // 所属趋势主题
  chainLevel: 'sector_leader' | 'bottleneck' | 'hidden_gem';
  multibaggerScore: number;      // 数倍潜力评分 0-100
  reasoning: string;             // 发现推理过程
  status: 'discovered' | 'watching' | 'focused' | 'expired';
  priceAtDiscovery: number;
  currentPrice?: number;
  marketCap?: number;
  alerts: {
    breakAboveSMA?: number[];
    breakBelowSMA?: number[];
    volumeSurgeMultiple?: number;
  };
  lastChecked?: string;
  promotionHistory: Array<{
    date: string;
    from: string;
    to: string;
    reason: string;
  }>;
}

/**
 * 加载动态观察池
 */
export function loadDynamicWatchlist(): DynamicTicker[] {
  try {
    if (fs.existsSync(DYNAMIC_WATCHLIST_PATH)) {
      return JSON.parse(fs.readFileSync(DYNAMIC_WATCHLIST_PATH, 'utf-8'));
    }
  } catch (e: any) {
    console.error(`[DynamicWatchlist] ⚠️ 加载失败: ${e.message}`);
  }
  return [];
}

/**
 * 保存动态观察池
 */
function saveDynamicWatchlist(tickers: DynamicTicker[]): void {
  const dir = path.dirname(DYNAMIC_WATCHLIST_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DYNAMIC_WATCHLIST_PATH, JSON.stringify(tickers, null, 2), 'utf-8');
  console.log(`[DynamicWatchlist] 💾 已保存 (${tickers.length} 条记录)`);
}

/**
 * 新增发现的标的到观察池
 * 自动去重（同一 symbol 不重复添加，但会更新 score）
 */
export async function addDiscoveredTickers(
  newTickers: Array<{
    symbol: string;
    name: string;
    trendName: string;
    chainLevel: 'sector_leader' | 'bottleneck' | 'hidden_gem';
    multibaggerScore: number;
    reasoning: string;
    discoverySource: string;
  }>
): Promise<DynamicTicker[]> {
  const existing = loadDynamicWatchlist();
  const now = new Date().toISOString().split('T')[0] || '';
  const added: DynamicTicker[] = [];

  for (const ticker of newTickers) {
    const existingIdx = existing.findIndex(e => e.symbol === ticker.symbol);

    if (existingIdx >= 0) {
      // 已存在：更新 score 和 reasoning
      const ex = existing[existingIdx]!;
      if (ticker.multibaggerScore > ex.multibaggerScore) {
        ex.multibaggerScore = ticker.multibaggerScore;
        ex.reasoning = ticker.reasoning;
        ex.lastChecked = now;
        console.log(`[DynamicWatchlist] ♻️ 更新 ${ticker.symbol} 评分: ${ticker.multibaggerScore}`);
      }
      continue;
    }

    // 获取当前价格
    let priceAtDiscovery = 0;
    let marketCap = 0;
    try {
      const quote = await getQuote(ticker.symbol);
      if (quote) {
        priceAtDiscovery = quote.price;
        marketCap = quote.marketCap;
      }
    } catch (e: any) {
      console.error(`[DynamicWatchlist] Failed to get quote for ${ticker.symbol}: ${e.message}`);
    }

    // 根据产业链层级自动配置监控参数
    const alerts = ticker.chainLevel === 'hidden_gem'
      ? { breakAboveSMA: [20, 50, 200], breakBelowSMA: [20], volumeSurgeMultiple: 3.0 }
      : ticker.chainLevel === 'bottleneck'
        ? { breakAboveSMA: [20, 50], breakBelowSMA: [20], volumeSurgeMultiple: 2.5 }
        : { breakAboveSMA: [50], breakBelowSMA: [20], volumeSurgeMultiple: 2.0 };

    // 高分标的直接进入 watching，低分进 discovered
    const initialStatus = ticker.multibaggerScore >= 60 ? 'watching' : 'discovered';

    const newTicker: DynamicTicker = {
      symbol: ticker.symbol,
      name: ticker.name,
      discoveredAt: now,
      discoverySource: ticker.discoverySource,
      trendName: ticker.trendName,
      chainLevel: ticker.chainLevel,
      multibaggerScore: ticker.multibaggerScore,
      reasoning: ticker.reasoning,
      status: initialStatus as 'discovered' | 'watching',
      priceAtDiscovery,
      marketCap,
      alerts,
      lastChecked: now,
      promotionHistory: [{
        date: now,
        from: 'none',
        to: initialStatus,
        reason: `由 ${ticker.discoverySource} 发现, 评分 ${ticker.multibaggerScore}`,
      }],
    };

    existing.push(newTicker);
    added.push(newTicker);

    const statusIcon = initialStatus === 'watching' ? '👀' : '🔍';
    console.log(`[DynamicWatchlist] ${statusIcon} 发现新标的: ${ticker.symbol} (${ticker.name}) | 层级: ${ticker.chainLevel} | 评分: ${ticker.multibaggerScore} | → ${initialStatus}`);
  }

  saveDynamicWatchlist(existing);
  return added;
}

/**
 * 将标的从 watching 升级为 focused（触发深度分析）
 */
export function promoteTicker(symbol: string, reason: string): boolean {
  const tickers = loadDynamicWatchlist();
  const ticker = tickers.find(t => t.symbol === symbol);
  if (!ticker || ticker.status !== 'watching') return false;

  const now = new Date().toISOString().split('T')[0] || '';
  ticker.status = 'focused';
  ticker.promotionHistory.push({
    date: now,
    from: 'watching',
    to: 'focused',
    reason,
  });

  saveDynamicWatchlist(tickers);
  console.log(`[DynamicWatchlist] 🎯 ${symbol} 升级为 focused: ${reason}`);
  return true;
}

/**
 * 将过期标的标记为 expired
 */
export function expireTicker(symbol: string, reason: string): boolean {
  const tickers = loadDynamicWatchlist();
  const ticker = tickers.find(t => t.symbol === symbol);
  if (!ticker || ticker.status === 'expired') return false;

  const now = new Date().toISOString().split('T')[0] || '';
  ticker.promotionHistory.push({
    date: now,
    from: ticker.status,
    to: 'expired',
    reason,
  });
  ticker.status = 'expired';

  saveDynamicWatchlist(tickers);
  console.log(`[DynamicWatchlist] ❌ ${symbol} 已过期: ${reason}`);
  return true;
}

/**
 * 获取当前正在监控的标的（watching + focused）
 */
export function getActiveTickers(): DynamicTicker[] {
  return loadDynamicWatchlist().filter(t => t.status === 'watching' || t.status === 'focused');
}

/**
 * 获取需要深度分析的标的（focused）
 */
export function getFocusedTickers(): DynamicTicker[] {
  return loadDynamicWatchlist().filter(t => t.status === 'focused');
}

/**
 * 生成动态观察池概览（用于 Telegram / 日报）
 */
export function generateDynamicWatchlistOverview(): string {
  const tickers = loadDynamicWatchlist();
  const active = tickers.filter(t => t.status !== 'expired');

  if (active.length === 0) return '📋 动态观察池为空，等待 TrendRadar 发现新标的。';

  const focused = active.filter(t => t.status === 'focused');
  const watching = active.filter(t => t.status === 'watching');
  const discovered = active.filter(t => t.status === 'discovered');

  let overview = `📋 *动态观察池* (${active.length} 只标的)\n\n`;

  if (focused.length > 0) {
    overview += `🎯 *聚焦池* (${focused.length}):\n`;
    focused.forEach(t => {
      overview += `  \`${t.symbol}\` ${t.name} | ${t.chainLevel} | 评分${t.multibaggerScore}\n`;
      overview += `  └ ${t.reasoning.substring(0, 80)}\n`;
    });
    overview += '\n';
  }

  if (watching.length > 0) {
    overview += `👀 *观察池* (${watching.length}):\n`;
    watching.forEach(t => {
      overview += `  \`${t.symbol}\` ${t.name} | ${t.chainLevel} | 评分${t.multibaggerScore}\n`;
    });
    overview += '\n';
  }

  if (discovered.length > 0) {
    overview += `🔍 *发现池* (${discovered.length}):\n`;
    discovered.forEach(t => {
      overview += `  \`${t.symbol}\` | 评分${t.multibaggerScore}\n`;
    });
  }

  return overview;
}
