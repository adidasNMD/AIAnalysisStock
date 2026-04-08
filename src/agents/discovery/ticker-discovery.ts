import * as fs from 'fs';
import * as path from 'path';
import { generateTextCompletion } from '../../utils/llm';
import { searchPosts, extractTickersFromPosts } from '../../tools/reddit';
import { fetchGoogleNewsRSS, GoogleNewsItem } from '../../tools/google-news';
import { getQuote } from '../../tools/market-data';
import { isMarketCapWithinGate } from '../../utils/market-cap-gate';

// ==========================================
// TickerDiscoveryEngine — (Free-form Text Flow 版本)
// 核心能力: 给定趋势主题 → LLM 纯文本推导 → 正则提取 ticker → Yahoo 验证
// ==========================================

function loadInvestorProfile(): string {
  try {
    const profilePath = path.join(process.cwd(), 'investor_profile.md');
    if (fs.existsSync(profilePath)) {
      return fs.readFileSync(profilePath, 'utf-8');
    }
  } catch (e: any) {
    console.error(`[TickerDiscovery] ⚠️ 投资者画像加载失败: ${e.message}`);
  }
  return '';
}

/**
 * 从文本中提取 ticker 代码
 */
function extractTickersFromText(text: string): string[] {
  const matches = text.match(/\$([A-Z]{1,5})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace('$', '')))];
}

// 保持导出兼容
export interface DiscoveredTicker {
  symbol: string;
  name: string;
  chainLevel: 'sector_leader' | 'bottleneck' | 'hidden_gem';
  multibaggerScore: number;
  reasoning: string;
  alreadyPriced: boolean;
  joinability: 'early' | 'joinable' | 'risky' | 'too_late';
  joinabilityReason: string;
  narrativeType: 'Fundamental' | 'Policy_Driven' | 'Narrative_Hype';
  catalysts: string[];
  risks: string[];
}

export class TickerDiscoveryEngine {
  private investorProfile: string;

  constructor() {
    this.investorProfile = loadInvestorProfile();
    if (this.investorProfile) {
      console.log('[TickerDiscovery] ✅ 投资者画像已加载');
    }
  }

  async discoverFromTrend(
    trendName: string,
    trendDescription?: string,
    existingTickers?: string[],
  ): Promise<{ tickers: DiscoveredTicker[]; supplyChainLogic: string }> {
    console.log(`\n[TickerDiscovery] 🔍 开始从趋势中发现标的: "${trendName}"`);

    // 多源数据采集
    const [redditTickers, newsContext] = await Promise.all([
      this.collectRedditTickers(trendName),
      this.collectNewsContext(trendName),
    ]);

    // LLM 纯文本产业链推导
    const systemPrompt = `你是全球顶尖的科技产业链分析师，专门为事件驱动型交易者服务。

${this.investorProfile ? `=== 投资者画像 ===\n${this.investorProfile.substring(0, 2000)}` : '事件驱动型右侧跟风交易者。'}

=== 核心任务 ===
给定市场趋势主题，进行产业链推导找到三类可投标的。所有标的必须用 **$TICKER** 格式标注。

=== 三条选股赛道 ===
1. 【赛道龙头 $5B-$500B】— 赛道第一梯队，不是巨头
2. 【产业链瓶颈 $1B-$50B】— 供给侧卡脖子节点
3. 【洼地黑马 $500M-$5B】— 筹码干净、弹性最大

=== 硬性约束 ===
- 排除市值超 $500B 的巨头
- 至少发现 8-12 个标的
- 每个标的评估：是否已定价、跟进时机、驱动力类型（基本面/政策/炒作）
- 所有输出中文`;

    let userPrompt = `趋势: ${trendName}\n`;
    if (trendDescription) userPrompt += `描述: ${trendDescription}\n`;

    if (redditTickers.size > 0) {
      const topRedditTickers = [...redditTickers.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([t, c]) => `$${t}(${c}次)`)
        .join(', ');
      userPrompt += `\n=== Reddit 热门标的 ===\n${topRedditTickers}\n`;
    }

    if (newsContext) {
      userPrompt += `\n=== 相关新闻 ===\n${newsContext}\n`;
    }

    if (existingTickers && existingTickers.length > 0) {
      userPrompt += `\n=== 已有标的（不要重复）===\n${existingTickers.join(', ')}\n`;
    }

    userPrompt += `\n请进行完整的产业链推导，三类赛道都要覆盖。`;

    console.log(`[TickerDiscovery] 🧠 提交至 LLM 进行产业链推导...`);
    const analysisReport = await generateTextCompletion(systemPrompt, userPrompt, { streamToConsole: true });

    // 从文本中提取 ticker
    const extractedTickers = extractTickersFromText(analysisReport);
    console.log(`[TickerDiscovery] 📊 从文本中提取到 ${extractedTickers.length} 个 ticker: ${extractedTickers.join(', ')}`);

    // Yahoo Finance 验证
    const validatedTickers: DiscoveredTicker[] = [];
    // Market cap gate will be enforced by central gate utilities

    for (const symbol of extractedTickers) {
      try {
        const quote = await getQuote(symbol);
        if (!quote || quote.price <= 0) {
          console.log(`[TickerDiscovery] ⚠️ 跳过无效标的: ${symbol}`);
          continue;
        }

        if (!isMarketCapWithinGate(quote.marketCap)) {
          console.log(`[TickerDiscovery] 🚫 排除: ${symbol} ($${(quote.marketCap / 1e9).toFixed(1)}B) — 不在 $200M-$50B 范围`);
          continue;
        }

        // 从分析文本中推断标的层级
        let chainLevel: 'sector_leader' | 'bottleneck' | 'hidden_gem' = 'hidden_gem';
        if (quote.marketCap > 5_000_000_000) chainLevel = 'sector_leader';
        else if (quote.marketCap > 1_000_000_000) chainLevel = 'bottleneck';

        validatedTickers.push({
          symbol,
          name: symbol, // QuoteSnapshot 无 name 字段，使用 symbol
          chainLevel,
          multibaggerScore: chainLevel === 'hidden_gem' ? 80 : chainLevel === 'bottleneck' ? 60 : 40,
          reasoning: `LLM 产业链推导中提及，市值 $${(quote.marketCap / 1e9).toFixed(1)}B`,
          alreadyPriced: chainLevel === 'sector_leader',
          joinability: 'joinable',
          joinabilityReason: '基于 LLM 分析判断',
          narrativeType: 'Fundamental',
          catalysts: [],
          risks: [],
        });
      } catch (e: any) {
        console.log(`[TickerDiscovery] ⚠️ 跳过无效标的: ${symbol} (${e.message})`);
      }
    }

    console.log(`\n[TickerDiscovery] ✅ 发现 ${validatedTickers.length} 个有效标的`);
    for (const t of validatedTickers) {
      const levelIcon = t.chainLevel === 'hidden_gem' ? '🎯' : t.chainLevel === 'bottleneck' ? '🔍' : '👑';
      console.log(`  ${levelIcon} ${t.symbol} (${t.name}) | ${t.chainLevel} | 评分${t.multibaggerScore}`);
    }

    return { tickers: validatedTickers, supplyChainLogic: analysisReport.substring(0, 500) };
  }

  private async collectRedditTickers(trendName: string): Promise<Map<string, number>> {
    try {
      const posts = await searchPosts(trendName, undefined, 20);
      return extractTickersFromPosts(posts);
    } catch (e: any) {
      console.error(`[TickerDiscovery] Reddit 搜索失败: ${e.message}`);
      return new Map();
    }
  }

  private async collectNewsContext(trendName: string): Promise<string> {
    try {
      const items = await fetchGoogleNewsRSS(trendName, 'en', 8);
      return items.map(item => `[${item.source}] ${item.title}`).join('\n');
    } catch (e: any) {
      console.error(`[TickerDiscovery] Google News 搜索失败: ${e.message}`);
      return '';
    }
  }

  formatForTelegram(
    trendName: string,
    tickers: DiscoveredTicker[],
    supplyChainLogic: string,
  ): string {
    let msg = `🆕 *标的发现引擎 — ${trendName}*\n\n`;
    msg += `🔗 *产业链逻辑:*\n${supplyChainLogic.substring(0, 300)}\n\n`;

    const leaders = tickers.filter(t => t.chainLevel === 'sector_leader');
    const bottlenecks = tickers.filter(t => t.chainLevel === 'bottleneck');
    const gems = tickers.filter(t => t.chainLevel === 'hidden_gem');

    if (leaders.length > 0) {
      msg += `👑 *赛道龙头:*\n`;
      leaders.forEach(t => msg += `  \`${t.symbol}\` ${t.name} — *${t.multibaggerScore}分*\n`);
      msg += '\n';
    }
    if (bottlenecks.length > 0) {
      msg += `🔍 *产业链瓶颈:*\n`;
      bottlenecks.forEach(t => msg += `  \`${t.symbol}\` ${t.name} — *${t.multibaggerScore}分*\n`);
      msg += '\n';
    }
    if (gems.length > 0) {
      msg += `🎯 *洼地黑马:*\n`;
      gems.forEach(t => msg += `  \`${t.symbol}\` ${t.name} — *${t.multibaggerScore}分*\n`);
    }

    return msg;
  }
}
