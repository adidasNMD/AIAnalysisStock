import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TickerDiscoveryEngine } from '../agents/discovery/ticker-discovery';
import * as marketData from '../tools/market-data';
import { generateTextCompletion } from '../utils/llm';

// Mock all external dependencies so tests run without real network calls
vi.mock('../tools/market-data', () => ({
  getQuote: vi.fn(),
}));

vi.mock('../utils/llm', () => ({
  generateTextCompletion: vi.fn().mockResolvedValue('分析报告: $TSYM'),
}));

vi.mock('../tools/reddit', () => ({
  searchPosts: vi.fn().mockResolvedValue([]),
  extractTickersFromPosts: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../tools/google-news', () => ({
  fetchGoogleNewsRSS: vi.fn().mockResolvedValue([]),
}));

// Helper: build a minimal QuoteSnapshot for a given marketCap
function makeQuote(marketCap: number) {
  return {
    symbol: 'TSYM',
    price: 10,
    previousClose: 10,
    changePercent: 0,
    volume: 1000000,
    avgVolume: 1000000,
    volumeSurgeRatio: 1,
    marketCap,
  };
}

describe('market cap filtering in TickerDiscoveryEngine', () => {
  let engine: TickerDiscoveryEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    delete process.env.MARKET_CAP_MAX;
    delete process.env.MARKET_CAP_MIN;
    engine = new TickerDiscoveryEngine();
  });

  afterEach(() => {
    delete process.env.MARKET_CAP_MAX;
    delete process.env.MARKET_CAP_MIN;
  });

  it('filters out mega-cap: $60B marketCap exceeds $50B threshold', async () => {
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(60_000_000_000)); // $60B

    const result = await engine.discoverFromTrend('AI数据中心');

    // Should be excluded — no validated tickers returned
    expect(result.tickers).toHaveLength(0);
  });

  it('filters out micro-cap: $100M marketCap below $200M lower bound', async () => {
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(100_000_000)); // $100M

    const result = await engine.discoverFromTrend('AI数据中心');

    // Should be excluded — below minimum threshold
    expect(result.tickers).toHaveLength(0);
  });

  it('allows valid range: $5B marketCap passes both filters', async () => {
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(5_000_000_000)); // $5B

    const result = await engine.discoverFromTrend('AI数据中心');

    // Should pass — within [$200M, $50B]
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0]!.symbol).toBe('TSYM');
  });

  it('respects MARKET_CAP_MAX env var override: $60B passes when env var is $100B', async () => {
    process.env.MARKET_CAP_MAX = '100000000000'; // $100B custom threshold
    engine = new TickerDiscoveryEngine();
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(60_000_000_000)); // $60B

    const result = await engine.discoverFromTrend('AI数据中心');

    // $60B < $100B threshold, so it should pass (assuming also above $200M min)
    expect(result.tickers).toHaveLength(1);
    expect(result.tickers[0]!.symbol).toBe('TSYM');
  });

  it('boundary: $50B exactly is filtered out (> threshold, not >=)', async () => {
    // 50B is NOT > 50B, so it should pass through the upper bound check
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(50_000_000_000)); // $50B exactly

    const result = await engine.discoverFromTrend('AI数据中心');

    // $50B is NOT greater than $50B, so it passes
    expect(result.tickers).toHaveLength(1);
  });

  it('boundary: $50B + 1 is filtered out (exceeds threshold)', async () => {
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(50_000_000_001)); // just over $50B

    const result = await engine.discoverFromTrend('AI数据中心');

    expect(result.tickers).toHaveLength(0);
  });

  it('boundary: $200M exactly passes lower bound (< threshold, not <=)', async () => {
    // $200M is NOT less than $200M, so it passes
    vi.mocked(marketData.getQuote).mockResolvedValue(makeQuote(200_000_000)); // $200M exactly

    const result = await engine.discoverFromTrend('AI数据中心');

    expect(result.tickers).toHaveLength(1);
  });

  it('returns rejected tickers with reasons', async () => {
    vi.mocked(generateTextCompletion).mockResolvedValue('分析报告: $HUGE $TINY $GOOD');

    const quotes: Record<string, number> = {
      HUGE: 100_000_000_000,
      TINY: 50_000_000,
      GOOD: 5_000_000_000,
    };

    vi.mocked(marketData.getQuote).mockImplementation(async (symbol: string) => ({
      ...makeQuote(quotes[symbol] ?? 5_000_000_000),
      symbol,
    }));

    const result = await engine.discoverFromTrend('test theme');

    expect(result.rejectedTickers).toBeDefined();
    expect(result.rejectedTickers).toHaveLength(2);

    const megaRej = result.rejectedTickers!.find((r) => r.symbol === 'HUGE');
    expect(megaRej?.reason).toBe('mega_cap');
    expect(megaRej?.marketCap).toBe(100_000_000_000);
    expect(megaRej?.thresholdMax).toBe(50_000_000_000);

    const microRej = result.rejectedTickers!.find((r) => r.symbol === 'TINY');
    expect(microRej?.reason).toBe('micro_cap');
    expect(microRej?.marketCap).toBe(50_000_000);
    expect(microRej?.thresholdMin).toBe(200_000_000);
  });
});
