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
});

const opportunityTypeSchema = z.enum(['ipo_spinout', 'relay_chain', 'proxy_narrative', 'ad_hoc']);
const opportunityStageSchema = z.enum(['radar', 'framing', 'tracking', 'ready', 'active', 'cooldown', 'archived']);
const opportunityStatusSchema = z.enum(['watching', 'ready', 'active', 'degraded', 'archived']);
const opportunityScoresSchema = z.object({
  purityScore: z.number().finite().optional(),
  scarcityScore: z.number().finite().optional(),
  tradeabilityScore: z.number().finite().optional(),
  relayScore: z.number().finite().optional(),
  catalystScore: z.number().finite().optional(),
  policyScore: z.number().finite().optional(),
}).strict();
const catalystItemSchema = z.object({
  label: z.string().trim().min(1),
  dueAt: z.string().trim().min(1).optional(),
  status: z.enum(['upcoming', 'active', 'observed', 'missed']),
  note: z.string().trim().optional(),
  source: z.string().trim().optional(),
  confidence: z.enum(['confirmed', 'inferred', 'placeholder']).optional(),
});
const opportunityProfileSchema = z.object({}).passthrough();
const stringListSchema = z.array(z.string().trim().min(1));
const requiredTextSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().optional();
const nullableTextSchema = z.string().trim().nullable().optional();

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
  heatProfile: opportunityProfileSchema.optional(),
  proxyProfile: opportunityProfileSchema.optional(),
  ipoProfile: opportunityProfileSchema.optional(),
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
  heatProfile: opportunityProfileSchema.optional(),
  proxyProfile: opportunityProfileSchema.optional(),
  ipoProfile: opportunityProfileSchema.optional(),
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
