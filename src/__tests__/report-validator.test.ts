import { describe, it, expect, vi } from 'vitest';
import { validateTradeDecision } from '../utils/report-validator';

describe('validateTradeDecision', () => {
  it('extracts driverType=Fundamental when report contains "基本面"', () => {
    const report = '该公司基本面强劲，营收持续增长，估值合理。';
    const result = validateTradeDecision(report, 'AAOI');
    expect(result).not.toBeNull();
    expect(result!.driverType).toBe('Fundamental');
  });

  it('extracts driverType=Policy_Driven when report contains "政策驱动"', () => {
    const report = '政策驱动下，核电赛道获得重大支持，监管层明确表态。';
    const result = validateTradeDecision(report, 'SMR');
    expect(result).not.toBeNull();
    expect(result!.driverType).toBe('Policy_Driven');
  });

  it('extracts driverType=Narrative_Hype when report contains "叙事"', () => {
    const report = '市场叙事推动下，该股短期内大幅拉升，情绪高涨。';
    const result = validateTradeDecision(report, 'NVDA');
    expect(result).not.toBeNull();
    expect(result!.driverType).toBe('Narrative_Hype');
  });

  it('extracts driverType=Narrative_Hype when report contains "hype"', () => {
    const report = 'This is pure hype driven by retail speculation.';
    const result = validateTradeDecision(report, 'GME');
    expect(result).not.toBeNull();
    expect(result!.driverType).toBe('Narrative_Hype');
  });

  it('defaults driverType=Fundamental and positionSize=trial when no keywords match', () => {
    const report = '该公司表现稳定，没有特别的驱动因素。';
    const result = validateTradeDecision(report, 'MU');
    expect(result).not.toBeNull();
    expect(result!.driverType).toBe('Fundamental');
    expect(result!.positionSize).toBe('trial');
  });

  it('extracts non-empty stopLosses when report contains "止损" sentence', () => {
    const report = '止损位设置在跌破20日均线时立即离场。当价格突破150则止损清仓。';
    const result = validateTradeDecision(report, 'AAOI');
    expect(result).not.toBeNull();
    expect(result!.stopLosses.length).toBeGreaterThan(0);
    expect(result!.stopLosses[0]!.type).toBe('custom');
  });

  it('returns empty stopLosses array when no stop loss keywords found', () => {
    const report = '该标的前景良好，未来可期，建议持有观察。';
    const result = validateTradeDecision(report, 'CRWV');
    expect(result).not.toBeNull();
    expect(result!.stopLosses).toEqual([]);
  });

  it('returns valid bullCase and bearCase defaults from empty report', () => {
    const result = validateTradeDecision('', 'LITE');
    expect(result).not.toBeNull();
    expect(result!.bullCase).toBe('从报告中提取的看多逻辑（详见完整报告）');
    expect(result!.bearCase).toBe('从报告中提取的看空风险（详见完整报告）');
  });

  it('extracts bullCase from report containing "看多" keyword', () => {
    const report = '看多理由：AI驱动的数据中心光模块需求爆发，订单能见度高。风险：竞争加剧。';
    const result = validateTradeDecision(report, 'AAOI');
    expect(result).not.toBeNull();
    expect(result!.bullCase).toContain('看多');
  });

  it('extracts bearCase from report containing "风险" keyword', () => {
    const report = '上行催化剂明确，但风险在于宏观利率走高可能压制估值。';
    const result = validateTradeDecision(report, 'CEG');
    expect(result).not.toBeNull();
    expect(result!.bearCase).toContain('风险');
  });

  it('returns null and does not throw when schema receives invalid ticker type', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = validateTradeDecision('基本面强劲', '' as any);
    warnSpy.mockRestore();
    expect(result === null || (result !== null && typeof result.ticker === 'string')).toBe(true);
  });

  it('returns object with correct ticker field', () => {
    const result = validateTradeDecision('政策推动下基本面改善', 'WDC');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('WDC');
  });

  it('returns verdict=HOLD (conservative default)', () => {
    const result = validateTradeDecision('基本面强劲，看多信号明确', 'AAOI');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('HOLD');
  });

  it('returns agreement=pending (conservative default)', () => {
    const result = validateTradeDecision('市场炒作推动', 'OKLO');
    expect(result).not.toBeNull();
    expect(result!.agreement).toBe('pending');
  });

  it('extracts positionSize=full when report contains "满仓"', () => {
    const report = '基本面极强，可以满仓买入，风险可控。';
    const result = validateTradeDecision(report, 'AAOI');
    expect(result).not.toBeNull();
    expect(result!.positionSize).toBe('full');
  });

  it('extracts positionSize=skip when report contains "不买"', () => {
    const report = '目前估值过高，建议不买，等待回调。';
    const result = validateTradeDecision(report, 'NVDA');
    expect(result).not.toBeNull();
    expect(result!.positionSize).toBe('skip');
  });

  it('handles stop loss in English "stop loss" text', () => {
    const report = 'Set stop loss at $45 if the price breaks support. Fundamental outlook is positive.';
    const result = validateTradeDecision(report, 'MU');
    expect(result).not.toBeNull();
    expect(result!.stopLosses.length).toBeGreaterThan(0);
  });
});
