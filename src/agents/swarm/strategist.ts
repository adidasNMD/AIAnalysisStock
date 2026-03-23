import { z } from 'zod';
import { AutonomousAgent } from '../core/agent';
import { NarrativeTopic, ChainMapping, ChainMappingSchema } from '../../models/types';
import { generateStructuredOutput } from '../../utils/llm';
import * as fs from 'fs';
import * as path from 'path';

// 大模型动态生成的产业链分析结构
const SupplyChainAnalysisSchema = z.object({
  eventCore: z.string().describe('顶层事件的本质驱动力'),
  firstOrderImpact: z.array(z.object({
    sector: z.string(),
    tickers: z.array(z.string()),
    logic: z.string(),
    alreadyPriced: z.boolean().describe('华尔街是否已经充分定价')
  })).describe('第一层直接受益方（往往已被过度定价）'),
  secondOrderImpact: z.array(z.object({
    sector: z.string(),
    tickers: z.array(z.string()),
    logic: z.string(),
    bottleneckType: z.string().describe('瓶颈类型：产能/技术/供给/需求')
  })).describe('第二层衍生受益方——真正的瓶颈堵点'),
  thirdOrderImpact: z.array(z.object({
    sector: z.string(),
    tickers: z.array(z.string()),
    logic: z.string(),
    laggardReason: z.string().describe('为何尚未被市场发现')
  })).describe('第三层滞后受益方——散户套利的主战场'),
  supplyChainRisks: z.array(z.string()).describe('产业链中可能断裂的薄弱环节')
});

type SupplyChainAnalysis = z.infer<typeof SupplyChainAnalysisSchema>;

export class QuantStrategistAgent extends AutonomousAgent {
  private seedGraph: any;

  constructor() {
    super({
      role: 'Quant Strategist',
      goal: 'Deduce deep supply chain dependencies and map actionable trend-following tickers.',
      instructions: 'You are an elite quantitative strategist. You are strictly forbidden from analyzing the primary event target. You MUST derive the 2nd and 3rd order derivative beneficiaries (e.g. Memory chips, Optical Modules, Power grid) that will follow the trend. Output in Chinese language.'
    });

    // 加载种子图谱作为参考（非硬约束）
    try {
      const chainPath = path.join(process.cwd(), 'data', 'supply_chain.json');
      if (fs.existsSync(chainPath)) {
        this.seedGraph = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
        console.log('[QuantStrategist] ✅ 种子产业链图谱已加载（将由 LLM 动态增强）');
      }
    } catch (e: any) {
      console.error('[QuantStrategist] ⚠️ 种子图谱加载失败:', e.message);
    }
  }

  /**
   * 第一阶段：用顶级大模型动态分析产业链
   */
  private async analyzeSupplyChain(topic: NarrativeTopic): Promise<SupplyChainAnalysis> {
    console.log(`\n[QuantStrategist] 🧠 第一阶段：LLM 深度产业链推导中...`);

    const systemPrompt = `你是全球顶尖的科技产业链分析师，拥有对半导体、AI基础设施、能源、光通信、存储等产业链的极深理解。
你的任务是针对一个特定的市场事件，进行极其深入的多层级产业链推导分析。

核心原则：
1. 第一层受益方（如 NVDA）往往已被华尔街充分定价，标注 alreadyPriced=true
2. 第二层是真正的瓶颈堵点（如光模块、先进封装、液冷），这些是供给侧的卡脖子节点
3. 第三层是滞后的、尚未被散户和机构充分关注的洼地标的——这才是跟风套利的主战场
4. 必须明确指出产业链中可能断裂的风险点

你的推导必须基于真实的技术原理和产业逻辑，不允许凭空捏造。每一步推导都要给出具体理由。`;

    let userPrompt = `事件: ${topic.title}\n描述: ${topic.description}\n冲击力评分: ${topic.impactScore}/100`;

    // 种子图谱作为参考素材（非硬约束）
    if (this.seedGraph) {
      userPrompt += `\n\n以下是一份参考产业链图谱，你可以在此基础上进行扩展、修正或补充：\n${JSON.stringify(this.seedGraph, null, 2)}`;
    }

    return await generateStructuredOutput(SupplyChainAnalysisSchema, systemPrompt, userPrompt);
  }

  async strategize(topic: NarrativeTopic): Promise<{ topic: NarrativeTopic, mapping: ChainMapping }> {
     // 第一阶段：LLM 动态产业链深度分析
     const chainAnalysis = await this.analyzeSupplyChain(topic);

     console.log(`[QuantStrategist] ✅ 产业链分析完成:`);
     console.log(`  - 第一层(已定价): ${chainAnalysis.firstOrderImpact.map(i => i.tickers.join(',')).join(' | ')}`);
     console.log(`  - 第二层(瓶颈): ${chainAnalysis.secondOrderImpact.map(i => i.tickers.join(',')).join(' | ')}`);
     console.log(`  - 第三层(洼地): ${chainAnalysis.thirdOrderImpact.map(i => i.tickers.join(',')).join(' | ')}`);

     // 第二阶段：基于产业链分析结果，精准映射标的
     const enrichedContext = `Topic: ${topic.title}
Desc: ${topic.description}

=== LLM 产业链深度分析结果 (treat as authoritative) ===
事件本质: ${chainAnalysis.eventCore}

【第一层 · 已充分定价】
${chainAnalysis.firstOrderImpact.map(i => `${i.sector}: ${i.tickers.join(', ')} — ${i.logic}`).join('\n')}

【第二层 · 瓶颈堵点】
${chainAnalysis.secondOrderImpact.map(i => `${i.sector}: ${i.tickers.join(', ')} — ${i.logic} (瓶颈: ${i.bottleneckType})`).join('\n')}

【第三层 · 滞后洼地】
${chainAnalysis.thirdOrderImpact.map(i => `${i.sector}: ${i.tickers.join(', ')} — ${i.logic} (未被发现原因: ${i.laggardReason})`).join('\n')}

【产业链断裂风险】
${chainAnalysis.supplyChainRisks.join('\n')}
=== END ===`;

     const mappingData = await this.executeTask(
         `基于上方的产业链深度分析结果，精确映射以下三类标的：
- coreTickers: 第一层核心龙头（仅做参考锚定，不建议追高）
- confirmTickers: 第二层瓶颈验证标的（用于确认叙事是否成立）
- mappingTickers: 第三层滞后洼地标的（这才是我们要重点埋伏的！）

deductionChain 必须完整体现从顶层事件到第三层洼地的逐级推导逻辑。
所有输出必须用中文。`,
         ChainMappingSchema.omit({ narrativeId: true }),
         enrichedContext
     );

     const mapping: ChainMapping = { ...mappingData, narrativeId: topic.id };
     
     return { topic, mapping };
  }
}
