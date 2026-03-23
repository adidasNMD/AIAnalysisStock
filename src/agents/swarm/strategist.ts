import { z } from 'zod';
import { AutonomousAgent } from '../core/agent';
import { NarrativeTopic, ChainMapping, ChainMappingSchema } from '../../models/types';
import { LifecycleEngine } from '../lifecycle/engine';

export class QuantStrategistAgent extends AutonomousAgent {
  private lifecycle = new LifecycleEngine();

  constructor() {
    super({
      role: 'Quant Strategist',
      goal: 'Determine narrative lifecycle transitions and map actionable market tickers.',
      instructions: 'You are an elite quantitative strategist. You track the lifecycle phase of a narrative and map it to core, confirm, and derivative equites or assets.'
    });
  }

  async strategize(topic: NarrativeTopic): Promise<{ topic: NarrativeTopic, mapping: ChainMapping }> {
     // Advance the lifecycle machine
     const updatedTopic = this.lifecycle.evaluateStateTransition(topic, []);

     // Determine map
     const mappingData = await this.executeTask(
         `Map the provided Narrative topic to specific publicly traded US stock tickers or Crypto assets (coreTickers, confirmTickers, mappingTickers). Provide a brief logicDescription.`,
         ChainMappingSchema.omit({ narrativeId: true }),
         `Topic: ${updatedTopic.title}\nDesc: ${updatedTopic.description}\nStage: ${updatedTopic.stage}`
     );

     const mapping: ChainMapping = { ...mappingData, narrativeId: updatedTopic.id };
     
     return { topic: updatedTopic, mapping };
  }
}
