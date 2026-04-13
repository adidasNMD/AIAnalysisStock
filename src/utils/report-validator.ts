import { TradeDecisionSchema, TradeDecision, StructuredStopLoss, OpenClawStructuredVerdictSchema, type OpenClawStructuredVerdict } from '../models/types';

/**
 * 从 LLM 报告文本中提取结构化的 TradeDecision。
 * 使用 safeParse — 永不抛出，解析失败仅 log 警告。
 */
export function validateTradeDecision(report: string, ticker: string): TradeDecision | null {
  // ── 1. Extract driverType ──────────────────────────────────────────────────
  let extractedDriverType: 'Fundamental' | 'Policy_Driven' | 'Narrative_Hype' = 'Fundamental';
  if (/政策|policy|Policy_Driven/i.test(report)) {
    extractedDriverType = 'Policy_Driven';
  } else if (/叙事|炒作|narrative|hype/i.test(report)) {
    extractedDriverType = 'Narrative_Hype';
  } else if (/基本面|fundamental/i.test(report)) {
    extractedDriverType = 'Fundamental';
  }

  // ── 2. Extract positionSize ────────────────────────────────────────────────
  type PositionSizeValue = 'full' | 'half' | 'quarter' | 'trial' | 'skip';
  let extractedPositionSize: PositionSizeValue = 'trial'; // conservative default
  if (/满仓|full position/i.test(report)) {
    extractedPositionSize = 'full';
  } else if (/半仓|half position/i.test(report)) {
    extractedPositionSize = 'half';
  } else if (/quarter|四分之一/i.test(report)) {
    extractedPositionSize = 'quarter';
  } else if (/不买|观望|\bskip\b/i.test(report)) {
    extractedPositionSize = 'skip';
  } else if (/trial|试仓|小仓/i.test(report)) {
    extractedPositionSize = 'trial';
  }

  // ── 3. Extract stopLosses ──────────────────────────────────────────────────
  const extractedStopLosses: StructuredStopLoss[] = [];
  // Split report into sentences on common Chinese/English delimiters
  const sentences = report.split(/[。！？\n.!?]+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (/止损|stop.?loss/i.test(trimmed)) {
      extractedStopLosses.push({
        type: 'custom',
        condition: trimmed,
        ticker,
        humanReadable: trimmed,
      });
    }
  }

  // ── 4. Extract bullCase ───────────────────────────────────────────────────
  const bullSentences: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (/看多|bullish|upside|catalyst|买入理由/i.test(trimmed)) {
      bullSentences.push(trimmed);
    }
  }
  const extractedBullCase =
    bullSentences.length > 0
      ? bullSentences.slice(0, 3).join('；')
      : '从报告中提取的看多逻辑（详见完整报告）';

  // ── 5. Extract bearCase ───────────────────────────────────────────────────
  const bearSentences: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (/看空|bearish|downside|risk|风险/i.test(trimmed)) {
      bearSentences.push(trimmed);
    }
  }
  const extractedBearCase =
    bearSentences.length > 0
      ? bearSentences.slice(0, 3).join('；')
      : '从报告中提取的看空风险（详见完整报告）';

  // ── 6. safeParse into schema ──────────────────────────────────────────────
  const result = TradeDecisionSchema.safeParse({
    ticker,
    verdict: 'HOLD', // conservative default
    driverType: extractedDriverType,
    positionSize: extractedPositionSize,
    stopLosses: extractedStopLosses,
    bullCase: extractedBullCase,
    bearCase: extractedBearCase,
    vetoed: false,
    agreement: 'pending',
  });

  if (!result.success) {
    console.warn(
      `[ReportValidator] ⚠️ 结构化提取失败 ${ticker}: ${result.error.message}`,
    );
    return null;
  }

  console.log(
    `[ReportValidator] 📋 结构化提取成功: driverType=${result.data.driverType}, positionSize=${result.data.positionSize}`,
  );
  return result.data;
}

/**
 * 从 LLM 报告文本中提取 ## STRUCTURED_VERDICTS JSON 块，
 * 使用 safeParse 逐票验证 — 永不抛出，解析失败仅 log 警告并返回空对象。
 */
export function parseStructuredVerdicts(
  report: string,
  tickers: string[],
): Record<string, OpenClawStructuredVerdict> {
  const result: Record<string, OpenClawStructuredVerdict> = {};

  try {
    // 1. Find the ## STRUCTURED_VERDICTS section and extract JSON code fence
    const sectionMatch = report.match(
      /## STRUCTURED_VERDICTS\s*\n```json\s*\n([\s\S]*?)\n```/,
    );
    if (!sectionMatch || !sectionMatch[1]) {
      console.warn('[ReportValidator] ⚠️ No ## STRUCTURED_VERDICTS section found in report');
      return result;
    }

    // 2. Parse JSON — expecting an array of per-ticker objects
    let parsed: unknown;
    try {
      parsed = JSON.parse(sectionMatch[1]);
    } catch (jsonErr) {
      console.warn(`[ReportValidator] ⚠️ STRUCTURED_VERDICTS JSON parse failed: ${jsonErr}`);
      return result;
    }

    // Normalize: accept both array and object-with-ticker-keys
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
        ? Object.values(parsed)
        : [];

    // 3. safeParse each item
    for (const item of items) {
      const parseResult = OpenClawStructuredVerdictSchema.safeParse(item);
      if (!parseResult.success) {
        console.warn(
          `[ReportValidator] ⚠️ Structured verdict safeParse failed for item: ${parseResult.error.message}`,
        );
        continue;
      }
      result[parseResult.data.ticker] = parseResult.data;
    }
  } catch (err) {
    console.warn(`[ReportValidator] ⚠️ parseStructuredVerdicts unexpected error: ${err}`);
    return {};
  }

  return result;
}
