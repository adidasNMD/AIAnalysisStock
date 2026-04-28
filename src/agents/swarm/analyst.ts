import { AutonomousAgent } from '../core/agent';

interface AgentRequestOptions {
  signal?: AbortSignal;
}

/**
 * LeadAnalystAgent — 首席市场分析师
 * 
 * 输入: 侦察兵的情报清洗备忘录文本
 * 输出: 一篇《事件与核心逻辑推导备忘录》(string)
 * 
 * 关键改变：不再输出 StructuredEvent / NarrativeTopic 的 JSON 对象。
 * 改为在文本分析末尾明确说明是否值得深入的结论。
 */
export class LeadAnalystAgent extends AutonomousAgent {
  constructor() {
    super({
      role: '首席市场分析师 (Lead Market Analyst)',
      goal: '将侦察兵的原始情报提炼为深度的事件分析与叙事推导。',
      instructions: `你是一个顶级对冲基金的资深分析师。
你的上游是情报侦察兵，他已经完成了多源数据采集和初步筛选。
你需要基于他的情报，进行更深层次的分析和推导。

你的核心工作：
1. 提炼出最核心的市场事件（1 个即可，不要发散）
2. 深度评估该事件的可信度和新颖度
3. 推导该事件可能引发的产业链连锁反应
4. 在文章末尾，明确给出【追踪建议】，格式如下：
   - 如果值得深入：写 "**追踪建议：建议深入追踪**"，并说明理由
   - 如果不值得：写 "**追踪建议：无需追踪**"，并说明理由
5. 所有输出使用中文`
    });
  }

  /**
   * 分析情报并输出事件推导备忘录
   * @returns { analysisMemo: string, shouldProceed: boolean }
   */
  async analyze(
    intelligenceBrief: string,
    query: string,
    options: AgentRequestOptions = {},
  ): Promise<{ analysisMemo: string, shouldProceed: boolean }> {
    console.log(`\n[LeadAnalyst] 🧠 开始深度事件分析...`);

    const analysisMemo = await this.executeTextTask(
      `基于上游侦察兵提供的情报清洗备忘录，撰写一份深度的《事件与核心逻辑推导备忘录》。

本次搜索目标: "${query}"

要求的报告结构：
## 📌 核心事件提炼
- 用一句话概括最核心的市场事件
- 事件来源和可信度评估 (极高/高/中/低)
- 事件新颖度评估 (极高/高/中/低)

## 🧠 产业链连锁反应推导
- 第一层：该事件的直接影响方（哪些行业/公司直接受益或受损）
- 第二层：间接传导（供应链上下游谁会受影响）
- 第三层：潜在的二三线受益者（市场尚未关注的洼地）

## ⏳ 事件时间线与催化节点
- 这个事件的发展节奏如何？
- 有哪些即将到来的催化事件可以验证或推翻？

## 📊 追踪建议
在这里明确写 "**建议深入追踪**" 或 "**无需追踪**"，并详细说明理由。`,
      intelligenceBrief,
      { ...(options.signal ? { signal: options.signal } : {}) },
    );

    // 从文本中检测是否建议深入
    const shouldProceed = analysisMemo.includes('建议深入') || 
                          analysisMemo.includes('值得追踪') || 
                          analysisMemo.includes('值得深入') ||
                          analysisMemo.includes('建议追踪');
    
    if (shouldProceed) {
      console.log(`[LeadAnalyst] ✅ 分析师判定：值得深入追踪。交接给策略师。`);
    } else {
      console.log(`[LeadAnalyst] 🛑 分析师判定：无需追踪。事件不具备足够的可信度/新颖度。`);
    }

    return { analysisMemo, shouldProceed };
  }
}
