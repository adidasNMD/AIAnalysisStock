import { StructuredEvent, NarrativeTopic, NarrativeTopicSchema } from '../../models/types';
import { generateStructuredOutput } from '../../utils/llm';
import { v4 as uuidv4 } from 'uuid';

export class EarlyDiscoveryAgent {
  /**
   * 判断单一事件是否具备极高的裂变潜质，以至于需要为其独立开辟一个「叙事生命周期」主题
   */
  async evaluateEvent(event: StructuredEvent): Promise<NarrativeTopic | null> {
    // 1. 初步置信度与新颖度过滤 (节约开销)
    if (event.credibility < 6 || event.novelty < 7) {
      console.log(`[DiscoveryAgent] ⏭️ 事件 "${event.title}" 深度不足，忽略创立叙事档案 (C:${event.credibility}, N:${event.novelty}).`);
      return null;
    }

    console.log(`\n[DiscoveryAgent] 🔭 捕获到高价值突变事件！正在研判是否符合新叙事档案标准: ${event.title}`);

    const systemPrompt = `You are the Early Narrative Discovery Engine for an elite macro hedge fund.
Read the event and formulate a comprehensive new 'NarrativeTopic'.
The lifecycle 'stage' MUST be either 'discovery' (早期发现) or 'earlyFermentation' (早期发酵) unless the event explicitly indicates mass market consensus.
Evaluate the 'impactScore' (0-100) reflecting potential macroeconomic or sector capitalization impact.`;

    const userPrompt = `Event Title: ${event.title}\nEvent Summary: ${event.summary}\nEntities Involved: ${event.entities.join(', ')}`;

    try {
      // 允许 LLM 直接生成缺少 id 和时间戳的主干字段
      const parsedTopic = await generateStructuredOutput(
        NarrativeTopicSchema.omit({ id: true, relatedEventIds: true, createdAt: true, updatedAt: true }),
        systemPrompt,
        userPrompt
      );

      // 组装成为合法的实体
      const result: NarrativeTopic = {
        ...parsedTopic,
        id: `topic_${uuidv4()}`,
        relatedEventIds: [event.id],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      console.log(`[DiscoveryAgent] 🚀 建立新叙事档案成功！[位于: ${result.stage}] ${result.title} (波及潜力: ${result.impactScore})`);
      return result;

    } catch (e: any) {
      console.error('[DiscoveryAgent] 研判过程发生逻辑中断:', e.message);
      return null;
    }
  }
}
