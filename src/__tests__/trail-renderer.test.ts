import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderTrailMarkdown, saveTrailReport } from '../utils/trail-renderer';
import type { DecisionTrailEntry } from '../workflows';

const { mkdirSync, writeFileSync } = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  mkdirSync,
  writeFileSync,
  default: { mkdirSync, writeFileSync },
}));

describe('trail-renderer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders mixed entries with funnel header and verdict markers', () => {
    const trail: DecisionTrailEntry[] = [
      { ticker: 'AAPL', stage: 'consensus', verdict: 'pass', reason: '共识通过', details: { openclawVerdict: 'BUY', taVerdict: 'BUY', agreement: 'agree', openbbVerdict: 'PASS' } },
      { ticker: 'MSFT', stage: 'sma_veto', verdict: 'reject', reason: '跌破均线', details: { price: 100, sma250: 120, position: 'below' } },
    ];

    const md = renderTrailMarkdown(trail, 'mission-1');
    expect(md).toContain('# 🔍 决策漏斗');
    expect(md).toContain('AAPL');
    expect(md).toContain('MSFT');
    expect(md).toContain('✅ 通过');
    expect(md).toContain('❌ 筛除');
  });

  it('renders full TA consensus details', () => {
    const trail: DecisionTrailEntry[] = [
      {
        ticker: 'NVDA',
        stage: 'consensus',
        verdict: 'pass',
        reason: 'TA 与 OpenClaw 同向',
        details: {
          openclawVerdict: 'BUY',
          taVerdict: 'BUY',
          agreement: 'agree',
          openbbVerdict: 'PASS',
          bullArguments: ['增长强劲', '订单充足'],
          bearArguments: ['估值偏高'],
          pmAction: 'buy',
          pmReasoning: '趋势和基本面同步',
          pmConfidence: 0.87,
          riskAggressiveView: '可以追击',
          riskConservativeView: '等待回踩',
          riskNeutralView: '保持观察',
          bullCase: '产业趋势明确',
          bearCase: '短期波动较大',
        },
      },
    ];

    const md = renderTrailMarkdown(trail, 'mission-2');
    expect(md).toContain('看多论据');
    expect(md).toContain('看空论据');
    expect(md).toContain('基金经理裁决');
    expect(md).toContain('趋势和基本面同步');
  });

  it('renders SMA veto details with price and SMA250', () => {
    const trail: DecisionTrailEntry[] = [
      {
        ticker: 'TSLA',
        stage: 'sma_veto',
        verdict: 'reject',
        reason: '价格低于SMA250',
        details: { price: 210.25, sma250: 225.5, position: 'below' },
      },
    ];

    const md = renderTrailMarkdown(trail, 'mission-3');
    expect(md).toContain('SMA250');
    expect(md).toContain('210.25');
    expect(md).toContain('225.5');
  });

  it('renders discovery filter details with market cap info', () => {
    const trail: DecisionTrailEntry[] = [
      {
        ticker: 'SMR',
        stage: 'discovery_filter',
        verdict: 'pass',
        reason: '满足市值条件',
        details: { marketCap: 1500000000, thresholdMin: 200000000, thresholdMax: 5000000000 },
      },
    ];

    const md = renderTrailMarkdown(trail, 'mission-4');
    expect(md).toContain('发现阶段筛选');
    expect(md).toContain('$1.50B');
    expect(md).toContain('200000000');
    expect(md).toContain('5000000000');
  });

  it('renders empty trail message', () => {
    const md = renderTrailMarkdown([], 'mission-5');
    expect(md).toContain('无决策记录');
  });

  it('saves trail report to dated directory', () => {
    mkdirSync.mockImplementation(() => undefined as any);
    writeFileSync.mockImplementation(() => undefined);

    const trail: DecisionTrailEntry[] = [
      { ticker: 'AAPL', stage: 'consensus', verdict: 'pass', reason: 'ok' },
    ];

    const filePath = saveTrailReport(trail, 'mission-6');
    expect(filePath).toMatch(/out\/trails\/[^/]+\/mission-6-trail\.md$/);
    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/out[\\/]trails[\\/].+mission-6-trail\.md$/), expect.any(String), 'utf-8');
  });
});
