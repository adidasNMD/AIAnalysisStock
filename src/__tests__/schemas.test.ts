import { describe, it, expect } from 'vitest';
import { TradeDecisionSchema, NarrativeTopicSchema, PositionSizeEnum, StructuredStopLossSchema, OpenClawStructuredVerdictSchema } from '../models/types';
import { parseStructuredVerdicts } from '../utils/report-validator';
import { emitStructuredVerdictBlock } from '../agents/intelligence/synthesis';

const validTradeDecision = {
  ticker: 'AAOI',
  verdict: 'BUY' as const,
  driverType: 'Fundamental' as const,
  positionSize: 'trial' as const,
  stopLosses: [],
  bullCase: '光模块需求受AI数据中心驱动，订单能见度高',
  bearCase: '竞争对手进入，毛利率承压风险',
  agreement: 'agree' as const,
};

describe('TradeDecisionSchema', () => {
  it('parses valid trade decision', () => {
    const result = TradeDecisionSchema.parse(validTradeDecision);
    expect(result.ticker).toBe('AAOI');
    expect(result.vetoed).toBe(false);
  });

  it('throws ZodError when driverType is missing', () => {
    const bad = { ...validTradeDecision };
    delete (bad as any).driverType;
    expect(() => TradeDecisionSchema.parse(bad)).toThrow();
  });

  it('throws ZodError when bullCase is missing', () => {
    const bad = { ...validTradeDecision };
    delete (bad as any).bullCase;
    expect(() => TradeDecisionSchema.parse(bad)).toThrow();
  });

  it('throws ZodError when bearCase is missing', () => {
    const bad = { ...validTradeDecision };
    delete (bad as any).bearCase;
    expect(() => TradeDecisionSchema.parse(bad)).toThrow();
  });

  it('accepts VETO_BUY verdict', () => {
    const vetoed = { ...validTradeDecision, verdict: 'VETO_BUY' as const, vetoed: true, vetoReason: 'below SMA250' };
    expect(() => TradeDecisionSchema.parse(vetoed)).not.toThrow();
  });

  it('vetoed defaults to false when not provided', () => {
    const result = TradeDecisionSchema.parse(validTradeDecision);
    expect(result.vetoed).toBe(false);
  });
});

describe('NarrativeTopicSchema', () => {
  it('defaults narrativeType to Fundamental when not provided', () => {
    const topic = {
      id: 'test-1',
      title: 'Test Topic',
      description: 'Test',
      relatedEventIds: [],
      impactScore: 50,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const result = NarrativeTopicSchema.parse(topic);
    expect(result.narrativeType).toBe('Fundamental');
  });

  it('accepts explicit narrativeType values', () => {
    const topic = {
      id: 'test-2',
      title: 'Policy Topic',
      description: 'Policy driven',
      relatedEventIds: [],
      impactScore: 80,
      narrativeType: 'Policy_Driven' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const result = NarrativeTopicSchema.parse(topic);
    expect(result.narrativeType).toBe('Policy_Driven');
  });
});

describe('StructuredStopLossSchema', () => {
  it('parses valid stop loss', () => {
    const sl = {
      type: 'price_sma_break' as const,
      condition: 'Price breaks below 20-day SMA',
      smaPeriod: 20,
      humanReadable: '20日均线跌破止损',
    };
    expect(() => StructuredStopLossSchema.parse(sl)).not.toThrow();
  });
});

describe('OpenClawStructuredVerdict', () => {
  const validVerdict = {
    ticker: 'AAOI',
    verdict: 'BUY' as const,
    bullCase: '光模块需求受AI数据中心驱动',
    bearCase: '竞争对手进入，毛利率承压',
  };

  it('parses valid payload with all required fields', () => {
    const result = OpenClawStructuredVerdictSchema.parse(validVerdict);
    expect(result.ticker).toBe('AAOI');
    expect(result.verdict).toBe('BUY');
    expect(result.bullCase).toBe('光模块需求受AI数据中心驱动');
    expect(result.bearCase).toBe('竞争对手进入，毛利率承压');
    expect(result.confidence).toBeUndefined();
  });

  it('rejects invalid verdict enum value', () => {
    const bad = { ...validVerdict, verdict: 'STRONG_BUY' };
    expect(() => OpenClawStructuredVerdictSchema.parse(bad)).toThrow();
  });

  it('throws ZodError when bullCase is missing', () => {
    const bad = { ...validVerdict };
    delete (bad as any).bullCase;
    expect(() => OpenClawStructuredVerdictSchema.parse(bad)).toThrow();
  });

  it('throws ZodError when bearCase is missing', () => {
    const bad = { ...validVerdict };
    delete (bad as any).bearCase;
    expect(() => OpenClawStructuredVerdictSchema.parse(bad)).toThrow();
  });

  it('accepts optional confidence when omitted', () => {
    const result = OpenClawStructuredVerdictSchema.parse(validVerdict);
    expect(result.confidence).toBeUndefined();
  });

  it('accepts optional confidence when provided', () => {
    const withConfidence = { ...validVerdict, confidence: 'high' as const };
    const result = OpenClawStructuredVerdictSchema.parse(withConfidence);
    expect(result.confidence).toBe('high');
  });

  it('rejects invalid confidence enum value', () => {
    const bad = { ...validVerdict, confidence: 'very_high' };
    expect(() => OpenClawStructuredVerdictSchema.parse(bad)).toThrow();
  });
});

describe('parseStructuredVerdicts', () => {
  const validBlock = `Some report content about $AAOI

## STRUCTURED_VERDICTS
\`\`\`json
[
  { "ticker": "AAOI", "verdict": "BUY", "bullCase": "AI数据中心驱动", "bearCase": "竞争风险" },
  { "ticker": "LITE", "verdict": "HOLD", "bullCase": "稳定增长", "bearCase": "估值偏高" }
]
\`\`\``;

  it('parses valid structured verdict block into Record', () => {
    const result = parseStructuredVerdicts(validBlock, ['AAOI', 'LITE']);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['AAOI']?.verdict).toBe('BUY');
    expect(result['AAOI']?.bullCase).toBe('AI数据中心驱动');
    expect(result['LITE']?.verdict).toBe('HOLD');
    expect(result['LITE']?.bearCase).toBe('估值偏高');
  });

  it('returns empty object when report has no STRUCTURED_VERDICTS section', () => {
    const report = 'Just a plain report with no structured block.';
    const result = parseStructuredVerdicts(report, ['AAOI']);
    expect(result).toEqual({});
  });

  it('returns empty object when JSON is malformed', () => {
    const report = `Report text\n\n## STRUCTURED_VERDICTS\n\`\`\`json\n{not valid json\n\`\`\``;
    const result = parseStructuredVerdicts(report, ['AAOI']);
    expect(result).toEqual({});
  });

  it('skips individual items with invalid verdict enum (safeParse rejection)', () => {
    const report = `Report\n\n## STRUCTURED_VERDICTS
\`\`\`json
[
  { "ticker": "AAOI", "verdict": "STRONG_BUY", "bullCase": "x", "bearCase": "y" },
  { "ticker": "LITE", "verdict": "SELL", "bullCase": "a", "bearCase": "b" }
]
\`\`\``;
    const result = parseStructuredVerdicts(report, ['AAOI', 'LITE']);
    expect(result['AAOI']).toBeUndefined();
    expect(result['LITE']?.verdict).toBe('SELL');
  });
});

describe('emitStructuredVerdictBlock', () => {
  it('appends STRUCTURED_VERDICTS section when tickers have verdicts', () => {
    const report = '$AAOI 建议 BUY 买入，催化剂是AI需求。风险是竞争加剧。';
    const result = emitStructuredVerdictBlock(report, ['AAOI']);
    expect(result).toContain('## STRUCTURED_VERDICTS');
    expect(result).toContain('```json');
    const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
    expect(jsonMatch).toBeTruthy();
    const parsed = JSON.parse(jsonMatch![1]!);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed[0].ticker).toBe('AAOI');
    expect(parsed[0].verdict).toBe('BUY');
  });

  it('returns string with empty verdicts array when no tickers provided', () => {
    const report = 'Some report without tickers.';
    const result = emitStructuredVerdictBlock(report, []);
    expect(result).toContain('## STRUCTURED_VERDICTS');
    expect(result).toContain('[]');
  });

  it('preserves original report content before the appended block', () => {
    const report = '# Original Report\n\n$MU is a HOLD. 风险较高。';
    const result = emitStructuredVerdictBlock(report, ['MU']);
    expect(result.startsWith('# Original Report')).toBe(true);
    expect(result).toContain('## STRUCTURED_VERDICTS');
  });
});
