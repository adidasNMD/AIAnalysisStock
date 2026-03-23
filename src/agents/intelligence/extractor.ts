import { RawSignal, StructuredEvent, StructuredEventSchema } from '../../models/types';
import { generateStructuredOutput } from '../../utils/llm';
import { v4 as uuidv4 } from 'uuid';

export class EventExtractorAgent {
  /**
   * 将含有噪音的混合多源情报，融合成一个聚焦的高价值结构化事件
   */
  async extractEvent(signals: RawSignal[], topicContext: string): Promise<StructuredEvent | null> {
    if (signals.length === 0) return null;

    console.log(`\n[EventExtractor] 🧠 正在处理 ${signals.length} 条关于 "${topicContext}" 的原始情报...`);

    // 将多条内容拼接作为语料
    const contentPayload = signals.map(s => `[平台: ${s.sourceType}] ${s.content}`).join('\n---\n');

    const systemPrompt = `You are an elite financial intelligence analyst on Wall Street. 
Review the noisy social media and news signals provided below. 
Extract the single most important cohesive event regarding the topic: "${topicContext}".
Evaluate 'novelty' and 'credibility' strictly on a 0-10 scale. If the inputs are pure spam or irrelevant noise, return credibility 0.
Ensure you return all requested JSON structure (title, summary, credibility, novelty, entities array).`;

    const userPrompt = `Raw Signals payload:\n${contentPayload}`;

    try {
      const parsedEvent = await generateStructuredOutput(
        StructuredEventSchema.omit({ id: true, sourceSignalIds: true, timestamp: true }),
        systemPrompt,
        userPrompt
      );

      // 组装最终业务数据
      const result: StructuredEvent = {
        ...parsedEvent,
        id: `ev_${uuidv4()}`,
        sourceSignalIds: signals.map(s => s.id),
        timestamp: Date.now()
      };

      console.log(`[EventExtractor] ✅ 成功抽取事件: "${result.title}" (可信度: ${result.credibility}, 新颖度: ${result.novelty})`);
      return result;

    } catch (e: any) {
      console.error('[EventExtractor] 抽取发生逻辑中断:', e.message);
      return null;
    }
  }
}
