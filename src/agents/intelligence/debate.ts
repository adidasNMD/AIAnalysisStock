import { generateTextCompletion } from '../../utils/llm';

/**
 * DebateAgent — 独立辩论仲裁 (Free-form Text Flow 版本)
 * 
 * 此模块可被 council.ts 中的仲裁 Agent 替代。
 * 保留此文件以供独立调用场景。
 */
export class DebateAgent {
  /**
   * 基于多视角观点文本，输出辩论仲裁报告
   */
  async executeDebate(topicTitle: string, perspectivesText: string): Promise<string | null> {
    console.log(`\n[DebateAgent] ⚔️ Arbitrating perspectives for: "${topicTitle}"`);

    const systemPrompt = `你是华尔街最高风控委员会的首席仲裁官。
你将收到多位不同立场的分析师的辩论观点。
你的职责是客观提炼多空双方的核心论据，并给出可执行的交易建议。
所有输出使用中文。`;

    const userPrompt = `叙事主题: ${topicTitle}\n\n分析师辩论观点:\n${perspectivesText}\n\n请输出包含以下内容的仲裁报告：\n1. 多方核心论据提纯\n2. 空方核心论据提纯\n3. 向上突破催化条件\n4. 铁血止损条件\n5. 最终裁决`;

    try {
      const report = await generateTextCompletion(systemPrompt, userPrompt, { streamToConsole: true });
      console.log(`[DebateAgent] 🏆 Final Verdict Reached. (${report.length} chars)`);
      return report;
    } catch (e: any) {
      console.error('[DebateAgent] Debate arbitration failed:', e.message);
      return null;
    }
  }
}
