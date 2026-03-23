import { z } from 'zod';

// 1. RawSignal 基础原始数据模型
export const RawSignalSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['twitter', 'reddit', 'news', 'sec', 'calendar']),
  content: z.string(),
  timestamp: z.number(),
  author: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(z.any()).optional()
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

// 3. NarrativeStage 叙事生命周期模型 (6 生命周期)
export const NarrativeStageSchema = z.enum([
  'discovery',          // 1. 早期发现
  'earlyFermentation',  // 2. 早期发酵
  'mainExpansion',      // 3. 主升扩展
  'peakFrenzy',         // 4. 顶峰狂热
  'divergence',         // 5. 分歧衰退
  'terminal'            // 6. 尾声或证伪
]);
export type NarrativeStage = z.infer<typeof NarrativeStageSchema>;

// 4. NarrativeTopic 叙事主题
export const NarrativeTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  stage: NarrativeStageSchema,
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
  logicDescription: z.string()          // 映射推导逻辑
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
  riskingPoints: z.array(z.string()),    // 风险点/反方逻辑
  sentimentScore: z.number().min(-10).max(10) // -10 极度看空，10 极度看多
});
export type PerspectiveCard = z.infer<typeof PerspectiveCardSchema>;

// 7. DebateResult 多空对抗辩论结果
export const DebateResultSchema = z.object({
  narrativeId: z.string(),
  bullProbability: z.number().min(0).max(100), // 辩论看多胜率
  bullCaseSummary: z.string(),                 // 看多论据精炼
  bearCaseSummary: z.string(),                 // 看空论据精炼
  keyTriggers: z.array(z.string()),            // 催化剂 (向上突破条件)
  bearInvalidation: z.array(z.string()),       // 看空失效条件/止损点
  timestamp: z.number()
});
export type DebateResult = z.infer<typeof DebateResultSchema>;
