import { z } from 'zod';

// 1. RawSignal 基础原始数据模型
export const RawSignalSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['twitter', 'reddit', 'news', 'sec', 'calendar', 'internal_memory']),
  content: z.string(),
  timestamp: z.number(),
  author: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});
export type RawSignal = z.infer<typeof RawSignalSchema>;

// 2. StructuredEvent 结构化事件模型
export const StructuredEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  sourceSignalIds: z.array(z.string()),
  credibility: z.number().min(0).max(10), // 可信度打分
  novelty: z.number().min(0).max(10),     // 新颖度打分
  entities: z.array(z.string()),
  timestamp: z.number()
});
export type StructuredEvent = z.infer<typeof StructuredEventSchema>;

// [REMOVED] NarrativeStage Schema (User requested removal of arbitrary strict stages)

// 4. NarrativeTopic 叙事主题
export const NarrativeTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  relatedEventIds: z.array(z.string()),
  impactScore: z.number().min(0).max(100), // 影响力/热度评分
  createdAt: z.number(),
  updatedAt: z.number()
});
export type NarrativeTopic = z.infer<typeof NarrativeTopicSchema>;

// 5. ChainMapping 产业链映射模型
export const ChainMappingSchema = z.object({
  narrativeId: z.string(),
  coreTickers: z.array(z.string()),     // 核心受益标的
  confirmTickers: z.array(z.string()),  // 验证标的（如龙头指引或关联资产用于印证）
  mappingTickers: z.array(z.string()),  // 弹性延伸或补涨标的
  logicDescription: z.string(),         // 映射概括描述
  deductionChain: z.array(z.string())   // 严密的产业链下沉逻辑推导步数
});
export type ChainMapping = z.infer<typeof ChainMappingSchema>;

// 6. PerspectiveCard 观点卡片 (多视角对抗)
export const RoleEnum = z.enum([
  'technicalRetail',  // 技术派散户
  'emotionalRetail',  // 情绪派散户/WSB
  'institutional',    // 机构席位
  'shortSeller',      // 空头
  'macroEconomist',   // 宏观分析师
  'valueInvestor',    // 价值投资者
  'quant'             // 量化资金
]);
export const PerspectiveCardSchema = z.object({
  role: RoleEnum,
  thesis: z.string(),                    // 核心论点
  supportingPoints: z.array(z.string()), // 支撑论据
  riskingPoints: z.array(z.string())     // 风险点/反方逻辑
});
export type PerspectiveCard = z.infer<typeof PerspectiveCardSchema>;

// 7. DebateResult 多空对抗辩论结果
export const DebateResultSchema = z.object({
  narrativeId: z.string(),
  bullCaseSummary: z.string(),                 // 多方硬逻辑提纯
  bearCaseSummary: z.string(),                 // 空方硬逻辑提纯
  keyTriggers: z.array(z.string()),            // 向上突破/催化落地触发条件
  ironcladStopLosses: z.array(z.string()),     // 铁血止损线/叙事证伪条件 (极其重要)
  timestamp: z.number()
});
export type DebateResult = z.infer<typeof DebateResultSchema>;
