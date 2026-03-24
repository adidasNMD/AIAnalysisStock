import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { generateStructuredOutput } from '../../utils/llm';
import { searchPosts, extractTickersFromPosts, RedditPost } from '../../tools/reddit';
import { fetchGoogleNewsRSS, GoogleNewsItem } from '../../tools/google-news';
import { getQuote } from '../../tools/market-data';

// ==========================================
// TickerDiscoveryEngine — 从趋势到标的的推导引擎
// 核心能力: 给定趋势主题 → 自动发现数倍潜力标的
// ==========================================

// 加载投资者画像
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

// LLM 输出结构：发现的标的列表
const DiscoveredTickerSchema = z.object({
  tickers: z.array(z.object({
    symbol: z.string().describe('美股 ticker 代码，如 AAOI'),
    name: z.string().describe('公司全名'),
    chainLevel: z.enum(['sector_leader', 'bottleneck', 'hidden_gem']).describe('标的类型：赛道龙头($5B-$500B)/产业链瓶颈/洼地黑马'),
    multibaggerScore: z.number().min(0).max(100).describe('数倍涨幅潜力评分'),
    reasoning: z.string().describe('推导逻辑：为什么这个标的有数倍潜力'),
    alreadyPriced: z.boolean().describe('是否已被机构充分定价，弹性耗尽'),
    joinability: z.enum(['early', 'joinable', 'risky', 'too_late']).describe('当前跟进时机: early=早期可布局, joinable=可跟进, risky=有风险, too_late=已错过'),
    joinabilityReason: z.string().describe('跟进时机判断理由'),
    catalysts: z.array(z.string()).describe('可能的催化事件'),
    risks: z.array(z.string()).describe('核心风险'),
  })).describe('按数倍潜力评分从高到低排列'),
  supplyChainLogic: z.string().describe('产业链推导全链条逻辑'),
});

export type DiscoveredTicker = z.infer<typeof DiscoveredTickerSchema>['tickers'][number];

export class TickerDiscoveryEngine {
  private investorProfile: string;

  constructor() {
    this.investorProfile = loadInvestorProfile();
    if (this.investorProfile) {
      console.log('[TickerDiscovery] ✅ 投资者画像已加载');
    }
  }

  /**
   * 从趋势主题发现标的
   */
  async discoverFromTrend(
    trendName: string,
    trendDescription?: string,
    existingTickers?: string[],
  ): Promise<{ tickers: DiscoveredTicker[]; supplyChainLogic: string }> {
    console.log(`\n[TickerDiscovery] 🔍 =====================================`);
    console.log(`[TickerDiscovery] 🔍 开始从趋势中发现标的: "${trendName}"`);
    console.log(`[TickerDiscovery] 🔍 =====================================\n`);

    // =============================================
    // 第一步：多源数据采集
    // =============================================
    const [redditTickers, newsContext] = await Promise.all([
      this.collectRedditTickers(trendName),
      this.collectNewsContext(trendName),
    ]);

    // =============================================
    // 第二步：LLM 产业链推导发现标的（修正版：三类标的 + 市值约束）
    // =============================================
    const systemPrompt = `你是全球顶尖的科技产业链分析师，专门为事件驱动型交易者服务。

=== 投资者画像（严格遵循）===
${this.investorProfile ? this.investorProfile.substring(0, 2000) : '事件驱动型右侧跟风交易者，追求数倍回报的中小市值标的。'}

=== 核心任务 ===
给定一个市场趋势主题，你必须进行深度产业链推导，找到三类可投标的。

=== 三条选股赛道（必须同时覆盖）===
1. 【赛道龙头 sector_leader】市值 $5B-$500B 的赛道第一梯队
   - 如 AAOI、LITE、CRWV 这类品种——不是 NVDA 级别巨头，但是赛道真正的龙头
   - 有明确催化、有弹性、散户可参与
2. 【产业链瓶颈 bottleneck】市值 $1B-$50B 的供给侧卡脖子节点
   - 如光模块、先进封装、液冷等关键瓶颈环节
3. 【洼地黑马 hidden_gem】市值 $500M-$5B、筹码干净、弹性远大于龙头
   - 如闪迪(WDC)、PL 等——散户尚未充分关注的标的

=== 硬性约束 ===
- 绝对排除市值超过 $500B 的巨头（如 NVDA、MSFT、AAPL、GOOG、AMZN、META）
- 必须给出具体美股 ticker 代码，不允许笼统描述
- 每个标的必须判断「现在跟进还来不来得及」(joinability):
  - early: 趋势还在早期，可以提前布局
  - joinable: 已经开始涨但远未到顶，可以跟进
  - risky: 涨幅已大，追高有风险
  - too_late: 已经涨到天上，不建议追
- 至少发现 8-12 个标的，三类赛道都要覆盖

=== multibaggerScore 评判标准 ===
  90-100: 极低市值 + 极高弹性 + 明确催化 + 筹码干净
  70-89: 中等市值 + 高弹性 + 有催化
  50-69: 有潜力但已有一些资金关注
  30-49: 大市值龙头，弹性有限
  0-29: 巨头级别无弹性（不应出现在推荐中）`;

    let userPrompt = `当前趋势: ${trendName}\n`;
    if (trendDescription) {
      userPrompt += `趋势描述: ${trendDescription}\n`;
    }

    // Reddit 数据
    if (redditTickers.size > 0) {
      const topRedditTickers = [...redditTickers.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([t, c]) => `$${t}(${c}次)`)
        .join(', ');
      userPrompt += `\n=== Reddit 散户高频讨论的标的 ===\n${topRedditTickers}\n`;
    }

    // 新闻数据
    if (newsContext) {
      userPrompt += `\n=== 相关新闻 ===\n${newsContext}\n`;
    }

    // 已知标的（避免重复推荐）
    if (existingTickers && existingTickers.length > 0) {
      userPrompt += `\n=== 已在监控的标的（请发现新的，不要重复推荐这些）===\n${existingTickers.join(', ')}\n`;
    }

    userPrompt += `\n请进行完整的产业链推导，三类赛道（龙头/瓶颈/洼地）都要覆盖。所有输出使用中文。`;

    console.log(`[TickerDiscovery] 🧠 提交至 LLM 进行产业链推导（三类标的）...`);

    const result = await generateStructuredOutput(
      DiscoveredTickerSchema,
      systemPrompt,
      userPrompt,
    );

    // =============================================
    // 第三步：验证标的有效性 + 市值硬过滤
    // =============================================
    const validatedTickers: DiscoveredTicker[] = [];
    const MEGA_CAP_THRESHOLD = 500_000_000_000; // $500B

    for (const ticker of result.tickers) {
      try {
        const quote = await getQuote(ticker.symbol);
        if (!quote || quote.price <= 0) {
          console.log(`[TickerDiscovery] ⚠️ 跳过无效标的: ${ticker.symbol} (无法获取行情)`);
          continue;
        }

        // 硬性市值过滤：排除巨头
        if (quote.marketCap > MEGA_CAP_THRESHOLD) {
          console.log(`[TickerDiscovery] 🚫 排除巨头: ${ticker.symbol} (市值 $${(quote.marketCap / 1e9).toFixed(0)}B > $500B)`);
          continue;
        }

        validatedTickers.push(ticker);
      } catch (e: any) {
        console.log(`[TickerDiscovery] ⚠️ 跳过无效标的: ${ticker.symbol} (${e.message})`);
      }
    }

    // =============================================
    // 输出日志
    // =============================================
    console.log(`\n[TickerDiscovery] ✅ 发现 ${validatedTickers.length} 个有效标的:`);
    for (const t of validatedTickers) {
      const levelIcon = t.chainLevel === 'hidden_gem' ? '🎯' : t.chainLevel === 'bottleneck' ? '🔍' : '👑';
      const joinIcon = t.joinability === 'early' ? '🟢早期' : t.joinability === 'joinable' ? '🟡可跟' : t.joinability === 'risky' ? '🟠有险' : '🔴太迟';
      console.log(`  ${levelIcon} ${t.symbol} (${t.name}) | ${t.chainLevel} | ${joinIcon} | 评分${t.multibaggerScore}`);
      console.log(`     └ ${t.reasoning.substring(0, 100)}`);
    }
    console.log(`\n[TickerDiscovery] 🔗 产业链逻辑: ${result.supplyChainLogic.substring(0, 200)}...\n`);

    return { tickers: validatedTickers, supplyChainLogic: result.supplyChainLogic };
  }

  /**
   * 从 Reddit 搜索中提取 ticker 频率
   */
  private async collectRedditTickers(trendName: string): Promise<Map<string, number>> {
    try {
      const posts = await searchPosts(trendName, undefined, 20);
      return extractTickersFromPosts(posts);
    } catch (e: any) {
      console.error(`[TickerDiscovery] Reddit 搜索失败: ${e.message}`);
      return new Map();
    }
  }

  /**
   * 从 Google News 采集新闻上下文
   */
  private async collectNewsContext(trendName: string): Promise<string> {
    try {
      const items = await fetchGoogleNewsRSS(trendName, 'en', 8);
      return items
        .map(item => `[${item.source}] ${item.title}`)
        .join('\n');
    } catch (e: any) {
      console.error(`[TickerDiscovery] Google News 搜索失败: ${e.message}`);
      return '';
    }
  }

  /**
   * 格式化发现结果为 Telegram 消息
   */
  formatForTelegram(
    trendName: string,
    tickers: DiscoveredTicker[],
    supplyChainLogic: string,
  ): string {
    let msg = `🆕 *标的发现引擎 — ${trendName}*\n\n`;
    msg += `🔗 *产业链逻辑:*\n${supplyChainLogic.substring(0, 300)}\n\n`;

    // 按层级分组
    const leaders = tickers.filter(t => t.chainLevel === 'sector_leader');
    const bottlenecks = tickers.filter(t => t.chainLevel === 'bottleneck');
    const gems = tickers.filter(t => t.chainLevel === 'hidden_gem');

    const joinIcon = (j: string) => j === 'early' ? '🟢' : j === 'joinable' ? '🟡' : j === 'risky' ? '🟠' : '🔴';

    if (leaders.length > 0) {
      msg += `👑 *赛道龙头:*\n`;
      leaders.forEach(t => {
        msg += `  \`${t.symbol}\` ${t.name} — ${joinIcon(t.joinability)} *${t.multibaggerScore}分*\n`;
      });
      msg += '\n';
    }

    if (bottlenecks.length > 0) {
      msg += `🔍 *产业链瓶颈:*\n`;
      bottlenecks.forEach(t => {
        msg += `  \`${t.symbol}\` ${t.name} — ${joinIcon(t.joinability)} *${t.multibaggerScore}分*\n`;
      });
      msg += '\n';
    }

    if (gems.length > 0) {
      msg += `🎯 *洼地黑马（重点关注）:*\n`;
      gems.forEach(t => {
        msg += `  \`${t.symbol}\` ${t.name} — ${joinIcon(t.joinability)} *${t.multibaggerScore}分*\n`;
        msg += `  └ ${t.reasoning.substring(0, 100)}\n`;
      });
    }

    return msg;
  }
}
