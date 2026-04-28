import { Response } from 'express';
import { z } from 'zod';

export const missionPayloadSchema = z.object({
  mode: z.enum(['explore', 'analyze', 'review']).optional(),
  query: z.string().trim().min(1),
  tickers: z.array(z.string().trim().min(1)).optional(),
  depth: z.enum(['quick', 'standard', 'deep']).optional(),
  source: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

const opportunityTypeSchema = z.enum(['ipo_spinout', 'relay_chain', 'proxy_narrative', 'ad_hoc']);
const opportunityStageSchema = z.enum(['radar', 'framing', 'tracking', 'ready', 'active', 'cooldown', 'archived']);
const opportunityStatusSchema = z.enum(['watching', 'ready', 'active', 'degraded', 'archived']);
const opportunityTemperatureSchema = z.enum(['cold', 'warming', 'hot', 'crowded', 'broken']);
const heatTransferValidationStatusSchema = z.enum(['forming', 'confirmed', 'fragile', 'broken']);
const heatTransferEdgeKindSchema = z.enum([
  'leader_to_bottleneck',
  'bottleneck_to_laggard',
  'leader_to_laggard',
]);
const catalystConfidenceSchema = z.enum(['confirmed', 'inferred', 'placeholder']);
const scoreFieldSchema = z.number().finite().min(0).max(100);
const opportunityScoresSchema = z.object({
  purityScore: scoreFieldSchema.optional(),
  scarcityScore: scoreFieldSchema.optional(),
  tradeabilityScore: scoreFieldSchema.optional(),
  relayScore: scoreFieldSchema.optional(),
  catalystScore: scoreFieldSchema.optional(),
  policyScore: scoreFieldSchema.optional(),
}).strict();
const catalystItemSchema = z.object({
  label: z.string().trim().min(1),
  dueAt: z.string().trim().min(1).optional(),
  status: z.enum(['upcoming', 'active', 'observed', 'missed']),
  note: z.string().trim().optional(),
  source: z.string().trim().optional(),
  confidence: catalystConfidenceSchema.optional(),
});
const stringListSchema = z.array(z.string().trim().min(1));
const requiredTextSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().optional();
const nullableTextSchema = z.string().trim().nullable().optional();
const heatTransferEdgeSchema = z.object({
  id: optionalTextSchema,
  from: requiredTextSchema,
  to: requiredTextSchema,
  weight: scoreFieldSchema,
  kind: heatTransferEdgeKindSchema,
  reason: optionalTextSchema,
}).strict();
const opportunityHeatProfileSchema = z.object({
  temperature: opportunityTemperatureSchema.optional(),
  bottleneckTickers: stringListSchema.optional(),
  laggardTickers: stringListSchema.optional(),
  junkTickers: stringListSchema.optional(),
  breadthScore: scoreFieldSchema.optional(),
  validationStatus: heatTransferValidationStatusSchema.optional(),
  validationSummary: optionalTextSchema,
  edgeCount: z.number().int().nonnegative().optional(),
  edges: z.array(heatTransferEdgeSchema).optional(),
  leaderHealth: optionalTextSchema,
  transmissionNote: optionalTextSchema,
}).strict();
const opportunityProxyProfileSchema = z.object({
  mappingTarget: optionalTextSchema,
  legitimacyScore: scoreFieldSchema.optional(),
  legibilityScore: scoreFieldSchema.optional(),
  tradeabilityScore: scoreFieldSchema.optional(),
  ruleStatus: optionalTextSchema,
  identityNote: optionalTextSchema,
  scarcityNote: optionalTextSchema,
}).strict();
const opportunityFieldEvidenceSchema = z.object({
  source: requiredTextSchema,
  confidence: catalystConfidenceSchema,
  note: optionalTextSchema,
  observedAt: optionalTextSchema,
}).strict();
const opportunityIpoEvidenceSchema = z.object({
  officialTradingDate: opportunityFieldEvidenceSchema.optional(),
  spinoutDate: opportunityFieldEvidenceSchema.optional(),
  retainedStakePercent: opportunityFieldEvidenceSchema.optional(),
  lockupDate: opportunityFieldEvidenceSchema.optional(),
  greenshoeStatus: opportunityFieldEvidenceSchema.optional(),
  firstIndependentEarningsAt: opportunityFieldEvidenceSchema.optional(),
  firstCoverageAt: opportunityFieldEvidenceSchema.optional(),
}).strict();
const opportunityIpoProfileSchema = z.object({
  officialTradingDate: optionalTextSchema,
  spinoutDate: optionalTextSchema,
  retainedStakePercent: scoreFieldSchema.optional(),
  lockupDate: optionalTextSchema,
  greenshoeStatus: optionalTextSchema,
  firstIndependentEarningsAt: optionalTextSchema,
  firstCoverageAt: optionalTextSchema,
  evidence: opportunityIpoEvidenceSchema.optional(),
}).strict();

export const createOpportunityPayloadSchema = z.object({
  type: opportunityTypeSchema.optional().default('ad_hoc'),
  title: optionalTextSchema,
  query: optionalTextSchema,
  thesis: optionalTextSchema,
  summary: optionalTextSchema,
  stage: opportunityStageSchema.optional(),
  status: opportunityStatusSchema.optional(),
  primaryTicker: optionalTextSchema,
  leaderTicker: optionalTextSchema,
  proxyTicker: optionalTextSchema,
  relatedTickers: stringListSchema.optional(),
  relayTickers: stringListSchema.optional(),
  nextCatalystAt: optionalTextSchema,
  supplyOverhang: optionalTextSchema,
  policyStatus: optionalTextSchema,
  scores: opportunityScoresSchema.optional(),
  heatProfile: opportunityHeatProfileSchema.optional(),
  proxyProfile: opportunityProxyProfileSchema.optional(),
  ipoProfile: opportunityIpoProfileSchema.optional(),
  catalystCalendar: z.array(catalystItemSchema).optional(),
});

export const updateOpportunityPayloadSchema = z.object({
  title: requiredTextSchema.optional(),
  query: requiredTextSchema.optional(),
  thesis: optionalTextSchema,
  summary: optionalTextSchema,
  stage: opportunityStageSchema.optional(),
  status: opportunityStatusSchema.optional(),
  primaryTicker: optionalTextSchema,
  leaderTicker: optionalTextSchema,
  proxyTicker: optionalTextSchema,
  relatedTickers: stringListSchema.optional(),
  relayTickers: stringListSchema.optional(),
  nextCatalystAt: nullableTextSchema,
  supplyOverhang: nullableTextSchema,
  policyStatus: nullableTextSchema,
  scores: opportunityScoresSchema.optional(),
  heatProfile: opportunityHeatProfileSchema.optional(),
  proxyProfile: opportunityProxyProfileSchema.optional(),
  ipoProfile: opportunityIpoProfileSchema.optional(),
  catalystCalendar: z.array(catalystItemSchema).optional(),
});

export const runtimeConfigPatchSchema = z.object({
  t1Enabled: z.boolean().optional(),
  leaderTickers: stringListSchema.optional(),
  sma250VetoEnabled: z.boolean().optional(),
}).strict();

const modelProfileSchema = z.object({
  model: z.string().trim().min(1),
  temperature: z.number().finite(),
  max_tokens: z.number().int().positive(),
});
const serviceModelMapSchema = z.record(z.string(), z.string().trim().min(1));
export const modelsConfigPayloadSchema = z.object({
  defaults: z.object({
    provider: z.string().trim().min(1),
    base_url: z.string().trim().min(1),
  }),
  models: z.object({
    deep_think: modelProfileSchema,
    quick_think: modelProfileSchema,
  }).catchall(modelProfileSchema),
  services: z.object({
    openclaw: serviceModelMapSchema,
    trading_agents: serviceModelMapSchema,
    trendradar: serviceModelMapSchema,
  }).catchall(serviceModelMapSchema),
});

export function sendValidationError(res: Response, error: z.ZodError, message = 'Invalid request payload') {
  return res.status(400).json({
    error: message,
    details: error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}
