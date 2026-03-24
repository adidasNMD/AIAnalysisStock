import * as fs from 'fs';
import * as path from 'path';
import { generateStructuredOutput } from '../../utils/llm';
import { fetchGoogleNewsRSS, GoogleNewsItem } from '../../tools/google-news';
import { pollAllFeeds, RSSAlert } from '../../tools/rss-monitor';
import { z } from 'zod';

// ==========================================
// MacroContextEngine — 地缘政治 + 宏观经济分析
// 仅展示层，不参与核心选股决策
// ==========================================

const MacroAnalysisSchema = z.object({
  geopoliticalRisk: z.enum(['low', 'moderate', 'elevated', 'high', 'extreme']).describe('地缘政治风险等级'),
  geopoliticalSummary: z.string().describe('地缘政治局势摘要'),
  geopoliticalEvents: z.array(z.object({
    event: z.string(),
    impact: z.string(),
    affectedSectors: z.array(z.string()),
  })).describe('近期地缘政治事件及影响'),

  macroOutlook: z.enum(['bullish', 'neutral', 'cautious', 'bearish']).describe('宏观经济展望'),
  macroSummary: z.string().describe('宏观经济形势摘要'),
  upcomingEvents: z.array(z.object({
    date: z.string(),
    event: z.string(),
    expectedImpact: z.string(),
  })).describe('近期重要宏观事件（FOMC/CPI/非农等）'),

  tariffAndSanctions: z.string().describe('关税和制裁最新动态'),
  investmentImplications: z.string().describe('对投资的综合影响评估（仅供参考）'),
});

export type MacroAnalysis = z.infer<typeof MacroAnalysisSchema>;

export class MacroContextEngine {
  /**
   * 执行宏观+地缘分析 (仅展示，不驱动选股)
   */
  async analyze(): Promise<MacroAnalysis> {
    console.log(`\n[MacroContext] 🌍 开始地缘政治 + 宏观经济分析...`);

    // 1. 并发采集数据
    const [geoNews, macroNews, policyAlerts] = await Promise.all([
      this.collectGeopoliticalNews(),
      this.collectMacroNews(),
      this.collectPolicyAlerts(),
    ]);

    // 2. LLM 综合分析
    const systemPrompt = `你是一个资深的宏观经济和地缘政治分析师。
你的任务是综合多个信息源，给出当前的地缘政治风险评估和宏观经济展望。

重要说明：
- 你的分析仅供参考，不直接驱动任何买卖决策
- 重点关注: 中美关系/关税、美联储利率政策、地缘冲突、制裁动态
- 必须列出近期即将到来的重要宏观事件（如 FOMC、CPI、非农数据发布日）
- 所有输出使用中文`;

    const newsContext = [
      '=== 地缘政治新闻 ===',
      ...geoNews.map(n => `[${n.source}] ${n.title}`),
      '\n=== 宏观经济新闻 ===',
      ...macroNews.map(n => `[${n.source}] ${n.title}`),
      '\n=== 政策 RSS 警报 ===',
      ...policyAlerts.map(a => `[${a.source}] ${a.title}`),
    ].join('\n');

    const analysis = await generateStructuredOutput(
      MacroAnalysisSchema,
      systemPrompt,
      newsContext || '无近期新闻数据可用',
    );

    const riskIcon = analysis.geopoliticalRisk === 'low' ? '🟢' :
      analysis.geopoliticalRisk === 'moderate' ? '🟡' :
      analysis.geopoliticalRisk === 'elevated' ? '🟠' : '🔴';

    console.log(`[MacroContext] 🌍 地缘风险: ${riskIcon} ${analysis.geopoliticalRisk}`);
    console.log(`[MacroContext] 📊 宏观展望: ${analysis.macroOutlook}`);
    console.log(`[MacroContext] 📅 即将到来: ${analysis.upcomingEvents.length} 个重要事件`);

    return analysis;
  }

  /**
   * 格式化为 Telegram 消息或报告附录
   */
  formatForReport(analysis: MacroAnalysis): string {
    const riskIcon = analysis.geopoliticalRisk === 'low' ? '🟢' :
      analysis.geopoliticalRisk === 'moderate' ? '🟡' :
      analysis.geopoliticalRisk === 'elevated' ? '🟠' : '🔴';

    let md = `## 🌍 地缘政治 + 宏观经济分析（仅供参考）\n\n`;
    md += `> ⚠️ 本板块内容不参与核心选股决策，仅作为背景信息展示。\n\n`;

    // 地缘政治
    md += `### 地缘政治风险: ${riskIcon} ${analysis.geopoliticalRisk.toUpperCase()}\n\n`;
    md += `${analysis.geopoliticalSummary}\n\n`;

    if (analysis.geopoliticalEvents.length > 0) {
      md += `**近期地缘事件:**\n`;
      for (const e of analysis.geopoliticalEvents) {
        md += `- **${e.event}** → ${e.impact} (影响板块: ${e.affectedSectors.join(', ')})\n`;
      }
      md += '\n';
    }

    // 宏观经济
    md += `### 宏观经济展望: ${analysis.macroOutlook.toUpperCase()}\n\n`;
    md += `${analysis.macroSummary}\n\n`;

    if (analysis.upcomingEvents.length > 0) {
      md += `**📅 近期重要宏观事件:**\n`;
      md += `| 日期 | 事件 | 预期影响 |\n|------|------|----------|\n`;
      for (const e of analysis.upcomingEvents) {
        md += `| ${e.date} | ${e.event} | ${e.expectedImpact} |\n`;
      }
      md += '\n';
    }

    // 关税与制裁
    if (analysis.tariffAndSanctions) {
      md += `### 关税与制裁动态\n\n${analysis.tariffAndSanctions}\n\n`;
    }

    // 综合影响
    md += `### 💡 投资影响评估\n\n${analysis.investmentImplications}\n`;

    return md;
  }

  private async collectGeopoliticalNews(): Promise<GoogleNewsItem[]> {
    try {
      const keywords = ['US China trade war', 'geopolitical conflict', 'sanctions', 'tariff'];
      const allItems: GoogleNewsItem[] = [];
      for (const kw of keywords) {
        const items = await fetchGoogleNewsRSS(kw, 'en', 3);
        allItems.push(...items);
      }
      return allItems;
    } catch (e: any) {
      console.error(`[MacroContext] 地缘新闻采集失败: ${e.message}`);
      return [];
    }
  }

  private async collectMacroNews(): Promise<GoogleNewsItem[]> {
    try {
      const keywords = ['Federal Reserve interest rate', 'CPI inflation', 'jobs report nonfarm'];
      const allItems: GoogleNewsItem[] = [];
      for (const kw of keywords) {
        const items = await fetchGoogleNewsRSS(kw, 'en', 3);
        allItems.push(...items);
      }
      return allItems;
    } catch (e: any) {
      console.error(`[MacroContext] 宏观新闻采集失败: ${e.message}`);
      return [];
    }
  }

  private async collectPolicyAlerts(): Promise<RSSAlert[]> {
    try {
      const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
      if (fs.existsSync(watchlistPath)) {
        const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
        if (watchlist.eventSources) {
          return await pollAllFeeds(watchlist.eventSources);
        }
      }
      return [];
    } catch (e: any) {
      console.error(`[MacroContext] 政策 RSS 采集失败: ${e.message}`);
      return [];
    }
  }
}
