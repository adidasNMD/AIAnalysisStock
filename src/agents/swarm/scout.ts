import { AutonomousAgent } from '../core/agent';
import { desearchTool } from '../../tools/desearch';
import { firecrawlTool } from '../../tools/firecrawl';
import { redditTool } from '../../tools/reddit';
import { fetchGoogleNewsRSS } from '../../tools/google-news';
import { RawSignal } from '../../models/types';

/**
 * DataScoutAgent — 数据侦察兵
 * 
 * 职责：多源数据采集 + LLM 文本情报清洗
 * 输出：{ signals: RawSignal[], intelligenceBrief: string }
 *   - signals: 从原始工具数据中直接提取（不依赖 LLM JSON）
 *   - intelligenceBrief: LLM 对情报数据的文本摘要分析
 */
export class DataScoutAgent extends AutonomousAgent {
  constructor() {
    super({
      role: '数据侦察兵 (Data Scout)',
      goal: '从 Reddit、X/Twitter、新闻网站等多源渠道采集原始情报，并撰写高质量情报清洗备忘录。',
      instructions: `你是一个精锐的金融情报分析员。你将收到来自多个数据源的原始情报数据。
你的任务是：
1. 识别其中真正有市场影响力的关键信息（政策变动、财报异常、供应链消息、行业催化等）
2. 过滤掉噪音（垃圾广告、无关闲聊、重复内容、纯情绪宣泄）
3. 将有价值的信息整理成一份结构清晰的《情报清洗备忘录》
4. 在备忘录中标注每条信息的来源可信度和新颖度
5. 所有输出使用中文`
    });
  }

  async scout(query: string): Promise<{ signals: RawSignal[], intelligenceBrief: string }> {
    console.log(`\n[DataScout] 🕵️‍♂️ Commencing scouting mission for: "${query}"`);
    
    let combinedSignals = "";
    const rawSignals: RawSignal[] = [];

    // 1. Reddit 免费采集
    try {
       const redditData = await redditTool.execute({ query, limit: 10 });
       combinedSignals += `\n[Reddit Data]:\n${redditData}`;
       // 从原始文本中直接构建 RawSignal（不依赖 LLM）
       const redditLines = redditData.split('\n').filter((l: string) => l.trim().length > 20);
       redditLines.forEach((line: string, idx: number) => {
         rawSignals.push({
           id: `reddit_${idx}_${Date.now()}`,
           sourceType: 'reddit',
           content: line.trim(),
           timestamp: Date.now(),
           author: 'Reddit',
           url: ''
         });
       });
    } catch(e: any) {
        console.error(`[DataScout] Reddit fallback: ${e.message}`);
    }
    
    // 2. X/Twitter Desearch
    try {
       const xData = await desearchTool.execute({ query, limit: 10 });
       combinedSignals += `\n[X/Twitter Data]:\n${xData}`;
       const xLines = xData.split('\n').filter((l: string) => l.trim().length > 20);
       xLines.forEach((line: string, idx: number) => {
         rawSignals.push({
           id: `twitter_${idx}_${Date.now()}`,
           sourceType: 'twitter',
           content: line.trim(),
           timestamp: Date.now(),
           author: 'X/Twitter',
           url: ''
         });
       });
    } catch(e: any) {
        console.error(`[DataScout] Desearch fallback: ${e.message}`);
    }
    
    // 3. Firecrawl 深度文章
    try {
       const webData = await firecrawlTool.execute({ query, limit: 2 });
       combinedSignals += `\n[Web Data]:\n${webData}`;
       rawSignals.push({
         id: `web_${Date.now()}`,
         sourceType: 'news',
         content: webData.substring(0, 2000),
         timestamp: Date.now(),
         author: 'Web',
         url: ''
       });
    } catch(e: any) {
        console.error(`[DataScout] Firecrawl fallback: ${e.message}`);
    }

    // 4. Google News
    try {
       const newsItems = await fetchGoogleNewsRSS(query, 'en', 10);
       if (newsItems.length > 0) {
         const newsText = newsItems.map(n => `[${n.source}] ${n.title}\n${n.snippet}`).join('\n');
         combinedSignals += `\n[Google News Data]:\n${newsText}`;
         newsItems.forEach((item, idx) => {
           rawSignals.push({
             id: `news_${idx}_${Date.now()}`,
             sourceType: 'google_news',
             content: `[${item.source}] ${item.title}: ${item.snippet}`,
             timestamp: Date.now(),
             author: item.source,
             url: item.link || ''
           });
         });
       }
    } catch(e: any) {
        console.error(`[DataScout] Google News fallback: ${e.message}`);
    }

    if (combinedSignals.trim().length === 0) {
      console.log('[DataScout] 🛑 所有数据源均采集失败，无可用情报。');
      return { signals: [], intelligenceBrief: '' };
    }

    // LLM 文本情报清洗 — 不再要求 JSON，输出情报分析备忘录
    console.log(`[DataScout] 🧠 提交 LLM 进行情报清洗分析... (${rawSignals.length} 条原始信号)`);
    
    const intelligenceBrief = await this.executeTextTask(
      `分析以下从多个数据源采集的原始情报数据，撰写一份《情报清洗备忘录》。

要求：
1. 识别并列出所有有价值的市场信号（标注来源和可信度）
2. 指出信号之间的关联性和共振点
3. 标注哪些信号是真正有交易价值的"一手信息"
4. 明确说明搜索目标是："${query}"
5. 在末尾给出总体评估：这组情报是否值得下游 Agent 进行深度分析`,
      combinedSignals
    );

    console.log(`[DataScout] ✅ 情报清洗完成。${rawSignals.length} 条原始信号，${intelligenceBrief.length} 字分析文本。`);
    
    return { signals: rawSignals, intelligenceBrief };
  }
}
