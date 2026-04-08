import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/telegram', () => ({
  sendStopLossAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/narrative-store', () => ({
  loadNarratives: vi.fn(),
  updateNarrative: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../tools/market-data', () => ({
  checkSMACross: vi.fn(),
}));

import { sendStopLossAlert } from '../utils/telegram';
import { triggerConsensusAlerts, type TickerConsensus } from '../workflows/mission-dispatcher';
import { NarrativeLifecycleEngine } from '../agents/lifecycle/engine';
import { loadNarratives, updateNarrative } from '../utils/narrative-store';
import { checkSMACross } from '../tools/market-data';

const mockedSendStopLossAlert = vi.mocked(sendStopLossAlert);
const mockedLoadNarratives = vi.mocked(loadNarratives);
const mockedCheckSMACross = vi.mocked(checkSMACross);

function makeConsensus(overrides: Partial<TickerConsensus>): TickerConsensus {
  return {
    ticker: 'NVDA',
    openclawVerdict: 'BUY',
    taVerdict: 'BUY',
    agreement: 'agree',
    openbbVerdict: 'PASS',
    vetoed: false,
    ...overrides,
  };
}

describe('triggerConsensusAlerts — disagree scenario', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTO_ALERT_ENABLED;
  });

  it('calls sendStopLossAlert once for disagree with 双大脑冲突 and reasoning chain', async () => {
    const consensus = [
      makeConsensus({
        ticker: 'TSLA',
        openclawVerdict: 'BUY',
        taVerdict: 'SELL',
        agreement: 'disagree',
        vetoed: false,
        bullCase: 'strong momentum and catalyst',
        bearCase: 'downside risk if guidance misses',
        vetoReason: '双大脑冲突: OpenClaw=BUY vs TradingAgents=SELL，强制 HOLD',
      }),
    ];

    await triggerConsensusAlerts(consensus);

    expect(mockedSendStopLossAlert).toHaveBeenCalledTimes(1);
    const [ticker, details] = mockedSendStopLossAlert.mock.calls[0]!;
    expect(ticker).toBe('TSLA');
    expect(details).toContain('双大脑冲突');
    expect(details).toContain('看多理由');
    expect(details).toContain('看空理由');
  });
});

describe('triggerConsensusAlerts — veto scenario', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTO_ALERT_ENABLED;
  });

  it('calls sendStopLossAlert once for vetoed=true with SMA250 否决', async () => {
    const consensus = [
      makeConsensus({
        ticker: 'AMZN',
        openclawVerdict: 'BUY',
        taVerdict: 'BUY',
        agreement: 'blocked',
        vetoed: true,
        vetoReason: 'AMZN 处于 250日均线下方 (价格 90 < SMA250 130)，右侧趋势未确认，否决 BUY',
      }),
    ];

    await triggerConsensusAlerts(consensus);

    expect(mockedSendStopLossAlert).toHaveBeenCalledTimes(1);
    const [ticker, details] = mockedSendStopLossAlert.mock.calls[0]!;
    expect(ticker).toBe('AMZN');
    expect(details).toContain('SMA250 否决');
  });
});

describe('triggerConsensusAlerts — agree/no-alert scenario', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTO_ALERT_ENABLED;
  });

  it('does NOT call sendStopLossAlert when agreement=agree and vetoed=false', async () => {
    const consensus = [
      makeConsensus({
        ticker: 'MSFT',
        agreement: 'agree',
        vetoed: false,
      }),
    ];

    await triggerConsensusAlerts(consensus);

    expect(mockedSendStopLossAlert).not.toHaveBeenCalled();
  });
});

describe('triggerConsensusAlerts — env disable scenario', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTO_ALERT_ENABLED;
  });

  it('does NOT call sendStopLossAlert when AUTO_ALERT_ENABLED=false even for disagree+vetoed', async () => {
    process.env.AUTO_ALERT_ENABLED = 'false';

    const consensus = [
      makeConsensus({
        ticker: 'META',
        openclawVerdict: 'BUY',
        taVerdict: 'SELL',
        agreement: 'disagree',
        vetoed: true,
        vetoReason: 'both disagree and vetoed',
      }),
    ];

    await triggerConsensusAlerts(consensus);

    expect(mockedSendStopLossAlert).not.toHaveBeenCalled();
  });
});

describe('NarrativeLifecycleEngine — lifecycle downgrade alert', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls sendStopLossAlert with 叙事阶段降级 when stage transitions to narrativeFatigue', async () => {
    mockedLoadNarratives.mockResolvedValue([
      {
        id: 'narr-1',
        title: 'AI光互联叙事',
        description: 'test',
        impactScore: 80,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        analysisText: '',
        debateText: '',
        coreTicker: 'AAOI',
        eventHistory: [],
        stage: 'mainExpansion',
        status: 'active',
      } as any,
    ]);
    mockedCheckSMACross.mockResolvedValue([
      { symbol: 'AAOI', period: 20, position: 'below', price: 10, sma: 15, crossedToday: true },
    ]);

    const engine = new NarrativeLifecycleEngine();
    await engine.evaluateAllActiveNarratives();

    expect(mockedSendStopLossAlert).toHaveBeenCalledTimes(1);
    const [ticker, details] = mockedSendStopLossAlert.mock.calls[0]!;
    expect(ticker).toBe('AAOI');
    expect(details).toContain('叙事阶段降级');
    expect(details).toContain('narrativeFatigue');
  });
});
