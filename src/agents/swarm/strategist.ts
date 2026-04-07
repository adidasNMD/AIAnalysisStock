import { AutonomousAgent } from '../core/agent';
import * as fs from 'fs';
import * as path from 'path';

/**
 * QuantStrategistAgent — 量化策略师
 * 
 * 输入: 分析师的事件推导备忘录文本
 * 输出: 一篇《产业链映射与标的推导研报》(string)
 * 
 * 核心改变：
 * - 移除 SupplyChainAnalysisSchema 和 ChainMappingSchema 的 Zod 定义
 * - 合并两阶段 LLM 调用为单次深度分析
 * - 产业链种子图谱仍作为参考素材注入
 */
export class QuantStrategistAgent extends AutonomousAgent {
  private seedGraph: any;

  constructor() {
    super({
      role: '量化策略师 (Quant Strategist)',
      goal: '基于上游分析师的事件推导，进行极其深入的多层级产业链推导，精确映射从龙头到洼地的全链条标的。',
      instructions: `你是全球顶尖的科技产业链分析师与量化策略师。你拥有对半导体、AI 基础设施、能源、光通信、存储、先进封装等产业链的极深理解。

核心原则：
1. 第一层受益方（如 NVDA）往往已被华尔街充分定价 — 标注为"已定价龙头"
2. 第二层是真正的瓶颈堵点（如光模块、先进封装、液冷）— 标注为"瓶颈验证标的"
3. 第三层是滞后的、尚未被散户和机构充分关注的洼地标的 — 标注为"洼地埋伏标的"，**这才是我们的主战场**
4. 必须标注具体的美股 ticker 代码（如 $AAOI, $WDC, $MU）。【量化强制红线】：推导出的洼地/瓶颈标的市值必须介于 3亿美元 ($300M) 到 1000亿美元 ($100B) 之间！绝对禁用大于 100B 的巨集公司（如苹果、英伟达等）作为最终埋伏目标。
5. 每一步推导都必须有具体的技术原理和产业逻辑支撑
6. 明确指出产业链中可能断裂的风险点
7. 所有输出使用中文`
    });

    // 加载种子图谱作为参考
    try {
      const chainPath = path.join(process.cwd(), 'data', 'supply_chain.json');
      if (fs.existsSync(chainPath)) {
        this.seedGraph = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
        console.log('[QuantStrategist] ✅ 种子产业链图谱已加载');
      }
    } catch (e: any) {
      console.error('[QuantStrategist] ⚠️ 种子图谱加载失败:', e.message);
    }
  }

  /**
   * 基于分析师备忘录，输出产业链研报
   */
  async strategize(analystMemo: string, investorProfile?: string): Promise<string> {
    console.log(`\n[QuantStrategist] 🧠 开始产业链深度推导...`);

    let enrichedContext = analystMemo;

    // 注入种子图谱作为参考
    if (this.seedGraph) {
      enrichedContext += `\n\n=== 参考产业链图谱（可在此基础上扩展、修正或补充）===\n${JSON.stringify(this.seedGraph, null, 2)}`;
    }

    if (investorProfile) {
      enrichedContext += `\n\n=== 投资者画像（请根据此画像调整推导重点和标的选择优先级）===\n${investorProfile.substring(0, 2000)}`;
    }

    const strategyReport = await this.executeTextTask(
      `基于上游分析师提供的事件推导备忘录，撰写一份极其深入的《产业链映射与标的推导研报》。

要求的报告结构：

## 🏗️ 事件本质与顶层驱动力
- 用一段话精炼概括这个事件的本质驱动力

## 🗺️ 三级产业链推导

### 第一层 · 已充分定价的龙头（仅做参考锚定，不建议追高）
| 标的 | 赛道 | 推导逻辑 | 是否已充分定价 |
对每个标的用 $TICKER 格式标注代码

### 第二层 · 瓶颈堵点（验证叙事是否成立的关键标的）
| 标的 | 赛道 | 推导逻辑 | 瓶颈类型 |
这些是供给侧卡脖子节点。如果它们的订单/产能印证了叙事，则叙事成立。

### 第三层 · 滞后洼地（我们要重点埋伏的主战场！）
| 标的 | 赛道 | 推导逻辑 | 为何尚未被市场发现 |
散户筹码干净、机构关注度低、弹性远大于龙头的标的。

## 🔗 完整推导链条
按 "顶层事件 → 第一层 → 第二层 → 第三层" 的逻辑，写出完整的逐级推导链条（每一步都要有具体理由）。

## ⚠️ 产业链断裂风险
列出产业链中可能断裂的薄弱环节和风险点。

## 📋 总括逻辑
用 2-3 句话总结整个产业链映射的核心投资逻辑。`,
      enrichedContext
    );

    console.log(`[QuantStrategist] ✅ 产业链研报完成 (${strategyReport.length} 字)`);
    return strategyReport;
  }
}
