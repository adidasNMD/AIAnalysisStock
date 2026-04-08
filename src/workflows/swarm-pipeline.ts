import { DataScoutAgent } from '../agents/swarm/scout';
import { LeadAnalystAgent } from '../agents/swarm/analyst';
import { QuantStrategistAgent } from '../agents/swarm/strategist';
import { CouncilArbitratorGroup } from '../agents/swarm/council';
import { NormalizerAgent } from '../agents/normalizer/index';
import { SynthesisAgent } from '../agents/intelligence/synthesis';
import { saveReport } from '../utils/storage';
import { sendReportSummary } from '../utils/telegram';
import { validateTradeDecision } from '../utils/report-validator';
import { loadNarratives, findRelatedNarrative, createNarrative, updateNarrative, getNarrativeContext } from '../utils/narrative-store';
import { startMissionTrace, logAgentStep, endMissionTrace } from '../utils/agent-logger';
import {
  type AnalysisDepth,
  type AgentHandoff,
  type PipelineResult,
  createHandoff,
  createDegradedHandoff,
  extractTickers,
} from '../models/handoff';
import * as fs from 'fs';
import * as path from 'path';

export interface SwarmState {
  completedPhases: string[];
  intelligenceBrief: string;
  analysisMemo: string;
  strategyReport: string;
  debateReport: string;
  handoffs: AgentHandoff[];
  rawSignals?: any[];
  enrichedBrief?: string;
}
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

const DEPTH_LABELS: Record<AnalysisDepth, string> = {
  quick: '⚡ 快速扫描 (Scout → Analyst → 快速报告)',
  standard: '📊 标准分析 (Scout → Analyst → Strategist → Synthesis)',
  deep: '🔬 深度研究 (Scout → Analyst → Strategist → Council → Synthesis)',
};

/**
 * AgentSwarmOrchestrator — 蜂群调度中心 (Free-form Thought Flow)
 * 
 * 核心架构：文本接力赛 + AgentHandoff 结构化握手协议
 * 
 * 分级分析策略：
 * - quick:    Scout → Analyst → 快速报告           (2 次 LLM, 适用于 T1 价量异动)
 * - standard: Scout → Analyst → Strategist → Synthesis (4 次 LLM, 适用于 T2 事件源)
 * - deep:     完整 Pipeline + Council 多人格辩论     (10+ 次 LLM, 适用于 T3 日报/交互)
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

  /**
   * 执行分析任务
   * @param query 搜索目标
   * @param depth 分析深度 (默认 'deep' 保持向后兼容)
   */
  async executeMission(
    query: string, 
    depth: AnalysisDepth = 'deep',
    initialState?: SwarmState | null,
    saveState?: (state: SwarmState) => Promise<void>,
    onProgress?: (step: 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis') => void,
    checkCanceled?: () => Promise<boolean>,
    explicitMissionId?: string
  ): Promise<string | null> {
    console.log(`\n======================================================`);
    console.log(`🦅 OPENCLAW V4 SWARM (Free-form Text Flow) ENGAGED: Target [${query}]`);
    console.log(`📐 分析深度: ${DEPTH_LABELS[depth]}`);
    console.log(`======================================================\n`);

    const pipelineStart = Date.now();
    
    // --- State Initialization ---
    const completedPhases = initialState?.completedPhases || [];
    const handoffs: AgentHandoff[] = initialState?.handoffs || [];
    let intelligenceBrief = initialState?.intelligenceBrief || '';
    let analysisMemo = initialState?.analysisMemo || '';
    let strategyReport = initialState?.strategyReport || '';
    let debateReport = initialState?.debateReport || '';
    let rawSignals: any[] = initialState?.rawSignals || [];
    let enrichedBrief = initialState?.enrichedBrief || '';

    if (completedPhases.length > 0) {
      console.log(`[SwarmManager] 🔄 从中断状态恢复任务！已跳过阶段: ${completedPhases.join(', ')}`);
    }

    const missionId = startMissionTrace(query, explicitMissionId);

    // 0. 加载投资者画像
    const investorProfile = loadInvestorProfile();
    if (investorProfile) {
      console.log(`[SwarmManager] 🧠 投资者画像已加载 (${investorProfile.length} 字)`);
    }

    // 0.5 加载历史叙事记忆
    const existingNarratives = await loadNarratives();
    const relatedNarrative = await findRelatedNarrative(query);
    if (relatedNarrative) {
      console.log(`[SwarmManager] 💾 发现关联历史叙事: "${relatedNarrative.title}" (已追踪 ${relatedNarrative.eventHistory.length} 个事件)`);
    }

    // ====================================================
    // Phase 1: Scout — 多源数据采集 + 情报清洗 (所有深度都需要)
    // ====================================================
    let t0 = Date.now();
    if (!completedPhases.includes('scout')) {
      if (await checkCanceled?.()) throw new Error('Canceled by user');
      onProgress?.('scout');
      const scoutRes = await this.scout.scout(query);
      rawSignals = scoutRes.signals;
      intelligenceBrief = scoutRes.intelligenceBrief;
      logAgentStep('DataScout', 'scouting', { query, rawSignals }, intelligenceBrief, Date.now() - t0, { signalCount: rawSignals.length });
      handoffs.push(createHandoff('DataScout', intelligenceBrief, Date.now() - t0, { signalCount: rawSignals.length }));

      if (rawSignals.length === 0 && intelligenceBrief.length === 0) {
        console.log('🛑 [SwarmManager] Scout returned no actionable intelligence. Initiating early abort.');
        saveReport(query, `# V4 Execution Aborted\n\nNo actionable intelligence found on the web/social for query: **${query}**`);
        endMissionTrace();
        return null;
      }
    } else {
        console.log('[SwarmManager] ⏩ 恢复机制触发：跳过已完成的 Scout 阶段');
    }

    // Phase 1.5: Normalizer — 去重过滤（仍然在 RawSignal 层操作）
    let cleanedSignals: any[] = [];
    if (!completedPhases.includes('scout')) {
      t0 = Date.now();
      cleanedSignals = await this.normalizer.process(rawSignals);
      logAgentStep('Normalizer', 'dedup_filter', rawSignals, cleanedSignals, Date.now() - t0);

      // 将叙事记忆注入情报上下文
      const narrativeMemory = await getNarrativeContext();
      enrichedBrief = intelligenceBrief;
      if (narrativeMemory) {
        enrichedBrief += `\n\n=== 系统历史叙事记忆 ===\n${narrativeMemory}`;
      }
      
      completedPhases.push('scout');
      if (saveState) await saveState({ completedPhases, intelligenceBrief, analysisMemo, strategyReport, debateReport, handoffs, rawSignals, enrichedBrief });
    }

    // ====================================================
    // Phase 2: Analyst — 事件深度分析 (所有深度都需要)
    // ====================================================
    let shouldProceed = true;
    
    t0 = Date.now();
    if (!completedPhases.includes('analyst')) {
        if (await checkCanceled?.()) throw new Error('Canceled by user');
        onProgress?.('analyst');
        try {
          const analystResult = await this.analyst.analyze(enrichedBrief, query);
          analysisMemo = analystResult.analysisMemo;
          shouldProceed = analystResult.shouldProceed;
          logAgentStep('LeadAnalyst', 'event_analysis', enrichedBrief, analysisMemo, Date.now() - t0, { shouldProceed });
          handoffs.push(createHandoff('LeadAnalyst', analysisMemo, Date.now() - t0, { shouldProceed }));
        } catch (e: any) {
          console.error(`[SwarmManager] ⚠️ Analyst phase failed: ${e.message}. Using raw intelligence brief as fallback.`);
          analysisMemo = enrichedBrief; // 降级：直接用情报文本
          logAgentStep('LeadAnalyst', 'event_analysis_FALLBACK', { error: e.message }, 'Using raw brief', Date.now() - t0);
          handoffs.push(createDegradedHandoff('LeadAnalyst', analysisMemo, Date.now() - t0, e.message));
        }

        if (!shouldProceed) {
          console.log('🛑 [SwarmManager] Analyst dismissed event. Insufficient novelty/credibility.');
          const abortReport = `# V4 分析中止报告\n\n**搜索目标:** ${query}\n\n## 分析师评估\n\n${analysisMemo}\n\n---\n*分析师判定该事件不具备足够的可信度/新颖度，Pipeline 提前终止。*`;
          saveReport(query, abortReport);
          endMissionTrace();
          return abortReport;
        }

       completedPhases.push('analyst');
       if (saveState) await saveState({ completedPhases, intelligenceBrief, analysisMemo, strategyReport, debateReport, handoffs, rawSignals, enrichedBrief });
    } else {
        console.log('[SwarmManager] ⏩ 恢复机制触发：跳过已完成的 Analyst 阶段');
    }

    // === Quick 模式到此结束 ===
    if (depth === 'quick') {
      const quickReport = `# ⚡ OpenClaw 快速扫描报告: ${new Date().toISOString().split('T')[0]}\n\n**搜索目标:** ${query}\n**分析深度:** 快速扫描\n\n---\n\n## 📌 事件分析\n\n${analysisMemo}\n\n---\n*Generated by OpenClaw V4 (Quick Scan Mode)*`;
      
      saveReport(query, quickReport);
      await this.persistNarrative(query, analysisMemo, '', relatedNarrative);
      endMissionTrace();

      // Telegram Push
      await this.pushToTelegram(query, quickReport, relatedNarrative, '⚡ 快速扫描');

      console.log(`[SwarmManager] ⚡ Quick Scan 完成. Pipeline 提前终止. (${Date.now() - pipelineStart}ms)`);
      return quickReport;
    }

    // ====================================================
    // Phase 3: Strategist — 产业链推导 (standard + deep)
    // ====================================================
    t0 = Date.now();
    if (!completedPhases.includes('strategist')) {
        if (await checkCanceled?.()) throw new Error('Canceled by user');
        onProgress?.('strategist');
        try {
          strategyReport = await this.strategist.strategize(analysisMemo, investorProfile);
          logAgentStep('QuantStrategist', 'supply_chain_mapping', analysisMemo, strategyReport, Date.now() - t0);
          handoffs.push(createHandoff('QuantStrategist', strategyReport, Date.now() - t0));
        } catch (e: any) {
          console.error(`[SwarmManager] ⚠️ Strategist phase failed: ${e.message}. Continuing with analyst memo.`);
          strategyReport = analysisMemo; // 降级：直接用分析师备忘录
          logAgentStep('QuantStrategist', 'supply_chain_mapping_FALLBACK', { error: e.message }, 'Using analyst memo', Date.now() - t0);
          handoffs.push(createDegradedHandoff('QuantStrategist', strategyReport, Date.now() - t0, e.message));
        }
        
        completedPhases.push('strategist');
        if (saveState) await saveState({ completedPhases, intelligenceBrief, analysisMemo, strategyReport, debateReport, handoffs, rawSignals, enrichedBrief });
    } else {
        console.log('[SwarmManager] ⏩ 恢复机制触发：跳过已完成的 Strategist 阶段');
    }

    // ====================================================
    // Phase 4: Council — 多视角辩论 (仅 deep 模式, standard 用 singlePass)
    // ====================================================
    t0 = Date.now();
    if (!completedPhases.includes('council')) {
        if (await checkCanceled?.()) throw new Error('Canceled by user');
        onProgress?.('council');
        try {
          if (depth === 'deep') {
            debateReport = await this.council.convene(strategyReport, investorProfile);
          } else {
            debateReport = await this.council.singlePassDebate(strategyReport, investorProfile);
          }
          logAgentStep('Council', depth === 'deep' ? 'multi_persona_debate' : 'single_pass_debate', strategyReport, debateReport, Date.now() - t0);
          handoffs.push(createHandoff('Council', debateReport, Date.now() - t0, { mode: depth === 'deep' ? 'full' : 'single-pass' }));
        } catch (e: any) {
          console.error(`[SwarmManager] ⚠️ Council phase failed: ${e.message}. Continuing with strategy report.`);
          debateReport = `## ⚖️ 辩论环节异常\n\n> 辩论 Agent 执行失败: ${e.message}\n\n请参考上游策略师的产业链研报进行独立判断。`;
          logAgentStep('Council', 'debate_FALLBACK', { error: e.message }, 'Partial output', Date.now() - t0);
          handoffs.push(createDegradedHandoff('Council', debateReport, Date.now() - t0, e.message));
        }
        
        completedPhases.push('council');
        if (saveState) await saveState({ completedPhases, intelligenceBrief, analysisMemo, strategyReport, debateReport, handoffs, rawSignals, enrichedBrief });
    } else {
        console.log('[SwarmManager] ⏩ 恢复机制触发：跳过已完成的 Council 阶段');
    }

    // ====================================================
    // Phase 5: Synthesis — 最终研报生成 (standard + deep)
    // ====================================================
    t0 = Date.now();
    if (await checkCanceled?.()) throw new Error('Canceled by user');
    onProgress?.('synthesis');
    let finalReport = '';
    
    // 构建 Handoff 状态摘要，注入 Synthesis 的上下文
    const handoffSummary = this.buildHandoffSummary(handoffs);
    
    try {
      finalReport = await this.synthesizer.synthesize(query, analysisMemo, strategyReport, debateReport, undefined, undefined, investorProfile);
      
      // 如果有降级情况，在报告末尾附加 Pipeline 健康状态
      const degradedSteps = handoffs.filter(h => h.status !== 'success');
      if (degradedSteps.length > 0) {
        finalReport += `\n\n---\n\n> ⚠️ **Pipeline 健康提示**: ${degradedSteps.length} 个阶段降级运行 (${degradedSteps.map(h => `${h.agentName}: ${h.degradeReason}`).join('; ')})`;
      }
    } catch (e: any) {
      console.error(`[SwarmManager] ⚠️ Synthesis failed: ${e.message}. Assembling raw report.`);
      // 降级：手动拼装原始文本
      finalReport = `# 📈 OpenClaw 深度研报: ${new Date().toISOString().split('T')[0]}\n\n**搜索目标:** ${query}\n**分析深度:** ${DEPTH_LABELS[depth]}\n\n---\n\n## 📌 事件分析\n\n${analysisMemo}\n\n---\n\n## 🗺️ 产业链研报\n\n${strategyReport}\n\n---\n\n## ⚔️ 多空辩论\n\n${debateReport}\n\n---\n*Generated by OpenClaw Autonomous Intelligence Desk (fallback mode)*`;
    }
    logAgentStep('Synthesis', 'report_generation', { query, analysisMemo, strategyReport, debateReport, depth }, finalReport, Date.now() - t0);

    const structured = validateTradeDecision(finalReport, query);
    if (structured) {
      console.log(`[SwarmPipeline] 📋 结构化提取: driverType=${structured.driverType}, positionSize=${structured.positionSize}`);
    }

    // === 保存 Agent 中间态数据 ===
    try {
      const debugData = {
        query,
        depth,
        rawSignalCount: rawSignals?.length || 0,
        cleanedSignalCount: 0, // cleanedSignals is local, so mock
        intelligenceBrief: intelligenceBrief.substring(0, 2000),
        analysisMemo: analysisMemo.substring(0, 2000),
        strategyReport: strategyReport.substring(0, 2000),
        debateReportLength: debateReport.length,
        finalReportLength: finalReport.length,
        handoffs: handoffs.map(h => ({ agent: h.agentName, status: h.status, chars: h.contentLength, tickers: h.extractedTickers, ms: h.durationMs })),
        totalDurationMs: Date.now() - pipelineStart,
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
    await this.persistNarrative(query, strategyReport, debateReport, relatedNarrative);
    
    // 7. 保存全链路追踪
    endMissionTrace();

    // 8. Telegram Push
    const depthEmoji = depth === 'deep' ? '🔬' : depth === 'standard' ? '📊' : '⚡';
    await this.pushToTelegram(query, finalReport, relatedNarrative, `${depthEmoji} ${depth.toUpperCase()}`);

    const totalMs = Date.now() - pipelineStart;
    console.log(`\n[SwarmManager] 🎉 Mission Accomplished. Depth=${depth}, Duration=${(totalMs / 1000).toFixed(1)}s, Handoffs=${handoffs.length}`);
    
    return finalReport;
  }

  /**
   * 构建 Handoff 链路状态摘要
   */
  private buildHandoffSummary(handoffs: AgentHandoff[]): string {
    if (handoffs.length === 0) return '';
    
    const lines = handoffs.map(h => {
      const statusIcon = h.status === 'success' ? '✅' : h.status === 'degraded' ? '⚠️' : '❌';
      const tickerStr = h.extractedTickers?.length ? ` | Tickers: ${h.extractedTickers.join(', ')}` : '';
      return `${statusIcon} ${h.agentName}: ${h.contentLength} 字, ${h.durationMs}ms${tickerStr}${h.degradeReason ? ` | 降级: ${h.degradeReason}` : ''}`;
    });
    
    return `=== Pipeline Handoff 链路状态 ===\n${lines.join('\n')}`;
  }

  /**
   * 叙事记忆持久化
   */
  private async persistNarrative(query: string, strategyReport: string, debateReport: string, relatedNarrative: any) {
    if (relatedNarrative) {
      await updateNarrative(relatedNarrative.id, {
        eventSummary: query,
        analysisText: strategyReport.substring(0, 3000),
        debateText: debateReport.substring(0, 3000),
      });
    } else {
      await createNarrative(query, strategyReport.substring(0, 3000), debateReport.substring(0, 3000));
    }
  }

  /**
   * Telegram 推送
   */
  private async pushToTelegram(query: string, report: string, relatedNarrative: any, tag: string) {
    try {
      const memoryTag = relatedNarrative ? `♻️ 已更新叙事 (第${relatedNarrative.eventHistory.length + 1}次追踪)` : '🆕 新建叙事';
      const summary = `📊 *${query}*\n${tag} | ${memoryTag}\n\n${report.substring(0, 500).replace(/[*_`]/g, '')}...`;
      await sendReportSummary(query, summary);
    } catch (e: any) {
      console.error(`[SwarmManager] Telegram push failed: ${e.message}`);
    }
  }
}
