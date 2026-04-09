import YahooFinance from 'yahoo-finance2';
import { yahooLimiter } from '../utils/rate-limiter';
const yahooFinance = new YahooFinance();

export interface QuoteSnapshot {
  symbol: string;
  price: number;
  previousClose: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeSurgeRatio: number;
  marketCap: number;
}

export interface SMACheckResult {
  symbol: string;
  price: number;
  sma: number;
  period: number;
  position: 'above' | 'below';
  crossedToday: boolean;
}

export interface AlertSignal {
  symbol: string;
  type: 'breakout_above_sma' | 'breakdown_below_sma' | 'volume_surge' | 'gap_up' | 'gap_down';
  details: string;
  severity: 'critical' | 'action' | 'info';
  timestamp: number;
}

/**
 * 获取实时快照报价
 */
export async function getQuote(symbol: string): Promise<QuoteSnapshot | null> {
  try {
    await yahooLimiter.acquire();
    const quote: any = await yahooFinance.quote(symbol);
    if (!quote || !quote.regularMarketPrice) return null;

    const volume = quote.regularMarketVolume || 0;
    const avgVolume = quote.averageDailyVolume10Day || quote.averageDailyVolume3Month || 1;

    return {
      symbol,
      price: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose || quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent || 0,
      volume,
      avgVolume,
      volumeSurgeRatio: avgVolume > 0 ? volume / avgVolume : 0,
      marketCap: quote.marketCap || 0
    };
  } catch (e: any) {
    console.error(`[MarketData] Failed to fetch quote for ${symbol}: ${e.message}`);
    return null;
  }
}

/**
 * 计算简单移动平均线 (SMA)
 */
export async function calculateSMA(symbol: string, period: number): Promise<number | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - Math.ceil(period * 2.0)); // extra buffer for weekends/holidays

    await yahooLimiter.acquire();
    const chartResult: any = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (!chartResult || !chartResult.quotes) return null;
    
    // Filter out rows with null close (e.g. today's incomplete data)
    const validBars = chartResult.quotes.filter((d: any) => d.close !== null && d.close !== undefined);

    if (validBars.length < period) return null;

    const recentClose = validBars.slice(-period).map((d: any) => d.close as number);
    const sma = recentClose.reduce((sum: number, p: number) => sum + p, 0) / period;
    return Math.round(sma * 100) / 100;
  } catch (e: any) {
    console.error(`[MarketData] Failed to calculate SMA(${period}) for ${symbol}: ${e.message}`);
    return null;
  }
}

/**
 * 检测均线突破/跌破
 */
export async function checkSMACross(symbol: string, periods: number[]): Promise<SMACheckResult[]> {
  const quote = await getQuote(symbol);
  if (!quote) return [];

  const results: SMACheckResult[] = [];
  for (const period of periods) {
    const sma = await calculateSMA(symbol, period);
    if (sma === null) continue;

    results.push({
      symbol,
      price: quote.price,
      sma,
      period,
      position: quote.price > sma ? 'above' : 'below',
      crossedToday: Math.abs(quote.price - sma) / sma < 0.02 // within 2% = likely just crossed
    });
  }
  return results;
}

/**
 * 对 Watchlist 中的单个标的执行完整异动扫描
 */
export async function scanTicker(
  symbol: string, 
  alertConfig: { breakAboveSMA?: number[]; breakBelowSMA?: number[]; volumeSurgeMultiple?: number }
): Promise<AlertSignal[]> {
  const alerts: AlertSignal[] = [];
  const quote = await getQuote(symbol);
  if (!quote) return alerts;

  // 1. 放量检测
  if (alertConfig.volumeSurgeMultiple && quote.volumeSurgeRatio >= alertConfig.volumeSurgeMultiple) {
    alerts.push({
      symbol,
      type: 'volume_surge',
      details: `🔥 ${symbol} 成交量异常放大！当前成交量是 20 日均量的 ${quote.volumeSurgeRatio.toFixed(1)} 倍`,
      severity: 'action',
      timestamp: Date.now()
    });
  }

  // 2. 跳空缺口检测
  const gapPercent = ((quote.price - quote.previousClose) / quote.previousClose) * 100;
  if (gapPercent > 5) {
    alerts.push({
      symbol,
      type: 'gap_up',
      details: `🚀 ${symbol} 跳空高开 ${gapPercent.toFixed(1)}%！可能有重大利好驱动`,
      severity: 'action',
      timestamp: Date.now()
    });
  } else if (gapPercent < -5) {
    alerts.push({
      symbol,
      type: 'gap_down',
      details: `💀 ${symbol} 跳空低开 ${Math.abs(gapPercent).toFixed(1)}%！可能触发止损`,
      severity: 'critical',
      timestamp: Date.now()
    });
  }

  // 3. 均线突破检测
  const allPeriods = [...(alertConfig.breakAboveSMA || []), ...(alertConfig.breakBelowSMA || [])];
  const uniquePeriods = [...new Set(allPeriods)];
  const smaResults = await checkSMACross(symbol, uniquePeriods);

  for (const result of smaResults) {
    if (alertConfig.breakAboveSMA?.includes(result.period) && result.position === 'above' && result.crossedToday) {
      alerts.push({
        symbol,
        type: 'breakout_above_sma',
        details: `📈 ${symbol} 价格 $${result.price} 突破 ${result.period} 日均线 $${result.sma}！右侧确认信号`,
        severity: result.period >= 200 ? 'action' : 'info',
        timestamp: Date.now()
      });
    }

    if (alertConfig.breakBelowSMA?.includes(result.period) && result.position === 'below' && result.crossedToday) {
      alerts.push({
        symbol,
        type: 'breakdown_below_sma',
        details: `⚠️ ${symbol} 价格 $${result.price} 跌破 ${result.period} 日均线 $${result.sma}！可能触发止损`,
        severity: 'critical',
        timestamp: Date.now()
      });
    }
  }

  return alerts;
}

/**
 * 为 Agent Prompt 生成技术面快照摘要
 */
export async function generateTechSnapshot(symbol: string): Promise<string> {
  const quote = await getQuote(symbol);
  if (!quote) return `[${symbol}] 无法获取行情数据`;

  const sma20 = await calculateSMA(symbol, 20);
  const sma50 = await calculateSMA(symbol, 50);
  const sma200 = await calculateSMA(symbol, 200);

  return `[${symbol}] 实时: $${quote.price} (${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%) | 量比: ${quote.volumeSurgeRatio.toFixed(1)}x | SMA20: $${sma20 ?? 'N/A'} | SMA50: $${sma50 ?? 'N/A'} | SMA200: $${sma200 ?? 'N/A'} | 市值: $${(quote.marketCap / 1e9).toFixed(1)}B`;
}
