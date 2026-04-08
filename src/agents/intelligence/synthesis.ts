import { generateTextCompletion } from '../../utils/llm';
import { MAX_SINGLE_POSITION_PCT, PROBE_POSITION_PCT } from '../../utils/position-guard';
import { validateReport } from '../../utils/report-validator';

/**
 * SynthesisAgent — 报告合成智能体
 * 
 * 核心改变：从模板拼装改为 LLM 汇总生成。
 * 将所有上游 Agent 的文本分析作为 Context，让 LLM 输出结构清晰的最终研报。
 */
export class SynthesisAgent {
  /**
   * 汇总所有上游 Agent 的分析文本，由 LLM 生成最终研报
   */
  async synthesize(
    query: string,
    analysisMemo: string,
    strategyReport: string,
    debateReport: string,
    macroAppendix?: string,
    performanceAppendix?: string,
    investorProfile?: string,
  ): Promise<string> {
    console.log(`\n[SynthesisAgent] 📝 Synthesizing Executive Daily Brief via LLM...`);

    const date = new Date().toISOString().split('T')[0];

    const systemPrompt = `你是 OpenClaw 自治情报台的首席报告官。
你的任务是将多个 AI Agent 产出的分析文本汇总为一份结构清晰、逻辑严密、可直接指导交易决策的终极研报。

报告质量要求：
1. 止损条件置顶（最重要，必须在报告最前面）
2. 逻辑推导完整，从事件到标的到风控一气呵成
3. 语气专业、冷静、不含糊——像一个顶级对冲基金的内部研报
4. 所有标的必须用 $TICKER 格式标注
5. 使用中文撰写
6. 使用清晰的 Markdown 格式（标题、列表、表格、引用、加粗等）
${investorProfile ? `7. 请严格参考以下投资者画像，调整报告的重点、语气和操作建议：\n${investorProfile.substring(0, 1500)}` : ''}`;

    let userPrompt = `请基于以下 Agent 分析链的全部输出，撰写最终研报。

**搜索目标**: ${query}
**日期**: ${date}

=== 分析师事件推导备忘录 ===
${analysisMemo}

=== 策略师产业链研报 ===
${strategyReport}

=== 辩论议会报告 ===
${debateReport}`;

    if (macroAppendix) {
      userPrompt += `\n\n=== 宏观环境附录 ===\n${macroAppendix}`;
    }
    if (performanceAppendix) {
      userPrompt += `\n\n=== 历史绩效附录 ===\n${performanceAppendix}`;
    }

    userPrompt += `

请按照以下结构撰写最终研报：

# 📈 OpenClaw 深度研报: ${date}

## 🚨 铁血风控与证伪条件（置顶！）
从辩论报告中提取最硬的止损条件

## 🎯 叙事主题概览
一句话核心事件 + 冲击力评估 + 驱动类型

## 🗺️ 产业链推导与标的映射
三级产业链的完整推导 + 标的代码

## ⚔️ 多空辩论精要
多方 vs 空方的核心论据

## 🎯 向上突破催化条件
具体的、可验证的催化事件

## 📊 操作建议
仓位建议、入场/止盈时机、风险提示`;

    let report = await generateTextCompletion(systemPrompt, userPrompt, { streamToConsole: true });
    // Position Sizing Discipline Guard integration: annotate final report with gate guidance
    try {
      // Gather tickers from all sources to assess concentration risk (best-effort heuristic)
      const combinedSources = `${analysisMemo} ${strategyReport} ${debateReport}`;
      const tickerMatches = combinedSources.match(/\$[A-Z]{1,5}/g) || [];
      const counts = new Map<string, number>();
      for (const tk of tickerMatches) {
        const t = tk.trim();
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const crowded = Array.from(counts.entries()).filter(([, c]) => c >= 3);
      const crowdedText = crowded.length > 0
        ? crowded.map(([t, c]) => `${t}(${c}次)`).join(', ')
        : '无显著聚集';
      const riskNote = crowded.length > 0 ? `高集中风险: ${crowdedText}` : '无显著聚集风险';
      const positionSection = `
## 💹 Position Sizing Guard
- 最大单笔仓位占比: ${MAX_SINGLE_POSITION_PCT}%
- 入场探针仓位: ${PROBE_POSITION_PCT}%
- 风险注记: ${riskNote}
`;
      // Append to the report to surface to downstream consumers
      report += positionSection;
    } catch {
      // best-effort only; do not fail the synthesis if this annotation cannot be added
    }
    const validation = validateReport(report);
    if (!validation.valid) {
      const warningLines = validation.warnings.map(w => `- ${w}`).join("\n");
      report += `\n\nWarnings:\n${warningLines}`;
    }

    console.log(`[SynthesisAgent] ✅ 最终研报生成完成 (${report.length} 字)`);
    return report;
  }
}
