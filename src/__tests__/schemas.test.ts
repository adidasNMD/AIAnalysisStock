import { describe, it, expect } from 'vitest';
import { TradeDecisionSchema, NarrativeTopicSchema, PositionSizeEnum, StructuredStopLossSchema } from '../models/types';

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
