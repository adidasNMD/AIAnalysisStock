import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { generateStructuredOutput } from '../../utils/llm';
import { scanMultipleSubreddits, redditPostsToSignals, extractTickersFromPosts, RedditPost } from '../../tools/reddit';
import { scanMultipleKeywords, googleNewsToSignals, GoogleNewsItem } from '../../tools/google-news';
import { scanAllSectorETFs, sectorSignalsToRawSignals, SectorSignal } from '../../tools/sector-scanner';
import { RawSignal } from '../../models/types';
import { TickerDiscoveryEngine, DiscoveredTicker } from '../discovery/ticker-discovery';
import { addDiscoveredTickers, getActiveTickers } from '../../utils/dynamic-watchlist';
import { saveTrendReport } from '../../utils/agent-logger';

// ==========================================
// TrendRadar 趋势雷达模块
// 每 15 分钟回答: "现在什么最热？热度在加速还是减速？"
// 并自动从趋势中发现标的 → 写入动态观察池
// ==========================================

// 加载投资者画像
function loadInvestorProfile(): string {
  try {
    const profilePath = path.join(process.cwd(), 'investor_profile.md');
    if (fs.existsSync(profilePath)) {
      return fs.readFileSync(profilePath, 'utf-8');
    }
  } catch (e: any) {
    console.error('[TrendRadar] ⚠️ 投资者画像加载失败');
  }
  return '';
}

// LLM 输出结构定义
const TrendAnalysisSchema = z.object({
  topics: z.array(z.object({
    name: z.string().describe('趋势主题名称，简洁概括'),
    momentum: z.enum(['accelerating', 'stable', 'decelerating']).describe('动量方向'),
    phase: z.enum(['emerging', 'trending', 'fading']).describe('阶段'),
    tickers: z.array(z.string()).describe('相关标的代码'),
    relatedETFs: z.array(z.string()).describe('相关板块 ETF'),
    hasCatalyst: z.boolean().describe('是否有真实催化事件'),
    catalystDescription: z.string().optional().describe('催化事件描述'),
    score: z.number().min(0).max(100).describe('综合热度评分'),
    sources: z.array(z.string()).describe('信息来源标注'),
    supplyChainHint: z.string().optional().describe('供应链瓶颈节点提示，帮助后续标的发现'),
  })).describe('当前 Top 热门主题列表'),
  marketSentiment: z.enum(['risk_on', 'neutral', 'risk_off']).describe('整体市场风险情绪'),
  summary: z.string().describe('一段话概括当前市场趋势全貌'),
});

export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;
export type TrendTopic = TrendAnalysis['topics'][number];

// 历史快照用于计算加速度
const snapshotHistory: TrendAnalysis[] = [];

export class TrendRadar {
  private tickerDiscovery = new TickerDiscoveryEngine();
  private investorProfile: string;

  constructor() {
    this.investorProfile = loadInvestorProfile();
  }

  /**
   * 执行完整趋势扫描 + 标的发现
   */
  async scan(): Promise<TrendAnalysis> {
    console.log(`\n[TrendRadar] 📡 =====================================`);
    console.log(`[TrendRadar] 📡 开始全方位趋势扫描...`);
    console.log(`[TrendRadar] 📡 =====================================\n`);

    // =============================================
    // 第一步：并发采集多源数据
    // =============================================
    const [redditPosts, newsItems, sectorSignals] = await Promise.all([
      this.collectRedditData(),
      this.collectNewsData(),
      this.collectSectorData(),
    ]);

    // =============================================
    // 第二步：汇聚为统一信号
    // =============================================
    const allSignals: RawSignal[] = [
      ...redditPostsToSignals(redditPosts),
      ...googleNewsToSignals(newsItems),
      ...sectorSignalsToRawSignals(sectorSignals),
    ];

    console.log(`[TrendRadar] 📊 多源信号汇聚完成: ${allSignals.length} 条 (Reddit: ${redditPosts.length}, News: ${newsItems.length}, Sector: ${sectorSignals.length})`);

    // =============================================
    // 第三步：提取 Reddit 热门 ticker
    // =============================================
    const tickerHeat = extractTickersFromPosts(redditPosts);
    const topTickers = [...tickerHeat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([ticker, count]) => `$${ticker}(${count}次被提及)`)
      .join(', ');

    // =============================================
    // 第四步：板块轮动洞察
    // =============================================
    const sectorOverview = sectorSignals
      .map(s => `${s.sectorName}(${s.etfSymbol}): ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}% 量比${s.volumeSurgeRatio.toFixed(1)}x`)
      .join('\n');

    // =============================================
    // 第五步：获取当前动态观察池标的（避免重复发现）
    // =============================================
    const existingTickers = getActiveTickers().map(t => t.symbol);

    // =============================================
    // 第六步：组装 LLM 分析 Prompt（注入投资画像）
    // =============================================
    const investorContext = this.investorProfile
      ? `\n\n=== 投资者画像（你的分析必须对齐此画像）===\n${this.investorProfile.substring(0, 1500)}`
      : '';

    const systemPrompt = `你是一个顶级的市场趋势分析师。你的任务是分析来自多个数据源的实时信号，识别当前市场中最重要的 3-7 个热门趋势主题。
${investorContext}

核心分析原则：
1. 优先关注"多源共振"——同一主题在 Reddit、新闻、板块 ETF 中同时出现，说明该趋势势头强劲
2. 区分"新兴热度"（刚出现）、"持续热度"（已确认）和"衰退热度"（在冷却）
3. 判断每个主题的动量方向：加速（讨论量/关注度在增加）、平稳、减速
4. 检查每个主题是否有真实的催化事件（政策、财报、合同等），还是纯粹的散户情绪炒作
5. 为每个主题列出最相关的股票代码和板块 ETF
6. 综合评分 0-100，衡量该主题的交易价值和紧迫性
7. 【关键】为每个主题提供"供应链瓶颈节点提示"（supplyChainHint）——指出该趋势的真正卡脖子环节在哪里，二三线受益标的可能在哪里。这是帮助后续标的发现引擎寻找洼地的关键信息
8. 不要只推荐龙头股。重点关注有数倍弹性的二三线标的

你的分析必须极其务实，面向实际交易决策。`;

    let userPrompt = `当前时间: ${new Date().toISOString()}\n\n`;
    userPrompt += `=== Reddit 热门讨论 (散户情绪) ===\n`;
    userPrompt += allSignals
      .filter(s => s.sourceType === 'reddit')
      .slice(0, 20)
      .map(s => s.content)
      .join('\n');
    
    if (topTickers) {
      userPrompt += `\n\n📌 Reddit 高频提及 Ticker: ${topTickers}\n`;
    }

    userPrompt += `\n\n=== 财经新闻 (主流媒体) ===\n`;
    userPrompt += allSignals
      .filter(s => s.sourceType === 'google_news')
      .slice(0, 15)
      .map(s => s.content)
      .join('\n');

    userPrompt += `\n\n=== 板块 ETF 实时表现 ===\n${sectorOverview}`;

    if (existingTickers.length > 0) {
      userPrompt += `\n\n=== 已在动态观察池的标的 ===\n${existingTickers.join(', ')}\n（请发现新的趋势和标的，不要只重复这些）`;
    }

    // 注入上一次快照用于动量对比
    if (snapshotHistory.length > 0) {
      const lastSnapshot = snapshotHistory[snapshotHistory.length - 1]!;
      userPrompt += `\n\n=== 上一轮趋势快照 (用于对比动量变化) ===\n`;
      userPrompt += lastSnapshot.topics
        .map(t => `${t.name}: 评分${t.score}, 动量${t.momentum}, 阶段${t.phase}`)
        .join('\n');
    }

    // =============================================
    // 第七步：LLM 结构化分析
    // =============================================
    console.log(`[TrendRadar] 🧠 提交至 LLM 进行趋势综合分析...`);

    const analysis = await generateStructuredOutput(
      TrendAnalysisSchema,
      systemPrompt,
      userPrompt,
    );

    // 保存快照用于下次对比
    snapshotHistory.push(analysis);
    if (snapshotHistory.length > 10) {
      snapshotHistory.shift();
    }

    // =============================================
    // 第八步：对加速趋势自动触发标的发现 🎯
    // =============================================
    const acceleratingTopics = analysis.topics.filter(
      t => (t.momentum === 'accelerating' || t.phase === 'emerging') && t.score >= 50
    );

    const allDiscoveredTickers: Array<{ symbol: string; name: string; chainLevel: string; multibaggerScore: number; reasoning: string }> = [];

    if (acceleratingTopics.length > 0) {
      console.log(`\n[TrendRadar] 🎯 发现 ${acceleratingTopics.length} 个加速趋势，启动标的发现引擎...`);

      for (const topic of acceleratingTopics) {
        try {
          const description = topic.supplyChainHint
            ? `${topic.name}: ${topic.supplyChainHint}`
            : topic.name;

          const { tickers: discovered } = await this.tickerDiscovery.discoverFromTrend(
            topic.name,
            description,
            existingTickers,
          );

          // 将发现的标的写入动态观察池
          if (discovered.length > 0) {
            const tickersToAdd = discovered
              .filter(d => !d.alreadyPriced)
              .map(d => ({
                symbol: d.symbol,
                name: d.name,
                trendName: topic.name,
                chainLevel: d.chainLevel,
                multibaggerScore: d.multibaggerScore,
                reasoning: d.reasoning,
                discoverySource: `TrendRadar:${topic.name}`,
              }));

            await addDiscoveredTickers(tickersToAdd);
            allDiscoveredTickers.push(...tickersToAdd);
          }
        } catch (e: any) {
          console.error(`[TrendRadar] 标的发现失败 (${topic.name}): ${e.message}`);
        }
      }
    }

    // =============================================
    // 第九步：保存完整情报报告 📊
    // =============================================
    try {
      saveTrendReport(analysis, allDiscoveredTickers, {
        redditCount: redditPosts.length,
        newsCount: newsItems.length,
        sectorCount: sectorSignals.length,
      });
    } catch (e: any) {
      console.error(`[TrendRadar] 情报报告保存失败: ${e.message}`);
    }

    // =============================================
    // 输出日志
    // =============================================
    console.log(`\n[TrendRadar] ✅ 趋势扫描完成 — 市场情绪: ${analysis.marketSentiment}`);
    console.log(`[TrendRadar] 📋 发现 ${analysis.topics.length} 个热门主题:`);
    for (const topic of analysis.topics) {
      const momentumIcon = topic.momentum === 'accelerating' ? '🚀' : topic.momentum === 'decelerating' ? '📉' : '➡️';
      const catalystIcon = topic.hasCatalyst ? '✅有催化' : '❌无催化';
      console.log(`  ${momentumIcon} [${topic.score}分] ${topic.name} | ${topic.phase} | ${catalystIcon} | ${topic.tickers.join(', ')}`);
    }
    console.log(`[TrendRadar] 💡 ${analysis.summary}\n`);

    return analysis;
  }

  /**
   * 采集 Reddit 数据
   */
  private async collectRedditData(): Promise<RedditPost[]> {
    try {
      return await scanMultipleSubreddits(
        ['wallstreetbets', 'stocks', 'investing', 'options', 'semiconductors'],
        5,
      );
    } catch (e: any) {
      console.error(`[TrendRadar] Reddit 采集失败: ${e.message}`);
      return [];
    }
  }

  /**
   * 采集 Google News 数据
   */
  private async collectNewsData(): Promise<GoogleNewsItem[]> {
    try {
      return await scanMultipleKeywords(undefined, 5);
    } catch (e: any) {
      console.error(`[TrendRadar] Google News 采集失败: ${e.message}`);
      return [];
    }
  }

  /**
   * 采集板块 ETF 数据
   */
  private async collectSectorData(): Promise<SectorSignal[]> {
    try {
      return await scanAllSectorETFs();
    } catch (e: any) {
      console.error(`[TrendRadar] 板块 ETF 扫描失败: ${e.message}`);
      return [];
    }
  }

  /**
   * 生成 Telegram 推送消息
   */
  formatForTelegram(analysis: TrendAnalysis): string {
    let msg = `📡 *TrendRadar 趋势雷达*\n`;
    msg += `⏰ ${new Date().toISOString().split('T')[0]} | 情绪: ${analysis.marketSentiment}\n\n`;

    for (const topic of analysis.topics) {
      const momentumIcon = topic.momentum === 'accelerating' ? '🚀' : topic.momentum === 'decelerating' ? '📉' : '➡️';
      const catalystIcon = topic.hasCatalyst ? '✅' : '❓';
      
      msg += `${momentumIcon} *${topic.name}* (${topic.score}分)\n`;
      msg += `   阶段: ${topic.phase} | 催化: ${catalystIcon}\n`;
      msg += `   标的: \`${topic.tickers.join('`, `')}\`\n`;
      if (topic.relatedETFs.length > 0) {
        msg += `   ETF: ${topic.relatedETFs.join(', ')}\n`;
      }
      if (topic.catalystDescription) {
        msg += `   💡 ${topic.catalystDescription}\n`;
      }
      if (topic.supplyChainHint) {
        msg += `   🔗 瓶颈: ${topic.supplyChainHint}\n`;
      }
      msg += `\n`;
    }

    msg += `📋 ${analysis.summary}`;
    return msg;
  }
}

