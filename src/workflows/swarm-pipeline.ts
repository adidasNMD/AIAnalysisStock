import { DataScoutAgent } from '../agents/swarm/scout';
import { LeadAnalystAgent } from '../agents/swarm/analyst';
import { QuantStrategistAgent } from '../agents/swarm/strategist';
import { CouncilArbitratorGroup } from '../agents/swarm/council';
import { SynthesisAgent } from '../agents/intelligence/synthesis';
import { saveReport } from '../utils/storage';
import { sendReportSummary } from '../utils/telegram';
import { loadNarratives, findRelatedNarrative, createNarrative, updateNarrative, getNarrativeContext } from '../utils/narrative-store';

export class AgentSwarmOrchestrator {
  private scout = new DataScoutAgent();
  private analyst = new LeadAnalystAgent();
  private strategist = new QuantStrategistAgent();
  private council = new CouncilArbitratorGroup();
  private synthesizer = new SynthesisAgent();

  async executeMission(query: string): Promise<string | null> {
    console.log(`\n======================================================`);
    console.log(`🦅 OPENCLAW V4 SWARM ENGAGED: Target [${query}]`);
    console.log(`======================================================\n`);

    // 0. 加载历史叙事记忆
    const existingNarratives = loadNarratives();
    const relatedNarrative = findRelatedNarrative(query, existingNarratives);
    if (relatedNarrative) {
      console.log(`[SwarmManager] 💾 发现关联历史叙事: "${relatedNarrative.title}" (已追踪 ${relatedNarrative.eventHistory.length} 个事件)`);
    }

    // 1. Scout Phase (Tool Calling Vanguard)
    const rawIntel = await this.scout.scout(query);
    if (!rawIntel || rawIntel.length === 0) {
      console.log('🛑 [SwarmManager] Scout returned no actionable intelligence. Initiating early abort.');
      saveReport(query, `# V4 Execution Aborted\n\nNo actionable intelligence found on the web/social for query: **${query}**`);
      return null;
    }

    // 2. Analyst Phase — 注入历史叙事上下文
    const narrativeMemory = getNarrativeContext();
    if (narrativeMemory) {
      // 将历史叙事作为额外上下文注入
      rawIntel.push({
        id: `memory_${Date.now()}`,
        sourceType: 'internal_memory',
        content: `[系统记忆] 以下是之前追踪的相关叙事:\n${narrativeMemory}`,
        timestamp: Date.now(),
        author: 'NarrativeStore',
        url: ''
      });
    }

    const { event, topic } = await this.analyst.processSignals(rawIntel, query);
    if (!topic) {
      console.log('🛑 [SwarmManager] Analyst dismissed event. Insufficient novelty/credibility. Initiating early abort.');
      saveReport(query, `# V4 Execution Aborted\n\nEvent discovered but discarded by Lead Analyst for lacking structural novelty/credibility.\n\n**Filtered Event Details:**\n- Title: ${event.title}\n- Summary: ${event.summary}\n- Credibility Score: ${event.credibility}/10`);
      return null;
    }

    // 3. Strategist Phase (Knowledge-enhanced Supply Chain Mapping)
    const { topic: updatedTopic, mapping } = await this.strategist.strategize(topic);

    // 4. Council Arbitration Phase (Concurrent 7 Persona Swarm)
    const { cards, result: debateResult } = await this.council.convene(updatedTopic);

    // 5. Synthesis & Hard Drive Archival
    const reportMarkdown = this.synthesizer.generateDailyBrief(updatedTopic, mapping, debateResult);
    
    // Append the individual agent swarm logs
    const swarmAppendix = cards.map(c => `#### Role Persona: ${c.role}\n- **Thesis:** ${c.thesis}`).join('\n\n');
    const finalReport = `${reportMarkdown}\n\n## 👥 Multi-Agent Council Testimonies\n\n${swarmAppendix}`;

    saveReport(query, finalReport);

    // 6. 叙事记忆持久化 — 创建或增量更新
    if (relatedNarrative) {
      updateNarrative(relatedNarrative.id, {
        eventSummary: event.title,
        impactScore: updatedTopic.impactScore,
        mapping,
        debate: debateResult
      });
    } else {
      createNarrative(updatedTopic, mapping, debateResult);
    }
    
    // 7. Telegram Push Delivery
    try {
      const memoryTag = relatedNarrative ? `♻️ 已更新叙事 (第${relatedNarrative.eventHistory.length + 1}次追踪)` : '🆕 新建叙事';
      const summary = `📊 *${updatedTopic.title}*\n${memoryTag}\n\n🎯 核心标的: ${mapping.coreTickers.join(', ')}\n🔍 跟踪标的: ${mapping.mappingTickers.join(', ')}\n\n💡 ${mapping.logicDescription?.substring(0, 200) || ''}`;
      await sendReportSummary(updatedTopic.title, summary);
    } catch (e: any) {
      console.error(`[SwarmManager] Telegram push failed: ${e.message}`);
    }

    console.log(`\n[SwarmManager] 🎉 Mission Accomplished. Pipeline fully resolved.`);
    
    return finalReport;
  }
}
