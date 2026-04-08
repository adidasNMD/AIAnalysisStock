/**
 * Sineige Alpha Engine — OpenBB 数据接入层
 *
 * 封装对 OpenBB REST API (localhost:8000) 的所有调用。
 * 数据按三层分类：
 *   🔴 核心层（驱动决策）：市值、机构持仓、内部人、价格vs均线
 *   🟡 辅助层（提升信心）：P/E、FCF、财报、营收增长
 *   🟣 背景层（环境感知）：期权链、宏观GDP/CPI、国会交易
 */

import * as dotenv from 'dotenv';
dotenv.config();

const OPENBB_BASE_URL = process.env.OPENBB_API_URL || 'http://localhost:8000';
const DEFAULT_PROVIDER = 'yfinance'; // 用户选择使用免费源平替
const PRICE_PROVIDER = 'yfinance';
const REQUEST_TIMEOUT_MS = 30_000;

// ===== 类型定义 =====

export interface CoreMetrics {
  marketCap: number | null;
  institutionalOwnership: number | null;
  institutionalChange: string | null;      // "+3% QoQ" 等
  insiderNetDirection: string | null;      // "net_buy" | "net_sell" | "neutral"
  insiderRecentBuys: number;
  insiderRecentSells: number;
  priceVsSma20: string | null;             // "above" | "below"
  currentPrice: number | null;
  sma20: number | null;
  sma50: number | null;
}

export interface AuxiliaryMetrics {
  peRatio: number | null;
  psRatio: number | null;
  freeCashFlow: number | null;
  revenueGrowthYoY: number | null;
  debtToEquity: number | null;
  grossMargin: number | null;
  evToEbitda: number | null;
}

export interface BackgroundMetrics {
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  putCallRatio: number | null;
  impliedVolatility: number | null;
  optionsUnusualActivity: string[];
}

export interface MacroEnvironment {
  fedRate: string | null;
  gdpGrowth: string | null;
  cpi: string | null;
  treasury10Y: string | null;
  vix: number | null;
}

export interface OpenBBTickerData {
  ticker: string;
  core: CoreMetrics;
  auxiliary: AuxiliaryMetrics;
  background: BackgroundMetrics;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  verdictReason: string;
  raw: Record<string, any>;              // 保留原始 OpenBB 返回
}

// ===== HTTP 请求工具 =====

async function openbbFetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`/api/v1${endpoint}`, OPENBB_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (![400, 422, 404, 403].includes(response.status)) {
        console.warn(`[OpenBB] ⚠️ ${endpoint} 返回 ${response.status}`);
      }
      return null;
    }

    try {
      return await response.json();
    } catch (e: any) {
      // Ignore "Unexpected end of JSON input" logging spam if the endpoint returned 200 without a body
      return null;
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.warn(`[OpenBB] ⏱️ ${endpoint} 超时`);
    } else {
      console.warn(`[OpenBB] ❌ ${endpoint} 失败: ${e.message}`);
    }
    return null;
  }
}

/**
 * 安全提取嵌套值
 */
function safeGet(data: any, ...paths: string[]): any {
  if (!data) return null;
  // OpenBB returns { results: [...] }
  const results = data?.results || data;
  if (Array.isArray(results) && results.length > 0) {
    for (const path of paths) {
      const val = results[0]?.[path];
      if (val !== undefined && val !== null) return val;
    }
  }
  return null;
}

// ===== 核心查询函数 =====

/**
 * 🔴 核心层数据：驱动决策的关键指标
 */
async function fetchCoreMetrics(ticker: string): Promise<CoreMetrics> {
  console.log(`[OpenBB] 🔴 查询核心数据: ${ticker}`);

  // 并行查询多个端点
  const [profile, price, institutional, insider] = await Promise.all([
    openbbFetch('/equity/profile', { symbol: ticker, provider: DEFAULT_PROVIDER }),
    openbbFetch('/equity/price/historical', { symbol: ticker, provider: PRICE_PROVIDER, limit: '60' }),
    openbbFetch('/equity/ownership/institutional', { symbol: ticker, provider: DEFAULT_PROVIDER }),
    openbbFetch('/equity/ownership/insider_trading', { symbol: ticker, provider: DEFAULT_PROVIDER, limit: '20' }),
  ]);

  // 计算 SMA20
  let currentPrice: number | null = null;
  let sma20: number | null = null;
  let sma50: number | null = null;
  if (price?.results && Array.isArray(price.results) && price.results.length >= 20) {
    const prices = price.results.map((d: any) => d.close).filter(Boolean);
    currentPrice = prices[prices.length - 1] || null;
    if (prices.length >= 20) {
      sma20 = prices.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
    }
    if (prices.length >= 50) {
      sma50 = prices.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50;
    }
  }

  // 内部人交易统计
  let insiderBuys = 0;
  let insiderSells = 0;
  if (insider?.results && Array.isArray(insider.results)) {
    for (const tx of insider.results) {
      const type = (tx.transaction_type || tx.acquisition_or_disposition || '').toLowerCase();
      if (type.includes('buy') || type.includes('purchase') || type === 'a') {
        insiderBuys++;
      } else if (type.includes('sell') || type.includes('sale') || type === 'd') {
        insiderSells++;
      }
    }
  }

  return {
    marketCap: safeGet(profile, 'market_cap', 'mktCap'),
    institutionalOwnership: safeGet(institutional, 'ownership_percent', 'investors_holding'),
    institutionalChange: null, // 需要历史比较，后续可增强
    insiderNetDirection: insiderBuys > insiderSells ? 'net_buy' : insiderSells > insiderBuys ? 'net_sell' : 'neutral',
    insiderRecentBuys: insiderBuys,
    insiderRecentSells: insiderSells,
    priceVsSma20: (currentPrice && sma20) ? (currentPrice > sma20 ? 'above' : 'below') : null,
    currentPrice,
    sma20: sma20 ? Math.round(sma20 * 100) / 100 : null,
    sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
  };
}

/**
 * 🟡 辅助层数据：提升信心的基本面指标
 */
async function fetchAuxiliaryMetrics(ticker: string): Promise<AuxiliaryMetrics> {
  console.log(`[OpenBB] 🟡 查询辅助数据: ${ticker}`);

  const [ratios, income] = await Promise.all([
    openbbFetch('/equity/fundamental/ratios', { symbol: ticker, provider: DEFAULT_PROVIDER, limit: '1' }),
    openbbFetch('/equity/fundamental/income', { symbol: ticker, provider: DEFAULT_PROVIDER, limit: '4' }),
  ]);

  // 通过近两个财报计算 YoY 营收增长
  let revenueGrowthYoY: number | null = null;
  if (income?.results && income.results.length >= 4) {
    const latest = income.results[0]?.revenue;
    const yearAgo = income.results[3]?.revenue;
    if (latest && yearAgo && yearAgo > 0) {
      revenueGrowthYoY = Math.round(((latest - yearAgo) / yearAgo) * 10000) / 100;
    }
  }

  return {
    peRatio: safeGet(ratios, 'pe_ratio', 'price_earnings_ratio'),
    psRatio: safeGet(ratios, 'price_to_sales_ratio'),
    freeCashFlow: safeGet(ratios, 'free_cash_flow_per_share'),
    revenueGrowthYoY,
    debtToEquity: safeGet(ratios, 'debt_equity_ratio', 'debt_to_equity'),
    grossMargin: safeGet(ratios, 'gross_profit_margin'),
    evToEbitda: safeGet(ratios, 'enterprise_value_over_ebitda'),
  };
}

/**
 * 🟣 背景层数据：期权 + 技术指标
 */
async function fetchBackgroundMetrics(ticker: string): Promise<BackgroundMetrics> {
  console.log(`[OpenBB] 🟣 查询背景数据: ${ticker}`);

  // 技术指标通过价格数据计算 RSI
  const price = await openbbFetch('/equity/price/historical', {
    symbol: ticker,
    provider: PRICE_PROVIDER,
    limit: '30',
  });

  let rsi14: number | null = null;
  if (price?.results && price.results.length >= 14) {
    const closes = price.results.map((d: any) => d.close).filter(Boolean);
    rsi14 = calculateRSI(closes, 14);
  }

  return {
    rsi14,
    macd: null,      // 可后续通过 /technical/macd 端点增强
    putCallRatio: null,
    impliedVolatility: null,
    optionsUnusualActivity: [],
  };
}

/**
 * 计算 RSI 指标
 */
function calculateRSI(prices: number[], period: number): number | null {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const curr = prices[i] ?? 0;
    const prev = prices[i - 1] ?? 0;
    const change = curr - prev;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return Math.round((100 - (100 / (1 + rs))) * 100) / 100;
}

// ===== 综合查询 =====

/**
 * 查询一只票的全部三层数据 + 综合评级
 */
export async function fetchTickerFullData(ticker: string): Promise<OpenBBTickerData> {
  console.log(`[OpenBB] 📊 开始全维度查询: ${ticker}`);

  const [core, auxiliary, background] = await Promise.all([
    fetchCoreMetrics(ticker),
    fetchAuxiliaryMetrics(ticker),
    fetchBackgroundMetrics(ticker),
  ]);

  // 综合评级逻辑
  const { verdict, verdictReason } = computeVerdict(ticker, core, auxiliary);

  return {
    ticker,
    core,
    auxiliary,
    background,
    verdict,
    verdictReason,
    raw: { core, auxiliary, background },
  };
}

/**
 * 批量查询多只票
 */
export async function fetchMultipleTickersData(tickers: string[]): Promise<OpenBBTickerData[]> {
  console.log(`[OpenBB] 📊 批量查询 ${tickers.length} 只标的: ${tickers.join(', ')}`);
  // 串行查询避免 API 限流
  const results: OpenBBTickerData[] = [];
  for (const ticker of tickers) {
    try {
      const data = await fetchTickerFullData(ticker);
      results.push(data);
    } catch (e: any) {
      console.error(`[OpenBB] ❌ ${ticker} 查询失败: ${e.message}`);
      results.push({
        ticker,
        core: { marketCap: null, institutionalOwnership: null, institutionalChange: null, insiderNetDirection: null, insiderRecentBuys: 0, insiderRecentSells: 0, priceVsSma20: null, currentPrice: null, sma20: null, sma50: null },
        auxiliary: { peRatio: null, psRatio: null, freeCashFlow: null, revenueGrowthYoY: null, debtToEquity: null, grossMargin: null, evToEbitda: null },
        background: { rsi14: null, macd: null, putCallRatio: null, impliedVolatility: null, optionsUnusualActivity: [] },
        verdict: 'WARN',
        verdictReason: `数据查询失败: ${e.message}`,
        raw: {},
      });
    }
  }
  return results;
}

/**
 * 查询宏观经济环境（底部数据带）
 */
export async function fetchMacroEnvironment(): Promise<MacroEnvironment> {
  console.log('[OpenBB] 🌍 查询宏观经济环境');
  // FRED 数据可能需要 FRED API key
  return {
    fedRate: null,
    gdpGrowth: null,
    cpi: null,
    treasury10Y: null,
    vix: null,
  };
}

/**
 * 健康检查：OpenBB 服务是否在线
 */
export async function checkOpenBBHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${OPENBB_BASE_URL}/docs`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ===== 评级逻辑 =====

function computeVerdict(
  ticker: string,
  core: CoreMetrics,
  auxiliary: AuxiliaryMetrics
): { verdict: 'PASS' | 'WARN' | 'FAIL'; verdictReason: string } {
  const reasons: string[] = [];
  let score = 0;

  // 市值红线 (3亿-1000亿)
  if (core.marketCap !== null) {
    if (core.marketCap < 300_000_000) {
      return { verdict: 'FAIL', verdictReason: `${ticker} 市值 $${(core.marketCap / 1e6).toFixed(0)}M < $300M 红线` };
    }
    if (core.marketCap > 100_000_000_000) {
      return { verdict: 'FAIL', verdictReason: `${ticker} 市值 $${(core.marketCap / 1e9).toFixed(0)}B > $100B 红线` };
    }
    score += 2;
    reasons.push('市值符合 ✅');
  }

  // 机构持仓
  if (core.institutionalOwnership !== null) {
    if (core.institutionalOwnership > 50) { score += 1; reasons.push('机构高持仓 ✅'); }
    else { reasons.push('机构低持仓 ⚠️'); }
  }

  // 内部人
  if (core.insiderNetDirection === 'net_buy') { score += 2; reasons.push('内部人净买入 ✅'); }
  else if (core.insiderNetDirection === 'net_sell') { score -= 1; reasons.push('内部人净卖出 ⚠️'); }

  // 均线
  if (core.priceVsSma20 === 'above') { score += 1; reasons.push('站稳 SMA20 ✅'); }
  else if (core.priceVsSma20 === 'below') { score -= 1; reasons.push('跌破 SMA20 ⚠️'); }

  // 基本面
  if (auxiliary.freeCashFlow !== null && auxiliary.freeCashFlow < 0) {
    score -= 1;
    reasons.push('FCF 为负 ⚠️');
  }

  if (score >= 3) return { verdict: 'PASS', verdictReason: reasons.join(' | ') };
  if (score >= 0) return { verdict: 'WARN', verdictReason: reasons.join(' | ') };
  return { verdict: 'FAIL', verdictReason: reasons.join(' | ') };
}
