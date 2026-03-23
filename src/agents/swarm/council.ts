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
            instructions: `Provide 2-3 strong supporting points and risking points. Assign a sentiment score from -10 to +10.`
        });
        const card = await agent.executeTask(
            `Generate your perspective thesis on this narrative.`,
            PerspectiveCardSchema,
             `Topic: ${topic.title}\nDesc: ${topic.description}\nStage: ${topic.stage}`
        );
        card.role = roleStr as any;
        return card; // Implicitly validated
    });

    const cards = await Promise.all(promises);

    // Arbitrator reviews
    const arbitrator = new AutonomousAgent({
        role: 'Master Arbitrator',
        goal: 'Weigh Bull vs Bear arguments and compute final bullProbability.',
        instructions: 'Remain highly objective. Synthesize all perspectives into final Bull vs Bear cases and stop-loss invalidations.'
    });

    const perspectiveSummaries = cards.map(c => `[${c.role}]: Sentiment=${c.sentimentScore}/10. Thesis=${c.thesis}. Pros: ${c.supportingPoints.join(', ')}. Cons: ${c.riskingPoints.join(', ')}.`).join('\n\n');
    
    console.log(`\n[CouncilArbitrator] ⚖️ Submitting testimonies to Arbitrator...`);
    const debateData = await arbitrator.executeTask(
        `Determine the ultimate bullProbability, multi-catalyst triggers, and bearInvalidation stops.`,
        DebateResultSchema.omit({ narrativeId: true, timestamp: true }),
        `Master Topic: ${topic.title}\n\nPerspectives Testimony:\n${perspectiveSummaries}`
    );

    const result: DebateResult = { ...debateData, narrativeId: topic.id, timestamp: Date.now() };
    console.log(`[CouncilArbitrator] 🏆 Final Verdict Reached. Probability: ${result.bullProbability}%`);

    return { cards, result };
  }
}
