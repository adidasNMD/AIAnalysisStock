import { DataScoutAgent } from '../agents/swarm/scout';
import { LeadAnalystAgent } from '../agents/swarm/analyst';
import { QuantStrategistAgent } from '../agents/swarm/strategist';
import { CouncilArbitratorGroup } from '../agents/swarm/council';
import { SynthesisAgent } from '../agents/intelligence/synthesis';
import { saveReport } from '../utils/storage';

export class AgentSwarmOrchestrator {
  private scout = new DataScoutAgent();
  private analyst = new LeadAnalystAgent();
  private strategist = new QuantStrategistAgent();
  private council = new CouncilArbitratorGroup();
  private synthesizer = new SynthesisAgent();

  async executeMission(query: string): Promise<string | null> {
    console.log(`\n======================================================`);
    console.log(`🦅 OPENCLAW V2 SWARM ENGAGED: Target [${query}]`);
    console.log(`======================================================\n`);

    // 1. Scout Phase (Tool Calling Vanguard)
    const rawIntel = await this.scout.scout(query);
    if (!rawIntel || rawIntel.length === 0) {
      console.log('🛑 [SwarmManager] Scout returned no actionable intelligence. Initiating early abort.');
      saveReport(query, `# V2 Execution Aborted\n\nNo actionable intelligence found on the web/social for query: **${query}**`);
      return null;
    }

    // 2. Analyst Phase (Zod Event Parsing)
    const { event, topic } = await this.analyst.processSignals(rawIntel, query);
    if (!topic) {
      console.log('🛑 [SwarmManager] Analyst dismissed event. Insufficient novelty/credibility. Initiating early abort.');
      saveReport(query, `# V2 Execution Aborted\n\nEvent discovered but discarded by Lead Analyst for lacking structural novelty/credibility.\n\n**Filtered Event Details:**\n- Title: ${event.title}\n- Summary: ${event.summary}\n- Credibility Score: ${event.credibility}/10`);
      return null;
    }

    // 3. Strategist Phase (Lifecycle State Machine & Graph mapping)
    const { topic: updatedTopic, mapping } = await this.strategist.strategize(topic);

    // 4. Council Arbitration Phase (Concurrent 7 Persona Swarm)
    const { cards, result: debateResult } = await this.council.convene(updatedTopic);

    // 5. Synthesis & Hard Drive Archival
    const reportMarkdown = this.synthesizer.generateDailyBrief(updatedTopic, mapping, debateResult);
    
    // Append the individual agent swarm logs
    const swarmAppendix = cards.map(c => `#### Role Persona: ${c.role}\n- **Sentiment:** ${c.sentimentScore}/10\n- **Thesis:** ${c.thesis}`).join('\n\n');
    const finalReport = `${reportMarkdown}\n\n## 👥 Multi-Agent Council Testimonies\n\n${swarmAppendix}`;

    saveReport(query, finalReport);
    console.log(`\n[SwarmManager] 🎉 Mission Accomplished. Pipeline fully resolved.`);
    
    return finalReport;
  }
}
