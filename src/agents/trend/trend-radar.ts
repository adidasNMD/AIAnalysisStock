import * as fs from 'fs';
import * as path from 'path';
import { generateTextCompletion } from '../../utils/llm';
import { DEFAULT_NEWS_KEYWORDS } from '../../tools/google-news';
import { scanMultipleSubreddits, redditPostsToSignals, extractTickersFromPosts, RedditPost } from '../../tools/reddit';
import { scanMultipleKeywords, googleNewsToSignals, GoogleNewsItem } from '../../tools/google-news';
import { scanAllSectorETFs, sectorSignalsToRawSignals, SectorSignal } from '../../tools/sector-scanner';
import { RawSignal } from '../../models/types';
import { TickerDiscoveryEngine } from '../discovery/ticker-discovery';
import { addDiscoveredTickers, getActiveTickers } from '../../utils/dynamic-watchlist';
import { saveTrendReport } from '../../utils/agent-logger';

// ==========================================
// TrendRadar 趋势雷达模块 (Free-form Text Flow 版本)
// ==========================================

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

/**
 * 从 LLM 文本输出中提取 ticker 代码
 */
function extractTickersFromAnalysis(text: string): string[] {
  const matches = text.match(/\$([A-Z]{1,5})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace('$', '')))];
}

// TrendAnalysis 改为纯文本接口
export interface TrendAnalysis {
  /** LLM 生成的完整趋势分析文本 */
  report: string;
  /** 从文本中提取的 ticker 列表 */
  mentionedTickers: string[];
  /** 市场情绪（从文本中简单检测） */
  marketSentiment: string;
  /** 为兼容下游保留的 topics 接口 — 从文本中解析 */
  topics: Array<{
    name: string;
    momentum: string;
    score: number;
    tickers: string[];
    hasCatalyst: boolean;
    phase: string;
    relatedETFs: string[];
    sources: string[];
    catalystDescription?: string;
    supplyChainHint?: string;
  }>;
}

const snapshotHistory: string[] = [];

export class TrendRadar {
  private tickerDiscovery = new TickerDiscoveryEngine();
  private investorProfile: string;

  constructor() {
    this.investorProfile = loadInvestorProfile();
  }

  async scan(): Promise<TrendAnalysis> {
    console.log(`\n[TrendRadar] 📡 =====================================`);
    console.log(`[TrendRadar] 📡 开始全方位趋势扫描...`);
    console.log(`[TrendRadar] 📡 =====================================\n`);

    // Step 0: LLM 动态生成当前最热的搜索关键词
    const dynamicKeywords = await this.generateDynamicKeywords();

    // 从 watchlist.json 中读取 LLM 自进化过的关键词
    let evolvedKeywords: string[] = [];
    try {
      const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
      if (fs.existsSync(watchlistPath)) {
        const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
        evolvedKeywords = watchlist.googleNewsKeywords || [];
      }
    } catch (e: any) {
      console.error(`[TrendRadar] ⚠️ 读取 watchlist 关键词失败: ${e.message}`);
    }

    const allKeywords = [...new Set([...dynamicKeywords, ...evolvedKeywords, ...DEFAULT_NEWS_KEYWORDS])];
    console.log(`[TrendRadar] 🔑 搜索关键词: ${allKeywords.length} 个 (AI动态${dynamicKeywords.length} + 进化池${evolvedKeywords.length} + 预设${DEFAULT_NEWS_KEYWORDS.length})`);

    // 第一步：并发采集多源数据
    const [redditPosts, newsItems, sectorSignals] = await Promise.all([
      this.collectRedditData(),
      this.collectNewsData(allKeywords),
      this.collectSectorData(),
    ]);

    // 第二步：汇聚信号
    const allSignals: RawSignal[] = [
      ...redditPostsToSignals(redditPosts),
      ...googleNewsToSignals(newsItems),
      ...sectorSignalsToRawSignals(sectorSignals),
    ];

    console.log(`[TrendRadar] 📊 多源信号汇聚完成: ${allSignals.length} 条`);

    // 第三步：Reddit 热门 ticker
    const tickerHeat = extractTickersFromPosts(redditPosts);
    const topTickers = [...tickerHeat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([ticker, count]) => `$${ticker}(${count}次被提及)`)
      .join(', ');

    // 第四步：板块轮动
    const sectorOverview = sectorSignals
      .map(s => `${s.sectorName}(${s.etfSymbol}): ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}% 量比${s.volumeSurgeRatio.toFixed(1)}x`)
      .join('\n');

    // 第五步：已有动态观察池
    const existingTickers = getActiveTickers().map(t => t.symbol);

    // 第六步：LLM 纯文本分析
    const investorContext = this.investorProfile
      ? `\n\n=== 投资者画像 ===\n${this.investorProfile.substring(0, 1500)}`
      : '';

    const systemPrompt = `你是一个顶级的市场趋势分析师。你的任务是分析来自多个数据源的实时信号，撰写一份完整的趋势扫描报告。
${investorContext}

报告要求：
1. 识别当前市场中最重要的 3-7 个热门趋势主题
2. 对每个主题评估：动量方向（加速/稳定/减速）、阶段（新兴/趋势中/衰退）、是否有真实催化事件
3. 列出相关标的代码（$TICKER 格式）
4. 综合多源信号共振分析
5. 给出整体市场情绪判断
6. 在报告末尾明确写出市场情绪判断：**市场情绪: risk_on** 或 **市场情绪: risk_off** 或 **市场情绪: neutral**
7. 所有输出使用中文`;

    let userPrompt = `当前时间: ${new Date().toISOString()}\n\n`;
    userPrompt += `=== Reddit 热门讨论 ===\n`;
    userPrompt += allSignals
      .filter(s => s.sourceType === 'reddit')
      .slice(0, 20)
      .map(s => s.content)
      .join('\n');
    
    if (topTickers) {
      userPrompt += `\n\n📌 Reddit 高频提及: ${topTickers}\n`;
    }

    userPrompt += `\n\n=== 财经新闻 ===\n`;
    userPrompt += allSignals
      .filter(s => s.sourceType === 'google_news')
      .slice(0, 15)
      .map(s => s.content)
      .join('\n');

    userPrompt += `\n\n=== 板块 ETF 表现 ===\n${sectorOverview}`;

    if (existingTickers.length > 0) {
      userPrompt += `\n\n=== 已在观察池 ===\n${existingTickers.join(', ')}`;
    }

    if (snapshotHistory.length > 0) {
      userPrompt += `\n\n=== 上一轮趋势报告摘要 ===\n${snapshotHistory[snapshotHistory.length - 1]!.substring(0, 500)}`;
    }

    console.log(`[TrendRadar] 🧠 提交至 LLM 进行趋势分析...`);
    const report = await generateTextCompletion(systemPrompt, userPrompt, { streamToConsole: true });

    // 保存快照
    snapshotHistory.push(report);
    if (snapshotHistory.length > 10) snapshotHistory.shift();

    // 从文本中提取 ticker
    const mentionedTickers = extractTickersFromAnalysis(report);

    // 检测市场情绪
    let marketSentiment = 'neutral';
    if (report.includes('risk_on') || report.includes('风险偏好') || report.includes('看多')) {
      marketSentiment = 'risk_on';
    } else if (report.includes('risk_off') || report.includes('避险') || report.includes('看空')) {
      marketSentiment = 'risk_off';
    }

    // 自动标的发现：从提取的 ticker 中筛选新标的写入动态观察池
    const newTickers = mentionedTickers.filter(t => !existingTickers.includes(t));
    if (newTickers.length > 0) {
      try {
        const tickersToAdd = newTickers.slice(0, 5).map(symbol => ({
          symbol,
          name: symbol, // Yahoo Finance 验证时会获取真实名称
          trendName: 'TrendRadar',
          chainLevel: 'hidden_gem' as const,
          multibaggerScore: 50,
          reasoning: `TrendRadar 文本分析中提及`,
          discoverySource: 'TrendRadar:text_extraction',
        }));
        await addDiscoveredTickers(tickersToAdd);
      } catch (e: any) {
        console.error(`[TrendRadar] 标的自动写入失败: ${e.message}`);
      }
    }

    // 保存情报报告（兼容旧接口）
    try {
      saveTrendReport(
        { topics: [], marketSentiment, summary: report.substring(0, 500) },
        newTickers.map(t => ({ symbol: t, name: t, chainLevel: 'hidden_gem', multibaggerScore: 50, reasoning: 'text extraction' })),
        { redditCount: redditPosts.length, newsCount: newsItems.length, sectorCount: sectorSignals.length }
      );
    } catch (e: any) {
      console.error(`[TrendRadar] 报告保存失败: ${e.message}`);
    }

    console.log(`\n[TrendRadar] ✅ 趋势扫描完成 — 情绪: ${marketSentiment}, 提及 ${mentionedTickers.length} 个 ticker`);
    console.log(`[TrendRadar] 💡 ${report.substring(0, 200)}...\n`);

    return {
      report,
      mentionedTickers,
      marketSentiment,
      topics: [], // 不再有结构化 topics，保留空数组兼容
    };
  }

  private async collectRedditData(): Promise<RedditPost[]> {
    try {
      return await scanMultipleSubreddits(
        ['wallstreetbets', 'stocks', 'investing', 'options', 'semiconductors'], 5);
    } catch (e: any) {
      console.error(`[TrendRadar] Reddit 采集失败: ${e.message}`);
      return [];
    }
  }

  private async collectNewsData(keywords?: string[]): Promise<GoogleNewsItem[]> {
    try {
      return await scanMultipleKeywords(keywords, 5);
    } catch (e: any) {
      console.error(`[TrendRadar] Google News 采集失败: ${e.message}`);
      return [];
    }
  }

  /**
   * LLM 动态生成当前最热的搜索关键词
   * 让 AI 根据当前日期和市场背景，推荐最应该搜索的话题
   */
  private async generateDynamicKeywords(): Promise<string[]> {
    try {
      console.log(`[TrendRadar] 🧠 请求 AI 生成当前最热搜索关键词...`);

      const result = await generateTextCompletion(
        `你是一个金融市场情报分析师。你的任务是给出当前最值得搜索的财经热点关键词。`,
        `当前时间: ${new Date().toISOString()}

请列出 8-12 个当前最值得在 Google News 和 Reddit 上搜索的财经热点关键词/短语。
要求：
1. 必须是当下正在发生、有时效性的话题（不要给过时的旧闻）
2. 覆盖：美股行情、AI/科技、半导体、能源、宏观政策、加密货币、中港股市
3. 每行一个关键词，中英文都要有
4. 用于 Google News RSS 搜索，所以要简洁、精准
5. 不要编号，直接一行一个关键词

示例格式：
NVIDIA earnings AI demand
美联储降息 利率决议
Tesla robotaxi autonomous
港股 科技股 反弹`,
      );

      // 从 AI 输出中提取关键词（每行一个）
      const keywords = result
        .split('\n')
        .map(line => line.replace(/^[-•*\d.]+\s*/, '').trim()) // 去掉列表符号
        .filter(line => line.length > 3 && line.length < 60) // 过滤太短或太长的
        .slice(0, 12);

      console.log(`[TrendRadar] 🔑 AI 生成了 ${keywords.length} 个动态关键词: ${keywords.join(' | ')}`);
      return keywords;
    } catch (e: any) {
      console.error(`[TrendRadar] ⚠️ AI 关键词生成失败，使用默认关键词: ${e.message}`);
      return [];
    }
  }

  private async collectSectorData(): Promise<SectorSignal[]> {
    try {
      return await scanAllSectorETFs();
    } catch (e: any) {
      console.error(`[TrendRadar] 板块 ETF 扫描失败: ${e.message}`);
      return [];
    }
  }

  formatForTelegram(analysis: TrendAnalysis): string {
    let msg = `📡 *TrendRadar 趋势雷达*\n`;
    msg += `⏰ ${new Date().toISOString().split('T')[0]} | 情绪: ${analysis.marketSentiment}\n\n`;
    
    // 直接截取 LLM 报告的前 800 字作为推送
    const reportSnippet = analysis.report.substring(0, 800).replace(/[*_`]/g, '');
    msg += reportSnippet;
    
    if (analysis.mentionedTickers.length > 0) {
      msg += `\n\n📌 提及标的: ${analysis.mentionedTickers.map(t => `$${t}`).join(', ')}`;
    }

    return msg;
  }
}

// 导出兼容类型
export type TrendTopic = TrendAnalysis['topics'][number];
