import { RawSignal } from '../../models/types';
import { generateTextCompletion } from '../../utils/llm';

/**
 * EventExtractorAgent — 事件提取器 (Free-form Text Flow 版本)
 * 
 * 从混合多源情报中提取核心事件的文本摘要
 */
export class EventExtractorAgent {
  async extractEvent(signals: RawSignal[], topicContext: string): Promise<string | null> {
    if (signals.length === 0) return null;

    console.log(`\n[EventExtractor] 🧠 正在处理 ${signals.length} 条关于 "${topicContext}" 的原始情报...`);

    const contentPayload = signals.map(s => `[平台: ${s.sourceType}] ${s.content}`).join('\n---\n');

    const systemPrompt = `你是一个精锐的金融情报分析员。
从多源的噪声信号中提取最核心的、可能影响市场的单一事件。
评估其可信度和新颖度。如果全是噪音，明确说明。
所有输出使用中文。`;

    const userPrompt = `主题: "${topicContext}"\n\n原始情报:\n${contentPayload}`;

    try {
      const summary = await generateTextCompletion(systemPrompt, userPrompt);
      console.log(`[EventExtractor] ✅ 事件摘要提取完成 (${summary.length} 字)`);
      return summary;
    } catch (e: any) {
      console.error('[EventExtractor] 提取失败:', e.message);
      return null;
    }
  }
}
