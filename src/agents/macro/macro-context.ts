import * as fs from 'fs';
import * as path from 'path';
import { generateTextCompletion } from '../../utils/llm';
import { fetchGoogleNewsRSS, GoogleNewsItem } from '../../tools/google-news';
import { pollAllFeeds, RSSAlert } from '../../tools/rss-monitor';

// ==========================================
// MacroContextEngine — (Free-form Text Flow 版本)
// 地缘政治 + 宏观经济纯文本分析
// ==========================================

export type MacroAnalysis = {
  /** LLM 生成的完整宏观分析报告 */
  report: string;
};

export class MacroContextEngine {
  async analyze(): Promise<MacroAnalysis> {
    console.log(`\n[MacroContext] 🌍 开始地缘政治 + 宏观经济分析...`);

    const [geoNews, macroNews, policyAlerts] = await Promise.all([
      this.collectGeopoliticalNews(),
      this.collectMacroNews(),
      this.collectPolicyAlerts(),
    ]);

    const systemPrompt = `你是一个资深的宏观经济和地缘政治分析师。
综合多个信息源，撰写一份完整的宏观环境分析报告。

重点关注：
- 中美关系/关税动态
- 美联储利率政策与 FOMC 会议
- 地缘冲突（中东/东欧）
- 制裁政策变化
- 近期即将到来的重要宏观事件（CPI、非农、FOMC）
- 所有输出使用中文

报告结构：
## 🌍 地缘政治风险评估
风险等级（低/中/高/极高）+ 详细分析

## 📊 宏观经济展望
展望（看多/中性/谨慎/看空）+ 详细分析

## 📅 近期重要宏观事件
列出日期、事件、预期影响

## 🛡️ 关税与制裁动态

## 💡 投资影响评估`;

    const newsContext = [
      '=== 地缘政治新闻 ===',
      ...geoNews.map(n => `[${n.source}] ${n.title}`),
      '\n=== 宏观经济新闻 ===',
      ...macroNews.map(n => `[${n.source}] ${n.title}`),
      '\n=== 政策 RSS 警报 ===',
      ...policyAlerts.map(a => `[${a.source}] ${a.title}`),
    ].join('\n');

    const report = await generateTextCompletion(
      systemPrompt,
      newsContext || '无近期新闻数据可用',
      { streamToConsole: true }
    );

    console.log(`[MacroContext] ✅ 宏观分析完成 (${report.length} 字)`);
    return { report };
  }

  formatForReport(analysis: MacroAnalysis): string {
    return `## 🌍 地缘政治 + 宏观经济分析（仅供参考）\n\n> ⚠️ 本板块内容不参与核心选股决策，仅作为背景信息展示。\n\n${analysis.report}`;
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
