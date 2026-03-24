import YahooFinance from 'yahoo-finance2';
import { RawSignal } from '../models/types';

// ==========================================
// 板块 ETF 扫描工具
// 基于 yahoo-finance2（免费）
// ==========================================

const yahooFinance = new YahooFinance();

// 核心板块 ETF 列表
export const SECTOR_ETFS = [
  { symbol: 'SMH', name: '半导体', sector: 'semiconductor' },
  { symbol: 'XLK', name: '科技', sector: 'technology' },
  { symbol: 'XLE', name: '能源', sector: 'energy' },
  { symbol: 'XLF', name: '金融', sector: 'financials' },
  { symbol: 'XLV', name: '医疗', sector: 'healthcare' },
  { symbol: 'IBB', name: '生物医药', sector: 'biotech' },
  { symbol: 'URA', name: '铀/核电', sector: 'nuclear' },
  { symbol: 'TAN', name: '太阳能', sector: 'solar' },
  { symbol: 'LIT', name: '锂电池', sector: 'lithium' },
  { symbol: 'BOTZ', name: '机器人/AI', sector: 'robotics_ai' },
  { symbol: 'SOXX', name: '半导体指数', sector: 'semiconductor_index' },
  { symbol: 'ARKK', name: '创新科技', sector: 'innovation' },
  { symbol: 'XLC', name: '通讯服务', sector: 'communication' },
  { symbol: 'HACK', name: '网络安全', sector: 'cybersecurity' },
  { symbol: 'SKYY', name: '云计算', sector: 'cloud' },
];

export interface SectorSignal {
  etfSymbol: string;
  sectorName: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeSurgeRatio: number;
  isBreakingOut: boolean;
  strength: 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear';
}

export interface SectorRotationSignal {
  strongestSectors: SectorSignal[];
  weakestSectors: SectorSignal[];
  rotationInsight: string;
  timestamp: number;
}

/**
 * 扫描单个板块 ETF
 */
export async function scanSectorETF(etfConfig: { symbol: string; name: string; sector: string }): Promise<SectorSignal | null> {
  try {
    const quote: any = await yahooFinance.quote(etfConfig.symbol);
    if (!quote || !quote.regularMarketPrice) return null;

    const price = quote.regularMarketPrice;
    const changePercent = quote.regularMarketChangePercent || 0;
    const volume = quote.regularMarketVolume || 0;
    const avgVolume = quote.averageDailyVolume10Day || quote.averageDailyVolume3Month || 1;
    const volumeSurgeRatio = avgVolume > 0 ? volume / avgVolume : 0;

    // 判断强度
    let strength: SectorSignal['strength'] = 'neutral';
    if (changePercent > 3) strength = 'strong_bull';
    else if (changePercent > 1) strength = 'bull';
    else if (changePercent < -3) strength = 'strong_bear';
    else if (changePercent < -1) strength = 'bear';

    return {
      etfSymbol: etfConfig.symbol,
      sectorName: etfConfig.name,
      sector: etfConfig.sector,
      price,
      changePercent,
      volume,
      avgVolume,
      volumeSurgeRatio,
      isBreakingOut: changePercent > 2 && volumeSurgeRatio > 1.5,
      strength,
    };
  } catch (e: any) {
    console.error(`[SectorScanner] Failed to scan ${etfConfig.symbol}: ${e.message}`);
    return null;
  }
}

/**
 * 扫描所有板块 ETF
 */
export async function scanAllSectorETFs(etfs: typeof SECTOR_ETFS = SECTOR_ETFS): Promise<SectorSignal[]> {
  console.log(`[SectorScanner] 📊 扫描 ${etfs.length} 个板块 ETF...`);

  const results: SectorSignal[] = [];

  // 并发扫描所有 ETF
  const promises = etfs.map(etf => scanSectorETF(etf));
  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  }

  // 按涨幅排序
  results.sort((a, b) => b.changePercent - a.changePercent);

  console.log(`[SectorScanner] ✅ 扫描完成，${results.length} 个板块`);
  if (results.length > 0) {
    const top = results[0]!;
    const bottom = results[results.length - 1]!;
    console.log(`  🟢 最强: ${top.sectorName} (${top.etfSymbol}) ${top.changePercent > 0 ? '+' : ''}${top.changePercent.toFixed(2)}%`);
    console.log(`  🔴 最弱: ${bottom.sectorName} (${bottom.etfSymbol}) ${bottom.changePercent > 0 ? '+' : ''}${bottom.changePercent.toFixed(2)}%`);
  }

  return results;
}

/**
 * 检测板块轮动信号
 */
export async function detectSectorRotation(): Promise<SectorRotationSignal> {
  const signals = await scanAllSectorETFs();

  const strongestSectors = signals.filter(s => s.strength === 'strong_bull' || (s.strength === 'bull' && s.volumeSurgeRatio > 1.3));
  const weakestSectors = signals.filter(s => s.strength === 'strong_bear' || (s.strength === 'bear' && s.volumeSurgeRatio > 1.3));

  // 生成板块轮动洞察
  let rotationInsight = '';
  if (strongestSectors.length > 0) {
    rotationInsight += `资金流入板块: ${strongestSectors.map(s => `${s.sectorName}(${s.etfSymbol} ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(1)}%)`).join(', ')}。`;
  }
  if (weakestSectors.length > 0) {
    rotationInsight += ` 资金流出板块: ${weakestSectors.map(s => `${s.sectorName}(${s.etfSymbol} ${s.changePercent.toFixed(1)}%)`).join(', ')}。`;
  }
  if (strongestSectors.length === 0 && weakestSectors.length === 0) {
    rotationInsight = '当前无明显板块轮动信号，大盘偏向震荡。';
  }

  return {
    strongestSectors,
    weakestSectors,
    rotationInsight,
    timestamp: Date.now(),
  };
}

/**
 * 将板块信号转换为 RawSignal 格式（供 TrendRadar 使用）
 */
export function sectorSignalsToRawSignals(signals: SectorSignal[]): RawSignal[] {
  return signals
    .filter(s => s.strength !== 'neutral') // 只保留有明显方向的
    .map(s => ({
      id: `sector_${s.etfSymbol}_${Date.now()}`,
      sourceType: 'sector_etf' as const,
      content: `[板块异动] ${s.sectorName} ETF (${s.etfSymbol}): ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}%, 量比 ${s.volumeSurgeRatio.toFixed(1)}x${s.isBreakingOut ? ' 🔥突破' : ''}`,
      timestamp: Date.now(),
      author: 'SectorScanner',
      url: `https://finance.yahoo.com/quote/${s.etfSymbol}`,
      metadata: {
        etfSymbol: s.etfSymbol,
        sector: s.sector,
        changePercent: s.changePercent,
        volumeSurgeRatio: s.volumeSurgeRatio,
        strength: s.strength,
        isBreakingOut: s.isBreakingOut,
      },
    }));
}

/**
 * 生成板块概览文本（供 Telegram / Agent 使用）
 */
export function generateSectorOverview(signals: SectorSignal[]): string {
  if (signals.length === 0) return '[SectorScanner] 无板块数据';

  let overview = '📊 *板块 ETF 概览*\n\n';

  for (const signal of signals) {
    const icon = signal.strength === 'strong_bull' ? '🟢🟢' :
      signal.strength === 'bull' ? '🟢' :
      signal.strength === 'strong_bear' ? '🔴🔴' :
      signal.strength === 'bear' ? '🔴' : '⚪';

    const breakout = signal.isBreakingOut ? ' 🔥' : '';

    overview += `${icon} ${signal.sectorName} (${signal.etfSymbol}): ${signal.changePercent > 0 ? '+' : ''}${signal.changePercent.toFixed(2)}% | 量比 ${signal.volumeSurgeRatio.toFixed(1)}x${breakout}\n`;
  }

  return overview;
}
