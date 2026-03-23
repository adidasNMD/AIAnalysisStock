import { z } from 'zod';
import { AutonomousAgent } from '../core/agent';
import { RawSignal, StructuredEvent, StructuredEventSchema, NarrativeTopic, NarrativeTopicSchema } from '../../models/types';

export class LeadAnalystAgent extends AutonomousAgent {
  constructor() {
    super({
      role: 'Lead Market Analyst',
      goal: 'Synthesize raw scout signals into Structured Events and identify overarching Narrative Topics.',
      instructions: 'You are a senior hedge fund analyst. You evaluate raw intel, score its credibility, and decide if it forms a new trading narrative.'
    });
  }

  async processSignals(signals: RawSignal[], query: string): Promise<{ event: StructuredEvent, topic: NarrativeTopic | null }> {
    const context = signals.map(s => `- ${s.content}`).join('\n');
    
    // 1. Extract Event
    const event = await this.executeTask(
      `Extract the core market moving event from the incoming signals. Evaluate credibility (0-10) and novelty (0-10). Target query was: "${query}"`,
      StructuredEventSchema.omit({ id: true, timestamp: true }),
      context
    );
    
    const structuredEvent: StructuredEvent = {
        ...event,
        id: `ev_${Date.now()}`,
        timestamp: Date.now()
    };

    // 2. Discover Topic
    let topic: NarrativeTopic | null = null;
    if (structuredEvent.credibility > 5 && structuredEvent.novelty > 5) {
       console.log(`[LeadAnalyst] 🧠 Event deemed highly credible/novel. Establishing new Narrative Topic.`);
       const newTopic = await this.executeTask(
           `The event has high credibility and novelty. Generate a comprehensive Narrative Topic outlining the core ecosystem flow.`,
           NarrativeTopicSchema.omit({ id: true, relatedEventIds: true, createdAt: true, updatedAt: true }),
           `Event Title: ${structuredEvent.title}\nDesc: ${structuredEvent.summary}`
       );
       topic = { ...newTopic, id: `topic_${Date.now()}`, relatedEventIds: [structuredEvent.id], createdAt: Date.now(), updatedAt: Date.now() };
    } else {
       console.log(`[LeadAnalyst] 🛑 Event discarded: Lacks required credibility or novelty score to form a narrative.`);
    }

    return { event: structuredEvent, topic };
  }
}
