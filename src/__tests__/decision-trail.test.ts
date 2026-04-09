import { describe, expect, it } from 'vitest';
import { buildDecisionTrail, type UnifiedMission } from '../workflows/mission-dispatcher';

function makeTAResult(ticker: string, overrides: Partial<UnifiedMission['taResults'][number]> = {}) {
  return {
    ticker,
    date: '2026-04-08',
    status: 'success' as const,
    analystReports: { market: '', sentiment: '', news: '', fundamentals: '' },
    investmentDebate: {
      bullArguments: ['bull a'],
      bearArguments: ['bear a'],
      judgeDecision: 'judge ok',
      rounds: 1,
    },
    traderPlan: 'plan',
    riskDebate: {
      aggressiveView: 'agg',
      conservativeView: 'cons',
      neutralView: 'neu',
      rounds: 1,
    },
    portfolioManagerDecision: {
      action: 'BUY' as const,
      allocation: '10%',
      stopLoss: '-5%',
      confidence: 0.9,
      reasoning: 'reason',
    },
    duration: 1,
    rawLogStates: {},
    ...overrides,
  };
}

function makeMission(overrides: Partial<UnifiedMission> = {}): UnifiedMission {
  return {
    id: 'test-mission',
    traceId: 'test-trace',
    input: { mode: 'analyze', query: 'test', tickers: ['AAA'], depth: 'deep', source: 'test' },
    status: 'fully_enriched',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    openclawReport: null,
    openclawTickers: [],
    openclawDurationMs: 0,
    taResults: [],
    taDurationMs: 0,
    openbbData: [],
    macroData: null,
    consensus: [],
    totalDurationMs: 0,
    ...overrides,
  };
}

describe('buildDecisionTrail', () => {
  it('returns two consensus pass entries for all-pass scenario', () => {
    const mission = makeMission({
      openclawTickers: ['AAA', 'BBB'],
      consensus: [
        {
          ticker: 'AAA',
          openclawVerdict: 'BUY',
          taVerdict: 'BUY',
          agreement: 'agree',
          openbbVerdict: 'PASS',
          vetoed: false,
        },
        {
          ticker: 'BBB',
          openclawVerdict: 'HOLD',
          taVerdict: 'HOLD',
          agreement: 'agree',
          openbbVerdict: 'PASS',
          vetoed: false,
        },
      ],
      taResults: [makeTAResult('AAA'), makeTAResult('BBB')],
    });

    const trail = buildDecisionTrail(mission);
    expect(trail).toHaveLength(2);
    expect(trail.every(e => e.stage === 'consensus' && e.verdict === 'pass')).toBe(true);
  });

  it('rejects disagree consensus with conflict reason', () => {
    const mission = makeMission({
      consensus: [{
        ticker: 'AAA',
        openclawVerdict: 'BUY',
        taVerdict: 'SELL',
        agreement: 'disagree',
        openbbVerdict: 'WARN',
        vetoed: false,
        vetoReason: '双大脑冲突: OpenClaw=BUY vs TradingAgents=SELL，强制 HOLD',
      }],
      taResults: [makeTAResult('AAA')],
    });

    const [entry] = buildDecisionTrail(mission);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.verdict).toBe('reject');
    expect(entry.reason).toContain('双大脑冲突');
  });

  it('adds sma veto entry when ticker is vetoed', () => {
    const mission = makeMission({
      consensus: [{
        ticker: 'AAA',
        openclawVerdict: 'BUY',
        taVerdict: 'BUY',
        agreement: 'agree',
        openbbVerdict: 'PASS',
        vetoed: true,
        vetoReason: 'AAA 处于 250日均线下方 (价格 123.45 < SMA250 150.67)，右侧趋势未确认，否决 BUY',
      }],
      taResults: [makeTAResult('AAA')],
    });

    const trail = buildDecisionTrail(mission);
    expect(trail[0]).toBeDefined();
    expect(trail[1]).toBeDefined();
    if (!trail[0] || !trail[1]) return;
    expect(trail).toHaveLength(2);
    expect(trail[0].stage).toBe('consensus');
    expect(trail[1].stage).toBe('sma_veto');
    expect(trail[1].details?.price).toBe(123.45);
    expect(trail[1].details?.sma250).toBe(150.67);
  });

  it('keeps partial agreement as pass', () => {
    const mission = makeMission({
      consensus: [{
        ticker: 'AAA',
        openclawVerdict: 'BUY',
        taVerdict: 'HOLD',
        agreement: 'partial',
        openbbVerdict: 'PASS',
        vetoed: false,
      }],
      taResults: [makeTAResult('AAA')],
    });

    const [entry] = buildDecisionTrail(mission);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.verdict).toBe('pass');
    expect(entry.details?.agreement).toBe('partial');
  });

  it('enriches consensus details from TA data', () => {
    const mission = makeMission({
      consensus: [{
        ticker: 'AAA',
        openclawVerdict: 'BUY',
        taVerdict: 'BUY',
        agreement: 'agree',
        openbbVerdict: 'PASS',
        vetoed: false,
      }],
      taResults: [makeTAResult('AAA')],
    });

    const [entry] = buildDecisionTrail(mission);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.details?.bullArguments).toEqual(['bull a']);
    expect(entry.details?.pmReasoning).toBe('reason');
    expect(entry.details?.pmConfidence).toBe(0.9);
    expect(entry.details?.riskAggressiveView).toBe('agg');
    expect(entry.details?.riskConservativeView).toBe('cons');
    expect(entry.details?.riskNeutralView).toBe('neu');
  });

  it('handles missing TA results without crashing', () => {
    const mission = makeMission({
      taResults: undefined as any,
      consensus: [{
        ticker: 'AAA',
        openclawVerdict: 'BUY',
        taVerdict: 'BUY',
        agreement: 'agree',
        openbbVerdict: 'PASS',
        vetoed: false,
      }],
    });

    const [entry] = buildDecisionTrail(mission);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.details?.bullArguments).toBeUndefined();
    expect(entry.details?.pmReasoning).toBeUndefined();
  });

  it('returns empty trail for empty mission', () => {
    expect(buildDecisionTrail(makeMission())).toEqual([]);
  });

  it('keeps null openclaw verdict in details', () => {
    const mission = makeMission({
      consensus: [{
        ticker: 'AAA',
        openclawVerdict: null,
        taVerdict: 'BUY',
        agreement: 'partial',
        openbbVerdict: 'PASS',
        vetoed: false,
      }],
      taResults: [makeTAResult('AAA')],
    });

    const [entry] = buildDecisionTrail(mission);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.details?.openclawVerdict).toBeNull();
  });

  it('builds discovery rejection entries', () => {
    const mission = makeMission({
      consensus: [],
      taResults: [],
      ...( { discoveryRejections: [
        { symbol: 'AAPL', reason: 'mega_cap', marketCap: 3e12, thresholdMax: 50e9 },
      ] } as Partial<UnifiedMission> & { discoveryRejections: any[] } ),
    });

    const [entry] = buildDecisionTrail(mission);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.stage).toBe('discovery_filter');
    expect(entry.verdict).toBe('reject');
    expect(entry.details?.marketCap).toBe(3e12);
  });

  it('sorts discovery, consensus, and sma veto stages in order', () => {
    const mission = makeMission({
      consensus: [
        { ticker: 'BBB', openclawVerdict: 'BUY', taVerdict: 'BUY', agreement: 'agree', openbbVerdict: 'PASS', vetoed: false },
        { ticker: 'AAA', openclawVerdict: 'BUY', taVerdict: 'BUY', agreement: 'agree', openbbVerdict: 'PASS', vetoed: true, vetoReason: 'AAA 处于 250日均线下方 (价格 1 < SMA250 2)，右侧趋势未确认，否决 BUY' },
      ],
      taResults: [makeTAResult('AAA'), makeTAResult('BBB')],
      ...( { discoveryRejections: [
        { symbol: 'ZZZ', reason: 'mega_cap', marketCap: 3e12, thresholdMax: 50e9 },
      ] } as Partial<UnifiedMission> & { discoveryRejections: any[] } ),
    });

    const trail = buildDecisionTrail(mission);
    expect(trail[0]).toBeDefined();
    expect(trail[1]).toBeDefined();
    if (!trail[0] || !trail[1]) return;
    expect(trail.map(e => `${e.stage}:${e.ticker}`)).toEqual([
      'discovery_filter:ZZZ',
      'consensus:AAA',
      'consensus:BBB',
      'sma_veto:AAA',
    ]);
  });
});
