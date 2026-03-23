import { NarrativeTopic, NarrativeStage, StructuredEvent } from '../../models/types';

export class LifecycleEngine {
  /**
   * Evaluate a NarrativeTopic based on incoming new StructuredEvents
   * and decide if the narrative stage needs to be upgraded or downgraded.
   */
  public evaluateStateTransition(topic: NarrativeTopic, newEvents: StructuredEvent[]): NarrativeTopic {
    if (!newEvents.length) return topic;

    console.log(`\n[LifecycleEngine] ♻️ Evaluating Lifecycle for Narrative: "${topic.title}"`);
    console.log(`[LifecycleEngine] Current Stage: ${topic.stage} | New Events: ${newEvents.length}`);

    let updatedImpactScore = topic.impactScore;
    let nextStage: NarrativeStage = topic.stage;

    // A simple heuristic rule engine for MVP
    // Upgrade paths
    if (topic.stage === 'discovery') {
      if (newEvents.length >= 2 || newEvents.some(e => e.credibility >= 8)) {
        nextStage = 'earlyFermentation';
      }
    } else if (topic.stage === 'earlyFermentation') {
      if (newEvents.length >= 5 || newEvents.some(e => e.credibility > 8)) {
        nextStage = 'mainExpansion';
        updatedImpactScore += 20;
      }
    } else if (topic.stage === 'mainExpansion') {
      if (newEvents.length >= 10) {
        nextStage = 'peakFrenzy';
        updatedImpactScore += 30;
      }
    }

    // Downgrade paths (Mock logic based on lack of credibility or conflicting events)
    const lowCredibilityEvents = newEvents.filter(e => e.credibility < 4);
    if (lowCredibilityEvents.length > 3) {
      if (nextStage !== 'discovery' && nextStage !== 'earlyFermentation') {
        nextStage = 'divergence';
      } else {
         nextStage = 'terminal'; // Early failure
      }
      updatedImpactScore -= 15;
    }

    // Ensure within bounds
    updatedImpactScore = Math.min(100, Math.max(0, updatedImpactScore));

    const updatedTopic: NarrativeTopic = {
      ...topic,
      stage: nextStage,
      impactScore: updatedImpactScore,
      relatedEventIds: [...new Set([...topic.relatedEventIds, ...newEvents.map(e => e.id)])],
      updatedAt: Date.now()
    };

    if (updatedTopic.stage !== topic.stage) {
      console.log(`[LifecycleEngine] 🚨 STAGE TRANSITION: ${topic.stage} ➔ ${updatedTopic.stage}`);
    } else {
      console.log(`[LifecycleEngine] 稳态维持: Stage remains ${topic.stage}`);
    }

    return updatedTopic;
  }
}
