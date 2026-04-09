import { checkSMACross } from '../tools/market-data';
import { sendStopLossAlert } from '../utils/telegram';
import { logger } from '../utils/logger';
import type { ConsensusResult, DecisionTrailEntry, TickerConsensus, UnifiedMission } from './types';

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

export async function computeConsensus(mission: UnifiedMission): Promise<ConsensusResult[]> {
  const tickers = mission.openclawTickers;
  if (!tickers.length) return [];

  const tickerConsensusResults = await Promise.all(tickers.map(async ticker => {
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

    const taResult = mission.taResults.find(r => r.ticker === ticker);
    const taVerdict = taResult?.portfolioManagerDecision?.action || null;

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
      logger.warn(`[Consensus] ⚠️ ${vetoReason}`);
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
          logger.warn(`[Consensus] 🚫 SMA250 否决: ${vetoReason}`);
        }
      } catch (e: any) {
        logger.warn(`[Consensus] SMA250 检查失败 ${ticker}: ${e.message}，跳过否决`);
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

  mission.consensus = tickerConsensusResults;

  return tickerConsensusResults.map(tc => mapToConsensusResult(tc));
}

function deriveOverallAction(tc: TickerConsensus): ConsensusResult['overallAction'] {
  if (tc.agreement === 'agree' && tc.taVerdict === 'BUY' && !tc.vetoed) return 'BUY';
  if (tc.agreement === 'agree' && tc.taVerdict === 'SELL' && !tc.vetoed) return 'SELL';
  if (tc.vetoed) return 'HOLD';
  if (tc.agreement === 'disagree') return 'HOLD';
  return 'HOLD';
}

const CONFIDENCE_BY_AGREEMENT: Record<TickerConsensus['agreement'], number> = {
  agree: 85,
  partial: 55,
  disagree: 20,
  blocked: 10,
  pending: 0,
};

function buildReasoning(tc: TickerConsensus): string {
  const parts: string[] = [];
  if (tc.bullCase) parts.push(`Bull: ${tc.bullCase}`);
  if (tc.bearCase) parts.push(`Bear: ${tc.bearCase}`);
  if (tc.vetoReason) parts.push(`Veto: ${tc.vetoReason}`);
  return parts.join(' | ') || 'No reasoning available';
}

function mapToConsensusResult(tc: TickerConsensus): ConsensusResult {
  return {
    ticker: tc.ticker,
    overallAction: deriveOverallAction(tc),
    confidence: CONFIDENCE_BY_AGREEMENT[tc.agreement],
    taSignal: tc.taVerdict ?? 'UNKNOWN',
    openbbSignal: tc.openbbVerdict ?? 'UNKNOWN',
    sma250Vetoed: tc.vetoed,
    antiSellGuardTriggered: false,
    entrySignalAligned: tc.agreement === 'agree',
    reasoning: buildReasoning(tc),
    decisionTrail: [],
  };
}
