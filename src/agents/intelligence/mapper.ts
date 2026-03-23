import { NarrativeTopic, ChainMapping, ChainMappingSchema } from '../../models/types';
import { generateStructuredOutput } from '../../utils/llm';

export class ChainMappingEngine {
  /**
   * Connects a narrative topic with actionable market tickers (Core, Confirm, Mapping)
   */
  async mapTickers(topic: NarrativeTopic): Promise<ChainMapping | null> {
    console.log(`\n[MappingEngine] 🗺️ Initiating Chain Mapping for Narrative: "${topic.title}"`);

    const systemPrompt = `You are a top-tier Wall Street quantitative researcher.
Map the provided Narrative topic to specific publicly traded US stock tickers.
Categorize them strictly as follows:
- coreTickers (1-3): The most direct and immediate multi-bagger beneficiaries of this narrative.
- confirmTickers (1-3): Large cap/sector leaders whose performance will confirm or deny the narrative momentum.
- mappingTickers (2-5): Secondary derivatives, upstream suppliers, or downstream laggards offering elastic upside.
Also formulate a brief rigorous logicDescription of why these tickers form the chain.`;

    const userPrompt = `Narrative Topic: ${topic.title}\nDescription: ${topic.description}\nCurrent Stage: ${topic.stage}\nScore: ${topic.impactScore}`;

    try {
      const mapping = await generateStructuredOutput(
        ChainMappingSchema.omit({ narrativeId: true }),
        systemPrompt,
        userPrompt
      );

      const result: ChainMapping = {
        ...mapping,
        narrativeId: topic.id
      };

      console.log(`[MappingEngine] ✅ Mapping Complete.`);
      console.log(`  - Core Tickers: ${result.coreTickers.join(', ')}`);
      console.log(`  - Confirm Tickers: ${result.confirmTickers.join(', ')}`);
      console.log(`  - Derivative Mapping: ${result.mappingTickers.join(', ')}`);
      
      return result;
    } catch (e: any) {
      console.error('[MappingEngine] Failed to extract ticker mapping:', e.message);
      return null;
    }
  }
}
