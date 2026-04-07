/**
 * Sineige Alpha Engine — TradingAgents HTTP 客户端
 *
 * 封装对 TradingAgents FastAPI 微服务 (localhost:8001) 的调用。
 * TradingAgents 是平等的"第二大脑"，与 OpenClaw 并行独立分析。
 *
 * 支持：
 * - 单只票分析：POST /api/analyze
 * - 批量分析（串行调用避免资源冲突）
 * - 完整辩论记录保留（analystReports + debate + risk + PM decision）
 * - 健康检查：GET /api/health
 */

import { getTradingAgentsConfig } from './model-config';

const TA_BASE_URL = process.env.TRADING_AGENTS_URL || 'http://localhost:8001';
const REQUEST_TIMEOUT_MS = 600_000; // 10 分钟超时（单只票分析可能较长）

// ===== 类型定义 =====

export interface TAAnalystReports {
  market: string;
  sentiment: string;
  news: string;
  fundamentals: string;
}

export interface TAInvestmentDebate {
  bullArguments: string[];
  bearArguments: string[];
  judgeDecision: string;
  rounds: number;
}

export interface TARiskDebate {
  aggressiveView: string;
  conservativeView: string;
  neutralView: string;
  rounds: number;
}

export interface TAPMDecision {
  action: 'BUY' | 'SELL' | 'HOLD' | 'UNKNOWN';
  allocation: string;
  stopLoss: string;
  confidence: number;
  reasoning: string;
}

export interface TAAnalysisResult {
  ticker: string;
  date: string;
  status: 'success' | 'error';
  analystReports: TAAnalystReports;
  investmentDebate: TAInvestmentDebate;
  traderPlan: string;
  riskDebate: TARiskDebate;
  portfolioManagerDecision: TAPMDecision;
  duration: number;            // 秒
  rawLogStates: any;           // TradingAgents 的完整 log_states_dict
  error?: string;
}

// ===== 核心函数 =====

/**
 * 分析单只票
 *
 * 调用 TradingAgents 的 POST /api/analyze 接口
 * 返回包含所有分析师报告 + 辩论记录 + PM 裁决的完整结果
 */
export async function analyzeTicker(
  ticker: string,
  date?: string,
  context?: string
): Promise<TAAnalysisResult> {
  const analysisDate: string = date || new Date().toISOString().split('T')[0] || '';
  console.log(`[TradingAgents] 🟢 开始分析: ${ticker} (${analysisDate})`);

  const startTime = Date.now();

  try {
    // 从统一配置获取 LLM 参数
    const modelConfig = getTradingAgentsConfig();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${TA_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        date: analysisDate,
        config: modelConfig,
        context,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`TradingAgents API 错误 (${response.status}): ${errorBody}`);
    }

    const result = await response.json();
    const duration = Math.round((Date.now() - startTime) / 1000);

    // 解析 TradingAgents 的 log_states_dict 到我们的结构
    const parsed = parseTAResult(ticker, analysisDate, result, duration);
    console.log(`[TradingAgents] ✅ ${ticker} 分析完成 (${duration}s) → ${parsed.portfolioManagerDecision.action}`);

    return parsed;
  } catch (e: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`[TradingAgents] ❌ ${ticker} 分析失败 (${duration}s): ${e.message}`);

    return {
      ticker,
      date: analysisDate,
      status: 'error',
      analystReports: { market: '', sentiment: '', news: '', fundamentals: '' },
      investmentDebate: { bullArguments: [], bearArguments: [], judgeDecision: '', rounds: 0 },
      traderPlan: '',
      riskDebate: { aggressiveView: '', conservativeView: '', neutralView: '', rounds: 0 },
      portfolioManagerDecision: { action: 'UNKNOWN', allocation: '0%', stopLoss: '', confidence: 0, reasoning: e.message },
      duration,
      rawLogStates: null,
      error: e.message,
    };
  }
}

/**
 * 批量分析多只票（串行，避免 LLM 资源冲突）
 */
export async function analyzeMultipleTickers(
  tickers: string[],
  date?: string,
  onProgress?: (ticker: string, index: number, total: number) => void
): Promise<TAAnalysisResult[]> {
  console.log(`[TradingAgents] 🟢 批量分析 ${tickers.length} 只标的: ${tickers.join(', ')}`);

  const results: TAAnalysisResult[] = [];
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i]!;
    if (onProgress) onProgress(t, i, tickers.length);
    const result = await analyzeTicker(t, date);
    results.push(result);
  }

  return results;
}

/**
 * 健康检查：TradingAgents 服务是否在线
 */
export async function checkTAHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${TA_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ===== 结果解析 =====

/**
 * 将 TradingAgents 的原始 log_states_dict 解析为结构化结果
 */
function parseTAResult(
  ticker: string,
  date: string,
  rawResult: any,
  duration: number
): TAAnalysisResult {
  // TradingAgents 返回的结构可能是 { decision, log_states } 或直接是 log_states
  const logStates = rawResult?.log_states || rawResult?.log_states_dict || rawResult;
  const decision = rawResult?.decision || '';

  // 提取分析师报告
  const analystReports: TAAnalystReports = {
    market: extractFromStates(logStates, ['market_analyst', 'market_report']) || '',
    sentiment: extractFromStates(logStates, ['social_media_analyst', 'sentiment_report', 'social_report']) || '',
    news: extractFromStates(logStates, ['news_analyst', 'news_report']) || '',
    fundamentals: extractFromStates(logStates, ['fundamentals_analyst', 'fundamentals_report']) || '',
  };

  // 提取 Bull/Bear 辩论
  const investmentDebate: TAInvestmentDebate = {
    bullArguments: extractDebateArguments(logStates, 'bull'),
    bearArguments: extractDebateArguments(logStates, 'bear'),
    judgeDecision: extractFromStates(logStates, ['research_manager', 'judge_decision']) || '',
    rounds: countDebateRounds(logStates),
  };

  // 提取 Trader 计划
  const traderPlan = extractFromStates(logStates, ['trader', 'trade_plan', 'trading_plan']) || '';

  // 提取风控辩论
  const riskDebate: TARiskDebate = {
    aggressiveView: extractFromStates(logStates, ['aggressive', 'aggressive_debater']) || '',
    conservativeView: extractFromStates(logStates, ['conservative', 'conservative_debater']) || '',
    neutralView: extractFromStates(logStates, ['neutral', 'neutral_debater']) || '',
    rounds: countRiskRounds(logStates),
  };

  // 提取 PM 裁决
  const pmDecision = parsePMDecision(logStates, decision);

  return {
    ticker,
    date,
    status: 'success',
    analystReports,
    investmentDebate,
    traderPlan,
    riskDebate,
    portfolioManagerDecision: pmDecision,
    duration,
    rawLogStates: logStates,
  };
}

function extractFromStates(states: any, keys: string[]): string | null {
  if (!states || typeof states !== 'object') return null;
  for (const key of keys) {
    // 搜索所有 state keys
    for (const stateKey of Object.keys(states)) {
      if (stateKey.toLowerCase().includes(key.toLowerCase())) {
        const val = states[stateKey];
        if (typeof val === 'string') return val;
        if (val?.content) return val.content;
        if (val?.messages) {
          // LangGraph 格式
          const msgs = Array.isArray(val.messages) ? val.messages : [];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.content) return lastMsg.content;
        }
      }
    }
  }
  return null;
}

function extractDebateArguments(states: any, side: 'bull' | 'bear'): string[] {
  if (!states) return [];
  const args: string[] = [];
  for (const key of Object.keys(states)) {
    if (key.toLowerCase().includes(side)) {
      const val = states[key];
      if (typeof val === 'string') args.push(val);
      else if (val?.content) args.push(val.content);
    }
  }
  return args;
}

function countDebateRounds(states: any): number {
  if (!states) return 0;
  return Object.keys(states).filter(k =>
    k.toLowerCase().includes('bull') || k.toLowerCase().includes('bear')
  ).length / 2;
}

function countRiskRounds(states: any): number {
  if (!states) return 0;
  return Math.ceil(
    Object.keys(states).filter(k =>
      k.toLowerCase().includes('aggressive') ||
      k.toLowerCase().includes('conservative') ||
      k.toLowerCase().includes('neutral')
    ).length / 3
  );
}

function parsePMDecision(states: any, rawDecision: string): TAPMDecision {
  const pmText = extractFromStates(states, ['portfolio_manager', 'pm_decision', 'final_decision']) || rawDecision || '';

  // 从文本中提取 BUY/SELL/HOLD
  let action: TAPMDecision['action'] = 'UNKNOWN';
  const upperText = pmText.toUpperCase();
  if (upperText.includes('BUY') || upperText.includes('LONG')) action = 'BUY';
  else if (upperText.includes('SELL') || upperText.includes('SHORT')) action = 'SELL';
  else if (upperText.includes('HOLD') || upperText.includes('WAIT')) action = 'HOLD';

  // 提取仓位百分比
  const allocMatch = pmText.match(/(\d+)\s*%/);
  const allocation = allocMatch ? `${allocMatch[1]}%` : '0%';

  // 提取止损
  const slMatch = pmText.match(/stop.?loss[:\s]*[-]?(\d+)\s*%/i);
  const stopLoss = slMatch ? `-${slMatch[1]}%` : '';

  return {
    action,
    allocation,
    stopLoss,
    confidence: action === 'UNKNOWN' ? 0 : 0.7,
    reasoning: pmText.slice(0, 500),
  };
}
