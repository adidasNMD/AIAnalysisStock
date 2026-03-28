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
import * as fs from 'fs';
import * as path from 'path';

function loadInvestorProfile(): string {
  try {
    const profilePath = path.join(process.cwd(), 'investor_profile.md');
    if (fs.existsSync(profilePath)) {
      return fs.readFileSync(profilePath, 'utf-8');
    }
  } catch (e: any) {
    console.error('[SwarmPipeline] ⚠️ 投资者画像加载失败');
  }
  return '';
}

/**
 * AgentSwarmOrchestrator — 蜂群调度中心 (Free-form Thought Flow)
 * 
 * 核心架构：文本接力赛
 * Scout → 情报文本 → Analyst → 事件分析文本 → Strategist → 产业链研报文本 → Council → 辩论报告文本 → Synthesis → 最终研报
 * 
 * 每个 Agent 的纯文本输出直接作为下一个 Agent 的 Context 输入。
 * 任何 Agent 失败都不会阻断 Pipeline — catch 后用上游已有文本继续推进。
 */
export class AgentSwarmOrchestrator {
  private scout = new DataScoutAgent();
  private normalizer = new NormalizerAgent();
  private analyst = new LeadAnalystAgent();
  private strategist = new QuantStrategistAgent();
  private council = new CouncilArbitratorGroup();
  private synthesizer = new SynthesisAgent();

  async executeMission(query: string): Promise<string | null> {
    console.log(`\n======================================================`);
    console.log(`🦅 OPENCLAW V4 SWARM (Free-form Text Flow) ENGAGED: Target [${query}]`);
    console.log(`======================================================\n`);

    const missionId = startMissionTrace(query);

    // 0. 加载投资者画像
    const investorProfile = loadInvestorProfile();
    if (investorProfile) {
      console.log(`[SwarmManager] 🧠 投资者画像已加载 (${investorProfile.length} 字)`);
    }

    // 0.5 加载历史叙事记忆
    const existingNarratives = loadNarratives();
    const relatedNarrative = findRelatedNarrative(query, existingNarratives);
    if (relatedNarrative) {
      console.log(`[SwarmManager] 💾 发现关联历史叙事: "${relatedNarrative.title}" (已追踪 ${relatedNarrative.eventHistory.length} 个事件)`);
    }

    // ====================================================
    // Phase 1: Scout — 多源数据采集 + 情报清洗
    // ====================================================
    let t0 = Date.now();
    const { signals: rawSignals, intelligenceBrief } = await this.scout.scout(query);
    logAgentStep('DataScout', 'scouting', { query }, `${rawSignals.length} signals, ${intelligenceBrief.length} chars brief`, Date.now() - t0, { signalCount: rawSignals.length });

    if (rawSignals.length === 0 && intelligenceBrief.length === 0) {
      console.log('🛑 [SwarmManager] Scout returned no actionable intelligence. Initiating early abort.');
      saveReport(query, `# V4 Execution Aborted\n\nNo actionable intelligence found on the web/social for query: **${query}**`);
      endMissionTrace();
      return null;
    }

    // Phase 1.5: Normalizer — 去重过滤（仍然在 RawSignal 层操作）
    t0 = Date.now();
    const cleanedSignals = await this.normalizer.process(rawSignals);
    logAgentStep('Normalizer', 'dedup_filter', { inputCount: rawSignals.length }, { outputCount: cleanedSignals.length }, Date.now() - t0);

    // 将叙事记忆注入情报上下文
    const narrativeMemory = getNarrativeContext();
    let enrichedBrief = intelligenceBrief;
    if (narrativeMemory) {
      enrichedBrief += `\n\n=== 系统历史叙事记忆 ===\n${narrativeMemory}`;
    }

    // ====================================================
    // Phase 2: Analyst — 事件深度分析
    // ====================================================
    let analysisMemo = '';
    let shouldProceed = true;
    
    t0 = Date.now();
    try {
      const analystResult = await this.analyst.analyze(enrichedBrief, query);
      analysisMemo = analystResult.analysisMemo;
      shouldProceed = analystResult.shouldProceed;
      logAgentStep('LeadAnalyst', 'event_analysis', { briefLength: enrichedBrief.length }, `${analysisMemo.length} chars, proceed=${shouldProceed}`, Date.now() - t0);
    } catch (e: any) {
      console.error(`[SwarmManager] ⚠️ Analyst phase failed: ${e.message}. Using raw intelligence brief as fallback.`);
      analysisMemo = enrichedBrief; // 降级：直接用情报文本
      logAgentStep('LeadAnalyst', 'event_analysis_FALLBACK', { error: e.message }, 'Using raw brief', Date.now() - t0);
    }

    if (!shouldProceed) {
      console.log('🛑 [SwarmManager] Analyst dismissed event. Insufficient novelty/credibility.');
      const abortReport = `# V4 分析中止报告\n\n**搜索目标:** ${query}\n\n## 分析师评估\n\n${analysisMemo}\n\n---\n*分析师判定该事件不具备足够的可信度/新颖度，Pipeline 提前终止。*`;
      saveReport(query, abortReport);
      endMissionTrace();
      return abortReport;
    }

    // ====================================================
    // Phase 3: Strategist — 产业链推导
    // ====================================================
    let strategyReport = '';
    
    t0 = Date.now();
    try {
      strategyReport = await this.strategist.strategize(analysisMemo, investorProfile);
      logAgentStep('QuantStrategist', 'supply_chain_mapping', { memoLength: analysisMemo.length }, `${strategyReport.length} chars`, Date.now() - t0);
    } catch (e: any) {
      console.error(`[SwarmManager] ⚠️ Strategist phase failed: ${e.message}. Continuing with analyst memo.`);
      strategyReport = analysisMemo; // 降级：直接用分析师备忘录
      logAgentStep('QuantStrategist', 'supply_chain_mapping_FALLBACK', { error: e.message }, 'Using analyst memo', Date.now() - t0);
    }

    // ====================================================
    // Phase 4: Council — 多视角辩论
    // ====================================================
    let debateReport = '';
    
    t0 = Date.now();
    try {
      debateReport = await this.council.convene(strategyReport, investorProfile);
      logAgentStep('Council', 'multi_persona_debate', { reportLength: strategyReport.length }, `${debateReport.length} chars`, Date.now() - t0);
    } catch (e: any) {
      console.error(`[SwarmManager] ⚠️ Council phase failed: ${e.message}. Continuing with strategy report.`);
      debateReport = `## ⚖️ 辩论环节异常\n\n> 辩论 Agent 执行失败: ${e.message}\n\n请参考上游策略师的产业链研报进行独立判断。`;
      logAgentStep('Council', 'multi_persona_debate_FALLBACK', { error: e.message }, 'Partial output', Date.now() - t0);
    }

    // ====================================================
    // Phase 5: Synthesis — 最终研报生成
    // ====================================================
    t0 = Date.now();
    let finalReport = '';
    
    try {
      finalReport = await this.synthesizer.synthesize(query, analysisMemo, strategyReport, debateReport, undefined, undefined, investorProfile);
    } catch (e: any) {
      console.error(`[SwarmManager] ⚠️ Synthesis failed: ${e.message}. Assembling raw report.`);
      // 降级：手动拼装原始文本
      finalReport = `# 📈 OpenClaw 深度研报: ${new Date().toISOString().split('T')[0]}\n\n**搜索目标:** ${query}\n\n---\n\n## 📌 事件分析\n\n${analysisMemo}\n\n---\n\n## 🗺️ 产业链研报\n\n${strategyReport}\n\n---\n\n## ⚔️ 多空辩论\n\n${debateReport}\n\n---\n*Generated by OpenClaw Autonomous Intelligence Desk (fallback mode)*`;
    }
    logAgentStep('Synthesis', 'report_generation', { query }, `${finalReport.length} chars`, Date.now() - t0);

    // === 保存 Agent 中间态数据 ===
    try {
      const debugData = {
        query,
        rawSignalCount: rawSignals.length,
        cleanedSignalCount: cleanedSignals.length,
        intelligenceBrief: intelligenceBrief.substring(0, 2000),
        analysisMemo: analysisMemo.substring(0, 2000),
        strategyReport: strategyReport.substring(0, 2000),
        debateReportLength: debateReport.length,
        finalReportLength: finalReport.length,
      };
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0] || '1970-01-01';
      const timeStr = [
        now.getHours().toString().padStart(2, '0'),
        now.getMinutes().toString().padStart(2, '0'),
        now.getSeconds().toString().padStart(2, '0'),
      ].join('-');
      const safeQuery = query.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 30);
      const debugDir = path.join(process.cwd(), 'out', 'debug', dateStr);
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      const debugPath = path.join(debugDir, `${timeStr}_${safeQuery}.json`);
      fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2), 'utf-8');
      console.log(`\n[SwarmManager] 📦 Agent 调试数据已备份至: ${debugPath}`);
    } catch (err: any) {
      console.error(`[SwarmManager] ⚠️ 调试数据写入失败: ${err.message}`);
    }

    saveReport(query, finalReport);

    // 6. 叙事记忆持久化
    if (relatedNarrative) {
      updateNarrative(relatedNarrative.id, {
        eventSummary: query,
        analysisText: strategyReport.substring(0, 3000),
        debateText: debateReport.substring(0, 3000),
      });
    } else {
      createNarrative(query, strategyReport.substring(0, 3000), debateReport.substring(0, 3000));
    }
    
    // 7. 保存全链路追踪
    endMissionTrace();

    // 8. Telegram Push
    try {
      const memoryTag = relatedNarrative ? `♻️ 已更新叙事 (第${relatedNarrative.eventHistory.length + 1}次追踪)` : '🆕 新建叙事';
      // 从最终报告中截取摘要发送
      const summary = `📊 *${query}*\n${memoryTag}\n\n${finalReport.substring(0, 500).replace(/[*_`]/g, '')}...`;
      await sendReportSummary(query, summary);
    } catch (e: any) {
      console.error(`[SwarmManager] Telegram push failed: ${e.message}`);
    }

    console.log(`\n[SwarmManager] 🎉 Mission Accomplished. Pipeline fully resolved.`);
    
    return finalReport;
  }
}
