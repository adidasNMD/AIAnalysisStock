import { z } from 'zod';
import { AutonomousAgent } from '../core/agent';
import { NarrativeTopic, PerspectiveCard, PerspectiveCardSchema, DebateResult, DebateResultSchema, RoleEnum } from '../../models/types';

export class CouncilArbitratorGroup {
  async convene(topic: NarrativeTopic): Promise<{ cards: PerspectiveCard[], result: DebateResult }> {
    const roles = RoleEnum.options;
    
    console.log(`\n[CouncilArbitrator] ⚖️ Convening the high council Swarm (${roles.length} agents) for topic: ${topic.title}`);

    // Concurrently trigger 7 micro-agent personas
    const promises = roles.map(async roleStr => {
        const agent = new AutonomousAgent({
            role: roleStr,
            goal: `Analyze the narrative strictly as a ${roleStr}.`,
            instructions: `IMPORTANT: YOU MUST BE EXTREMELY DETAILED. Provide a deep, multi-paragraph thesis. List 4-5 extensively detailed supporting points and 4-5 risking points with deep logical reasoning. Output in Chinese language. Do NOT provide any subjective numerical scores, only hard logistical verification.`
        });
        const card = await agent.executeTask(
            `Generate your perspective thesis on this narrative.`,
            PerspectiveCardSchema,
             `Topic: ${topic.title}\nDesc: ${topic.description}`
        );
        card.role = roleStr as any;
        return card; // Implicitly validated
    });

    const cards = await Promise.all(promises);

    // Arbitrator reviews
    const arbitrator = new AutonomousAgent({
        role: 'Master Arbitrator',
        goal: 'Weigh Bull vs Bear arguments purely on indisputable factual/logical deduction.',
        instructions: 'Remain highly objective. Write an extremely detailed, compelling, and lengthy macro/micro synthesis for both Bull and Bear cases based on testimonies. Output in Chinese language. Detail exact multi-step ironclad stop-losses.'
    });

    const perspectiveSummaries = cards.map(c => `[${c.role}]: Thesis=${c.thesis}. Pros: ${c.supportingPoints.join(', ')}. Cons: ${c.riskingPoints.join(', ')}.`).join('\n\n');
    
    console.log(`\n[CouncilArbitrator] ⚖️ Submitting testimonies to Arbitrator...`);
    const debateData = await arbitrator.executeTask(
        `Determine the ultimate bullCaseSummary, bearCaseSummary, keyTriggers, and ironcladStopLosses.`,
        DebateResultSchema.omit({ narrativeId: true, timestamp: true }),
        `Master Topic: ${topic.title}\n\nPerspectives Testimony:\n${perspectiveSummaries}`
    );

    const result: DebateResult = { ...debateData, narrativeId: topic.id, timestamp: Date.now() };
    console.log(`[CouncilArbitrator] 🏆 Final Verification Reached.`);

    return { cards, result };
  }
}
