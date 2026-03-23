import { z } from 'zod';
import { NarrativeTopic, PerspectiveCard, PerspectiveCardSchema, RoleEnum } from '../../models/types';
import { generateStructuredOutput } from '../../utils/llm';

export class PerspectivesAgent {
  /**
   * Generates a fully formed PerspectiveCard acting as one of 7 market factions.
   */
  async analyzeFromRole(topic: NarrativeTopic, roleStr: string): Promise<PerspectiveCard | null> {
    console.log(`\n[PerspectivesAgent] 🎭 Adopting Market Persona: [${roleStr}]`);

    const systemPrompt = `You are assuming the persona of a highly critical Wall Street participant: "${roleStr}".
Focus strictly on your specific domain:
- technicalRetail: Focuses on charts, breakouts, liquidity, moving averages.
- emotionalRetail: Focuses on WSB hype, FOMO, short squeezes.
- institutional: Earnings growth, macro landscape, institutional ownership, valuation multiples.
- shortSeller: Looks aggressively for fraud, overvaluation, insider selling, hype deflating.
- macroEconomist: Focuses on rates, Fed policy, currency, supply chain macro.
- valueInvestor: Focuses on free cash flow, moat, balance sheet health.
- quant: Looks at momentum factors, stat-arb, systematic flows.

Evaluate the following narrative and return a strictly structured PerspectiveCard representing this persona's thesis. Make sure the outputs strictly match your role. Provide 2-3 strong supportingPoints and riskingPoints each. Sentiment is from -10 (extreme short) to +10 (extreme long).`;

    const userPrompt = `Narrative Topic: ${topic.title}\nDescription: ${topic.description}\nCurrent Stage: ${topic.stage}`;

    try {
      const card = await generateStructuredOutput(
        PerspectiveCardSchema,
        systemPrompt,
        userPrompt
      );

      // Forcefully assign the requested role
      card.role = roleStr as any;
      console.log(`[PerspectivesAgent] ✅ [${roleStr}] generated thesis (Sentiment: ${card.sentimentScore}): "${card.thesis.substring(0, 50)}..."`);
      return card;
    } catch (e: any) {
      console.error(`[PerspectivesAgent] Failed to generate card for ${roleStr}:`, e.message);
      return null;
    }
  }

  /**
   * Convenes the full council of perspectives.
   */
  async generateAllPerspectives(topic: NarrativeTopic): Promise<PerspectiveCard[]> {
    const roles = RoleEnum.options;
    const cards = await Promise.all(roles.map(r => this.analyzeFromRole(topic, r)));
    return cards.filter((c): c is PerspectiveCard => c !== null);
  }
}
