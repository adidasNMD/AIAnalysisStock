/**
 * Sineige Alpha Engine — Mission Dispatcher
 *
 * 统一任务调度器：解析输入 → 分发给两个大脑
 *
 * 多入口触发场景：
 *   场景A (探索模式): TrendRadar热点/手动问题 → OpenClaw先推导 → 推导出Tickers后送给TA
 *   场景B (分析模式): 用户直接输入Ticker → 两个大脑同时启动，真正并行
 *   场景C (复查模式): Watchlist定期复查 → 两个大脑同时启动
 *
 * Mission 状态机：
 *   TRIGGERED → MAIN_RUNNING → MAIN_COMPLETE → TA_RUNNING → FULLY_ENRICHED
 *                                              └→ (如果TA离线) MAIN_ONLY
 */

import { eventBus } from '../utils/event-bus';
import { analyzeTicker, checkTAHealth, type TAAnalysisResult } from '../utils/ta-client';
import { fetchTickerFullData, fetchMacroEnvironment, checkOpenBBHealth, type OpenBBTickerData } from '../utils/openbb-provider';
import { checkSMACross } from '../tools/market-data';
import { sendStopLossAlert, sendEntrySignal, sendMessage } from '../utils/telegram';
import { NarrativeLifecycleEngine } from '../agents/lifecycle/engine';
import * as fs from 'fs';
import * as path from 'path';
import { saveTrailReport } from '../utils/trail-renderer';
import { type RejectedTicker } from '../agents/discovery/ticker-discovery';

// ===== 类型定义 =====

export type MissionStatus =
  | 'triggered'
  | 'main_running'
  | 'main_complete'
  | 'ta_running'
  | 'fully_enriched'
  | 'main_only'
  | 'failed';

export type MissionMode = 'explore' | 'analyze' | 'review';

export interface MissionInput {
  mode: MissionMode;
  query: string;              // 探索模式: 问题文本 / 分析模式: Ticker
  tickers?: string[];         // 分析/复查模式: 明确的Tickers
  depth?: 'quick' | 'standard' | 'deep';
  source?: string;            // 'trendradar' | 'manual' | 'watchlist' | 'webhook'
  date?: string;              // TradingAgents 需要的日期
}

export interface UnifiedMission {
  id: string;
  traceId?: string;
  input: MissionInput;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;

  // OpenClaw 主线结果
  openclawReport: string | null;
  openclawTickers: string[];
  openclawDurationMs: number;

  // TradingAgents 结果
  taResults: TAAnalysisResult[];
  taDurationMs: number;

  // OpenBB 数据
  openbbData: OpenBBTickerData[];
  macroData: any;

  // 双大脑共识
  consensus: TickerConsensus[];

  discoveryRejections?: RejectedTicker[];
  decisionTrail?: DecisionTrailEntry[];

  // 完整耗时
  totalDurationMs: number;
}

export interface TickerConsensus {
  ticker: string;
  openclawVerdict: 'BUY' | 'HOLD' | 'SELL' | 'SKIP' | null;
  taVerdict: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
  agreement: 'agree' | 'disagree' | 'partial' | 'pending' | 'blocked';
  openbbVerdict: 'PASS' | 'WARN' | 'FAIL' | null;
  vetoed: boolean;
  vetoReason?: string;
  bullCase?: string;
  bearCase?: string;
}

export interface DecisionTrailEntry {
  ticker: string;
  stage: 'discovery_filter' | 'consensus' | 'sma_veto';
  verdict: 'pass' | 'reject';
  reason: string;
  details?: {
    marketCap?: number;
    thresholdMin?: number;
    thresholdMax?: number;
    openclawVerdict?: string | null;
    taVerdict?: string | null;
    agreement?: string | undefined;
    bullCase?: string | undefined;
    bearCase?: string | undefined;
    bullArguments?: string[] | undefined;
    bearArguments?: string[] | undefined;
    judgeDecision?: string | undefined;
    pmAction?: string | undefined;
    pmReasoning?: string | undefined;
    pmConfidence?: number | undefined;
    riskAggressiveView?: string | undefined;
    riskConservativeView?: string | undefined;
    riskNeutralView?: string | undefined;
    openbbVerdict?: string | null;
    price?: number | undefined;
    sma250?: number | undefined;
    position?: string | undefined;
  };
}

// ===== Mission 存储 =====

const MISSIONS_DIR = path.join(process.cwd(), 'out', 'missions');
const missionCache = new Map<string, UnifiedMission>();

function ensureMissionsDir() {
  if (!fs.existsSync(MISSIONS_DIR)) {
    fs.mkdirSync(MISSIONS_DIR, { recursive: true });
  }
}

function generateMissionId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `mission_${ts}_${Math.random().toString(36).substring(2, 6)}`;
}

function saveMission(mission: UnifiedMission) {
  ensureMissionsDir();
  const dateDir = path.join(MISSIONS_DIR, mission.createdAt.split('T')[0] || 'unknown');
  if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });

  const filePath = path.join(dateDir, `${mission.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(mission, null, 2), 'utf-8');
  missionCache.set(mission.id, mission);
}

// ===== API: 读取 Missions =====

export function getMission(id: string): UnifiedMission | null {
  if (missionCache.has(id)) return missionCache.get(id)!;

  ensureMissionsDir();
  // 搜索所有日期目录
  const dateDirs = fs.readdirSync(MISSIONS_DIR).filter(d => {
    const fullPath = path.join(MISSIONS_DIR, d);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const dateDir of dateDirs) {
    const filePath = path.join(MISSIONS_DIR, dateDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      const mission = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      missionCache.set(id, mission);
      return mission;
    }
  }
  return null;
}

export function listMissions(limit = 50): UnifiedMission[] {
  ensureMissionsDir();
  const missions: UnifiedMission[] = [];

  const dateDirs = fs.readdirSync(MISSIONS_DIR)
    .filter(d => fs.statSync(path.join(MISSIONS_DIR, d)).isDirectory())
    .sort((a, b) => b.localeCompare(a)); // 最新日期排前

  for (const dateDir of dateDirs) {
    const dirPath = path.join(MISSIONS_DIR, dateDir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json')).sort((a, b) => b.localeCompare(a));

    for (const file of files) {
      if (missions.length >= limit) break;
      try {
        const mission = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8'));
        missions.push(mission);
        missionCache.set(mission.id, mission);
      } catch {}
    }
    if (missions.length >= limit) break;
  }

  return missions;
}

// ===== 核心调度逻辑 =====

export async function triggerConsensusAlerts(consensus: TickerConsensus[]): Promise<void> {
  const alertEnabled = process.env.AUTO_ALERT_ENABLED !== 'false';
  if (!alertEnabled) return;

  for (const c of consensus) {
    const reasoningBlock = [
      c.bullCase ? `📈 看多理由: ${c.bullCase}` : '',
      c.bearCase ? `📉 看空理由: ${c.bearCase}` : '',
    ].filter(Boolean).join('\n');

    if (c.agreement === 'disagree') {
      await sendStopLossAlert(c.ticker,
        `⚠️ 双大脑冲突\nOpenClaw: ${c.openclawVerdict}\nTradingAgents: ${c.taVerdict}\n${reasoningBlock}\n建议: 暂不操作，等待共识\n${c.vetoReason || ''}`
      );
    }
    if (c.vetoed) {
      await sendStopLossAlert(c.ticker,
        `🚫 SMA250 否决\n${c.vetoReason}\n${reasoningBlock}\n建议: 右侧趋势未确认，禁止建仓`
      );
    }
  }
}

/**
 * 启动一个统一 Mission
 *
 * 这个函数被 worker.ts 的 taskQueue.onProcess 回调调用。
 * 它协调 OpenClaw + TradingAgents + OpenBB 的并行运行。
 */
export async function dispatchMission(
  input: MissionInput,
  executeOpenClaw: (query: string, depth: string, missionId: string) => Promise<string | null>,
): Promise<UnifiedMission> {
  const missionId = generateMissionId();
  const now = new Date().toISOString();

  const mission: UnifiedMission = {
    id: missionId,
    traceId: missionId,
    input,
    status: 'triggered',
    createdAt: now,
    updatedAt: now,
    openclawReport: null,
    openclawTickers: [],
    openclawDurationMs: 0,
    taResults: [],
    taDurationMs: 0,
    openbbData: [],
    macroData: null,
    consensus: [],
    totalDurationMs: 0,
  };

  saveMission(mission);
  eventBus.emitSystem('info', `🚀 Mission ${missionId} 已创建 (${input.mode})`);

  const startTime = Date.now();

  try {
    if (input.mode === 'explore') {
      // ━━━ 场景A: 探索模式 ━━━
      // Step 1: OpenClaw 先推导标的
      await runOpenClawPhase(mission, input, executeOpenClaw);

      // Step 2: 从报告中提取 Tickers
      const tickers = extractTickersFromReport(mission.openclawReport || '');
      mission.openclawTickers = tickers;

      if (tickers.length > 0) {
        // Step 3: 并行获取 OpenBB 数据 + TradingAgents 分析
        await runParallelEnrichment(mission, tickers, input.date);
      } else {
        mission.status = 'main_only';
      }

    } else if (input.mode === 'analyze') {
      // ━━━ 场景B: 分析模式 (真正并行) ━━━
      const tickers = input.tickers || [input.query.replace('$', '').toUpperCase()];
      mission.openclawTickers = tickers;

      // Step 1: 三个系统同时启动
      await Promise.all([
        runOpenClawPhase(mission, input, executeOpenClaw),
        runParallelEnrichment(mission, tickers, input.date),
      ]);

    } else if (input.mode === 'review') {
      // ━━━ 场景C: 复查模式 (真正并行) ━━━
      const tickers = input.tickers || [];
      mission.openclawTickers = tickers;

      await Promise.all([
        runOpenClawPhase(mission, input, executeOpenClaw),
        runParallelEnrichment(mission, tickers, input.date),
      ]);
    }

    // Step Final: 计算双大脑共识
    mission.consensus = await computeConsensus(mission);

    const lifecycleEngine = new NarrativeLifecycleEngine();
    let antiSellGuards: Array<{ ticker: string; reason: string }> = [];
    try {
      const lifecycleResult = await lifecycleEngine.evaluateAllActiveNarratives();
      antiSellGuards = lifecycleResult.antiSellGuards;
    } catch (e: any) {
      console.error(`[Dispatcher] Lifecycle evaluation failed: ${e.message}`);
    }

    for (const consensus of mission.consensus) {
      const guard = antiSellGuards.find(g => g.ticker === consensus.ticker);
      if (guard && (consensus.taVerdict === 'SELL' || consensus.openclawVerdict === 'SELL')) {
        consensus.vetoed = true;
        consensus.vetoReason = `🛡️ 防卖飞: ${guard.reason}`;
        eventBus.emitSystem('info', `🛡️ [ANTI_SELL] ${consensus.ticker}: TA/OC 发出 SELL 但龙头健康 → 否决清仓`);
      }
    }

    for (const c of mission.consensus) {
      if (c.agreement === 'agree' && !c.vetoed && c.openclawVerdict === 'BUY' && c.taVerdict === 'BUY') {
        try {
          await sendEntrySignal(c.ticker, '双脑共识一致看多 — 入场信号');
        } catch (err) {
          eventBus.emitSystem('error', `Failed to send entry signal for ${c.ticker}: ${err}`);
        }
      }

      if (c.openbbVerdict === 'FAIL') {
        try {
          await sendStopLossAlert(c.ticker, 'OpenBB 数据评级 FAIL — 风控预警');
        } catch (err) {
          eventBus.emitSystem('error', `Failed to send stop loss alert for ${c.ticker}: ${err}`);
        }
      }
    }

    await triggerConsensusAlerts(mission.consensus);

    const vetoedTickers = mission.consensus.filter(c => c.vetoed);
    if (vetoedTickers.length > 0) {
      try {
        await sendMessage(
          `⚠️ *双脑共识否决报告*\n\n${vetoedTickers.map(v => `🚫 *${v.ticker}*: ${v.vetoReason ?? ''}`).join('\n')}\n\n_右侧跟风纪律: 双脑冲突时不行动_`
        );
      } catch (err) {
        eventBus.emitSystem('error', `Failed to send veto summary: ${err}`);
      }
    }

    mission.decisionTrail = buildDecisionTrail(mission);
    if (mission.decisionTrail.length > 0) {
      try {
        const trailPath = saveTrailReport(mission.decisionTrail, mission.id);
        console.log(`[Dispatcher] 📋 Decision trail saved: ${trailPath}`);
      } catch (e: any) {
        console.warn(`[Dispatcher] ⚠️ Trail report save failed: ${e.message}`);
      }
    }
    mission.totalDurationMs = Date.now() - startTime;
    if (mission.status !== 'main_only') {
      mission.status = 'fully_enriched';
    }
    mission.updatedAt = new Date().toISOString();
    saveMission(mission);

    eventBus.emitSystem('info',
      `✅ Mission ${missionId} 完成 (${Math.round(mission.totalDurationMs / 1000)}s) — ` +
      `OC: ${mission.openclawReport ? '✅' : '❌'} | TA: ${mission.taResults.length} 只 | ` +
      `共识: ${mission.consensus.map(c => `${c.ticker}:${c.agreement}`).join(', ')}`
    );

  } catch (e: any) {
    mission.status = 'failed';
    mission.totalDurationMs = Date.now() - startTime;
    mission.updatedAt = new Date().toISOString();
    saveMission(mission);
    eventBus.emitSystem('error', `❌ Mission ${missionId} 失败: ${e.message}`);
    throw e;
  }

  return mission;
}

// ===== 内部执行函数 =====

async function runOpenClawPhase(
  mission: UnifiedMission,
  input: MissionInput,
  executeOpenClaw: (query: string, depth: string, missionId: string) => Promise<string | null>,
) {
  mission.status = 'main_running';
  mission.updatedAt = new Date().toISOString();
  saveMission(mission);

  const t0 = Date.now();
  try {
    mission.openclawReport = await executeOpenClaw(input.query, input.depth || 'deep', mission.id);
    mission.openclawDurationMs = Date.now() - t0;
    mission.status = 'main_complete';
    mission.updatedAt = new Date().toISOString();
    saveMission(mission);

    eventBus.emitSystem('info',
      `🔵 OpenClaw 完成 (${Math.round(mission.openclawDurationMs / 1000)}s)`
    );
  } catch (e: any) {
    mission.openclawDurationMs = Date.now() - t0;
    console.error(`[Dispatcher] OpenClaw 失败: ${e.message}`);
    // 不抛出——允许 TA 继续
  }
}

async function runParallelEnrichment(
  mission: UnifiedMission,
  tickers: string[],
  date?: string,
) {
  if (tickers.length === 0) return;

  // OpenBB + TA + Macro 三路并行
  const [openbbResults, taResults, macroData] = await Promise.allSettled([
    // OpenBB 数据查询
    (async () => {
      const isOnline = await checkOpenBBHealth();
      if (!isOnline) {
        const msg = '[Dispatcher] ⚠️ OpenBB 数据引擎离线或鉴权拒绝，强行跳过量化数据收集。请前往诊断中心查看详细原因。';
        console.warn(msg);
        eventBus.emitSystem('error', `🚨 [CRITICAL ALERT] ${msg}`);
        return [] as OpenBBTickerData[];
      }
      const results: OpenBBTickerData[] = [];
      for (const ticker of tickers) {
        try {
          const data = await fetchTickerFullData(ticker);
          if (data.verdict === 'WARN' && data.verdictReason?.includes('失败')) {
            eventBus.emitSystem('error', `🚨 [CRITICAL ALERT] OpenBB ${ticker} 查询异常: ${data.verdictReason}`);
          }
          results.push(data);
        } catch (e: any) {
          const msg = `OpenBB ${ticker} 查询崩溃: ${e.message}`;
          console.error(`[Dispatcher] ${msg}`);
          eventBus.emitSystem('error', `🚨 [CRITICAL ALERT] ${msg}`);
        }
      }
      return results;
    })(),

    // TradingAgents 分析
    (async () => {
      mission.status = 'ta_running';
      mission.updatedAt = new Date().toISOString();
      saveMission(mission);

      const isOnline = await checkTAHealth();
      if (!isOnline) {
        console.log('[Dispatcher] ⚠️ TradingAgents 离线，跳过第二大脑分析');
        return [] as TAAnalysisResult[];
      }
      const t0 = Date.now();
      const results: TAAnalysisResult[] = [];
      for (const ticker of tickers.slice(0, 3)) { // 最多分析3只
        eventBus.emitSystem('info', `🟢 TradingAgents 开始分析: ${ticker}`);
        const result = await analyzeTicker(ticker, date, mission.openclawReport || undefined);
        results.push(result);
      }
      mission.taDurationMs = Date.now() - t0;
      return results;
    })(),

    // 宏观环境
    fetchMacroEnvironment(),
  ]);

  // 收集结果
  if (openbbResults.status === 'fulfilled') {
    mission.openbbData = openbbResults.value;
  }
  if (taResults.status === 'fulfilled') {
    mission.taResults = taResults.value;
  }
  if (macroData.status === 'fulfilled') {
    mission.macroData = macroData.value;
  }
}

// ===== 工具函数 =====

/**
 * 从 OpenClaw 报告文本中提取 Ticker 符号
 */
function extractTickersFromReport(report: string): string[] {
  if (!report) return [];

  // 匹配 $TICKER 或 **$TICKER** 或 `$TICKER` 或 独立的 TICKER
  const patterns = [
    /\$([A-Z]{1,5})\b/g,                    // $NVDA
    /\*\*\$?([A-Z]{2,5})\*\*/g,             // **NVDA**
    /`\$?([A-Z]{2,5})`/g,                   // `NVDA`
    /\b([A-Z]{2,5})\b(?=\s*[—–\-:：])/g,   // NVDA — 或 NVDA:
  ];

  const tickers = new Set<string>();
  const BLACKLIST = new Set([
    'AI', 'ETF', 'IPO', 'CEO', 'CTO', 'FDA', 'SEC', 'GDP', 'CPI', 'RSI',
    'SMA', 'EPS', 'FCF', 'BUY', 'SELL', 'HOLD', 'SKIP', 'NEW', 'MACD',
    'API', 'USD', 'RMB', 'BCI', 'PE', 'PS', 'QE', 'YOY', 'QOQ',
    'NOTE', 'WARN', 'PASS', 'FAIL', 'DEEP', 'THE', 'AND', 'FOR',
  ]);

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(report)) !== null) {
      const ticker = match[1]?.toUpperCase();
      if (ticker && !BLACKLIST.has(ticker) && ticker.length >= 2) {
        tickers.add(ticker);
      }
    }
  }

  return Array.from(tickers).slice(0, 10);
}

/**
 * 计算双大脑共识
 */
function extractBullCase(ocReport: string | null, taReport: string | null): string | undefined {
  const combined = [ocReport || '', taReport || ''].join(' ');
  const sentences = combined
    .split(/[。！？\n.!?]+/)
    .map(s => s.trim())
    .filter(Boolean);
  const bullSentences = sentences
    .filter(s => /看多|bullish|upside|catalyst|做多|建仓/i.test(s))
    .slice(0, 3);
  return bullSentences.length > 0 ? bullSentences.join('；') : undefined;
}

function extractBearCase(ocReport: string | null, taReport: string | null): string | undefined {
  const combined = [ocReport || '', taReport || ''].join(' ');
  const sentences = combined
    .split(/[。！？\n.!?]+/)
    .map(s => s.trim())
    .filter(Boolean);
  const bearSentences = sentences
    .filter(s => /看空|bearish|downside|risk|风险|止损/i.test(s))
    .slice(0, 3);
  return bearSentences.length > 0 ? bearSentences.join('；') : undefined;
}

export function buildDecisionTrail(mission: UnifiedMission): DecisionTrailEntry[] {
  const entries: DecisionTrailEntry[] = [];
  const discoveryRejections = (mission as any).discoveryRejections ?? [];

  for (const rej of discoveryRejections) {
    const reason = rej.reason === 'mega_cap'
      ? `市值过大: $${(rej.marketCap! / 1e9).toFixed(1)}B > $${(rej.thresholdMax! / 1e9).toFixed(0)}B阈值`
      : rej.reason === 'micro_cap'
      ? `市值过小: $${(rej.marketCap! / 1e6).toFixed(1)}M < $${(rej.thresholdMin! / 1e6).toFixed(0)}M阈值`
      : rej.reason === 'invalid'
      ? '无效报价 (price <= 0)'
      : '数据错误';

    entries.push({
      ticker: rej.symbol,
      stage: 'discovery_filter',
      verdict: 'reject',
      reason,
      details: {
        marketCap: rej.marketCap,
        thresholdMin: rej.thresholdMin,
        thresholdMax: rej.thresholdMax,
      },
    });
  }

  for (const c of mission.consensus ?? []) {
    const taResult = mission.taResults?.find(r => r.ticker === c.ticker);

    entries.push({
      ticker: c.ticker,
      stage: 'consensus',
      verdict: c.agreement === 'disagree' ? 'reject' : 'pass',
      reason: c.vetoReason ?? `双大脑共识: ${c.agreement}`,
      details: {
        openclawVerdict: c.openclawVerdict,
        taVerdict: c.taVerdict,
        agreement: c.agreement,
        bullCase: c.bullCase,
        bearCase: c.bearCase,
        bullArguments: taResult?.investmentDebate?.bullArguments,
        bearArguments: taResult?.investmentDebate?.bearArguments,
        judgeDecision: taResult?.investmentDebate?.judgeDecision,
        pmAction: taResult?.portfolioManagerDecision?.action,
        pmReasoning: taResult?.portfolioManagerDecision?.reasoning,
        pmConfidence: taResult?.portfolioManagerDecision?.confidence,
        riskAggressiveView: taResult?.riskDebate?.aggressiveView,
        riskConservativeView: taResult?.riskDebate?.conservativeView,
        riskNeutralView: taResult?.riskDebate?.neutralView,
        openbbVerdict: c.openbbVerdict,
      },
    });

    if (c.vetoed === true) {
      const match = c.vetoReason?.match(/价格\s+([\d.]+)\s*<\s*SMA250\s+([\d.]+)/);
      entries.push({
        ticker: c.ticker,
        stage: 'sma_veto',
        verdict: 'reject',
        reason: c.vetoReason || 'SMA250 veto',
        details: {
          price: match ? Number(match[1]) : undefined,
          sma250: match ? Number(match[2]) : undefined,
          position: 'below',
        },
      });
    }
  }

  const stageOrder: Record<DecisionTrailEntry['stage'], number> = {
    discovery_filter: 0,
    consensus: 1,
    sma_veto: 2,
  };

  return entries.sort((a, b) => {
    const stageDiff = stageOrder[a.stage] - stageOrder[b.stage];
    if (stageDiff !== 0) return stageDiff;
    return a.ticker.localeCompare(b.ticker);
  });
}

export async function computeConsensus(mission: UnifiedMission): Promise<TickerConsensus[]> {
  const tickers = mission.openclawTickers;
  if (!tickers.length) return [];

  const results = await Promise.all(tickers.map(async ticker => {
    // OpenClaw 从报告中推断态度
    let ocVerdict: TickerConsensus['openclawVerdict'] = null;
    if (mission.openclawReport) {
      const report = mission.openclawReport.toUpperCase();
      const tickerContext = report.split(ticker).slice(1).join('').slice(0, 200);
      const negationPatterns = ['NOT ', "DON'T ", '不建议', '不推荐', '避免', '远离'];
      const hasNegation = negationPatterns.some(neg => tickerContext.includes(neg));
      if (hasNegation) {
        ocVerdict = 'SKIP';
      } else if (tickerContext.includes('BUY') || tickerContext.includes('做多') || tickerContext.includes('✅') || tickerContext.includes('建仓')) {
        ocVerdict = 'BUY';
      } else if (tickerContext.includes('SELL') || tickerContext.includes('做空') || tickerContext.includes('离场')) {
        ocVerdict = 'SELL';
      } else if (tickerContext.includes('HOLD') || tickerContext.includes('观望')) {
        ocVerdict = 'HOLD';
      } else if (tickerContext.includes('跳过') || tickerContext.includes('SKIP') || tickerContext.includes('❌')) {
        ocVerdict = 'SKIP';
      }
    }

    // TradingAgents PM 裁决
    const taResult = mission.taResults.find(r => r.ticker === ticker);
    const taVerdict = taResult?.portfolioManagerDecision?.action || null;

    // OpenBB 评级
    const openbbResult = mission.openbbData.find(d => d.ticker === ticker);
    const openbbVerdict = openbbResult?.verdict || null;

    const taReport = taResult
      ? [
          taResult.traderPlan,
          taResult.portfolioManagerDecision?.reasoning,
          taResult.investmentDebate?.judgeDecision,
          ...(taResult.investmentDebate?.bullArguments || []),
          ...(taResult.investmentDebate?.bearArguments || []),
        ]
          .filter(Boolean)
          .join(' ')
      : null;
    const bullCase = extractBullCase(mission.openclawReport, taReport);
    const bearCase = extractBearCase(mission.openclawReport, taReport);

    // 共识判断
    let agreement: TickerConsensus['agreement'] = 'pending';
    let vetoed = false;
    let vetoReason: string | undefined;

    if (ocVerdict && taVerdict) {
      if (ocVerdict === 'BUY' && taVerdict === 'BUY') agreement = 'agree';
      else if (ocVerdict === 'SELL' && taVerdict === 'SELL') agreement = 'agree';
      else if ((ocVerdict === 'BUY' && taVerdict === 'SELL') || (ocVerdict === 'SELL' && taVerdict === 'BUY')) {
        agreement = 'disagree';
      } else {
        agreement = 'partial';
      }
    } else if (ocVerdict || taVerdict) {
      agreement = 'partial';
    }

    if (agreement === 'disagree') {
      vetoReason = `双大脑冲突: OpenClaw=${ocVerdict} vs TradingAgents=${taVerdict}，强制 HOLD`;
      console.log(`[Consensus] ⚠️ ${vetoReason}`);
    }

    const smaVetoEnabled = process.env.SMA250_VETO_ENABLED !== 'false';
    if (
      smaVetoEnabled
      && (agreement === 'agree' || agreement === 'partial')
      && (ocVerdict === 'BUY' || taVerdict === 'BUY')
    ) {
      try {
        const smaResults = await checkSMACross(ticker, [250]);
        const sma250 = smaResults.find(r => r.period === 250);
        if (sma250?.position === 'below') {
          vetoed = true;
          vetoReason = `${ticker} 处于 250日均线下方 (价格 ${sma250.price} < SMA250 ${sma250.sma})，右侧趋势未确认，否决 BUY`;
          agreement = 'blocked';
          console.log(`[Consensus] 🚫 SMA250 否决: ${vetoReason}`);
        }
      } catch (e: any) {
        console.warn(`[Consensus] SMA250 检查失败 ${ticker}: ${e.message}，跳过否决`);
      }
    }

    const consensus: TickerConsensus = {
      ticker,
      openclawVerdict: ocVerdict,
      taVerdict,
      agreement,
      openbbVerdict,
      vetoed,
    };

    if (vetoReason) consensus.vetoReason = vetoReason;
    if (bullCase) consensus.bullCase = bullCase;
    if (bearCase) consensus.bearCase = bearCase;

    return consensus;
  }));

  return results;
}
