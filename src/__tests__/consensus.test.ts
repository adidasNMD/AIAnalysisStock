import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeConsensus, type UnifiedMission } from '../workflows';
import { checkSMACross } from '../tools/market-data';

vi.mock('../tools/market-data', () => ({
  checkSMACross: vi.fn(),
}));

const mockedCheckSMACross = vi.mocked(checkSMACross);

function makeMission(ticker: string, ocReport: string | null, taDecision: 'BUY' | 'SELL' | 'HOLD' | 'UNKNOWN', overrides?: Partial<UnifiedMission>): UnifiedMission {
  return {
    id: 'test',
    traceId: 'test',
    input: { mode: 'analyze', query: ticker, tickers: [ticker], depth: 'deep', source: 'test' },
    status: 'main_complete',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    openclawReport: ocReport,
    openclawTickers: [ticker],
    openclawDurationMs: 0,
    taResults: [
      {
        ticker,
        date: '2026-04-08',
        status: 'success',
        analystReports: { market: '', sentiment: '', news: '', fundamentals: '' },
        investmentDebate: {
          bullArguments: ['bullish catalyst and upside remain clear'],
          bearArguments: ['downside risk increases if guidance misses'],
          judgeDecision: '',
          rounds: 1,
        },
        traderPlan: '看多逻辑：做多建仓。风险：跌破关键位止损。',
        riskDebate: { aggressiveView: '', conservativeView: '', neutralView: '', rounds: 1 },
        portfolioManagerDecision: {
          action: taDecision,
          allocation: '10%',
          stopLoss: '-5%',
          confidence: 0.7,
          reasoning: 'risk and catalyst both present',
        },
        duration: 1,
        rawLogStates: {},
      },
    ],
    taDurationMs: 0,
    openbbData: [],
    macroData: null,
    consensus: [],
    totalDurationMs: 0,
    ...overrides,
  };
}

describe('computeConsensus', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SMA250_VETO_ENABLED;
  });

  it('blocks BUY when agree and price is below SMA250', async () => {
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'NVDA', period: 250, position: 'below', price: 95, sma: 120, crossedToday: false },
    ]);
    const mission = makeMission('NVDA', 'NVDA ✅ BUY 看多 catalyst upside', 'BUY');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.overallAction).toBe('HOLD');
    expect(result.sma250Vetoed).toBe(true);
    expect(result.confidence).toBe(10);
    expect(result.reasoning).toContain('250日均线下方');
    expect(result.reasoning).toContain('Bull:');
    expect(result.reasoning).toContain('Bear:');

    const tc = mission.consensus[0]!;
    expect(tc.agreement).toBe('blocked');
    expect(tc.vetoed).toBe(true);
    expect(tc.vetoReason).toContain('250日均线下方');
    expect(tc.bullCase).toBeTruthy();
    expect(tc.bearCase).toBeTruthy();
  });

  it('adds conflict vetoReason when OC and TA disagree', async () => {
    mockedCheckSMACross.mockResolvedValue([]);
    const mission = makeMission('TSLA', 'TSLA BUY strong momentum', 'SELL');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.overallAction).toBe('HOLD');
    expect(result.sma250Vetoed).toBe(false);
    expect(result.confidence).toBe(20);
    expect(result.entrySignalAligned).toBe(false);
    expect(result.reasoning).toContain('双大脑冲突');

    const tc = mission.consensus[0]!;
    expect(tc.agreement).toBe('disagree');
    expect(tc.vetoed).toBe(false);
    expect(tc.vetoReason).toContain('双大脑冲突');
  });

  it('treats negated BUY phrasing as SKIP', async () => {
    mockedCheckSMACross.mockResolvedValue([]);
    const mission = makeMission('AAPL', 'AAPL NOT recommend BUY at this level', 'HOLD');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.overallAction).toBe('HOLD');

    const tc = mission.consensus[0]!;
    expect(tc.openclawVerdict).toBe('SKIP');
    expect(tc.openclawVerdict).not.toBe('BUY');
  });

  it('falls back gracefully when checkSMACross throws', async () => {
    mockedCheckSMACross.mockRejectedValue(new Error('network down'));
    const mission = makeMission('META', 'META BUY on catalyst', 'BUY');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.overallAction).toBe('BUY');
    expect(result.sma250Vetoed).toBe(false);
    expect(result.confidence).toBe(85);
    expect(result.entrySignalAligned).toBe(true);

    const tc = mission.consensus[0]!;
    expect(tc.agreement).toBe('agree');
    expect(tc.vetoed).toBe(false);
  });

  it('disables veto when SMA250_VETO_ENABLED=false', async () => {
    process.env.SMA250_VETO_ENABLED = 'false';
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'AMZN', period: 250, position: 'below', price: 90, sma: 130, crossedToday: false },
    ]);
    const mission = makeMission('AMZN', 'AMZN BUY 做多', 'BUY');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.overallAction).toBe('BUY');
    expect(result.sma250Vetoed).toBe(false);
    expect(result.confidence).toBe(85);
    expect(result.entrySignalAligned).toBe(true);

    const tc = mission.consensus[0]!;
    expect(tc.agreement).toBe('agree');
    expect(tc.vetoed).toBe(false);
    expect(tc.vetoReason).toBeUndefined();
  });

  it('keeps agree when BUY is above SMA250', async () => {
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'MSFT', period: 250, position: 'above', price: 200, sma: 180, crossedToday: false },
    ]);
    const mission = makeMission('MSFT', 'MSFT BUY 建仓 bullish', 'BUY');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.overallAction).toBe('BUY');
    expect(result.sma250Vetoed).toBe(false);
    expect(result.confidence).toBe(85);
    expect(result.entrySignalAligned).toBe(true);
    expect(result.taSignal).toBe('BUY');
    expect(result.decisionTrail).toEqual([]);

    const tc = mission.consensus[0]!;
    expect(tc.agreement).toBe('agree');
    expect(tc.vetoed).toBe(false);
    expect(tc.vetoReason).toBeUndefined();
  });
});

describe('computeConsensus with structuredVerdicts', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SMA250_VETO_ENABLED;
  });

  it('BUY+BUY parity via structured verdict', async () => {
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'AAOI', period: 250, position: 'above', price: 100, sma: 90, crossedToday: false },
    ]);
    const mission = makeMission('AAOI', null, 'BUY', {
      structuredVerdicts: {
        AAOI: { ticker: 'AAOI', verdict: 'BUY', bullCase: 'strong demand', bearCase: 'competition' },
      },
    });

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.agreement).toBe('agree');
    expect(result.openclawVerdict).toBe('BUY');
    expect(result.overallAction).toBe('BUY');
    expect(result.confidence).toBe(85);

    const tc = mission.consensus[0]!;
    expect(tc.agreement).toBe('agree');
    expect(tc.openclawVerdict).toBe('BUY');
    expect(tc.bullCase).toBe('strong demand');
    expect(tc.bearCase).toBe('competition');
  });

  it('BUY+SELL disagreement via structured verdict', async () => {
    mockedCheckSMACross.mockResolvedValue([]);
    const mission = makeMission('AAOI', null, 'SELL', {
      structuredVerdicts: {
        AAOI: { ticker: 'AAOI', verdict: 'BUY', bullCase: 'bullish', bearCase: 'risky' },
      },
    });

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.agreement).toBe('disagree');
    expect(result.overallAction).toBe('HOLD');
    expect(result.confidence).toBe(20);
  });

  it('legacy fallback when structuredVerdicts absent', async () => {
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'AAOI', period: 250, position: 'above', price: 100, sma: 90, crossedToday: false },
    ]);
    const mission = makeMission('AAOI', 'AAOI BUY 建仓', 'BUY');

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.agreement).toBe('agree');
    expect(result.openclawVerdict).toBe('BUY');
    expect(result.overallAction).toBe('BUY');
  });

  it('legacy fallback when structured verdict ticker missing', async () => {
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'AAOI', period: 250, position: 'above', price: 100, sma: 90, crossedToday: false },
    ]);
    const mission = makeMission('AAOI', 'AAOI BUY 建仓', 'BUY', {
      structuredVerdicts: {
        OTHER: { ticker: 'OTHER', verdict: 'SELL', bullCase: 'n/a', bearCase: 'n/a' },
      },
    });

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.agreement).toBe('agree');
    expect(result.openclawVerdict).toBe('BUY');
    expect(result.overallAction).toBe('BUY');
  });

  it('structured verdict HOLD yields partial agreement with BUY from TA', async () => {
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'AAOI', period: 250, position: 'above', price: 100, sma: 90, crossedToday: false },
    ]);
    const mission = makeMission('AAOI', null, 'BUY', {
      structuredVerdicts: {
        AAOI: { ticker: 'AAOI', verdict: 'HOLD', bullCase: 'some upside', bearCase: 'limited risk' },
      },
    });

    const [result] = await computeConsensus(mission);
    expect(result).toBeDefined();
    if (!result) throw new Error('Expected consensus result');

    expect(result.agreement).toBe('partial');
    expect(result.openclawVerdict).toBe('HOLD');
    expect(result.overallAction).toBe('HOLD');
    expect(result.confidence).toBe(55);
  });
});
