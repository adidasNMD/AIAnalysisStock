import { eventBus } from '../utils/event-bus';
import { logger } from '../utils/logger';
import { analyzeTicker, checkTAHealth, type TAAnalysisResult } from '../utils/ta-client';
import { fetchTickerFullData, fetchMacroEnvironment, checkOpenBBHealth, type OpenBBTickerData } from '../utils/openbb-provider';
import { sendEntrySignal, sendMessage, sendStopLossAlert } from '../utils/telegram';
import { NarrativeLifecycleEngine } from '../agents/lifecycle/engine';
import * as fs from 'fs';
import * as path from 'path';
import { saveTrailReport } from '../utils/trail-renderer';
import { buildDecisionTrail, computeConsensus, triggerConsensusAlerts } from './consensus';
import type { ConsensusResult, MissionInput, UnifiedMission } from './types';

const MISSIONS_DIR = path.join(process.cwd(), 'out', 'missions');
const missionCache = new Map<string, UnifiedMission>();
function ensureMissionsDir() {
  if (!fs.existsSync(MISSIONS_DIR)) fs.mkdirSync(MISSIONS_DIR, { recursive: true });
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
  fs.writeFileSync(path.join(dateDir, `${mission.id}.json`), JSON.stringify(mission, null, 2), 'utf-8');
  missionCache.set(mission.id, mission);
}

export function getMission(id: string): UnifiedMission | null {
  if (missionCache.has(id)) return missionCache.get(id)!;
  ensureMissionsDir();
  const dateDirs = fs.readdirSync(MISSIONS_DIR).filter(d => fs.statSync(path.join(MISSIONS_DIR, d)).isDirectory());
  for (const dateDir of dateDirs) {
    const filePath = path.join(MISSIONS_DIR, dateDir, `${id}.json`);
    if (!fs.existsSync(filePath)) continue;
    const mission = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    missionCache.set(id, mission);
    return mission;
  }
  return null;
}

export function listMissions(limit = 50): UnifiedMission[] {
  ensureMissionsDir();
  const missions: UnifiedMission[] = [];
  const dateDirs = fs.readdirSync(MISSIONS_DIR).filter(d => fs.statSync(path.join(MISSIONS_DIR, d)).isDirectory()).sort((a, b) => b.localeCompare(a));
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
      await runOpenClawPhase(mission, input, executeOpenClaw);
      const tickers = extractTickersFromReport(mission.openclawReport || '');
      mission.openclawTickers = tickers;
      if (tickers.length > 0) await runParallelEnrichment(mission, tickers, input.date);
      else mission.status = 'main_only';
    } else if (input.mode === 'analyze') {
      const tickers = input.tickers || [input.query.replace('$', '').toUpperCase()];
      mission.openclawTickers = tickers;
      await Promise.all([runOpenClawPhase(mission, input, executeOpenClaw), runParallelEnrichment(mission, tickers, input.date)]);
    } else if (input.mode === 'review') {
      const tickers = input.tickers || [];
      mission.openclawTickers = tickers;
      await Promise.all([runOpenClawPhase(mission, input, executeOpenClaw), runParallelEnrichment(mission, tickers, input.date)]);
    }

    const _consensusResults: ConsensusResult[] = await computeConsensus(mission);
    const lifecycleEngine = new NarrativeLifecycleEngine();
    let antiSellGuards: Array<{ ticker: string; reason: string }> = [];
    try {
      const lifecycleResult = await lifecycleEngine.evaluateAllActiveNarratives();
      antiSellGuards = lifecycleResult.antiSellGuards;
    } catch (e: any) {
      logger.error(`[Dispatcher] Lifecycle evaluation failed: ${e.message}`);
    }

    for (const consensus of mission.consensus) {
      const guard = antiSellGuards.find(g => g.ticker === consensus.ticker);
      if (!guard || (consensus.taVerdict !== 'SELL' && consensus.openclawVerdict !== 'SELL')) continue;
      consensus.vetoed = true;
      consensus.vetoReason = `🛡️ 防卖飞: ${guard.reason}`;
      eventBus.emitSystem('info', `🛡️ [ANTI_SELL] ${consensus.ticker}: TA/OC 发出 SELL 但龙头健康 → 否决清仓`);
    }

    for (const c of mission.consensus) {
      if (c.agreement === 'agree' && !c.vetoed && c.openclawVerdict === 'BUY' && c.taVerdict === 'BUY') {
        try {
          await sendEntrySignal(c.ticker, '双脑共识一致看多 — 入场信号');
        } catch (err) {
          eventBus.emitSystem('error', `Failed to send entry signal for ${c.ticker}: ${err}`);
        }
      }
      if (c.openbbVerdict !== 'FAIL') continue;
      try {
        await sendStopLossAlert(c.ticker, 'OpenBB 数据评级 FAIL — 风控预警');
      } catch (err) {
        eventBus.emitSystem('error', `Failed to send stop loss alert for ${c.ticker}: ${err}`);
      }
    }

    await triggerConsensusAlerts(mission.consensus);
    const vetoedTickers = mission.consensus.filter(c => c.vetoed);
    if (vetoedTickers.length > 0) {
      try {
        await sendMessage(`⚠️ *双脑共识否决报告*\n\n${vetoedTickers.map(v => `🚫 *${v.ticker}*: ${v.vetoReason ?? ''}`).join('\n')}\n\n_右侧跟风纪律: 双脑冲突时不行动_`);
      } catch (err) {
        eventBus.emitSystem('error', `Failed to send veto summary: ${err}`);
      }
    }

    mission.decisionTrail = buildDecisionTrail(mission);
    if (mission.decisionTrail.length > 0) {
      try {
        const trailPath = saveTrailReport(mission.decisionTrail, mission.id);
        logger.info(`[Dispatcher] 📋 Decision trail saved: ${trailPath}`);
      } catch (e: any) {
        logger.warn(`[Dispatcher] ⚠️ Trail report save failed: ${e.message}`);
      }
    }
    mission.totalDurationMs = Date.now() - startTime;
    if (mission.status !== 'main_only') mission.status = 'fully_enriched';
    mission.updatedAt = new Date().toISOString();
    saveMission(mission);
    eventBus.emitSystem('info', `✅ Mission ${missionId} 完成 (${Math.round(mission.totalDurationMs / 1000)}s) — OC: ${mission.openclawReport ? '✅' : '❌'} | TA: ${mission.taResults.length} 只 | 共识: ${mission.consensus.map(c => `${c.ticker}:${c.agreement}`).join(', ')}`);
  } catch (e: any) {
    mission.status = 'failed';
    mission.totalDurationMs = Date.now() - startTime;
    mission.updatedAt = new Date().toISOString();
    saveMission(mission);
    eventBus.emitSystem('error', `❌ Mission ${missionId} 失败: ${e.message}`);
    throw e;
  } finally {
    eventBus.cleanupMission(mission.id);
  }

  return mission;
}

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
    eventBus.emitSystem('info', `🔵 OpenClaw 完成 (${Math.round(mission.openclawDurationMs / 1000)}s)`);
  } catch (e: any) {
    mission.openclawDurationMs = Date.now() - t0;
    logger.error(`[Dispatcher] OpenClaw 失败: ${e.message}`);
  }
}

async function runParallelEnrichment(
  mission: UnifiedMission,
  tickers: string[],
  date?: string,
) {
  if (tickers.length === 0) return;
  const [openbbResults, taResults, macroData] = await Promise.allSettled([
    (async () => {
      const isOnline = await checkOpenBBHealth();
      if (!isOnline) {
        const msg = '[Dispatcher] ⚠️ OpenBB 数据引擎离线或鉴权拒绝，强行跳过量化数据收集。请前往诊断中心查看详细原因。';
        logger.warn(msg);
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
          logger.error(`[Dispatcher] ${msg}`);
          eventBus.emitSystem('error', `🚨 [CRITICAL ALERT] ${msg}`);
        }
      }
      return results;
    })(),
    (async () => {
      mission.status = 'ta_running';
      mission.updatedAt = new Date().toISOString();
      saveMission(mission);
      const isOnline = await checkTAHealth();
      if (!isOnline) {
        logger.info('[Dispatcher] ⚠️ TradingAgents 离线，跳过第二大脑分析');
        return [] as TAAnalysisResult[];
      }
      const t0 = Date.now();
      const results: TAAnalysisResult[] = [];
      for (const ticker of tickers.slice(0, 3)) {
        eventBus.emitSystem('info', `🟢 TradingAgents 开始分析: ${ticker}`);
        const result = await analyzeTicker(ticker, date, mission.openclawReport || undefined);
        results.push(result);
      }
      mission.taDurationMs = Date.now() - t0;
      return results;
    })(),
    fetchMacroEnvironment(),
  ]);

  if (openbbResults.status === 'fulfilled') mission.openbbData = openbbResults.value;
  if (taResults.status === 'fulfilled') mission.taResults = taResults.value;
  if (macroData.status === 'fulfilled') mission.macroData = macroData.value;
}

function extractTickersFromReport(report: string): string[] {
  if (!report) return [];
  const patterns = [/\$([A-Z]{1,5})\b/g, /\*\*\$?([A-Z]{2,5})\*\*/g, /`\$?([A-Z]{2,5})`/g, /\b([A-Z]{2,5})\b(?=\s*[—–\-:：])/g];
  const tickers = new Set<string>();
  const BLACKLIST = new Set(['AI', 'ETF', 'IPO', 'CEO', 'CTO', 'FDA', 'SEC', 'GDP', 'CPI', 'RSI', 'SMA', 'EPS', 'FCF', 'BUY', 'SELL', 'HOLD', 'SKIP', 'NEW', 'MACD', 'API', 'USD', 'RMB', 'BCI', 'PE', 'PS', 'QE', 'YOY', 'QOQ', 'NOTE', 'WARN', 'PASS', 'FAIL', 'DEEP', 'THE', 'AND', 'FOR']);
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(report)) !== null) {
      const ticker = match[1]?.toUpperCase();
      if (ticker && !BLACKLIST.has(ticker) && ticker.length >= 2) tickers.add(ticker);
    }
  }
  return Array.from(tickers).slice(0, 10);
}
