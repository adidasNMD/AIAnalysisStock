import { Response } from 'express';
import { z } from 'zod';
import { sendValidationApiError } from './route-helpers';

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

export const missionRetryPayloadSchema = z.object({
  depth: z.enum(['quick', 'standard', 'deep']).optional(),
  source: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
}).strict();

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
const sourceProvenanceConfidenceSchema = z.enum(['confirmed', 'inferred', 'placeholder', 'unknown']);
const fieldEvidenceKindSchema = z.enum(['record', 'profile', 'score', 'source', 'mission', 'event']);
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
}).strict();
const preTradeActionKindSchema = z.enum([
  'review_missed',
  'verify_today',
  'prepare',
  'fill_date',
  'review_observed',
  'watch',
]);
const preTradeCatalystUrgencySchema = z.enum([
  'missed',
  'overdue',
  'today',
  'soon',
  'missing_date',
  'observed',
  'watch',
]);
const preTradeReadinessSchema = z.enum(['ready', 'watch', 'blocked']);
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
}).strict().superRefine((body, ctx) => {
  const title = (body.title || body.query || '').trim();
  if (!title) {
    ctx.addIssue({
      code: 'custom',
      path: ['title'],
      message: 'title or query is required',
    });
  }
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
}).strict();

export type CreateOpportunityPayload = z.infer<typeof createOpportunityPayloadSchema>;
export type UpdateOpportunityPayload = z.infer<typeof updateOpportunityPayloadSchema>;

export const preTradeConfirmationPayloadSchema = z.object({
  itemId: requiredTextSchema,
  label: requiredTextSchema,
  status: z.enum(['pass', 'warn', 'block']),
  completed: z.boolean(),
  evidence: optionalTextSchema,
  actionKind: preTradeActionKindSchema.optional(),
  catalystUrgency: preTradeCatalystUrgencySchema.optional(),
  readiness: preTradeReadinessSchema.optional(),
  score: z.number().finite().min(0).max(100).optional(),
}).strict();

export type PreTradeConfirmationPayload = z.infer<typeof preTradeConfirmationPayloadSchema>;

export const catalystReminderPreferencePayloadSchema = z.object({
  reminderId: requiredTextSchema,
  catalystLabel: requiredTextSchema,
  catalystDueAt: optionalTextSchema,
  catalystStatus: z.enum(['upcoming', 'active', 'observed', 'missed']).optional(),
  urgency: preTradeCatalystUrgencySchema,
  actionKind: preTradeActionKindSchema,
  preference: z.enum(['acknowledge', 'snooze', 'reopen', 'subscribe', 'unsubscribe']),
  snoozedUntil: optionalTextSchema,
  subscriptionLeadDays: z.number().int().min(0).max(30).optional(),
  note: optionalTextSchema,
}).strict().superRefine((body, ctx) => {
  if (body.preference === 'snooze') {
    if (!body.snoozedUntil) {
      ctx.addIssue({
        code: 'custom',
        path: ['snoozedUntil'],
        message: 'snoozedUntil is required when preference is snooze',
      });
      return;
    }
    const parsed = Date.parse(body.snoozedUntil);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({
        code: 'custom',
        path: ['snoozedUntil'],
        message: 'snoozedUntil must be a parseable date',
      });
    }
  }
  if (body.preference === 'subscribe' && body.subscriptionLeadDays === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['subscriptionLeadDays'],
      message: 'subscriptionLeadDays is required when preference is subscribe',
    });
  }
});

export type CatalystReminderPreferencePayload = z.infer<typeof catalystReminderPreferencePayloadSchema>;

export const priceHistoryRefreshPayloadSchema = z.object({
  symbols: stringListSchema.max(50).optional(),
  limit: z.number().int().min(5).max(1000).optional(),
  force: z.boolean().optional(),
  staleAfterHours: z.number().finite().min(1).max(24 * 30).optional(),
}).strict();

export type PriceHistoryRefreshPayload = z.infer<typeof priceHistoryRefreshPayloadSchema>;

const fieldEvidencePayloadShape = {
  field: requiredTextSchema,
  label: optionalTextSchema,
  kind: fieldEvidenceKindSchema.optional(),
  source: optionalTextSchema,
  confidence: sourceProvenanceConfidenceSchema.optional(),
  value: optionalTextSchema,
  note: optionalTextSchema,
  observedAt: optionalTextSchema,
};

function requireFieldEvidenceValueOrNote(
  body: { value?: string | undefined; note?: string | undefined },
  ctx: z.RefinementCtx,
) {
  if (!body.value && !body.note) {
    ctx.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'value or note is required',
    });
  }
}

export const fieldEvidencePayloadSchema = z.object(fieldEvidencePayloadShape).strict().superRefine((body, ctx) => {
  requireFieldEvidenceValueOrNote(body, ctx);
});

export type FieldEvidencePayload = z.infer<typeof fieldEvidencePayloadSchema>;

const fieldEvidenceBatchItemPayloadSchema = z.object({
  ...fieldEvidencePayloadShape,
  clientId: optionalTextSchema,
}).strict().superRefine((body, ctx) => {
  requireFieldEvidenceValueOrNote(body, ctx);
});

export const fieldEvidenceBatchPayloadSchema = z.object({
  batchId: optionalTextSchema,
  items: z.array(fieldEvidenceBatchItemPayloadSchema).min(1).max(25),
}).strict();

export type FieldEvidenceBatchPayload = z.infer<typeof fieldEvidenceBatchPayloadSchema>;

export const fieldEvidenceInvalidationPayloadSchema = z.object({
  reason: requiredTextSchema,
  field: optionalTextSchema,
  source: optionalTextSchema,
}).strict();

export type FieldEvidenceInvalidationPayload = z.infer<typeof fieldEvidenceInvalidationPayloadSchema>;

export const fieldEvidenceRestorationPayloadSchema = z.object({
  reason: requiredTextSchema,
  field: optionalTextSchema,
  source: optionalTextSchema,
}).strict();

export type FieldEvidenceRestorationPayload = z.infer<typeof fieldEvidenceRestorationPayloadSchema>;

const fieldEvidenceBulkStatusItemSchema = z.object({
  opportunityId: requiredTextSchema,
  evidenceId: requiredTextSchema,
  field: optionalTextSchema,
  source: optionalTextSchema,
}).strict();

export const fieldEvidenceBulkStatusPayloadSchema = z.object({
  action: z.enum(['invalidate', 'restore']),
  reason: requiredTextSchema,
  items: z.array(fieldEvidenceBulkStatusItemSchema).min(1).max(50),
}).strict();

export type FieldEvidenceBulkStatusPayload = z.infer<typeof fieldEvidenceBulkStatusPayloadSchema>;

export const fieldRegistryOverridePayloadSchema = z.object({
  field: requiredTextSchema,
  label: optionalTextSchema,
  kind: fieldEvidenceKindSchema.optional(),
  source: optionalTextSchema,
  confidence: sourceProvenanceConfidenceSchema.optional(),
  note: optionalTextSchema,
  updatedBy: optionalTextSchema,
}).strict().superRefine((body, ctx) => {
  requireFieldRegistryOverrideValue(body, ctx);
});

export type FieldRegistryOverridePayload = z.infer<typeof fieldRegistryOverridePayloadSchema>;

function requireFieldRegistryOverrideValue(
  body: {
    label?: string | undefined;
    kind?: string | undefined;
    source?: string | undefined;
    confidence?: string | undefined;
    note?: string | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (!body.label && !body.kind && !body.source && !body.confidence && !body.note) {
    ctx.addIssue({
      code: 'custom',
      path: ['field'],
      message: 'at least one registry override field is required',
    });
  }
}

const fieldRegistryImportItemSchema = z.object({
  field: requiredTextSchema,
  label: optionalTextSchema,
  kind: fieldEvidenceKindSchema.optional(),
  source: optionalTextSchema,
  confidence: sourceProvenanceConfidenceSchema.optional(),
  note: optionalTextSchema,
  updatedAt: optionalTextSchema,
  updatedBy: optionalTextSchema,
}).strict().superRefine((body, ctx) => {
  requireFieldRegistryOverrideValue(body, ctx);
});

export const fieldRegistryImportPayloadSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  updatedBy: optionalTextSchema,
  items: z.array(fieldRegistryImportItemSchema).min(1).max(100),
}).strict();

export type FieldRegistryImportPayload = z.infer<typeof fieldRegistryImportPayloadSchema>;

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
  return sendValidationApiError(
    res,
    message,
    error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}
