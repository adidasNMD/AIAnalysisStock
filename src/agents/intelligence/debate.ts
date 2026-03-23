import { NarrativeTopic, PerspectiveCard, DebateResult, DebateResultSchema } from '../../models/types';
import { generateStructuredOutput } from '../../utils/llm';

export class DebateAgent {
  /**
   * Collides the bull case vs bear case generated from the 7 factions and yields a final probability
   */
  async executeDebate(topic: NarrativeTopic, cards: PerspectiveCard[]): Promise<DebateResult | null> {
    console.log(`\n[DebateAgent] ⚔️ Arbitrating Clash of Perspectives (${cards.length} views) for: "${topic.title}"`);

    const systemPrompt = `You are the Master Arbitrator of a Wall Street risk council.
You will be provided with a set of conflicting market perspectives regarding a specific narrative.
Your job is to objectively weigh the Bull vs Bear arguments based purely on logical deduction — NO numerical scores or probabilities.
Extract the ultimate 'bullCaseSummary' and 'bearCaseSummary'. Determine 'keyTriggers' (catalysts for breakout) and 'ironcladStopLosses' (conditions that would invalidate the thesis and require immediate exit).
Output in Chinese language.`;

    const perspectiveSummaries = cards.map(c => `[${c.role}]: Thesis=${c.thesis}. Pros: ${c.supportingPoints.join(', ')}. Cons: ${c.riskingPoints.join(', ')}.`).join('\n\n');
    const userPrompt = `System Narrative: ${topic.title} (Impact: ${topic.impactScore})\n\nPerspectives:\n${perspectiveSummaries}`;

    try {
      const result = await generateStructuredOutput(
        DebateResultSchema.omit({ narrativeId: true, timestamp: true }),
        systemPrompt,
        userPrompt
      );

      const finalResult: DebateResult = {
        ...result,
        narrativeId: topic.id,
        timestamp: Date.now()
      };

      console.log(`[DebateAgent] 🏆 Final Verdict Reached.`);
      return finalResult;
    } catch (e: any) {
      console.error('[DebateAgent] Debate arbitration failed:', e.message);
      return null;
    }
  }
}
