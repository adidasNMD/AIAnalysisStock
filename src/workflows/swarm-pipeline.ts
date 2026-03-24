import { DataScoutAgent } from '../agents/swarm/scout';
import { LeadAnalystAgent } from '../agents/swarm/analyst';
import { QuantStrategistAgent } from '../agents/swarm/strategist';
import { CouncilArbitratorGroup } from '../agents/swarm/council';
import { NormalizerAgent } from '../agents/normalizer/index';
import { SynthesisAgent } from '../agents/intelligence/synthesis';
import { saveReport } from '../utils/storage';
import { sendReportSummary } from '../utils/telegram';
import { loadNarratives, findRelatedNarrative, createNarrative, updateNarrative, getNarrativeContext } from '../utils/narrative-store';
import { startMissionTrace, logAgentStep, endMissionTrace } from '../utils/agent-logger';

export class AgentSwarmOrchestrator {
  private scout = new DataScoutAgent();
  private normalizer = new NormalizerAgent();
  private analyst = new LeadAnalystAgent();
  private strategist = new QuantStrategistAgent();
  private council = new CouncilArbitratorGroup();
  private synthesizer = new SynthesisAgent();

  async executeMission(query: string): Promise<string | null> {
    console.log(`\n======================================================`);
    console.log(`🦅 OPENCLAW V4 SWARM ENGAGED: Target [${query}]`);
    console.log(`======================================================\n`);

    // 启动全链路追踪
    const missionId = startMissionTrace(query);

    // 0. 加载历史叙事记忆
    const existingNarratives = loadNarratives();
    const relatedNarrative = findRelatedNarrative(query, existingNarratives);
    if (relatedNarrative) {
      console.log(`[SwarmManager] 💾 发现关联历史叙事: "${relatedNarrative.title}" (已追踪 ${relatedNarrative.eventHistory.length} 个事件)`);
    }

    // 1. Scout Phase (Tool Calling Vanguard — Reddit + Desearch + Firecrawl)
    let t0 = Date.now();
    const rawIntel = await this.scout.scout(query);
    logAgentStep('DataScout', 'scouting', { query }, rawIntel, Date.now() - t0, { signalCount: rawIntel?.length || 0 });

    if (!rawIntel || rawIntel.length === 0) {
      console.log('🛑 [SwarmManager] Scout returned no actionable intelligence. Initiating early abort.');
      saveReport(query, `# V4 Execution Aborted\n\nNo actionable intelligence found on the web/social for query: **${query}**`);
      endMissionTrace();
      return null;
    }

    // 1.5 Normalizer Phase — 去重 + 短文本过滤
    t0 = Date.now();
    const cleanedIntel = await this.normalizer.process(rawIntel);
    logAgentStep('Normalizer', 'dedup_filter', { inputCount: rawIntel.length }, { outputCount: cleanedIntel.length }, Date.now() - t0);

    if (cleanedIntel.length === 0) {
      console.log('🛑 [SwarmManager] All signals filtered out by Normalizer. Aborting.');
      endMissionTrace();
      return null;
    }

    // 2. Analyst Phase — 注入历史叙事上下文
    const narrativeMemory = getNarrativeContext();
    if (narrativeMemory) {
      cleanedIntel.push({
        id: `memory_${Date.now()}`,
        sourceType: 'internal_memory',
        content: `[系统记忆] 以下是之前追踪的相关叙事:\n${narrativeMemory}`,
        timestamp: Date.now(),
        author: 'NarrativeStore',
        url: ''
      });
    }

    t0 = Date.now();
    const { event, topic } = await this.analyst.processSignals(cleanedIntel, query);
    logAgentStep('LeadAnalyst', 'signal_evaluation', { signalCount: cleanedIntel.length, query }, { event, topic: topic || 'DISMISSED' }, Date.now() - t0, {
      credibility: event.credibility,
      novelty: event.novelty,
      accepted: !!topic,
    });

    if (!topic) {
      console.log('🛑 [SwarmManager] Analyst dismissed event. Insufficient novelty/credibility. Initiating early abort.');
      saveReport(query, `# V4 Execution Aborted\n\nEvent discovered but discarded by Lead Analyst for lacking structural novelty/credibility.\n\n**Filtered Event Details:**\n- Title: ${event.title}\n- Summary: ${event.summary}\n- Credibility Score: ${event.credibility}/10`);
      endMissionTrace();
      return null;
    }

    // 3. Strategist Phase (Knowledge-enhanced Supply Chain Mapping)
    t0 = Date.now();
    const { topic: updatedTopic, mapping } = await this.strategist.strategize(topic);
    logAgentStep('QuantStrategist', 'supply_chain_mapping', { topic }, { mapping }, Date.now() - t0, {
      coreTickers: mapping.coreTickers,
      mappingTickers: mapping.mappingTickers,
    });

    // 4. Council Arbitration Phase (Concurrent 7 Persona Swarm)
    t0 = Date.now();
    const { cards, result: debateResult } = await this.council.convene(updatedTopic);
    logAgentStep('Council', 'multi_persona_debate', { topic: updatedTopic.title }, { cards, debateResult }, Date.now() - t0, {
      perspectives: cards.length,
      keyTriggers: debateResult.keyTriggers,
      stopLosses: debateResult.ironcladStopLosses,
    });

    // 5. Synthesis & Hard Drive Archival
    t0 = Date.now();
    const reportMarkdown = this.synthesizer.generateDailyBrief(updatedTopic, mapping, debateResult);
    
    // 完整的 Council 证词（包含每个角色的论据和风险点）
    const swarmAppendix = cards.map(c => {
      let section = `#### 🎭 ${c.role}\n`;
      section += `**核心论点:** ${c.thesis}\n\n`;
      if (c.supportingPoints && c.supportingPoints.length > 0) {
        section += `**支撑论据:**\n`;
        c.supportingPoints.forEach(p => section += `- ✅ ${p}\n`);
      }
      if (c.riskingPoints && c.riskingPoints.length > 0) {
        section += `\n**风险/反方:**\n`;
        c.riskingPoints.forEach(p => section += `- ⚠️ ${p}\n`);
      }
      return section;
    }).join('\n\n');

    const finalReport = `${reportMarkdown}\n\n## 👥 Multi-Agent Council — 完整证词\n\n${swarmAppendix}`;

    saveReport(query, finalReport);
    logAgentStep('Synthesis', 'report_generation', { topic: updatedTopic.title }, { reportLength: finalReport.length }, Date.now() - t0);

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
    
    // 7. 保存全链路追踪
    endMissionTrace();

    // 8. Telegram Push Delivery
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

