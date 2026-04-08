import { z } from 'zod';

// 1. RawSignal 基础原始数据模型
export const RawSignalSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['twitter', 'reddit', 'news', 'sec', 'calendar', 'internal_memory', 'google_news', 'sector_etf']),
  content: z.string(),
  timestamp: z.number(),
  author: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});
export type RawSignal = z.infer<typeof RawSignalSchema>;

// 2. StructuredEvent 结构化事件模型（增强版）
export const StructuredEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  sourceSignalIds: z.array(z.string()),
  credibility: z.number().min(0).max(10), // 可信度打分
  novelty: z.number().min(0).max(10),     // 新颖度打分
  entities: z.array(z.string()),
  timestamp: z.number(),
  // 新增字段
  eventType: z.enum(['policy', 'earnings', 'supply_chain', 'ipo', 'macro', 'sentiment', 'technical', 'other']).optional(),
  direction: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  urgency: z.enum(['immediate', 'short_term', 'medium_term']).optional(),
  trendRelevance: z.number().min(0).max(10).optional(), // 与当前热门趋势的关联度
});
export type StructuredEvent = z.infer<typeof StructuredEventSchema>;

// 3. NarrativeStage 叙事生命周期阶段（重新引入）
export const NarrativeStageSchema = z.enum([
  'earlyFermentation',  // 早期酝酿 → 小仓试错
  'emergingConsensus',  // 共识形成 → 逐步建仓
  'mainExpansion',      // 主升浪 → 加仓参与
  'crowdedClimax',      // 拥挤高潮 → 控制风险
  'narrativeFatigue',   // 叙事疲劳 → 准备退出
  'postCollapse'        // 崩溃后 → 完全回避
]);
export type NarrativeStage = z.infer<typeof NarrativeStageSchema>;

// 4. NarrativeTopic 叙事主题
export const NarrativeTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  relatedEventIds: z.array(z.string()),
  impactScore: z.number().min(0).max(100), // 影响力/热度评分
  narrativeType: z.enum(['Fundamental', 'Policy_Driven', 'Narrative_Hype']).default('Fundamental'), // 新增：驱动力类型
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

// 8. TrendSnapshot 趋势快照模型（新增 — TrendRadar 输出）
export const TrendTopicSchema = z.object({
  name: z.string(),
  momentum: z.enum(['accelerating', 'stable', 'decelerating']),
  phase: z.enum(['emerging', 'trending', 'fading']),
  tickers: z.array(z.string()),
  relatedETFs: z.array(z.string()),
  hasCatalyst: z.boolean(),
  catalystDescription: z.string().optional(),
  score: z.number().min(0).max(100),
  sources: z.array(z.string()),
});
export type TrendTopic = z.infer<typeof TrendTopicSchema>;

export const TrendSnapshotSchema = z.object({
  timestamp: z.number(),
  topics: z.array(TrendTopicSchema),
  marketSentiment: z.enum(['risk_on', 'neutral', 'risk_off']),
  summary: z.string(),
});
export type TrendSnapshot = z.infer<typeof TrendSnapshotSchema>;

// 9. PositionSizeEnum — 仓位大小枚举
export const PositionSizeEnum = z.enum(['full', 'half', 'quarter', 'trial', 'skip']);
export type PositionSize = z.infer<typeof PositionSizeEnum>;

// 10. StructuredStopLossSchema — 结构化止损条件
export const StructuredStopLossSchema = z.object({
  type: z.enum(['price_sma_break', 'event_failure', 'sector_collapse', 'custom']),
  condition: z.string(),            // 人类可读条件描述
  ticker: z.string().optional(),   // 关联标的
  smaPeriod: z.number().optional(), // 如 20, 50, 250
  humanReadable: z.string(),       // 中文说明
});
export type StructuredStopLoss = z.infer<typeof StructuredStopLossSchema>;

// 11. TradeDecisionSchema — 共识仲裁后的结构化决策（辅助判断核心：必须包含推理链）
export const TradeDecisionSchema = z.object({
  ticker: z.string(),
  verdict: z.enum(['BUY', 'HOLD', 'SELL', 'SKIP', 'VETO_BUY']),
  driverType: z.enum(['Fundamental', 'Policy_Driven', 'Narrative_Hype']),
  positionSize: PositionSizeEnum,
  stopLosses: z.array(StructuredStopLossSchema),
  bullCase: z.string(),             // 为什么买 / 为什么是它 — 核心看多逻辑（必填）
  bearCase: z.string(),             // 为什么不买 / 为什么不是它 — 核心风险与看空逻辑（必填）
  vetoed: z.boolean().default(false),
  vetoReason: z.string().optional(),
  agreement: z.enum(['agree', 'disagree', 'partial', 'pending', 'blocked']),
});
export type TradeDecision = z.infer<typeof TradeDecisionSchema>;
