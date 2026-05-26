import {
  getOpportunityHeatHistory,
  listOpportunityFieldEvidenceIndex,
  listOpportunityEvents,
} from '../../workflows';
import type {
  OpportunityEventRecord,
  OpportunityEventType,
  OpportunityFieldEvidenceKind,
  OpportunityFieldEvidenceListFilters,
  OpportunityFieldEvidenceStatus,
  OpportunityHeatHistoryPoint,
  OpportunityType,
  OpportunitySummaryRecord,
  OpportunitySourceProvenanceConfidence,
} from '../../workflows';
import type { PaginationRequest } from '../route-helpers';
import { listOpportunitySummaries } from './opportunity-service';
import { loadPerformanceData, type TickerPerformance } from '../../utils/performance-tracker';
import {
  calculatePriceWindowPerformance,
  findPriceHistorySeries,
  loadPriceHistoryCache,
  type PriceHistorySeries,
} from '../../utils/price-history-cache';

export interface OpportunityQueryDependencies {
  listOpportunityEvents: typeof listOpportunityEvents;
  getOpportunityHeatHistory: typeof getOpportunityHeatHistory;
  listOpportunityFieldEvidenceIndex: typeof listOpportunityFieldEvidenceIndex;
  listOpportunitySummaries: typeof listOpportunitySummaries;
  listTickerPerformance: typeof loadPerformanceData;
  listPriceHistory: typeof loadPriceHistoryCache;
  now: () => string;
}

const defaultDependencies: OpportunityQueryDependencies = {
  listOpportunityEvents,
  getOpportunityHeatHistory,
  listOpportunityFieldEvidenceIndex,
  listOpportunitySummaries,
  listTickerPerformance: loadPerformanceData,
  listPriceHistory: loadPriceHistoryCache,
  now: () => new Date().toISOString(),
};

const OPPORTUNITY_EVENT_TYPES = new Set<OpportunityEventType>([
  'created',
  'updated',
  'mission_linked',
  'mission_queued',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
  'signal_changed',
  'thesis_upgraded',
  'thesis_degraded',
  'leader_broken',
  'relay_triggered',
  'proxy_ignited',
  'catalyst_due',
  'catalyst_reminder_updated',
  'pretrade_confirmed',
  'pretrade_unconfirmed',
  'field_evidence_recorded',
  'field_evidence_invalidated',
  'field_evidence_restored',
]);

export type OpportunityEventTypeFilter = {
  types: OpportunityEventType[];
  invalid: string[];
};

export type OpportunityFieldEvidenceFilterResult = {
  filters: OpportunityFieldEvidenceListFilters;
  invalid: string[];
};

const FIELD_EVIDENCE_STATUSES = new Set<OpportunityFieldEvidenceStatus>(['active', 'invalidated']);
const FIELD_EVIDENCE_KINDS = new Set<OpportunityFieldEvidenceKind>([
  'record',
  'profile',
  'score',
  'source',
  'mission',
  'event',
]);
const FIELD_EVIDENCE_CONFIDENCES = new Set<OpportunitySourceProvenanceConfidence>([
  'confirmed',
  'inferred',
  'placeholder',
  'unknown',
]);
const CATALYST_REMINDER_PREFERENCES = new Set<OpportunityCatalystReminderPreference>([
  'acknowledge',
  'snooze',
  'reopen',
  'subscribe',
  'unsubscribe',
]);
const PRETRADE_AUDIT_CATEGORIES = new Set<OpportunityPreTradeAuditCategory>([
  'pretrade',
  'catalyst_blocker',
  'evidence',
]);
const PRETRADE_AUDIT_STATUSES = new Set<OpportunityPreTradeAuditStatus>([
  'pass',
  'warn',
  'block',
  'ready',
  'watch',
  'blocked',
  'recorded',
  'invalidated',
  'restored',
]);
const PRETRADE_AUDIT_EVENT_TYPES: OpportunityEventType[] = [
  'pretrade_confirmed',
  'pretrade_unconfirmed',
  'catalyst_reminder_updated',
  'field_evidence_recorded',
  'field_evidence_invalidated',
  'field_evidence_restored',
];
const BLOCKING_CATALYST_URGENCIES = new Set(['missed', 'overdue', 'missing_date']);
const BLOCKING_CATALYST_ACTIONS = new Set(['review_missed', 'fill_date']);
const REVIEW_PLAYBACK_CATEGORIES = new Set<OpportunityReviewPlaybackCategory>([
  'mission',
  'pretrade',
  'evidence',
  'catalyst',
  'thesis',
  'signal',
  'status',
]);
const REVIEW_PLAYBACK_TONES = new Set<OpportunityReviewPlaybackTone>([
  'positive',
  'warning',
  'negative',
  'neutral',
]);
const OPPORTUNITY_TYPES = new Set<OpportunityType>([
  'ipo_spinout',
  'relay_chain',
  'proxy_narrative',
  'ad_hoc',
]);
const REVIEW_PLAYBACK_EVENT_TYPES: OpportunityEventType[] = [
  'created',
  'updated',
  'mission_linked',
  'mission_queued',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
  'signal_changed',
  'thesis_upgraded',
  'thesis_degraded',
  'leader_broken',
  'relay_triggered',
  'proxy_ignited',
  'catalyst_due',
  'catalyst_reminder_updated',
  'pretrade_confirmed',
  'pretrade_unconfirmed',
  'field_evidence_recorded',
  'field_evidence_invalidated',
  'field_evidence_restored',
];
const REVIEW_PRICE_CACHE_STALE_AFTER_HOURS = 24;

export type OpportunityCatalystReminderPreference =
  | 'acknowledge'
  | 'snooze'
  | 'reopen'
  | 'subscribe'
  | 'unsubscribe';

export interface OpportunityCatalystReminderAuditFilters {
  opportunityId?: string;
  preference?: OpportunityCatalystReminderPreference;
  q?: string;
  activeOnly?: boolean;
}

export interface OpportunityCatalystReminderAuditItem {
  id: string;
  eventId: string;
  opportunityId: string;
  reminderId: string;
  catalystLabel: string;
  catalystDueAt?: string;
  catalystStatus?: string;
  urgency?: string;
  actionKind?: string;
  preference: OpportunityCatalystReminderPreference;
  snoozedUntil?: string;
  subscriptionLeadDays?: number;
  note?: string;
  message: string;
  timestamp: string;
  activeSubscription: boolean;
}

export interface OpportunityCatalystReminderAuditResponse {
  generatedAt: string;
  metrics: {
    total: number;
    acknowledged: number;
    snoozed: number;
    reopened: number;
    subscribed: number;
    unsubscribed: number;
    activeSubscriptions: number;
  };
  items: OpportunityCatalystReminderAuditItem[];
}

export interface OpportunityCatalystReminderCalendar {
  generatedAt: string;
  itemCount: number;
  content: string;
}

export type OpportunityPreTradeAuditCategory = 'pretrade' | 'catalyst_blocker' | 'evidence';
export type OpportunityPreTradeAuditStatus =
  | 'pass'
  | 'warn'
  | 'block'
  | 'ready'
  | 'watch'
  | 'blocked'
  | 'recorded'
  | 'invalidated'
  | 'restored';

export interface OpportunityPreTradeAuditFilters {
  opportunityId?: string;
  category?: OpportunityPreTradeAuditCategory;
  status?: OpportunityPreTradeAuditStatus;
  q?: string;
}

export interface OpportunityPreTradeAuditItem {
  id: string;
  eventId: string;
  opportunityId: string;
  category: OpportunityPreTradeAuditCategory;
  eventType: OpportunityEventType;
  label: string;
  detail: string;
  timestamp: string;
  status?: OpportunityPreTradeAuditStatus;
  readiness?: string;
  actionKind?: string;
  catalystUrgency?: string;
  evidence?: string;
  field?: string;
  source?: string;
  confidence?: string;
  message: string;
}

export interface OpportunityPreTradeAuditResponse {
  generatedAt: string;
  metrics: {
    total: number;
    confirmations: number;
    reopened: number;
    blockers: number;
    evidence: number;
    blocked: number;
    ready: number;
  };
  items: OpportunityPreTradeAuditItem[];
}

export type OpportunityReviewPlaybackCategory =
  | 'mission'
  | 'pretrade'
  | 'evidence'
  | 'catalyst'
  | 'thesis'
  | 'signal'
  | 'status';
export type OpportunityReviewPlaybackTone = 'positive' | 'warning' | 'negative' | 'neutral';

export interface OpportunityReviewPlaybackFilters {
  opportunityId?: string;
  category?: OpportunityReviewPlaybackCategory;
  tone?: OpportunityReviewPlaybackTone;
  q?: string;
  backtestFrom?: string;
  backtestTo?: string;
  backtestTicker?: string;
  backtestStrategy?: OpportunityType;
}

export interface OpportunityReviewPlaybackItem {
  id: string;
  eventId: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunityType?: string;
  timestamp: string;
  category: OpportunityReviewPlaybackCategory;
  tone: OpportunityReviewPlaybackTone;
  eventType: OpportunityEventType;
  label: string;
  detail: string;
  chips: string[];
  missionId?: string;
  runId?: string;
  field?: string;
  status?: string;
  actionKind?: string;
  catalystUrgency?: string;
  evidence?: string;
  symbol?: string;
  price?: number;
  quantity?: number;
  positionPct?: number;
  notionalUsd?: number;
  exitPct?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  riskBudgetPct?: number;
  riskBudgetUsd?: number;
  exitReason?: string;
}

export type OpportunityReviewPlaybackOutcomeStatus = 'blocked' | 'review' | 'ready' | 'quiet';

export interface OpportunityReviewPlaybackOutcome {
  status: OpportunityReviewPlaybackOutcomeStatus;
  headline: string;
  detail: string;
  nextStep: string;
  score: number;
  blockers: number;
  failedMissions: number;
  completedMissions: number;
  evidenceRecorded: number;
  evidenceInvalidated: number;
  latestRiskAt?: string;
  latestPositiveAt?: string;
}

export type OpportunityReviewPlaybackPerformanceStatus =
  | 'multi_opportunity'
  | 'insufficient_data'
  | 'tracking'
  | 'positive_follow_through'
  | 'risk_hit';
export type OpportunityReviewPlaybackPerformanceDataQuality =
  | 'missing'
  | 'event_only'
  | 'heat_proxy'
  | 'price_confirmed';
export type OpportunityReviewPlaybackPerformanceConfidence = 'observed' | 'inferred' | 'missing';
export type OpportunityReviewPlaybackRiskBacktestVerdict =
  | 'favorable'
  | 'mixed'
  | 'unfavorable'
  | 'inconclusive'
  | 'no_trades';
export type OpportunityReviewPlaybackRiskBacktestSegmentKind =
  | 'opportunity_type'
  | 'stage'
  | 'status';
export type OpportunityReviewPlaybackStrategyBacktestStatus =
  | 'ready'
  | 'partial'
  | 'empty';
export type OpportunityReviewPlaybackPriceSource =
  | 'event_meta'
  | 'performance_cache'
  | 'price_history_cache';
export type OpportunityReviewPlaybackPriceCacheStatus =
  | 'fresh'
  | 'stale'
  | 'missing'
  | 'unknown';

export interface OpportunityReviewPlaybackPerformanceSignal {
  at: string;
  label: string;
  eventId: string;
  category: OpportunityReviewPlaybackCategory;
  confidence: OpportunityReviewPlaybackPerformanceConfidence;
  price?: number;
}

export interface OpportunityReviewPlaybackPriceCacheSummary {
  status: OpportunityReviewPlaybackPriceCacheStatus;
  staleAfterHours: number;
  symbol?: string;
  source?: string;
  updatedAt?: string;
  ageHours?: number;
  pointCount?: number;
  oldestPointAt?: string;
  newestPointAt?: string;
  refreshPath: string;
}

export type OpportunityReviewPlaybackTradeStatus = 'closed' | 'partial' | 'open';
export type OpportunityReviewPlaybackRiskRewardOutcome = 'gain' | 'loss' | 'flat' | 'unknown';
export type OpportunityReviewPlaybackPositionSizingStatus =
  | 'within_plan'
  | 'scaled_down'
  | 'open_exposure'
  | 'oversized'
  | 'missing_sizing'
  | 'missing_risk_budget'
  | 'unknown';
export type OpportunityReviewPlaybackPositionSizingSeverity = 'ok' | 'warning' | 'blocker';
export type OpportunityReviewPlaybackExecutionQualityStatus =
  | 'on_plan'
  | 'early_exit'
  | 'late_exit'
  | 'slippage'
  | 'missing_plan'
  | 'open_position'
  | 'unknown';
export type OpportunityReviewPlaybackPlanCompleteness = 'complete' | 'partial' | 'missing';
export type OpportunityReviewPlaybackPlanRepairSuggestionKind =
  | 'add_stop_loss'
  | 'add_target_price'
  | 'add_risk_budget'
  | 'add_entry_price'
  | 'add_exit_price'
  | 'add_exit_reason';
export type OpportunityReviewPlaybackPlanRepairSeverity = 'blocker' | 'warning' | 'info';
export type OpportunityReviewPlaybackExitAttributionKind =
  | 'target_hit'
  | 'stop_loss'
  | 'risk_reduction'
  | 'catalyst_failed'
  | 'thesis_invalidated'
  | 'mission_failed'
  | 'manual_exit'
  | 'unknown';

export interface OpportunityReviewPlaybackExitAttribution {
  kind: OpportunityReviewPlaybackExitAttributionKind;
  label: string;
  detail: string;
  stopLossPrice?: number;
  targetPrice?: number;
  riskBudgetPct?: number;
  riskBudgetUsd?: number;
  stopDistancePct?: number;
  targetUpsidePct?: number;
  exitVsStopPct?: number;
  exitVsTargetPct?: number;
  riskRewardRatio?: number;
}

export interface OpportunityReviewPlaybackRiskRewardAttribution {
  outcome: OpportunityReviewPlaybackRiskRewardOutcome;
  note: string;
  exposurePct?: number;
  returnContributionPct?: number;
  drawdownContributionPct?: number;
}

export interface OpportunityReviewPlaybackPositionSizingRule {
  status: OpportunityReviewPlaybackPositionSizingStatus;
  label: string;
  severity: OpportunityReviewPlaybackPositionSizingSeverity;
  detail: string;
  hasSizing: boolean;
  exposurePct?: number;
  remainingExposurePct?: number;
  notionalUsd?: number;
  riskBudgetPct?: number;
  riskBudgetUsd?: number;
  stopDistancePct?: number;
  riskAtStopPct?: number;
  riskBudgetUsedPct?: number;
}

export interface OpportunityReviewPlaybackPlanRepairSuggestion {
  kind: OpportunityReviewPlaybackPlanRepairSuggestionKind;
  label: string;
  detail: string;
  field: string;
  severity: OpportunityReviewPlaybackPlanRepairSeverity;
}

export interface OpportunityReviewPlaybackExecutionQuality {
  status: OpportunityReviewPlaybackExecutionQualityStatus;
  label: string;
  detail: string;
  planCompleteness: OpportunityReviewPlaybackPlanCompleteness;
  priceTolerancePct: number;
  repairSuggestions: OpportunityReviewPlaybackPlanRepairSuggestion[];
  plannedExitPrice?: number;
  targetCapturePct?: number;
  stopBreachPct?: number;
  slippagePct?: number;
}

export interface OpportunityReviewPlaybackTradeLeg {
  id: string;
  status: OpportunityReviewPlaybackTradeStatus;
  symbol?: string;
  entry: OpportunityReviewPlaybackPerformanceSignal;
  exit?: OpportunityReviewPlaybackPerformanceSignal;
  holdingDays?: number;
  entryQuantity?: number;
  exitQuantity?: number;
  remainingQuantity?: number;
  closedPct?: number;
  remainingPct?: number;
  positionPct?: number;
  notionalUsd?: number;
  returnPct?: number;
  maxDrawdownPct?: number;
  peakReturnPct?: number;
  priceSource?: OpportunityReviewPlaybackPriceSource;
  dataQuality: OpportunityReviewPlaybackPerformanceDataQuality;
  exitAttribution?: OpportunityReviewPlaybackExitAttribution;
  executionQuality?: OpportunityReviewPlaybackExecutionQuality;
  sizingRule?: OpportunityReviewPlaybackPositionSizingRule;
  riskReward?: OpportunityReviewPlaybackRiskRewardAttribution;
  notes: string[];
}

export interface OpportunityReviewPlaybackExitAttributionCount {
  kind: OpportunityReviewPlaybackExitAttributionKind;
  label: string;
  count: number;
}

export interface OpportunityReviewPlaybackExecutionQualityCount {
  status: OpportunityReviewPlaybackExecutionQualityStatus;
  label: string;
  count: number;
}

export interface OpportunityReviewPlaybackPlanRepairSuggestionCount {
  kind: OpportunityReviewPlaybackPlanRepairSuggestionKind;
  label: string;
  severity: OpportunityReviewPlaybackPlanRepairSeverity;
  count: number;
}

export interface OpportunityReviewPlaybackPositionSizingRuleCount {
  status: OpportunityReviewPlaybackPositionSizingStatus;
  label: string;
  severity: OpportunityReviewPlaybackPositionSizingSeverity;
  count: number;
}

export interface OpportunityReviewPlaybackPositionSummary {
  closedLegs: number;
  partialLegs: number;
  openLegs: number;
  sizedLegs: number;
  notes: string[];
  realizedReturnContributionPct?: number;
  drawdownContributionPct?: number;
  openExposurePct?: number;
  exitAttributions: OpportunityReviewPlaybackExitAttributionCount[];
  executionQuality: OpportunityReviewPlaybackExecutionQualityCount[];
  planRepairSuggestions: OpportunityReviewPlaybackPlanRepairSuggestionCount[];
  sizingRules: OpportunityReviewPlaybackPositionSizingRuleCount[];
}

export interface OpportunityReviewPlaybackRiskBacktestSummary {
  verdict: OpportunityReviewPlaybackRiskBacktestVerdict;
  label: string;
  detail: string;
  sampleSize: number;
  closedLegs: number;
  pricedLegs: number;
  opportunityCount?: number;
  opportunitiesWithTrades?: number;
  opportunitiesWithPricedTrades?: number;
  oversizedLegs: number;
  planRepairLegs: number;
  executionIssueLegs: number;
  notes: string[];
  segments?: OpportunityReviewPlaybackRiskBacktestSegment[];
  winRatePct?: number;
  avgReturnPct?: number;
  avgMaxDrawdownPct?: number;
  avgRiskAtStopPct?: number;
  avgRiskBudgetUsedPct?: number;
  payoffRatio?: number;
  realizedReturnContributionPct?: number;
  openExposurePct?: number;
}

export interface OpportunityReviewPlaybackRiskBacktestSegment {
  kind: OpportunityReviewPlaybackRiskBacktestSegmentKind;
  key: string;
  label: string;
  verdict: OpportunityReviewPlaybackRiskBacktestVerdict;
  verdictLabel: string;
  opportunityCount: number;
  sampleSize: number;
  closedLegs: number;
  pricedLegs: number;
  oversizedLegs: number;
  planRepairLegs: number;
  executionIssueLegs: number;
  winRatePct?: number;
  avgReturnPct?: number;
  avgMaxDrawdownPct?: number;
  avgRiskAtStopPct?: number;
  avgRiskBudgetUsedPct?: number;
  payoffRatio?: number;
}

export interface OpportunityReviewPlaybackStrategyBacktestGroup {
  key: string;
  label: string;
  verdict: OpportunityReviewPlaybackRiskBacktestVerdict;
  verdictLabel: string;
  opportunityCount: number;
  sampleSize: number;
  closedLegs: number;
  pricedLegs: number;
  coveragePct?: number;
  winRatePct?: number;
  avgReturnPct?: number;
  avgMaxDrawdownPct?: number;
  avgRiskAtStopPct?: number;
  avgRiskBudgetUsedPct?: number;
  payoffRatio?: number;
  oversizedLegs: number;
  planRepairLegs: number;
  executionIssueLegs: number;
}

export interface OpportunityReviewPlaybackStrategyBacktestSummary {
  status: OpportunityReviewPlaybackStrategyBacktestStatus;
  headline: string;
  detail: string;
  filterLabel: string;
  windowStart?: string;
  windowEnd?: string;
  ticker?: string;
  strategy?: OpportunityType;
  strategyLabel?: string;
  totalStrategies: number;
  coveredStrategies: number;
  opportunityCount: number;
  pricedLegs: number;
  closedLegs: number;
  notes: string[];
  groups: OpportunityReviewPlaybackStrategyBacktestGroup[];
  bestGroup?: OpportunityReviewPlaybackStrategyBacktestGroup;
  weakestGroup?: OpportunityReviewPlaybackStrategyBacktestGroup;
}

export interface OpportunityReviewPlaybackPerformanceSummary {
  status: OpportunityReviewPlaybackPerformanceStatus;
  headline: string;
  detail: string;
  nextStep: string;
  opportunityCount: number;
  triggeredCatalysts: number;
  pretradeBlockHit: boolean;
  pretradeBlockers: number;
  riskEvents: number;
  dataQuality: OpportunityReviewPlaybackPerformanceDataQuality;
  notes: string[];
  symbol?: string;
  priceSource?: OpportunityReviewPlaybackPriceSource;
  priceAsOf?: string;
  pricePointCount?: number;
  priceWindowStart?: string;
  priceWindowEnd?: string;
  priceCache?: OpportunityReviewPlaybackPriceCacheSummary;
  trades: OpportunityReviewPlaybackTradeLeg[];
  position: OpportunityReviewPlaybackPositionSummary;
  riskBacktest: OpportunityReviewPlaybackRiskBacktestSummary;
  strategyBacktest: OpportunityReviewPlaybackStrategyBacktestSummary;
  entrySignal?: OpportunityReviewPlaybackPerformanceSignal;
  exitSignal?: OpportunityReviewPlaybackPerformanceSignal;
  holdingDays?: number;
  returnPct?: number;
  maxDrawdownPct?: number;
  peakReturnPct?: number;
  heatStart?: number;
  heatEnd?: number;
  heatDelta?: number;
  heatHigh?: number;
  heatLow?: number;
  heatMaxDrawdownPct?: number;
}

export interface OpportunityReviewPlaybackResponse {
  generatedAt: string;
  metrics: {
    total: number;
    missions: number;
    pretrade: number;
    evidence: number;
    catalysts: number;
    risks: number;
    positives: number;
    warnings: number;
  };
  outcome: OpportunityReviewPlaybackOutcome;
  performance: OpportunityReviewPlaybackPerformanceSummary;
  items: OpportunityReviewPlaybackItem[];
}

function withDependencies(
  overrides: Partial<OpportunityQueryDependencies> = {},
): OpportunityQueryDependencies {
  return { ...defaultDependencies, ...overrides };
}

function firstText(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function stringifyMeta(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function finiteNumberMeta(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'number'
    ? raw
    : typeof raw === 'string'
      ? Number.parseFloat(raw.replace(/[$,%]/g, '').trim())
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanQuery(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'active', 'subscribed'].includes(raw.trim().toLowerCase());
}

function parseSubscriptionLeadDays(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(30, Math.round(parsed)));
}

export function parseOpportunityEventTypeFilter(value: unknown): OpportunityEventTypeFilter {
  const rawValues = Array.isArray(value) ? value : [value];
  const tokens = rawValues
    .flatMap((item) => typeof item === 'string' ? item.split(',') : [])
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  const types: OpportunityEventType[] = [];
  const invalid: string[] = [];

  for (const token of unique) {
    if (OPPORTUNITY_EVENT_TYPES.has(token as OpportunityEventType)) {
      types.push(token as OpportunityEventType);
    } else {
      invalid.push(token);
    }
  }

  return { types, invalid };
}

export function parseOpportunityFieldEvidenceFilters(
  query: Record<string, unknown>,
): OpportunityFieldEvidenceFilterResult {
  const filters: OpportunityFieldEvidenceListFilters = {};
  const invalid: string[] = [];
  const opportunityId = firstText(query.opportunityId);
  const field = firstText(query.field);
  const source = firstText(query.source);
  const q = firstText(query.q);
  const status = firstText(query.status);
  const kind = firstText(query.kind);
  const confidence = firstText(query.confidence);

  if (opportunityId) filters.opportunityId = opportunityId;
  if (field) filters.field = field;
  if (source) filters.source = source;
  if (q) filters.q = q;
  if (status) {
    if (FIELD_EVIDENCE_STATUSES.has(status as OpportunityFieldEvidenceStatus)) {
      filters.status = status as OpportunityFieldEvidenceStatus;
    } else {
      invalid.push(`status:${status}`);
    }
  }
  if (kind) {
    if (FIELD_EVIDENCE_KINDS.has(kind as OpportunityFieldEvidenceKind)) {
      filters.kind = kind as OpportunityFieldEvidenceKind;
    } else {
      invalid.push(`kind:${kind}`);
    }
  }
  if (confidence) {
    if (FIELD_EVIDENCE_CONFIDENCES.has(confidence as OpportunitySourceProvenanceConfidence)) {
      filters.confidence = confidence as OpportunitySourceProvenanceConfidence;
    } else {
      invalid.push(`confidence:${confidence}`);
    }
  }

  return { filters, invalid };
}

export function parseOpportunityCatalystReminderFilters(
  query: Record<string, unknown>,
): { filters: OpportunityCatalystReminderAuditFilters; invalid: string[] } {
  const filters: OpportunityCatalystReminderAuditFilters = {};
  const invalid: string[] = [];
  const opportunityId = firstText(query.opportunityId);
  const q = firstText(query.q);
  const preference = firstText(query.preference);

  if (opportunityId) filters.opportunityId = opportunityId;
  if (q) filters.q = q;
  if (parseBooleanQuery(query.activeOnly)) filters.activeOnly = true;
  if (preference && preference !== 'all') {
    if (CATALYST_REMINDER_PREFERENCES.has(preference as OpportunityCatalystReminderPreference)) {
      filters.preference = preference as OpportunityCatalystReminderPreference;
    } else {
      invalid.push(`preference:${preference}`);
    }
  }

  return { filters, invalid };
}

export function parseOpportunityPreTradeAuditFilters(
  query: Record<string, unknown>,
): { filters: OpportunityPreTradeAuditFilters; invalid: string[] } {
  const filters: OpportunityPreTradeAuditFilters = {};
  const invalid: string[] = [];
  const opportunityId = firstText(query.opportunityId);
  const q = firstText(query.q);
  const category = firstText(query.category);
  const status = firstText(query.status);

  if (opportunityId) filters.opportunityId = opportunityId;
  if (q) filters.q = q;
  if (category && category !== 'all') {
    if (PRETRADE_AUDIT_CATEGORIES.has(category as OpportunityPreTradeAuditCategory)) {
      filters.category = category as OpportunityPreTradeAuditCategory;
    } else {
      invalid.push(`category:${category}`);
    }
  }
  if (status && status !== 'all') {
    if (PRETRADE_AUDIT_STATUSES.has(status as OpportunityPreTradeAuditStatus)) {
      filters.status = status as OpportunityPreTradeAuditStatus;
    } else {
      invalid.push(`status:${status}`);
    }
  }

  return { filters, invalid };
}

export function parseOpportunityReviewPlaybackFilters(
  query: Record<string, unknown>,
): { filters: OpportunityReviewPlaybackFilters; invalid: string[] } {
  const filters: OpportunityReviewPlaybackFilters = {};
  const invalid: string[] = [];
  const opportunityId = firstText(query.opportunityId);
  const q = firstText(query.q);
  const category = firstText(query.category);
  const tone = firstText(query.tone);
  const backtestFrom = firstText(query.backtestFrom);
  const backtestTo = firstText(query.backtestTo);
  const backtestTicker = firstText(query.backtestTicker);
  const backtestStrategy = firstText(query.backtestStrategy);

  if (opportunityId) filters.opportunityId = opportunityId;
  if (q) filters.q = q;
  if (backtestTicker) filters.backtestTicker = backtestTicker.toUpperCase();
  if (backtestStrategy && backtestStrategy !== 'all') {
    if (OPPORTUNITY_TYPES.has(backtestStrategy as OpportunityType)) {
      filters.backtestStrategy = backtestStrategy as OpportunityType;
    } else {
      invalid.push(`backtestStrategy:${backtestStrategy}`);
    }
  }
  if (backtestFrom) {
    if (Number.isFinite(Date.parse(backtestFrom))) {
      filters.backtestFrom = backtestFrom;
    } else {
      invalid.push(`backtestFrom:${backtestFrom}`);
    }
  }
  if (backtestTo) {
    if (Number.isFinite(Date.parse(backtestTo))) {
      filters.backtestTo = backtestTo;
    } else {
      invalid.push(`backtestTo:${backtestTo}`);
    }
  }
  if (
    filters.backtestFrom
    && filters.backtestTo
    && backtestBoundaryMs(filters.backtestFrom, false) > backtestBoundaryMs(filters.backtestTo, true)
  ) {
    invalid.push('backtestRange');
  }
  if (category && category !== 'all') {
    if (REVIEW_PLAYBACK_CATEGORIES.has(category as OpportunityReviewPlaybackCategory)) {
      filters.category = category as OpportunityReviewPlaybackCategory;
    } else {
      invalid.push(`category:${category}`);
    }
  }
  if (tone && tone !== 'all') {
    if (REVIEW_PLAYBACK_TONES.has(tone as OpportunityReviewPlaybackTone)) {
      filters.tone = tone as OpportunityReviewPlaybackTone;
    } else {
      invalid.push(`tone:${tone}`);
    }
  }

  return { filters, invalid };
}

function catalystReminderAuditItemFromEvent(
  event: OpportunityEventRecord,
  activeReminderIds: Set<string>,
): OpportunityCatalystReminderAuditItem | null {
  if (event.type !== 'catalyst_reminder_updated') return null;
  const preference = stringifyMeta(event.meta?.preference);
  if (!preference || !CATALYST_REMINDER_PREFERENCES.has(preference as OpportunityCatalystReminderPreference)) {
    return null;
  }
  const reminderId = stringifyMeta(event.meta?.reminderId) || event.id;
  const catalystLabel = stringifyMeta(event.meta?.catalystLabel) || 'Catalyst reminder';
  const catalystDueAt = stringifyMeta(event.meta?.catalystDueAt);
  const catalystStatus = stringifyMeta(event.meta?.catalystStatus);
  const urgency = stringifyMeta(event.meta?.urgency);
  const actionKind = stringifyMeta(event.meta?.actionKind);
  const snoozedUntil = stringifyMeta(event.meta?.snoozedUntil);
  const subscriptionLeadDays = parseSubscriptionLeadDays(event.meta?.subscriptionLeadDays);
  const note = stringifyMeta(event.meta?.note);

  return {
    id: event.id,
    eventId: event.id,
    opportunityId: event.opportunityId,
    reminderId,
    catalystLabel,
    ...(catalystDueAt ? { catalystDueAt } : {}),
    ...(catalystStatus ? { catalystStatus } : {}),
    ...(urgency ? { urgency } : {}),
    ...(actionKind ? { actionKind } : {}),
    preference: preference as OpportunityCatalystReminderPreference,
    ...(snoozedUntil ? { snoozedUntil } : {}),
    ...(subscriptionLeadDays !== undefined ? { subscriptionLeadDays } : {}),
    ...(note ? { note } : {}),
    message: event.message,
    timestamp: event.timestamp,
    activeSubscription: activeReminderIds.has(reminderId),
  };
}

function matchesCatalystReminderSearch(item: OpportunityCatalystReminderAuditItem, query?: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [
    item.opportunityId,
    item.reminderId,
    item.catalystLabel,
    item.catalystDueAt,
    item.catalystStatus,
    item.urgency,
    item.actionKind,
    item.preference,
    item.note,
    item.message,
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

function latestPreferenceByReminder(events: OpportunityEventRecord[]): Map<string, OpportunityCatalystReminderPreference> {
  const latest = new Map<string, OpportunityCatalystReminderPreference>();
  for (const event of events) {
    const preference = stringifyMeta(event.meta?.preference);
    if (!preference || !CATALYST_REMINDER_PREFERENCES.has(preference as OpportunityCatalystReminderPreference)) continue;
    const reminderId = stringifyMeta(event.meta?.reminderId) || event.id;
    if (!latest.has(reminderId)) {
      latest.set(reminderId, preference as OpportunityCatalystReminderPreference);
    }
  }
  return latest;
}

function buildCatalystReminderMetrics(items: OpportunityCatalystReminderAuditItem[]) {
  return {
    total: items.length,
    acknowledged: items.filter((item) => item.preference === 'acknowledge').length,
    snoozed: items.filter((item) => item.preference === 'snooze').length,
    reopened: items.filter((item) => item.preference === 'reopen').length,
    subscribed: items.filter((item) => item.preference === 'subscribe').length,
    unsubscribed: items.filter((item) => item.preference === 'unsubscribe').length,
    activeSubscriptions: items.filter((item) => item.activeSubscription).length,
  };
}

export async function listOpportunityCatalystReminderAuditForApi(
  limit = 50,
  filters: OpportunityCatalystReminderAuditFilters = {},
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
): Promise<OpportunityCatalystReminderAuditResponse> {
  const deps = withDependencies(dependencyOverrides);
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const fetchLimit = Math.max(cappedLimit, Math.min(1000, cappedLimit * 4));
  const events = await deps.listOpportunityEvents(
    filters.opportunityId,
    fetchLimit,
    ['catalyst_reminder_updated'],
  );
  const latestByReminder = latestPreferenceByReminder(events);
  const activeReminderIds = new Set(
    [...latestByReminder.entries()]
      .filter(([, preference]) => preference === 'subscribe')
      .map(([reminderId]) => reminderId),
  );
  const items = events
    .map((event) => catalystReminderAuditItemFromEvent(event, activeReminderIds))
    .filter((item): item is OpportunityCatalystReminderAuditItem => Boolean(item))
    .filter((item) => !filters.preference || item.preference === filters.preference)
    .filter((item) => !filters.activeOnly || item.activeSubscription)
    .filter((item) => matchesCatalystReminderSearch(item, filters.q))
    .slice(0, cappedLimit);

  return {
    generatedAt: new Date().toISOString(),
    metrics: buildCatalystReminderMetrics(items),
    items,
  };
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function icsDate(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsDurationAlarm(leadDays?: number): string {
  const days = leadDays ?? 3;
  return days > 0 ? `-P${days}D` : '-PT0M';
}

function calendarEventForReminder(item: OpportunityCatalystReminderAuditItem): string | null {
  if (!item.catalystDueAt) return null;
  const start = icsDate(item.catalystDueAt);
  if (!start) return null;
  const end = icsDate(new Date(new Date(item.catalystDueAt).getTime() + 60 * 60 * 1000).toISOString());
  const stamp = icsDate(item.timestamp) || icsDate(new Date().toISOString());
  const summary = escapeIcsText(`${item.catalystLabel} (${item.opportunityId})`);
  const description = escapeIcsText([
    `Opportunity: ${item.opportunityId}`,
    `Reminder: ${item.reminderId}`,
    item.urgency ? `Urgency: ${item.urgency}` : undefined,
    item.actionKind ? `Action: ${item.actionKind}` : undefined,
    item.note ? `Note: ${item.note}` : undefined,
  ].filter(Boolean).join('\n'));

  return [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(`opportunity-catalyst-${item.reminderId}@ai-analysis-stock`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    end ? `DTEND:${end}` : undefined,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    `TRIGGER:${icsDurationAlarm(item.subscriptionLeadDays)}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

export async function buildOpportunityCatalystReminderCalendarForApi(
  limit = 200,
  filters: OpportunityCatalystReminderAuditFilters = {},
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
): Promise<OpportunityCatalystReminderCalendar> {
  const audit = await listOpportunityCatalystReminderAuditForApi(limit, {
    ...filters,
    preference: 'subscribe',
    activeOnly: true,
  }, dependencyOverrides);
  const events = audit.items
    .map(calendarEventForReminder)
    .filter((event): event is string => Boolean(event));
  const generatedAt = new Date().toISOString();
  const timestamp = icsDate(generatedAt) || '19700101T000000Z';
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Analysis Stock//Opportunity Catalyst Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('Opportunity Catalyst Reminders')}`,
    `X-PUBLISHED-TTL:${icsDurationAlarm(1).replace('-', '')}`,
    `X-WR-CALDESC:${escapeIcsText(`Generated ${generatedAt}`)}`,
    ...events,
    `X-GENERATED-AT:${timestamp}`,
    'END:VCALENDAR',
  ].join('\r\n');

  return {
    generatedAt,
    itemCount: events.length,
    content,
  };
}

function preTradeStatusFromEvent(event: OpportunityEventRecord): OpportunityPreTradeAuditStatus | undefined {
  const status = stringifyMeta(event.meta?.status);
  if (status && PRETRADE_AUDIT_STATUSES.has(status as OpportunityPreTradeAuditStatus)) {
    return status as OpportunityPreTradeAuditStatus;
  }
  const readiness = stringifyMeta(event.meta?.readiness);
  if (readiness && PRETRADE_AUDIT_STATUSES.has(readiness as OpportunityPreTradeAuditStatus)) {
    return readiness as OpportunityPreTradeAuditStatus;
  }
  if (event.type === 'pretrade_unconfirmed') return 'watch';
  if (event.type === 'field_evidence_recorded') return 'recorded';
  if (event.type === 'field_evidence_invalidated') return 'invalidated';
  if (event.type === 'field_evidence_restored') return 'restored';
  return undefined;
}

function preTradeAuditItemFromEvent(event: OpportunityEventRecord): OpportunityPreTradeAuditItem | null {
  if (event.type === 'pretrade_confirmed' || event.type === 'pretrade_unconfirmed') {
    const label = stringifyMeta(event.meta?.label) || 'Pre-trade check';
    const status = preTradeStatusFromEvent(event);
    const readiness = stringifyMeta(event.meta?.readiness);
    const actionKind = stringifyMeta(event.meta?.actionKind);
    const catalystUrgency = stringifyMeta(event.meta?.catalystUrgency);
    const evidence = stringifyMeta(event.meta?.evidence);
    const detail = [
      status ? `Status ${status}` : undefined,
      readiness ? `Readiness ${readiness}` : undefined,
      actionKind ? `Action ${actionKind}` : undefined,
      catalystUrgency ? `Catalyst ${catalystUrgency}` : undefined,
      evidence,
    ].filter(Boolean).join(' · ') || event.message;

    return {
      id: event.id,
      eventId: event.id,
      opportunityId: event.opportunityId,
      category: 'pretrade',
      eventType: event.type,
      label: `${label} ${event.type === 'pretrade_confirmed' ? 'confirmed' : 'reopened'}`,
      detail,
      timestamp: event.timestamp,
      ...(status ? { status } : {}),
      ...(readiness ? { readiness } : {}),
      ...(actionKind ? { actionKind } : {}),
      ...(catalystUrgency ? { catalystUrgency } : {}),
      ...(evidence ? { evidence } : {}),
      message: event.message,
    };
  }

  if (event.type === 'catalyst_reminder_updated') {
    const urgency = stringifyMeta(event.meta?.urgency);
    const actionKind = stringifyMeta(event.meta?.actionKind);
    const isBlocker = (urgency && BLOCKING_CATALYST_URGENCIES.has(urgency))
      || (actionKind && BLOCKING_CATALYST_ACTIONS.has(actionKind));
    if (!isBlocker) return null;

    const label = stringifyMeta(event.meta?.catalystLabel) || 'Catalyst blocker';
    const preference = stringifyMeta(event.meta?.preference);
    const note = stringifyMeta(event.meta?.note);
    const detail = [
      urgency ? `Urgency ${urgency}` : undefined,
      actionKind ? `Action ${actionKind}` : undefined,
      preference ? `Preference ${preference}` : undefined,
      note,
    ].filter(Boolean).join(' · ') || event.message;

    return {
      id: event.id,
      eventId: event.id,
      opportunityId: event.opportunityId,
      category: 'catalyst_blocker',
      eventType: event.type,
      label,
      detail,
      timestamp: event.timestamp,
      status: 'block',
      readiness: 'blocked',
      ...(actionKind ? { actionKind } : {}),
      ...(urgency ? { catalystUrgency: urgency } : {}),
      ...(note ? { evidence: note } : {}),
      message: event.message,
    };
  }

  if (
    event.type === 'field_evidence_recorded'
    || event.type === 'field_evidence_invalidated'
    || event.type === 'field_evidence_restored'
  ) {
    const field = stringifyMeta(event.meta?.field) || 'field evidence';
    const label = stringifyMeta(event.meta?.label) || field;
    const source = stringifyMeta(event.meta?.source);
    const confidence = stringifyMeta(event.meta?.confidence);
    const note = stringifyMeta(event.meta?.note) || stringifyMeta(event.meta?.reason);
    const status = preTradeStatusFromEvent(event);
    const detail = [
      field ? `Field ${field}` : undefined,
      source ? `Source ${source}` : undefined,
      confidence ? `Confidence ${confidence}` : undefined,
      note,
    ].filter(Boolean).join(' · ') || event.message;

    return {
      id: event.id,
      eventId: event.id,
      opportunityId: event.opportunityId,
      category: 'evidence',
      eventType: event.type,
      label,
      detail,
      timestamp: event.timestamp,
      ...(status ? { status } : {}),
      ...(field ? { field } : {}),
      ...(source ? { source } : {}),
      ...(confidence ? { confidence } : {}),
      ...(note ? { evidence: note } : {}),
      message: event.message,
    };
  }

  return null;
}

function matchesPreTradeAuditSearch(item: OpportunityPreTradeAuditItem, query?: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [
    item.opportunityId,
    item.category,
    item.eventType,
    item.label,
    item.detail,
    item.status,
    item.readiness,
    item.actionKind,
    item.catalystUrgency,
    item.evidence,
    item.field,
    item.source,
    item.confidence,
    item.message,
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

function buildPreTradeAuditMetrics(items: OpportunityPreTradeAuditItem[]) {
  return {
    total: items.length,
    confirmations: items.filter((item) => item.eventType === 'pretrade_confirmed').length,
    reopened: items.filter((item) => item.eventType === 'pretrade_unconfirmed').length,
    blockers: items.filter((item) => item.category === 'catalyst_blocker').length,
    evidence: items.filter((item) => item.category === 'evidence').length,
    blocked: items.filter((item) => item.status === 'block' || item.readiness === 'blocked').length,
    ready: items.filter((item) => item.status === 'pass' || item.readiness === 'ready').length,
  };
}

export async function listOpportunityPreTradeAuditForApi(
  limit = 50,
  filters: OpportunityPreTradeAuditFilters = {},
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
): Promise<OpportunityPreTradeAuditResponse> {
  const deps = withDependencies(dependencyOverrides);
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const fetchLimit = Math.max(cappedLimit, Math.min(1200, cappedLimit * 5));
  const events = await deps.listOpportunityEvents(
    filters.opportunityId,
    fetchLimit,
    PRETRADE_AUDIT_EVENT_TYPES,
  );
  const items = events
    .map(preTradeAuditItemFromEvent)
    .filter((item): item is OpportunityPreTradeAuditItem => Boolean(item))
    .filter((item) => !filters.category || item.category === filters.category)
    .filter((item) => !filters.status || item.status === filters.status || item.readiness === filters.status)
    .filter((item) => matchesPreTradeAuditSearch(item, filters.q))
    .slice(0, cappedLimit);

  return {
    generatedAt: new Date().toISOString(),
    metrics: buildPreTradeAuditMetrics(items),
    items,
  };
}

function missionIdFromEvent(event: OpportunityEventRecord): string | undefined {
  return stringifyMeta(event.meta?.missionId) || stringifyMeta(event.meta?.mission_id);
}

function runIdFromEvent(event: OpportunityEventRecord): string | undefined {
  return stringifyMeta(event.meta?.runId) || stringifyMeta(event.meta?.run_id);
}

function symbolFromEvent(event: OpportunityEventRecord): string | undefined {
  const symbol = stringifyMeta(event.meta?.symbol)
    || stringifyMeta(event.meta?.ticker)
    || stringifyMeta(event.meta?.primaryTicker);
  return symbol ? symbol.toUpperCase() : undefined;
}

function priceFromEvent(event: OpportunityEventRecord): number | undefined {
  return finiteNumberMeta(event.meta?.price)
    ?? finiteNumberMeta(event.meta?.entryPrice)
    ?? finiteNumberMeta(event.meta?.exitPrice)
    ?? finiteNumberMeta(event.meta?.currentPrice)
    ?? finiteNumberMeta(event.meta?.close)
    ?? finiteNumberMeta(event.meta?.closePrice);
}

function positiveNumberFromMeta(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = finiteNumberMeta(value);
    if (parsed !== undefined && parsed > 0) return parsed;
  }
  return undefined;
}

function percentFromMeta(...values: unknown[]): number | undefined {
  const parsed = positiveNumberFromMeta(...values);
  if (parsed === undefined) return undefined;
  return roundOne(Math.max(0, Math.min(100, parsed)));
}

function quantityFromEvent(event: OpportunityEventRecord): number | undefined {
  return positiveNumberFromMeta(
    event.meta?.quantity,
    event.meta?.shares,
    event.meta?.shareCount,
    event.meta?.units,
  );
}

function positionPctFromEvent(event: OpportunityEventRecord): number | undefined {
  return percentFromMeta(
    event.meta?.positionPct,
    event.meta?.positionPercent,
    event.meta?.positionSizePct,
    event.meta?.allocationPct,
    event.meta?.allocationPercent,
    event.meta?.sizePct,
    event.meta?.sizePercent,
    event.meta?.portfolioPct,
    event.meta?.portfolioPercent,
  );
}

function notionalUsdFromEvent(event: OpportunityEventRecord): number | undefined {
  return positiveNumberFromMeta(
    event.meta?.notionalUsd,
    event.meta?.notionalUSD,
    event.meta?.notional,
    event.meta?.positionUsd,
    event.meta?.positionUSD,
    event.meta?.positionValue,
    event.meta?.capitalUsd,
    event.meta?.capitalUSD,
    event.meta?.allocationUsd,
    event.meta?.allocationUSD,
  );
}

function exitPctFromEvent(event: OpportunityEventRecord): number | undefined {
  return percentFromMeta(
    event.meta?.exitPct,
    event.meta?.exitPercent,
    event.meta?.partialExitPct,
    event.meta?.reducePct,
    event.meta?.reductionPct,
    event.meta?.sellPct,
    event.meta?.trimPct,
  );
}

function stopLossPriceFromEvent(event: OpportunityEventRecord): number | undefined {
  return positiveNumberFromMeta(
    event.meta?.stopLossPrice,
    event.meta?.stopPrice,
    event.meta?.stopLoss,
    event.meta?.stop,
    event.meta?.riskPrice,
    event.meta?.invalidBelow,
  );
}

function targetPriceFromEvent(event: OpportunityEventRecord): number | undefined {
  return positiveNumberFromMeta(
    event.meta?.targetPrice,
    event.meta?.priceTarget,
    event.meta?.takeProfitPrice,
    event.meta?.takeProfit,
    event.meta?.profitTarget,
    event.meta?.target,
  );
}

function riskBudgetPctFromEvent(event: OpportunityEventRecord): number | undefined {
  return percentFromMeta(
    event.meta?.riskBudgetPct,
    event.meta?.riskBudgetPercent,
    event.meta?.riskPct,
    event.meta?.riskPercent,
    event.meta?.maxLossPct,
    event.meta?.maxLossPercent,
  );
}

function riskBudgetUsdFromEvent(event: OpportunityEventRecord): number | undefined {
  return positiveNumberFromMeta(
    event.meta?.riskBudgetUsd,
    event.meta?.riskBudgetUSD,
    event.meta?.riskBudget,
    event.meta?.maxLossUsd,
    event.meta?.maxLossUSD,
  );
}

function exitReasonFromEvent(event: OpportunityEventRecord): string | undefined {
  return stringifyMeta(event.meta?.exitReason)
    || stringifyMeta(event.meta?.exitType)
    || stringifyMeta(event.meta?.exitKind)
    || stringifyMeta(event.meta?.trigger)
    || stringifyMeta(event.meta?.reason);
}

function catalystIsBlocking(urgency?: string, actionKind?: string): boolean {
  return Boolean(
    (urgency && BLOCKING_CATALYST_URGENCIES.has(urgency))
      || (actionKind && BLOCKING_CATALYST_ACTIONS.has(actionKind)),
  );
}

function reviewPlaybackMetaChips(event: OpportunityEventRecord): string[] {
  return [
    stringifyMeta(event.meta?.status),
    stringifyMeta(event.meta?.readiness),
    stringifyMeta(event.meta?.actionKind),
    stringifyMeta(event.meta?.catalystUrgency) || stringifyMeta(event.meta?.urgency),
    stringifyMeta(event.meta?.preference),
    stringifyMeta(event.meta?.field),
    stringifyMeta(event.meta?.source),
    stringifyMeta(event.meta?.confidence),
  ]
    .filter((chip): chip is string => Boolean(chip))
    .slice(0, 5);
}

function reviewPlaybackCategory(event: OpportunityEventRecord): OpportunityReviewPlaybackCategory {
  if (event.type.startsWith('mission_')) return 'mission';
  if (event.type === 'pretrade_confirmed' || event.type === 'pretrade_unconfirmed') return 'pretrade';
  if (event.type.startsWith('field_evidence_')) return 'evidence';
  if (event.type === 'catalyst_due' || event.type === 'catalyst_reminder_updated') return 'catalyst';
  if (event.type === 'thesis_upgraded' || event.type === 'thesis_degraded') return 'thesis';
  if (['signal_changed', 'leader_broken', 'relay_triggered', 'proxy_ignited'].includes(event.type)) return 'signal';
  return 'status';
}

function reviewPlaybackTone(event: OpportunityEventRecord): OpportunityReviewPlaybackTone {
  if (event.type === 'mission_completed' || event.type === 'thesis_upgraded' || event.type === 'relay_triggered' || event.type === 'proxy_ignited') {
    return 'positive';
  }
  if (event.type === 'mission_failed' || event.type === 'thesis_degraded' || event.type === 'leader_broken') {
    return 'negative';
  }
  if (event.type === 'mission_canceled' || event.type === 'signal_changed' || event.type === 'catalyst_due' || event.type === 'pretrade_unconfirmed') {
    return 'warning';
  }
  if (event.type === 'pretrade_confirmed') {
    const status = stringifyMeta(event.meta?.status);
    const readiness = stringifyMeta(event.meta?.readiness);
    if (status === 'block' || readiness === 'blocked') return 'negative';
    if (status === 'warn' || readiness === 'watch') return 'warning';
    return 'positive';
  }
  if (event.type === 'catalyst_reminder_updated') {
    const urgency = stringifyMeta(event.meta?.urgency);
    const actionKind = stringifyMeta(event.meta?.actionKind);
    const preference = stringifyMeta(event.meta?.preference);
    if (catalystIsBlocking(urgency, actionKind)) return 'negative';
    if (preference === 'reopen' || preference === 'snooze') return 'warning';
    return 'neutral';
  }
  if (event.type === 'field_evidence_invalidated') return 'warning';
  if (event.type === 'field_evidence_recorded' || event.type === 'field_evidence_restored') return 'positive';
  return 'neutral';
}

function reviewPlaybackLabel(event: OpportunityEventRecord): string {
  if (event.type === 'mission_completed') return 'Mission completed';
  if (event.type === 'mission_failed') return 'Mission failed';
  if (event.type === 'mission_canceled') return 'Mission canceled';
  if (event.type === 'mission_queued') return 'Mission queued';
  if (event.type === 'mission_linked') return 'Mission linked';
  if (event.type === 'pretrade_confirmed' || event.type === 'pretrade_unconfirmed') {
    const label = stringifyMeta(event.meta?.label) || 'Pre-trade check';
    return event.type === 'pretrade_confirmed' ? `${label} confirmed` : `${label} reopened`;
  }
  if (event.type === 'catalyst_reminder_updated') {
    return stringifyMeta(event.meta?.catalystLabel) || 'Catalyst reminder';
  }
  if (event.type === 'catalyst_due') return stringifyMeta(event.meta?.catalystLabel) || 'Catalyst due';
  if (event.type.startsWith('field_evidence_')) {
    return stringifyMeta(event.meta?.label) || stringifyMeta(event.meta?.field) || 'Field evidence';
  }
  if (event.type === 'thesis_upgraded') return 'Thesis upgraded';
  if (event.type === 'thesis_degraded') return 'Thesis degraded';
  if (event.type === 'leader_broken') return 'Leader broken';
  if (event.type === 'relay_triggered') return 'Relay triggered';
  if (event.type === 'proxy_ignited') return 'Proxy ignited';
  if (event.type === 'signal_changed') return 'Signal changed';
  return event.type === 'created' ? 'Opportunity created' : 'Opportunity updated';
}

function reviewPlaybackDetail(event: OpportunityEventRecord): string {
  const detailParts = [
    stringifyMeta(event.meta?.evidence),
    stringifyMeta(event.meta?.note),
    stringifyMeta(event.meta?.reason),
    stringifyMeta(event.meta?.field) ? `Field ${stringifyMeta(event.meta?.field)}` : undefined,
    stringifyMeta(event.meta?.source) ? `Source ${stringifyMeta(event.meta?.source)}` : undefined,
    stringifyMeta(event.meta?.confidence) ? `Confidence ${stringifyMeta(event.meta?.confidence)}` : undefined,
  ].filter(Boolean);
  return detailParts.join(' · ') || event.message;
}

function reviewPlaybackItemFromEvent(
  event: OpportunityEventRecord,
  summariesById: Map<string, OpportunitySummaryRecord>,
): OpportunityReviewPlaybackItem {
  const summary = summariesById.get(event.opportunityId);
  const category = reviewPlaybackCategory(event);
  const tone = reviewPlaybackTone(event);
  const missionId = missionIdFromEvent(event) || summary?.latestMissionId;
  const runId = runIdFromEvent(event);
  const field = stringifyMeta(event.meta?.field);
  const actionKind = stringifyMeta(event.meta?.actionKind);
  const catalystUrgency = stringifyMeta(event.meta?.catalystUrgency) || stringifyMeta(event.meta?.urgency);
  const status = stringifyMeta(event.meta?.status) || stringifyMeta(event.meta?.readiness) || stringifyMeta(event.meta?.preference);
  const evidence = stringifyMeta(event.meta?.evidence) || stringifyMeta(event.meta?.note) || stringifyMeta(event.meta?.reason);
  const symbol = symbolFromEvent(event);
  const price = priceFromEvent(event);
  const quantity = quantityFromEvent(event);
  const positionPct = positionPctFromEvent(event);
  const notionalUsd = notionalUsdFromEvent(event);
  const exitPct = exitPctFromEvent(event);
  const stopLossPrice = stopLossPriceFromEvent(event);
  const targetPrice = targetPriceFromEvent(event);
  const riskBudgetPct = riskBudgetPctFromEvent(event);
  const riskBudgetUsd = riskBudgetUsdFromEvent(event);
  const exitReason = exitReasonFromEvent(event);
  const chips = [
    category.toUpperCase(),
    tone.toUpperCase(),
    summary?.type,
    symbol,
    ...reviewPlaybackMetaChips(event),
  ].filter((chip): chip is string => Boolean(chip));

  return {
    id: event.id,
    eventId: event.id,
    opportunityId: event.opportunityId,
    opportunityTitle: summary?.title || event.opportunityId,
    ...(summary?.type ? { opportunityType: summary.type } : {}),
    timestamp: event.timestamp,
    category,
    tone,
    eventType: event.type,
    label: reviewPlaybackLabel(event),
    detail: reviewPlaybackDetail(event),
    chips,
    ...(missionId ? { missionId } : {}),
    ...(runId ? { runId } : {}),
    ...(field ? { field } : {}),
    ...(status ? { status } : {}),
    ...(actionKind ? { actionKind } : {}),
    ...(catalystUrgency ? { catalystUrgency } : {}),
    ...(evidence ? { evidence } : {}),
    ...(symbol ? { symbol } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(positionPct !== undefined ? { positionPct } : {}),
    ...(notionalUsd !== undefined ? { notionalUsd } : {}),
    ...(exitPct !== undefined ? { exitPct } : {}),
    ...(stopLossPrice !== undefined ? { stopLossPrice } : {}),
    ...(targetPrice !== undefined ? { targetPrice } : {}),
    ...(riskBudgetPct !== undefined ? { riskBudgetPct } : {}),
    ...(riskBudgetUsd !== undefined ? { riskBudgetUsd } : {}),
    ...(exitReason ? { exitReason } : {}),
  };
}

function matchesReviewPlaybackSearch(item: OpportunityReviewPlaybackItem, query?: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [
    item.opportunityId,
    item.opportunityTitle,
    item.opportunityType,
    item.category,
    item.tone,
    item.eventType,
    item.label,
    item.detail,
    item.missionId,
    item.runId,
    item.field,
    item.status,
    item.actionKind,
    item.catalystUrgency,
    item.evidence,
    item.symbol,
    item.price,
    item.quantity,
    item.positionPct,
    item.notionalUsd,
    item.exitPct,
    item.stopLossPrice,
    item.targetPrice,
    item.riskBudgetPct,
    item.riskBudgetUsd,
    item.exitReason,
    ...item.chips,
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

function normalizeBacktestTicker(value?: string): string | undefined {
  const normalized = value?.trim().replace(/^\$/, '').toUpperCase();
  return normalized || undefined;
}

function summaryTickersForBacktest(summary?: OpportunitySummaryRecord): string[] {
  if (!summary) return [];
  return [
    summary.primaryTicker,
    summary.leaderTicker,
    summary.proxyTicker,
    ...(summary.relatedTickers || []),
    ...(summary.relayTickers || []),
  ]
    .map(normalizeBacktestTicker)
    .filter((ticker): ticker is string => Boolean(ticker));
}

function matchesBacktestTicker(
  item: OpportunityReviewPlaybackItem,
  summary: OpportunitySummaryRecord | undefined,
  ticker?: string,
): boolean {
  const target = normalizeBacktestTicker(ticker);
  if (!target) return true;
  const itemSymbol = normalizeBacktestTicker(item.symbol);
  if (itemSymbol === target) return true;
  return summaryTickersForBacktest(summary).includes(target);
}

function opportunityTypeForBacktest(
  item: OpportunityReviewPlaybackItem,
  summary: OpportunitySummaryRecord | undefined,
): string | undefined {
  return summary?.type || item.opportunityType;
}

function matchesBacktestStrategy(
  item: OpportunityReviewPlaybackItem,
  summary: OpportunitySummaryRecord | undefined,
  strategy?: OpportunityType,
): boolean {
  if (!strategy) return true;
  return opportunityTypeForBacktest(item, summary) === strategy;
}

function matchesBacktestWindow(item: OpportunityReviewPlaybackItem, filters: OpportunityReviewPlaybackFilters): boolean {
  const itemMs = timestampMs(item.timestamp);
  if (itemMs === undefined) return false;
  if (filters.backtestFrom && itemMs < backtestBoundaryMs(filters.backtestFrom, false)) return false;
  if (filters.backtestTo && itemMs > backtestBoundaryMs(filters.backtestTo, true)) return false;
  return true;
}

function hasReviewBacktestFilters(filters: OpportunityReviewPlaybackFilters): boolean {
  return Boolean(filters.backtestFrom || filters.backtestTo || filters.backtestTicker || filters.backtestStrategy);
}

function filterReviewPlaybackBacktestItems(
  items: OpportunityReviewPlaybackItem[],
  filters: OpportunityReviewPlaybackFilters,
  summariesById: Map<string, OpportunitySummaryRecord>,
): OpportunityReviewPlaybackItem[] {
  if (!hasReviewBacktestFilters(filters)) return items;
  return items
    .filter((item) => matchesBacktestWindow(item, filters))
    .filter((item) => {
      const summary = summariesById.get(item.opportunityId);
      return (
        matchesBacktestTicker(item, summary, filters.backtestTicker)
        && matchesBacktestStrategy(item, summary, filters.backtestStrategy)
      );
    });
}

function buildReviewPlaybackMetrics(items: OpportunityReviewPlaybackItem[]) {
  return {
    total: items.length,
    missions: items.filter((item) => item.category === 'mission').length,
    pretrade: items.filter((item) => item.category === 'pretrade').length,
    evidence: items.filter((item) => item.category === 'evidence').length,
    catalysts: items.filter((item) => item.category === 'catalyst').length,
    risks: items.filter((item) => item.tone === 'negative').length,
    positives: items.filter((item) => item.tone === 'positive').length,
    warnings: items.filter((item) => item.tone === 'warning').length,
  };
}

function latestTimestamp(items: OpportunityReviewPlaybackItem[]): string | undefined {
  return items
    .map((item) => item.timestamp)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function clampReviewScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildReviewPlaybackOutcome(
  items: OpportunityReviewPlaybackItem[],
): OpportunityReviewPlaybackOutcome {
  const failedMissions = items.filter((item) => item.eventType === 'mission_failed').length;
  const completedMissions = items.filter((item) => item.eventType === 'mission_completed').length;
  const blockingPretrade = items.filter((item) => (
    item.category === 'pretrade'
    && (item.tone === 'negative' || item.status === 'block' || item.status === 'blocked')
  )).length;
  const catalystBlockers = items.filter((item) => item.category === 'catalyst' && item.tone === 'negative').length;
  const thesisRisks = items.filter((item) => (
    (item.category === 'thesis' || item.category === 'signal') && item.tone === 'negative'
  )).length;
  const evidenceRecorded = items.filter((item) => (
    item.eventType === 'field_evidence_recorded' || item.eventType === 'field_evidence_restored'
  )).length;
  const evidenceInvalidated = items.filter((item) => item.eventType === 'field_evidence_invalidated').length;
  const blockers = blockingPretrade + catalystBlockers;
  const riskItems = items.filter((item) => item.tone === 'negative' || item.tone === 'warning');
  const positiveItems = items.filter((item) => item.tone === 'positive');
  const score = clampReviewScore(
    failedMissions * 25
    + blockingPretrade * 20
    + catalystBlockers * 15
    + thesisRisks * 12
    + evidenceInvalidated * 8
    + riskItems.filter((item) => item.tone === 'warning').length * 5
    - completedMissions * 8
    - evidenceRecorded * 4,
  );
  const latestRiskAt = latestTimestamp(riskItems);
  const latestPositiveAt = latestTimestamp(positiveItems);

  if (items.length === 0) {
    return {
      status: 'quiet',
      headline: '暂无复盘信号',
      detail: '当前过滤条件下没有 Mission、交易前检查、催化、evidence 或 thesis 事件。',
      nextStep: '放宽过滤条件，或回到机会工作台查看最近事件。',
      score: 0,
      blockers: 0,
      failedMissions: 0,
      completedMissions: 0,
      evidenceRecorded: 0,
      evidenceInvalidated: 0,
    };
  }

  if (blockers > 0) {
    return {
      status: 'blocked',
      headline: `${blockers} 个执行前阻塞`,
      detail: `Mission 失败 ${failedMissions} 条，交易前/催化阻塞 ${blockers} 条，已记录 evidence ${evidenceRecorded} 条。`,
      nextStep: '先解除 pre-trade 或催化阻塞，再复核 Mission 失败和最新 evidence。',
      score,
      blockers,
      failedMissions,
      completedMissions,
      evidenceRecorded,
      evidenceInvalidated,
      ...(latestRiskAt ? { latestRiskAt } : {}),
      ...(latestPositiveAt ? { latestPositiveAt } : {}),
    };
  }

  if (score >= 35 || failedMissions > 0 || thesisRisks > 0) {
    return {
      status: 'review',
      headline: `${riskItems.length} 条需要复核`,
      detail: `Mission 失败 ${failedMissions} 条，thesis/signal 风险 ${thesisRisks} 条，作废 evidence ${evidenceInvalidated} 条。`,
      nextStep: '优先复核风险事件，再决定是否重跑 Mission 或更新机会 thesis。',
      score,
      blockers,
      failedMissions,
      completedMissions,
      evidenceRecorded,
      evidenceInvalidated,
      ...(latestRiskAt ? { latestRiskAt } : {}),
      ...(latestPositiveAt ? { latestPositiveAt } : {}),
    };
  }

  return {
    status: positiveItems.length >= riskItems.length ? 'ready' : 'review',
    headline: positiveItems.length >= riskItems.length ? '复盘链路偏正向' : `${riskItems.length} 条待确认变化`,
    detail: `完成 Mission ${completedMissions} 条，已记录 evidence ${evidenceRecorded} 条，风险/复核事件 ${riskItems.length} 条。`,
    nextStep: positiveItems.length >= riskItems.length
      ? '可以进入策略复盘或交易前最终检查。'
      : '确认 warning 事件是否已经被新的 evidence 或 Mission 结果覆盖。',
    score,
    blockers,
    failedMissions,
    completedMissions,
    evidenceRecorded,
    evidenceInvalidated,
    ...(latestRiskAt ? { latestRiskAt } : {}),
    ...(latestPositiveAt ? { latestPositiveAt } : {}),
  };
}

function timestampMs(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function backtestBoundaryMs(value: string | undefined, endOfDay: boolean): number {
  if (!value) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = Date.parse(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : value);
  if (!Number.isFinite(parsed)) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return parsed;
}

function itemsByTimeAsc(items: OpportunityReviewPlaybackItem[]): OpportunityReviewPlaybackItem[] {
  return [...items].sort((a, b) => (timestampMs(a.timestamp) ?? 0) - (timestampMs(b.timestamp) ?? 0));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function returnPctBetween(entryPrice?: number, exitPrice?: number): number | undefined {
  if (entryPrice === undefined || exitPrice === undefined || entryPrice <= 0) return undefined;
  return roundOne(((exitPrice - entryPrice) / entryPrice) * 100);
}

function holdingDaysBetween(start?: string, end?: string): number | undefined {
  const startMs = timestampMs(start);
  const endMs = timestampMs(end);
  if (startMs === undefined || endMs === undefined || endMs < startMs) return undefined;
  return roundOne((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function isReviewEntrySignal(item: OpportunityReviewPlaybackItem): boolean {
  return item.tone === 'positive' && (
    item.eventType === 'relay_triggered'
    || item.eventType === 'proxy_ignited'
    || item.eventType === 'thesis_upgraded'
    || item.eventType === 'mission_completed'
    || item.eventType === 'pretrade_confirmed'
  );
}

function isReviewExitSignal(item: OpportunityReviewPlaybackItem): boolean {
  return item.tone === 'negative'
    || item.eventType === 'mission_canceled'
    || item.eventType === 'pretrade_unconfirmed'
    || item.eventType === 'field_evidence_invalidated';
}

function performanceSignalFromItem(
  item: OpportunityReviewPlaybackItem,
  overrides: Partial<OpportunityReviewPlaybackPerformanceSignal> = {},
): OpportunityReviewPlaybackPerformanceSignal {
  return {
    at: item.timestamp,
    label: item.label,
    eventId: item.eventId,
    category: item.category,
    confidence: item.eventType === 'created' || item.eventType === 'updated' ? 'inferred' : 'observed',
    ...(item.price !== undefined ? { price: item.price } : {}),
    ...overrides,
  };
}

function performanceSignalFromCache(
  record: TickerPerformance,
  kind: 'entry' | 'exit',
): OpportunityReviewPlaybackPerformanceSignal {
  return {
    at: kind === 'entry' ? record.discoveredAt : record.lastUpdated,
    label: kind === 'entry' ? `${record.symbol} discovery price` : `${record.symbol} latest tracked price`,
    eventId: `performance:${record.symbol}:${kind}`,
    category: 'status',
    confidence: 'observed',
    price: kind === 'entry' ? record.priceAtDiscovery : record.currentPrice,
  };
}

function candidateSymbolsForPerformance(
  selectedSummary: OpportunitySummaryRecord | undefined,
  items: OpportunityReviewPlaybackItem[],
): string[] {
  const values = [
    selectedSummary?.primaryTicker,
    selectedSummary?.leaderTicker,
    selectedSummary?.proxyTicker,
    ...(selectedSummary?.relayTickers || []),
    ...(selectedSummary?.relatedTickers || []),
    ...items.map((item) => item.symbol),
  ];
  return [...new Set(
    values
      .map((value) => typeof value === 'string' ? value.trim().toUpperCase() : '')
      .filter(Boolean),
  )];
}

function findPriceHistorySeriesForReview(
  selectedSummary: OpportunitySummaryRecord | undefined,
  items: OpportunityReviewPlaybackItem[],
  records: PriceHistorySeries[],
): { symbol: string; series: PriceHistorySeries } | undefined {
  const candidates = candidateSymbolsForPerformance(selectedSummary, items);
  for (const symbol of candidates) {
    const series = findPriceHistorySeries(records, symbol);
    if (series) return { symbol, series };
  }
  return undefined;
}

function findTickerPerformance(
  selectedSummary: OpportunitySummaryRecord | undefined,
  items: OpportunityReviewPlaybackItem[],
  records: TickerPerformance[],
): TickerPerformance | undefined {
  const candidates = candidateSymbolsForPerformance(selectedSummary, items);
  if (candidates.length === 0) return undefined;
  return records.find((record) => candidates.includes(record.symbol.toUpperCase()));
}

function findPriceWindowPerformanceForReview(
  selectedSummary: OpportunitySummaryRecord | undefined,
  items: OpportunityReviewPlaybackItem[],
  records: PriceHistorySeries[],
  startAt?: string,
  endAt?: string,
) {
  if (!startAt || !endAt) return null;
  const match = findPriceHistorySeriesForReview(selectedSummary, items, records);
  if (!match) return null;
  return calculatePriceWindowPerformance(match.symbol, match.series.points, startAt, endAt);
}

function firstTradeSymbol(
  selectedSummary: OpportunitySummaryRecord | undefined,
  entry: OpportunityReviewPlaybackItem,
  exit?: OpportunityReviewPlaybackItem,
): string | undefined {
  return [
    entry.symbol,
    exit?.symbol,
    selectedSummary?.primaryTicker,
    selectedSummary?.leaderTicker,
    selectedSummary?.proxyTicker,
    ...(selectedSummary?.relayTickers || []),
    ...(selectedSummary?.relatedTickers || []),
  ]
    .map((value) => typeof value === 'string' ? value.trim().toUpperCase() : '')
    .find(Boolean);
}

function findPriceWindowPerformanceForTrade(
  selectedSummary: OpportunitySummaryRecord | undefined,
  entry: OpportunityReviewPlaybackItem,
  exit: OpportunityReviewPlaybackItem,
  records: PriceHistorySeries[],
) {
  const candidates = [
    entry.symbol,
    exit.symbol,
    selectedSummary?.primaryTicker,
    selectedSummary?.leaderTicker,
    selectedSummary?.proxyTicker,
    ...(selectedSummary?.relayTickers || []),
    ...(selectedSummary?.relatedTickers || []),
  ]
    .map((value) => typeof value === 'string' ? value.trim().toUpperCase() : '')
    .filter(Boolean);
  for (const symbol of [...new Set(candidates)]) {
    const series = findPriceHistorySeries(records, symbol);
    if (!series) continue;
    const performance = calculatePriceWindowPerformance(symbol, series.points, entry.timestamp, exit.timestamp);
    if (performance) return performance;
  }
  return null;
}

interface OpenReviewTradeEntry {
  entry: OpportunityReviewPlaybackItem;
  originalQuantity?: number;
  remainingQuantity?: number;
  remainingPct: number;
  positionPct?: number;
  notionalUsd?: number;
}

function roundFour(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function scaledByPct(value: number | undefined, pct: number | undefined): number | undefined {
  if (value === undefined || pct === undefined) return undefined;
  return roundOne((value * pct) / 100);
}

function tradeExitPortionPct(
  state: OpenReviewTradeEntry,
  exit: OpportunityReviewPlaybackItem,
  remainingExitQuantity?: number,
): number {
  if (remainingExitQuantity !== undefined && state.remainingQuantity !== undefined && state.remainingQuantity > 0) {
    return roundOne(Math.max(0, Math.min(100, (remainingExitQuantity / state.remainingQuantity) * 100)));
  }
  if (exit.exitPct !== undefined) return exit.exitPct;
  return 100;
}

function tradeExitQuantity(
  state: OpenReviewTradeEntry,
  exitPortionPct: number,
  remainingExitQuantity?: number,
): number | undefined {
  if (remainingExitQuantity !== undefined && state.remainingQuantity !== undefined) {
    return roundFour(Math.min(remainingExitQuantity, state.remainingQuantity));
  }
  if (state.remainingQuantity !== undefined) {
    return roundFour((state.remainingQuantity * exitPortionPct) / 100);
  }
  return remainingExitQuantity;
}

const EXIT_ATTRIBUTION_LABELS: Record<OpportunityReviewPlaybackExitAttributionKind, string> = {
  target_hit: 'Target hit',
  stop_loss: 'Stop loss',
  risk_reduction: 'Risk reduction',
  catalyst_failed: 'Catalyst failed',
  thesis_invalidated: 'Thesis invalidated',
  mission_failed: 'Mission failed',
  manual_exit: 'Manual exit',
  unknown: 'Unclassified exit',
};

const EXECUTION_QUALITY_LABELS: Record<OpportunityReviewPlaybackExecutionQualityStatus, string> = {
  on_plan: 'On plan',
  early_exit: 'Early exit',
  late_exit: 'Late exit',
  slippage: 'Slippage',
  missing_plan: 'Missing plan',
  open_position: 'Open position',
  unknown: 'Unknown quality',
};

const POSITION_SIZING_LABELS: Record<OpportunityReviewPlaybackPositionSizingStatus, string> = {
  within_plan: 'Within plan',
  scaled_down: 'Scaled down',
  open_exposure: 'Open exposure',
  oversized: 'Oversized',
  missing_sizing: 'Missing sizing',
  missing_risk_budget: 'Missing risk budget',
  unknown: 'Unknown sizing',
};

const RISK_BACKTEST_LABELS: Record<OpportunityReviewPlaybackRiskBacktestVerdict, string> = {
  favorable: 'Favorable',
  mixed: 'Mixed',
  unfavorable: 'Unfavorable',
  inconclusive: 'Inconclusive',
  no_trades: 'No trades',
};

const REVIEW_BACKTEST_SEGMENT_KIND_ORDER: Record<OpportunityReviewPlaybackRiskBacktestSegmentKind, number> = {
  opportunity_type: 0,
  stage: 1,
  status: 2,
};

const REVIEW_BACKTEST_OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  ipo_spinout: 'IPO / spinout',
  relay_chain: 'Relay chain',
  proxy_narrative: 'Proxy narrative',
  ad_hoc: 'Ad hoc',
  unknown_type: 'Unknown type',
};

const REVIEW_BACKTEST_STAGE_LABELS: Record<string, string> = {
  radar: 'Radar',
  framing: 'Framing',
  tracking: 'Tracking',
  ready: 'Ready',
  active: 'Active',
  cooldown: 'Cooldown',
  archived: 'Archived',
  unknown_stage: 'Unknown stage',
};

const REVIEW_BACKTEST_STATUS_LABELS: Record<string, string> = {
  watching: 'Watching',
  ready: 'Ready',
  active: 'Active',
  degraded: 'Degraded',
  archived: 'Archived',
  unknown_status: 'Unknown status',
};

const REVIEW_BACKTEST_VERDICT_STRENGTH: Record<OpportunityReviewPlaybackRiskBacktestVerdict, number> = {
  favorable: 4,
  mixed: 3,
  inconclusive: 2,
  no_trades: 1,
  unfavorable: 0,
};

const POSITION_SIZING_SEVERITY_ORDER: Record<OpportunityReviewPlaybackPositionSizingSeverity, number> = {
  blocker: 0,
  warning: 1,
  ok: 2,
};

const EXECUTION_PRICE_TOLERANCE_PCT = 2;
const RISK_BUDGET_OVERSIZE_TOLERANCE_PCT = 105;
const PLAN_REPAIR_SEVERITY_ORDER: Record<OpportunityReviewPlaybackPlanRepairSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

interface ExecutionQualityPlanInput {
  stopLossPrice?: number;
  targetPrice?: number;
  riskBudgetPct?: number;
  riskBudgetUsd?: number;
  exitReason?: string;
}

function riskRewardRatioBetween(entryPrice?: number, stopLossPrice?: number, targetPrice?: number): number | undefined {
  if (
    entryPrice === undefined
    || stopLossPrice === undefined
    || targetPrice === undefined
    || entryPrice <= 0
    || stopLossPrice >= entryPrice
    || targetPrice <= entryPrice
  ) {
    return undefined;
  }
  return roundOne((targetPrice - entryPrice) / (entryPrice - stopLossPrice));
}

function classifyExitAttribution(
  entry: OpportunityReviewPlaybackItem,
  exit: OpportunityReviewPlaybackItem,
  entrySignal: OpportunityReviewPlaybackPerformanceSignal,
  exitSignal: OpportunityReviewPlaybackPerformanceSignal,
  closedPct: number,
): OpportunityReviewPlaybackExitAttributionKind {
  const stopLossPrice = exit.stopLossPrice ?? entry.stopLossPrice;
  const targetPrice = exit.targetPrice ?? entry.targetPrice;
  if (exitSignal.price !== undefined && targetPrice !== undefined && exitSignal.price >= targetPrice) return 'target_hit';
  if (exitSignal.price !== undefined && stopLossPrice !== undefined && exitSignal.price <= stopLossPrice) return 'stop_loss';
  const text = [
    exit.exitReason,
    exit.eventType,
    exit.label,
    exit.detail,
    exit.status,
    exit.actionKind,
  ].join(' ').toLowerCase();
  if (/risk.?reduction|reduce|reduction|trim|scale.?down|de.?risk|降仓|减仓/.test(text)) return 'risk_reduction';
  if (/target|take.?profit|profit.?target|目标|止盈/.test(text)) return 'target_hit';
  if (/stop|loss|broken|breakdown|invalid.?below|止损|跌破/.test(text)) return 'stop_loss';
  if (/catalyst|missed|overdue|催化/.test(text)) return 'catalyst_failed';
  if (/thesis|field.?evidence|invalidated|pretrade|证据|假设/.test(text)) return 'thesis_invalidated';
  if (/mission|timeout|cancel/.test(text)) return 'mission_failed';
  if (/manual|user|operator|人工/.test(text)) return 'manual_exit';
  if (closedPct < 99.9 || exit.exitPct !== undefined) return 'risk_reduction';
  if (entrySignal.price !== undefined && exitSignal.price !== undefined) return 'manual_exit';
  return 'unknown';
}

function buildExitAttributionDetail(
  kind: OpportunityReviewPlaybackExitAttributionKind,
  closedPct: number,
  stopLossPrice: number | undefined,
  targetPrice: number | undefined,
  riskRewardRatio: number | undefined,
): string {
  const planParts = [
    stopLossPrice !== undefined ? `stop ${stopLossPrice}` : undefined,
    targetPrice !== undefined ? `target ${targetPrice}` : undefined,
    riskRewardRatio !== undefined ? `R/R ${riskRewardRatio}` : undefined,
  ].filter(Boolean);
  const plan = planParts.length > 0 ? ` 计划：${planParts.join(' · ')}。` : '';
  if (kind === 'risk_reduction') return `本次是风险降仓，关闭原始仓位 ${closedPct}%。${plan}`;
  if (kind === 'target_hit') return `退出接近或命中目标价。${plan}`;
  if (kind === 'stop_loss') return `退出接近或触发止损/失效位。${plan}`;
  if (kind === 'catalyst_failed') return `催化窗口失败、错过或过期后退出。${plan}`;
  if (kind === 'thesis_invalidated') return `关键 thesis、字段证据或交易前条件被重新打开。${plan}`;
  if (kind === 'mission_failed') return `Mission 失败、取消或超时驱动复核退出。${plan}`;
  if (kind === 'manual_exit') return `人工或事件记录触发退出。${plan}`;
  return `缺少明确退出原因。${plan}`;
}

function buildExitAttribution(
  entry: OpportunityReviewPlaybackItem,
  exit: OpportunityReviewPlaybackItem,
  entrySignal: OpportunityReviewPlaybackPerformanceSignal,
  exitSignal: OpportunityReviewPlaybackPerformanceSignal,
  closedPct: number,
): OpportunityReviewPlaybackExitAttribution {
  const stopLossPrice = exit.stopLossPrice ?? entry.stopLossPrice;
  const targetPrice = exit.targetPrice ?? entry.targetPrice;
  const riskBudgetPct = exit.riskBudgetPct ?? entry.riskBudgetPct;
  const riskBudgetUsd = exit.riskBudgetUsd ?? entry.riskBudgetUsd;
  const stopDistancePct = returnPctBetween(entrySignal.price, stopLossPrice);
  const targetUpsidePct = returnPctBetween(entrySignal.price, targetPrice);
  const exitVsStopPct = returnPctBetween(stopLossPrice, exitSignal.price);
  const exitVsTargetPct = returnPctBetween(targetPrice, exitSignal.price);
  const riskRewardRatio = riskRewardRatioBetween(entrySignal.price, stopLossPrice, targetPrice);
  const kind = classifyExitAttribution(entry, exit, entrySignal, exitSignal, closedPct);
  return {
    kind,
    label: EXIT_ATTRIBUTION_LABELS[kind],
    detail: buildExitAttributionDetail(kind, closedPct, stopLossPrice, targetPrice, riskRewardRatio),
    ...(stopLossPrice !== undefined ? { stopLossPrice } : {}),
    ...(targetPrice !== undefined ? { targetPrice } : {}),
    ...(riskBudgetPct !== undefined ? { riskBudgetPct } : {}),
    ...(riskBudgetUsd !== undefined ? { riskBudgetUsd } : {}),
    ...(stopDistancePct !== undefined ? { stopDistancePct } : {}),
    ...(targetUpsidePct !== undefined ? { targetUpsidePct } : {}),
    ...(exitVsStopPct !== undefined ? { exitVsStopPct } : {}),
    ...(exitVsTargetPct !== undefined ? { exitVsTargetPct } : {}),
    ...(riskRewardRatio !== undefined ? { riskRewardRatio } : {}),
  };
}

function executionPlanCompleteness(
  stopLossPrice: number | undefined,
  targetPrice: number | undefined,
): OpportunityReviewPlaybackPlanCompleteness {
  if (stopLossPrice !== undefined && targetPrice !== undefined) return 'complete';
  if (stopLossPrice !== undefined || targetPrice !== undefined) return 'partial';
  return 'missing';
}

function targetCapturePctBetween(
  entryPrice: number | undefined,
  exitPrice: number | undefined,
  targetPrice: number | undefined,
): number | undefined {
  if (
    entryPrice === undefined
    || exitPrice === undefined
    || targetPrice === undefined
    || targetPrice === entryPrice
  ) {
    return undefined;
  }
  return roundOne(((exitPrice - entryPrice) / (targetPrice - entryPrice)) * 100);
}

function buildExecutionQualityDetail(
  status: OpportunityReviewPlaybackExecutionQualityStatus,
  planCompleteness: OpportunityReviewPlaybackPlanCompleteness,
  targetCapturePct: number | undefined,
  slippagePct: number | undefined,
): string {
  const capture = targetCapturePct !== undefined ? `目标捕获 ${targetCapturePct}%。` : '';
  const slippage = slippagePct !== undefined ? `滑点 ${slippagePct}%。` : '';
  if (status === 'on_plan') return `退出符合已有 stop/target 计划。${capture}`;
  if (status === 'early_exit') return `退出早于 stop/target 终局，属于提前降风险或人工复核动作。${capture}`;
  if (status === 'late_exit') return `退出晚于计划触发点，需要复盘执行延迟。${slippage}`;
  if (status === 'slippage') return `退出价格相对计划触发点偏离较大。${slippage}`;
  if (status === 'missing_plan') return '缺少 stop/target 计划字段，无法判断执行质量。';
  if (status === 'open_position') return planCompleteness === 'missing'
    ? '仍有 open exposure，且缺少 stop/target 计划字段。'
    : '仍有 open exposure，等待后续 exit/risk event 验证执行质量。';
  return '价格、计划或退出原因不足，执行质量待人工复核。';
}

function buildPlanRepairSuggestions(
  status: OpportunityReviewPlaybackTradeStatus,
  entrySignal: OpportunityReviewPlaybackPerformanceSignal,
  exitSignal: OpportunityReviewPlaybackPerformanceSignal | undefined,
  planInput: ExecutionQualityPlanInput,
): OpportunityReviewPlaybackPlanRepairSuggestion[] {
  const suggestions: OpportunityReviewPlaybackPlanRepairSuggestion[] = [];
  if (planInput.stopLossPrice === undefined) {
    suggestions.push({
      kind: 'add_stop_loss',
      label: 'Add stop loss',
      detail: '补充 meta.stopLossPrice，复盘才能判断 stop loss、late exit 和 slippage。',
      field: 'meta.stopLossPrice',
      severity: 'blocker',
    });
  }
  if (planInput.targetPrice === undefined) {
    suggestions.push({
      kind: 'add_target_price',
      label: 'Add target price',
      detail: '补充 meta.targetPrice，复盘才能判断 target hit 和目标捕获率。',
      field: 'meta.targetPrice',
      severity: 'blocker',
    });
  }
  if (planInput.riskBudgetPct === undefined && planInput.riskBudgetUsd === undefined) {
    suggestions.push({
      kind: 'add_risk_budget',
      label: 'Add risk budget',
      detail: '补充 meta.riskBudgetPct 或 meta.riskBudgetUsd，复盘才能评估这笔交易承担了多少计划内风险。',
      field: 'meta.riskBudgetPct',
      severity: 'warning',
    });
  }
  if (entrySignal.price === undefined) {
    suggestions.push({
      kind: 'add_entry_price',
      label: 'Add entry price',
      detail: '补充 entryPrice 或 price，复盘才能计算真实收益、回撤和目标捕获率。',
      field: 'meta.entryPrice',
      severity: 'warning',
    });
  }
  if (status !== 'open' && exitSignal?.price === undefined) {
    suggestions.push({
      kind: 'add_exit_price',
      label: 'Add exit price',
      detail: '补充 exitPrice 或 price，复盘才能判断退出是否贴近 stop/target 计划。',
      field: 'meta.exitPrice',
      severity: 'warning',
    });
  }
  if (
    status !== 'open'
    && !planInput.exitReason
  ) {
    suggestions.push({
      kind: 'add_exit_reason',
      label: 'Add exit reason',
      detail: '补充 meta.exitReason，例如 target_hit、stop_loss、risk_reduction、catalyst_failed 或 thesis_invalidated。',
      field: 'meta.exitReason',
      severity: 'warning',
    });
  }
  return suggestions;
}

function executionQualityPlanInputFromItems(
  entry: OpportunityReviewPlaybackItem,
  exit?: OpportunityReviewPlaybackItem,
): ExecutionQualityPlanInput {
  const input: ExecutionQualityPlanInput = {};
  const stopLossPrice = exit?.stopLossPrice ?? entry.stopLossPrice;
  const targetPrice = exit?.targetPrice ?? entry.targetPrice;
  const riskBudgetPct = exit?.riskBudgetPct ?? entry.riskBudgetPct;
  const riskBudgetUsd = exit?.riskBudgetUsd ?? entry.riskBudgetUsd;
  const exitReason = exit?.exitReason;
  if (stopLossPrice !== undefined) input.stopLossPrice = stopLossPrice;
  if (targetPrice !== undefined) input.targetPrice = targetPrice;
  if (riskBudgetPct !== undefined) input.riskBudgetPct = riskBudgetPct;
  if (riskBudgetUsd !== undefined) input.riskBudgetUsd = riskBudgetUsd;
  if (exitReason) input.exitReason = exitReason;
  return input;
}

function classifyExecutionQuality(
  status: OpportunityReviewPlaybackTradeStatus,
  exitAttribution: OpportunityReviewPlaybackExitAttribution | undefined,
  entrySignal: OpportunityReviewPlaybackPerformanceSignal,
  exitSignal: OpportunityReviewPlaybackPerformanceSignal | undefined,
  planCompleteness: OpportunityReviewPlaybackPlanCompleteness,
  stopLossPrice: number | undefined,
  targetPrice: number | undefined,
): OpportunityReviewPlaybackExecutionQualityStatus {
  if (status === 'open') return 'open_position';
  if (planCompleteness === 'missing') return 'missing_plan';
  if (!exitAttribution || exitSignal?.price === undefined) return 'unknown';
  if (exitAttribution.kind === 'target_hit') {
    if (targetPrice === undefined) return 'unknown';
    return exitSignal.price >= targetPrice * (1 - EXECUTION_PRICE_TOLERANCE_PCT / 100)
      ? 'on_plan'
      : 'early_exit';
  }
  if (exitAttribution.kind === 'stop_loss') {
    if (stopLossPrice === undefined) return 'unknown';
    if (exitSignal.price < stopLossPrice * (1 - EXECUTION_PRICE_TOLERANCE_PCT / 100)) return 'slippage';
    if (exitSignal.price <= stopLossPrice * (1 + EXECUTION_PRICE_TOLERANCE_PCT / 100)) return 'on_plan';
    return 'late_exit';
  }
  if (exitAttribution.kind === 'risk_reduction') return 'early_exit';
  if (exitAttribution.kind === 'catalyst_failed' || exitAttribution.kind === 'thesis_invalidated' || exitAttribution.kind === 'mission_failed') {
    return 'early_exit';
  }
  if (entrySignal.price !== undefined && exitSignal.price !== undefined) return 'early_exit';
  return 'unknown';
}

function buildExecutionQuality(
  status: OpportunityReviewPlaybackTradeStatus,
  entrySignal: OpportunityReviewPlaybackPerformanceSignal,
  exitSignal: OpportunityReviewPlaybackPerformanceSignal | undefined,
  exitAttribution: OpportunityReviewPlaybackExitAttribution | undefined,
  planInput: ExecutionQualityPlanInput = {},
): OpportunityReviewPlaybackExecutionQuality {
  const stopLossPrice = exitAttribution?.stopLossPrice ?? planInput.stopLossPrice;
  const targetPrice = exitAttribution?.targetPrice ?? planInput.targetPrice;
  const riskBudgetPct = exitAttribution?.riskBudgetPct ?? planInput.riskBudgetPct;
  const riskBudgetUsd = exitAttribution?.riskBudgetUsd ?? planInput.riskBudgetUsd;
  const normalizedPlanInput = {
    ...planInput,
    ...(stopLossPrice !== undefined ? { stopLossPrice } : {}),
    ...(targetPrice !== undefined ? { targetPrice } : {}),
    ...(riskBudgetPct !== undefined ? { riskBudgetPct } : {}),
    ...(riskBudgetUsd !== undefined ? { riskBudgetUsd } : {}),
  };
  const planCompleteness = executionPlanCompleteness(stopLossPrice, targetPrice);
  const plannedExitPrice = exitAttribution?.kind === 'target_hit'
    ? targetPrice
    : exitAttribution?.kind === 'stop_loss'
      ? stopLossPrice
      : undefined;
  const targetCapturePct = targetCapturePctBetween(entrySignal.price, exitSignal?.price, targetPrice);
  const stopBreachPct = returnPctBetween(stopLossPrice, exitSignal?.price);
  const slippagePct = plannedExitPrice !== undefined && exitSignal?.price !== undefined
    ? returnPctBetween(plannedExitPrice, exitSignal.price)
    : undefined;
  const qualityStatus = classifyExecutionQuality(
    status,
    exitAttribution,
    entrySignal,
    exitSignal,
    planCompleteness,
    stopLossPrice,
    targetPrice,
  );
  const repairSuggestions = buildPlanRepairSuggestions(status, entrySignal, exitSignal, normalizedPlanInput);
  return {
    status: qualityStatus,
    label: EXECUTION_QUALITY_LABELS[qualityStatus],
    detail: buildExecutionQualityDetail(qualityStatus, planCompleteness, targetCapturePct, slippagePct),
    planCompleteness,
    priceTolerancePct: EXECUTION_PRICE_TOLERANCE_PCT,
    repairSuggestions,
    ...(plannedExitPrice !== undefined ? { plannedExitPrice } : {}),
    ...(targetCapturePct !== undefined ? { targetCapturePct } : {}),
    ...(stopBreachPct !== undefined ? { stopBreachPct } : {}),
    ...(slippagePct !== undefined ? { slippagePct } : {}),
  };
}

function buildRiskRewardAttribution(
  status: OpportunityReviewPlaybackTradeStatus,
  returnPct: number | undefined,
  maxDrawdownPct: number | undefined,
  exposurePct: number | undefined,
): OpportunityReviewPlaybackRiskRewardAttribution {
  const outcome: OpportunityReviewPlaybackRiskRewardOutcome = returnPct === undefined
    ? 'unknown'
    : returnPct > 0.05
      ? 'gain'
      : returnPct < -0.05
        ? 'loss'
        : 'flat';
  const returnContributionPct = returnPct !== undefined && exposurePct !== undefined
    ? roundOne((returnPct * exposurePct) / 100)
    : undefined;
  const drawdownContributionPct = maxDrawdownPct !== undefined && exposurePct !== undefined
    ? roundOne((maxDrawdownPct * exposurePct) / 100)
    : undefined;
  const note = exposurePct !== undefined && returnContributionPct !== undefined
    ? `仓位暴露 ${exposurePct}%，收益贡献 ${returnContributionPct >= 0 ? '+' : ''}${returnContributionPct}%。`
    : status === 'open'
      ? '仍有未关闭仓位，等待 exit/risk event 或最新价格确认。'
      : '缺少 positionPct，无法折算组合收益贡献。';
  return {
    outcome,
    note,
    ...(exposurePct !== undefined ? { exposurePct } : {}),
    ...(returnContributionPct !== undefined ? { returnContributionPct } : {}),
    ...(drawdownContributionPct !== undefined ? { drawdownContributionPct } : {}),
  };
}

function hasSizingValues(values: {
  entryQuantity?: number;
  exitQuantity?: number;
  remainingQuantity?: number;
  positionPct?: number;
  notionalUsd?: number;
}): boolean {
  return values.entryQuantity !== undefined
    || values.exitQuantity !== undefined
    || values.remainingQuantity !== undefined
    || values.positionPct !== undefined
    || values.notionalUsd !== undefined;
}

function positionSizingDetail(
  status: OpportunityReviewPlaybackPositionSizingStatus,
  riskAtStopPct: number | undefined,
  riskBudgetPct: number | undefined,
  riskBudgetUsedPct: number | undefined,
  remainingExposurePct: number | undefined,
): string {
  const risk = riskAtStopPct !== undefined ? `risk-at-stop ${riskAtStopPct}%` : 'risk-at-stop unknown';
  const budget = riskBudgetPct !== undefined ? `budget ${riskBudgetPct}%` : 'budget unknown';
  const usage = riskBudgetUsedPct !== undefined ? `usage ${riskBudgetUsedPct}%` : 'usage unknown';
  if (status === 'oversized') return `仓位风险超过计划预算：${risk}，${budget}，${usage}。`;
  if (status === 'scaled_down') return `Partial exit 已降低仓位，剩余敞口 ${remainingExposurePct ?? 'unknown'}%，${risk}。`;
  if (status === 'open_exposure') return `仍有 open exposure，${risk}，${budget}，${usage}。`;
  if (status === 'missing_sizing') return '缺少 quantity / positionPct / notional，无法判断仓位是否符合计划。';
  if (status === 'missing_risk_budget') return `有仓位信息，但缺少 riskBudgetPct / riskBudgetUsd，${risk}。`;
  if (status === 'within_plan') return `仓位风险在预算内：${risk}，${budget}，${usage}。`;
  return '仓位、止损或风险预算不足，仓位规则待人工复核。';
}

function buildPositionSizingRule(
  status: OpportunityReviewPlaybackTradeStatus,
  entrySignal: OpportunityReviewPlaybackPerformanceSignal,
  values: {
    entryQuantity?: number;
    exitQuantity?: number;
    remainingQuantity?: number;
    closedPct?: number;
    remainingPct?: number;
    remainingExposurePct?: number;
    positionPct?: number;
    notionalUsd?: number;
  },
  exitAttribution: OpportunityReviewPlaybackExitAttribution | undefined,
  planInput: ExecutionQualityPlanInput,
): OpportunityReviewPlaybackPositionSizingRule {
  const riskBudgetPct = exitAttribution?.riskBudgetPct ?? planInput.riskBudgetPct;
  const riskBudgetUsd = exitAttribution?.riskBudgetUsd ?? planInput.riskBudgetUsd;
  const stopLossPrice = exitAttribution?.stopLossPrice ?? planInput.stopLossPrice;
  const stopDistancePct = exitAttribution?.stopDistancePct ?? returnPctBetween(entrySignal.price, stopLossPrice);
  const hasSizing = hasSizingValues(values);
  const riskAtStopPct = values.positionPct !== undefined && stopDistancePct !== undefined
    ? roundOne(Math.abs((values.positionPct * stopDistancePct) / 100))
    : undefined;
  const riskBudgetUsedPct = riskAtStopPct !== undefined && riskBudgetPct !== undefined && riskBudgetPct > 0
    ? roundOne((riskAtStopPct / riskBudgetPct) * 100)
    : undefined;
  let sizingStatus: OpportunityReviewPlaybackPositionSizingStatus = 'unknown';
  let severity: OpportunityReviewPlaybackPositionSizingSeverity = 'warning';

  if (!hasSizing) {
    sizingStatus = 'missing_sizing';
  } else if (riskBudgetPct === undefined && riskBudgetUsd === undefined) {
    sizingStatus = 'missing_risk_budget';
  } else if (riskBudgetUsedPct !== undefined && riskBudgetUsedPct > RISK_BUDGET_OVERSIZE_TOLERANCE_PCT) {
    sizingStatus = 'oversized';
    severity = 'blocker';
  } else if (status === 'partial') {
    sizingStatus = 'scaled_down';
    severity = 'ok';
  } else if (status === 'open') {
    sizingStatus = 'open_exposure';
    severity = 'ok';
  } else if (riskAtStopPct !== undefined || riskBudgetPct !== undefined || riskBudgetUsd !== undefined) {
    sizingStatus = 'within_plan';
    severity = 'ok';
  }

  return {
    status: sizingStatus,
    label: POSITION_SIZING_LABELS[sizingStatus],
    severity,
    detail: positionSizingDetail(sizingStatus, riskAtStopPct, riskBudgetPct, riskBudgetUsedPct, values.remainingExposurePct ?? values.positionPct),
    hasSizing,
    ...(values.positionPct !== undefined ? { exposurePct: values.positionPct } : {}),
    ...(values.remainingExposurePct !== undefined ? { remainingExposurePct: values.remainingExposurePct } : {}),
    ...(values.notionalUsd !== undefined ? { notionalUsd: values.notionalUsd } : {}),
    ...(riskBudgetPct !== undefined ? { riskBudgetPct } : {}),
    ...(riskBudgetUsd !== undefined ? { riskBudgetUsd } : {}),
    ...(stopDistancePct !== undefined ? { stopDistancePct } : {}),
    ...(riskAtStopPct !== undefined ? { riskAtStopPct } : {}),
    ...(riskBudgetUsedPct !== undefined ? { riskBudgetUsedPct } : {}),
  };
}

function buildReviewPlaybackTradeLegs(
  orderedItems: OpportunityReviewPlaybackItem[],
  selectedSummary: OpportunitySummaryRecord | undefined,
  priceHistoryRecords: PriceHistorySeries[],
): OpportunityReviewPlaybackTradeLeg[] {
  const openEntries: OpenReviewTradeEntry[] = [];
  const trades: OpportunityReviewPlaybackTradeLeg[] = [];

  for (const item of orderedItems) {
    if (isReviewEntrySignal(item)) {
      const quantity = item.quantity;
      const entryPrice = item.price;
      const notionalUsd = item.notionalUsd ?? (
        quantity !== undefined && entryPrice !== undefined ? roundOne(quantity * entryPrice) : undefined
      );
      openEntries.push({
        entry: item,
        remainingPct: 100,
        ...(quantity !== undefined ? { originalQuantity: quantity, remainingQuantity: quantity } : {}),
        ...(item.positionPct !== undefined ? { positionPct: item.positionPct } : {}),
        ...(notionalUsd !== undefined ? { notionalUsd } : {}),
      });
      continue;
    }
    if (!isReviewExitSignal(item) || openEntries.length === 0) continue;

    let remainingExitQuantity = item.quantity;
    while (openEntries.length > 0) {
      const state = openEntries[0];
      if (!state) break;
      const entry = state.entry;
      let entrySignal = performanceSignalFromItem(entry);
      let exitSignal = performanceSignalFromItem(item);
      const symbol = firstTradeSymbol(selectedSummary, entry, item);
      const priceWindow = findPriceWindowPerformanceForTrade(selectedSummary, entry, item, priceHistoryRecords);
      let priceSource: OpportunityReviewPlaybackPriceSource | undefined;
      let returnPct: number | undefined;
      let maxDrawdownPct: number | undefined;
      let peakReturnPct: number | undefined;
      const notes: string[] = [];

      if (priceWindow) {
        priceSource = 'price_history_cache';
        returnPct = priceWindow.returnPct;
        maxDrawdownPct = priceWindow.maxDrawdownPct;
        peakReturnPct = priceWindow.peakReturnPct;
        entrySignal = entrySignal.price !== undefined
          ? entrySignal
          : { ...entrySignal, price: priceWindow.entryPrice, confidence: 'inferred' };
        exitSignal = exitSignal.price !== undefined
          ? exitSignal
          : { ...exitSignal, price: priceWindow.exitPrice, confidence: 'inferred' };
        notes.push('价格来自 price history cache 时间窗。');
      } else if (entrySignal.price !== undefined && exitSignal.price !== undefined) {
        priceSource = 'event_meta';
        returnPct = returnPctBetween(entrySignal.price, exitSignal.price);
        maxDrawdownPct = returnPct !== undefined ? Math.min(returnPct, 0) : undefined;
        notes.push('价格来自事件 meta。');
      } else {
        notes.push('缺少完整 entry/exit price，只保留事件配对。');
      }

      const exitPortionPct = tradeExitPortionPct(state, item, remainingExitQuantity);
      if (exitPortionPct <= 0) break;
      const closedPct = roundOne((state.remainingPct * exitPortionPct) / 100);
      const remainingPct = roundOne(Math.max(0, state.remainingPct - closedPct));
      const exitQuantity = tradeExitQuantity(state, exitPortionPct, remainingExitQuantity);
      const remainingQuantity = state.remainingQuantity !== undefined && exitQuantity !== undefined
        ? roundFour(Math.max(0, state.remainingQuantity - exitQuantity))
        : undefined;
      const status: OpportunityReviewPlaybackTradeStatus = remainingPct > 0.1 ? 'partial' : 'closed';
      const positionPct = scaledByPct(state.positionPct, closedPct);
      const notionalUsd = scaledByPct(state.notionalUsd, closedPct);
      if (status === 'partial') {
        notes.push(`Partial exit：本次关闭原始仓位 ${closedPct}%，剩余 ${remainingPct}%。`);
      }

      const holdingDays = holdingDaysBetween(entry.timestamp, item.timestamp);
      const exitAttribution = buildExitAttribution(entry, item, entrySignal, exitSignal, closedPct);
      const planInput = executionQualityPlanInputFromItems(entry, item);
      const executionQuality = buildExecutionQuality(
        status,
        entrySignal,
        exitSignal,
        exitAttribution,
        planInput,
      );
      const remainingExposurePct = scaledByPct(state.positionPct, remainingPct);
      const sizingRule = buildPositionSizingRule(
        status,
        entrySignal,
        {
          ...(state.originalQuantity !== undefined ? { entryQuantity: state.originalQuantity } : {}),
          ...(exitQuantity !== undefined ? { exitQuantity } : {}),
          ...(remainingQuantity !== undefined ? { remainingQuantity } : {}),
          closedPct,
          ...(remainingPct > 0.1 ? { remainingPct } : {}),
          ...(remainingExposurePct !== undefined ? { remainingExposurePct } : {}),
          ...(positionPct !== undefined ? { positionPct } : {}),
          ...(notionalUsd !== undefined ? { notionalUsd } : {}),
        },
        exitAttribution,
        planInput,
      );
      trades.push({
        id: `${entry.eventId}:${item.eventId}`,
        status,
        ...(symbol ? { symbol } : {}),
        entry: entrySignal,
        exit: exitSignal,
        ...(holdingDays !== undefined ? { holdingDays } : {}),
        ...(state.originalQuantity !== undefined ? { entryQuantity: state.originalQuantity } : {}),
        ...(exitQuantity !== undefined ? { exitQuantity } : {}),
        ...(remainingQuantity !== undefined && remainingQuantity > 0 ? { remainingQuantity } : {}),
        closedPct,
        ...(remainingPct > 0.1 ? { remainingPct } : {}),
        ...(positionPct !== undefined ? { positionPct } : {}),
        ...(notionalUsd !== undefined ? { notionalUsd } : {}),
        ...(returnPct !== undefined ? { returnPct } : {}),
        ...(maxDrawdownPct !== undefined ? { maxDrawdownPct } : {}),
        ...(peakReturnPct !== undefined ? { peakReturnPct } : {}),
        ...(priceSource ? { priceSource } : {}),
        dataQuality: returnPct !== undefined || maxDrawdownPct !== undefined ? 'price_confirmed' : 'event_only',
        exitAttribution,
        executionQuality,
        sizingRule,
        riskReward: buildRiskRewardAttribution(status, returnPct, maxDrawdownPct, positionPct),
        notes,
      });

      if (remainingExitQuantity !== undefined && exitQuantity !== undefined) {
        remainingExitQuantity = roundFour(Math.max(0, remainingExitQuantity - exitQuantity));
      }

      if (status === 'closed') {
        openEntries.shift();
      } else {
        openEntries[0] = {
          ...state,
          remainingPct,
          ...(remainingQuantity !== undefined ? { remainingQuantity } : {}),
        };
        break;
      }

      if (remainingExitQuantity === undefined || remainingExitQuantity <= 0.0001) break;
    }
  }

  for (const state of openEntries) {
    const entry = state.entry;
    const symbol = firstTradeSymbol(selectedSummary, entry);
    const entrySignal = performanceSignalFromItem(entry);
    const positionPct = scaledByPct(state.positionPct, state.remainingPct);
    const notionalUsd = scaledByPct(state.notionalUsd, state.remainingPct);
    const planInput = executionQualityPlanInputFromItems(entry);
    const sizingRule = buildPositionSizingRule(
      'open',
      entrySignal,
      {
        ...(state.originalQuantity !== undefined ? { entryQuantity: state.originalQuantity } : {}),
        ...(state.remainingQuantity !== undefined ? { remainingQuantity: state.remainingQuantity } : {}),
        remainingPct: state.remainingPct,
        ...(positionPct !== undefined ? { positionPct, remainingExposurePct: positionPct } : {}),
        ...(notionalUsd !== undefined ? { notionalUsd } : {}),
      },
      undefined,
      planInput,
    );
    trades.push({
      id: `${entry.eventId}:open`,
      status: 'open',
      ...(symbol ? { symbol } : {}),
      entry: entrySignal,
      ...(state.originalQuantity !== undefined ? { entryQuantity: state.originalQuantity } : {}),
      ...(state.remainingQuantity !== undefined ? { remainingQuantity: state.remainingQuantity } : {}),
      remainingPct: state.remainingPct,
      ...(positionPct !== undefined ? { positionPct } : {}),
      ...(notionalUsd !== undefined ? { notionalUsd } : {}),
      dataQuality: entry.price !== undefined ? 'price_confirmed' : 'event_only',
      executionQuality: buildExecutionQuality('open', entrySignal, undefined, undefined, planInput),
      sizingRule,
      riskReward: buildRiskRewardAttribution('open', undefined, undefined, positionPct),
      notes: ['尚未找到匹配的 exit/risk event。'],
    });
  }

  return trades;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => value !== undefined);
  if (numbers.length === 0) return undefined;
  return roundOne(numbers.reduce((sum, value) => sum + value, 0));
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => value !== undefined);
  if (numbers.length === 0) return undefined;
  return roundOne(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function percentOf(part: number, total: number): number | undefined {
  if (total <= 0) return undefined;
  return roundOne((part / total) * 100);
}

function buildRiskBacktestDetail(
  verdict: OpportunityReviewPlaybackRiskBacktestVerdict,
  pricedLegs: number,
  winRatePct: number | undefined,
  avgReturnPct: number | undefined,
  avgMaxDrawdownPct: number | undefined,
): string {
  const sample = `${pricedLegs} priced leg${pricedLegs === 1 ? '' : 's'}`;
  const winRate = winRatePct !== undefined ? `win rate ${winRatePct}%` : 'win rate n/a';
  const avgReturn = avgReturnPct !== undefined ? `avg return ${avgReturnPct}%` : 'avg return n/a';
  const avgDrawdown = avgMaxDrawdownPct !== undefined ? `avg DD ${avgMaxDrawdownPct}%` : 'avg DD n/a';
  if (verdict === 'no_trades') return '还没有 entry/exit 复盘腿，无法形成风险回测样本。';
  if (verdict === 'inconclusive') return `样本不足或缺少价格，当前只有 ${sample}，${winRate}，${avgReturn}。`;
  if (verdict === 'unfavorable') return `风险收益不划算：${sample}，${winRate}，${avgReturn}，${avgDrawdown}。`;
  if (verdict === 'favorable') return `当前规则表现较好：${sample}，${winRate}，${avgReturn}，${avgDrawdown}。`;
  return `当前规则表现混合：${sample}，${winRate}，${avgReturn}，${avgDrawdown}。`;
}

function buildRiskBacktestSummary(
  trades: OpportunityReviewPlaybackTradeLeg[],
  position: OpportunityReviewPlaybackPositionSummary,
): OpportunityReviewPlaybackRiskBacktestSummary {
  const closedTrades = trades.filter((trade) => trade.status !== 'open');
  const pricedTrades = closedTrades.filter((trade) => trade.returnPct !== undefined);
  const winningTrades = pricedTrades.filter((trade) => (trade.returnPct || 0) > 0.05);
  const losingTrades = pricedTrades.filter((trade) => (trade.returnPct || 0) < -0.05);
  const avgWinnerPct = averageDefined(winningTrades.map((trade) => trade.returnPct));
  const avgLoserPct = averageDefined(losingTrades.map((trade) => trade.returnPct));
  const payoffRatio = avgWinnerPct !== undefined && avgLoserPct !== undefined && avgLoserPct !== 0
    ? roundOne(avgWinnerPct / Math.abs(avgLoserPct))
    : undefined;
  const winRatePct = pricedTrades.length > 0 ? roundOne((winningTrades.length / pricedTrades.length) * 100) : undefined;
  const avgReturnPct = averageDefined(pricedTrades.map((trade) => trade.returnPct));
  const avgMaxDrawdownPct = averageDefined(pricedTrades.map((trade) => trade.maxDrawdownPct));
  const avgRiskAtStopPct = averageDefined(trades.map((trade) => trade.sizingRule?.riskAtStopPct));
  const avgRiskBudgetUsedPct = averageDefined(trades.map((trade) => trade.sizingRule?.riskBudgetUsedPct));
  const oversizedLegs = trades.filter((trade) => trade.sizingRule?.status === 'oversized').length;
  const planRepairLegs = trades.filter((trade) => (trade.executionQuality?.repairSuggestions.length || 0) > 0).length;
  const executionIssueLegs = trades.filter((trade) => (
    trade.executionQuality?.status === 'late_exit'
    || trade.executionQuality?.status === 'slippage'
    || trade.executionQuality?.status === 'missing_plan'
    || trade.executionQuality?.status === 'unknown'
  )).length;

  let verdict: OpportunityReviewPlaybackRiskBacktestVerdict = 'mixed';
  if (trades.length === 0) {
    verdict = 'no_trades';
  } else if (closedTrades.length === 0 || pricedTrades.length === 0) {
    verdict = 'inconclusive';
  } else if (
    oversizedLegs > 0
    || executionIssueLegs > 0
    || (avgReturnPct !== undefined && avgReturnPct < 0)
    || (winRatePct !== undefined && winRatePct < 40)
    || (avgMaxDrawdownPct !== undefined && avgMaxDrawdownPct <= -15)
  ) {
    verdict = 'unfavorable';
  } else if (
    avgReturnPct !== undefined
    && avgReturnPct > 0
    && winRatePct !== undefined
    && winRatePct >= 50
    && oversizedLegs === 0
    && executionIssueLegs === 0
  ) {
    verdict = 'favorable';
  }

  const notes = [
    pricedTrades.length > 0
      ? `已用 ${pricedTrades.length}/${closedTrades.length} 笔 closed/partial leg 计算收益样本。`
      : 'closed/partial leg 缺少价格，暂时无法计算真实胜率。',
    position.openExposurePct !== undefined ? `仍有 ${position.openExposurePct}% open exposure 未纳入胜率。` : undefined,
    oversizedLegs > 0 ? `${oversizedLegs} 笔仓位超过风险预算。` : undefined,
    executionIssueLegs > 0 ? `${executionIssueLegs} 笔存在执行质量问题。` : undefined,
    planRepairLegs > 0 ? `${planRepairLegs} 笔缺少完整计划字段。` : undefined,
  ].filter((note): note is string => Boolean(note));

  return {
    verdict,
    label: RISK_BACKTEST_LABELS[verdict],
    detail: buildRiskBacktestDetail(verdict, pricedTrades.length, winRatePct, avgReturnPct, avgMaxDrawdownPct),
    sampleSize: trades.length,
    closedLegs: closedTrades.length,
    pricedLegs: pricedTrades.length,
    oversizedLegs,
    planRepairLegs,
    executionIssueLegs,
    notes,
    ...(winRatePct !== undefined ? { winRatePct } : {}),
    ...(avgReturnPct !== undefined ? { avgReturnPct } : {}),
    ...(avgMaxDrawdownPct !== undefined ? { avgMaxDrawdownPct } : {}),
    ...(avgRiskAtStopPct !== undefined ? { avgRiskAtStopPct } : {}),
    ...(avgRiskBudgetUsedPct !== undefined ? { avgRiskBudgetUsedPct } : {}),
    ...(payoffRatio !== undefined ? { payoffRatio } : {}),
    ...(position.realizedReturnContributionPct !== undefined ? { realizedReturnContributionPct: position.realizedReturnContributionPct } : {}),
    ...(position.openExposurePct !== undefined ? { openExposurePct: position.openExposurePct } : {}),
  };
}

function hasTradeSizing(trade: OpportunityReviewPlaybackTradeLeg): boolean {
  return trade.entryQuantity !== undefined
    || trade.exitQuantity !== undefined
    || trade.remainingQuantity !== undefined
    || trade.positionPct !== undefined
    || trade.notionalUsd !== undefined;
}

function buildPositionSummary(
  trades: OpportunityReviewPlaybackTradeLeg[],
): OpportunityReviewPlaybackPositionSummary {
  const closedLegs = trades.filter((trade) => trade.status === 'closed').length;
  const partialLegs = trades.filter((trade) => trade.status === 'partial').length;
  const openLegs = trades.filter((trade) => trade.status === 'open').length;
  const sizedLegs = trades.filter(hasTradeSizing).length;
  const realizedReturnContributionPct = sumDefined(
    trades
      .filter((trade) => trade.status !== 'open')
      .map((trade) => trade.riskReward?.returnContributionPct),
  );
  const drawdownContributionPct = sumDefined(
    trades
      .filter((trade) => trade.status !== 'open')
      .map((trade) => trade.riskReward?.drawdownContributionPct),
  );
  const openExposurePct = sumDefined(
    trades
      .filter((trade) => trade.status === 'open')
      .map((trade) => trade.positionPct),
  );
  const attributionCounts = new Map<OpportunityReviewPlaybackExitAttributionKind, number>();
  for (const trade of trades) {
    const kind = trade.exitAttribution?.kind;
    if (!kind) continue;
    attributionCounts.set(kind, (attributionCounts.get(kind) || 0) + 1);
  }
  const exitAttributions = Array.from(attributionCounts.entries())
    .map(([kind, count]) => ({ kind, label: EXIT_ATTRIBUTION_LABELS[kind], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const executionQualityCounts = new Map<OpportunityReviewPlaybackExecutionQualityStatus, number>();
  for (const trade of trades) {
    const status = trade.executionQuality?.status;
    if (!status) continue;
    executionQualityCounts.set(status, (executionQualityCounts.get(status) || 0) + 1);
  }
  const executionQuality = Array.from(executionQualityCounts.entries())
    .map(([status, count]) => ({ status, label: EXECUTION_QUALITY_LABELS[status], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const planRepairCounts = new Map<
    OpportunityReviewPlaybackPlanRepairSuggestionKind,
    OpportunityReviewPlaybackPlanRepairSuggestionCount
  >();
  for (const trade of trades) {
    for (const suggestion of trade.executionQuality?.repairSuggestions || []) {
      const current = planRepairCounts.get(suggestion.kind);
      planRepairCounts.set(suggestion.kind, {
        kind: suggestion.kind,
        label: suggestion.label,
        severity: suggestion.severity,
        count: (current?.count || 0) + 1,
      });
    }
  }
  const planRepairSuggestions = Array.from(planRepairCounts.values())
    .sort((a, b) => (
      PLAN_REPAIR_SEVERITY_ORDER[a.severity] - PLAN_REPAIR_SEVERITY_ORDER[b.severity]
      || b.count - a.count
      || a.label.localeCompare(b.label)
    ));
  const sizingRuleCounts = new Map<
    OpportunityReviewPlaybackPositionSizingStatus,
    OpportunityReviewPlaybackPositionSizingRuleCount
  >();
  for (const trade of trades) {
    const rule = trade.sizingRule;
    if (!rule) continue;
    const current = sizingRuleCounts.get(rule.status);
    sizingRuleCounts.set(rule.status, {
      status: rule.status,
      label: rule.label,
      severity: rule.severity,
      count: (current?.count || 0) + 1,
    });
  }
  const sizingRules = Array.from(sizingRuleCounts.values())
    .sort((a, b) => (
      POSITION_SIZING_SEVERITY_ORDER[a.severity] - POSITION_SIZING_SEVERITY_ORDER[b.severity]
      || b.count - a.count
      || a.label.localeCompare(b.label)
    ));
  const notes = [
    sizedLegs > 0
      ? `已识别 ${sizedLegs}/${trades.length} 笔带仓位信息的复盘腿。`
      : '事件缺少 quantity / positionPct / notional，暂时只能复盘方向和价格。',
    partialLegs > 0 ? `已识别 ${partialLegs} 笔 partial exit。` : undefined,
    openLegs > 0 ? `仍有 ${openLegs} 笔 open exposure。` : undefined,
  ].filter((note): note is string => Boolean(note));
  return {
    closedLegs,
    partialLegs,
    openLegs,
    sizedLegs,
    notes,
    exitAttributions,
    executionQuality,
    planRepairSuggestions,
    sizingRules,
    ...(realizedReturnContributionPct !== undefined ? { realizedReturnContributionPct } : {}),
    ...(drawdownContributionPct !== undefined ? { drawdownContributionPct } : {}),
    ...(openExposurePct !== undefined ? { openExposurePct } : {}),
  };
}

interface RiskBacktestSegmentAccumulator {
  kind: OpportunityReviewPlaybackRiskBacktestSegmentKind;
  key: string;
  opportunityIds: Set<string>;
  trades: OpportunityReviewPlaybackTradeLeg[];
}

interface MultiOpportunityRiskBacktestAggregate {
  trades: OpportunityReviewPlaybackTradeLeg[];
  position: OpportunityReviewPlaybackPositionSummary;
  riskBacktest: OpportunityReviewPlaybackRiskBacktestSummary;
  strategyBacktest: OpportunityReviewPlaybackStrategyBacktestSummary;
}

function riskBacktestSegmentLabel(
  kind: OpportunityReviewPlaybackRiskBacktestSegmentKind,
  key: string,
): string {
  if (kind === 'opportunity_type') return REVIEW_BACKTEST_OPPORTUNITY_TYPE_LABELS[key] || key;
  if (kind === 'stage') return REVIEW_BACKTEST_STAGE_LABELS[key] || key;
  return REVIEW_BACKTEST_STATUS_LABELS[key] || key;
}

function addRiskBacktestSegment(
  groups: Map<string, RiskBacktestSegmentAccumulator>,
  kind: OpportunityReviewPlaybackRiskBacktestSegmentKind,
  key: string,
  opportunityId: string,
  trades: OpportunityReviewPlaybackTradeLeg[],
): void {
  const groupId = `${kind}:${key}`;
  const current = groups.get(groupId) || {
    kind,
    key,
    opportunityIds: new Set<string>(),
    trades: [],
  };
  current.opportunityIds.add(opportunityId);
  current.trades.push(...trades);
  groups.set(groupId, current);
}

function buildRiskBacktestSegment(
  group: RiskBacktestSegmentAccumulator,
): OpportunityReviewPlaybackRiskBacktestSegment {
  const position = buildPositionSummary(group.trades);
  const summary = buildRiskBacktestSummary(group.trades, position);
  return {
    kind: group.kind,
    key: group.key,
    label: riskBacktestSegmentLabel(group.kind, group.key),
    verdict: summary.verdict,
    verdictLabel: summary.label,
    opportunityCount: group.opportunityIds.size,
    sampleSize: summary.sampleSize,
    closedLegs: summary.closedLegs,
    pricedLegs: summary.pricedLegs,
    oversizedLegs: summary.oversizedLegs,
    planRepairLegs: summary.planRepairLegs,
    executionIssueLegs: summary.executionIssueLegs,
    ...(summary.winRatePct !== undefined ? { winRatePct: summary.winRatePct } : {}),
    ...(summary.avgReturnPct !== undefined ? { avgReturnPct: summary.avgReturnPct } : {}),
    ...(summary.avgMaxDrawdownPct !== undefined ? { avgMaxDrawdownPct: summary.avgMaxDrawdownPct } : {}),
    ...(summary.avgRiskAtStopPct !== undefined ? { avgRiskAtStopPct: summary.avgRiskAtStopPct } : {}),
    ...(summary.avgRiskBudgetUsedPct !== undefined ? { avgRiskBudgetUsedPct: summary.avgRiskBudgetUsedPct } : {}),
    ...(summary.payoffRatio !== undefined ? { payoffRatio: summary.payoffRatio } : {}),
  };
}

function strategyBacktestGroupFromSegment(
  segment: OpportunityReviewPlaybackRiskBacktestSegment,
): OpportunityReviewPlaybackStrategyBacktestGroup {
  const coveragePct = percentOf(segment.pricedLegs, segment.closedLegs);
  return {
    key: segment.key,
    label: segment.label,
    verdict: segment.verdict,
    verdictLabel: segment.verdictLabel,
    opportunityCount: segment.opportunityCount,
    sampleSize: segment.sampleSize,
    closedLegs: segment.closedLegs,
    pricedLegs: segment.pricedLegs,
    ...(coveragePct !== undefined ? { coveragePct } : {}),
    ...(segment.winRatePct !== undefined ? { winRatePct: segment.winRatePct } : {}),
    ...(segment.avgReturnPct !== undefined ? { avgReturnPct: segment.avgReturnPct } : {}),
    ...(segment.avgMaxDrawdownPct !== undefined ? { avgMaxDrawdownPct: segment.avgMaxDrawdownPct } : {}),
    ...(segment.avgRiskAtStopPct !== undefined ? { avgRiskAtStopPct: segment.avgRiskAtStopPct } : {}),
    ...(segment.avgRiskBudgetUsedPct !== undefined ? { avgRiskBudgetUsedPct: segment.avgRiskBudgetUsedPct } : {}),
    ...(segment.payoffRatio !== undefined ? { payoffRatio: segment.payoffRatio } : {}),
    oversizedLegs: segment.oversizedLegs,
    planRepairLegs: segment.planRepairLegs,
    executionIssueLegs: segment.executionIssueLegs,
  };
}

function strategyBacktestGroupFromSummary(
  key: string,
  label: string,
  summary: OpportunityReviewPlaybackRiskBacktestSummary,
  opportunityCount: number,
): OpportunityReviewPlaybackStrategyBacktestGroup {
  const coveragePct = percentOf(summary.pricedLegs, summary.closedLegs);
  return {
    key,
    label,
    verdict: summary.verdict,
    verdictLabel: summary.label,
    opportunityCount,
    sampleSize: summary.sampleSize,
    closedLegs: summary.closedLegs,
    pricedLegs: summary.pricedLegs,
    ...(coveragePct !== undefined ? { coveragePct } : {}),
    ...(summary.winRatePct !== undefined ? { winRatePct: summary.winRatePct } : {}),
    ...(summary.avgReturnPct !== undefined ? { avgReturnPct: summary.avgReturnPct } : {}),
    ...(summary.avgMaxDrawdownPct !== undefined ? { avgMaxDrawdownPct: summary.avgMaxDrawdownPct } : {}),
    ...(summary.avgRiskAtStopPct !== undefined ? { avgRiskAtStopPct: summary.avgRiskAtStopPct } : {}),
    ...(summary.avgRiskBudgetUsedPct !== undefined ? { avgRiskBudgetUsedPct: summary.avgRiskBudgetUsedPct } : {}),
    ...(summary.payoffRatio !== undefined ? { payoffRatio: summary.payoffRatio } : {}),
    oversizedLegs: summary.oversizedLegs,
    planRepairLegs: summary.planRepairLegs,
    executionIssueLegs: summary.executionIssueLegs,
  };
}

function compareStrategyBacktestGroups(
  left: OpportunityReviewPlaybackStrategyBacktestGroup,
  right: OpportunityReviewPlaybackStrategyBacktestGroup,
): number {
  return (
    REVIEW_BACKTEST_VERDICT_STRENGTH[right.verdict] - REVIEW_BACKTEST_VERDICT_STRENGTH[left.verdict]
    || (right.avgReturnPct ?? Number.NEGATIVE_INFINITY) - (left.avgReturnPct ?? Number.NEGATIVE_INFINITY)
    || (right.winRatePct ?? Number.NEGATIVE_INFINITY) - (left.winRatePct ?? Number.NEGATIVE_INFINITY)
    || right.pricedLegs - left.pricedLegs
    || left.label.localeCompare(right.label)
  );
}

function compareWeakStrategyBacktestGroups(
  left: OpportunityReviewPlaybackStrategyBacktestGroup,
  right: OpportunityReviewPlaybackStrategyBacktestGroup,
): number {
  return (
    REVIEW_BACKTEST_VERDICT_STRENGTH[left.verdict] - REVIEW_BACKTEST_VERDICT_STRENGTH[right.verdict]
    || (left.avgReturnPct ?? Number.POSITIVE_INFINITY) - (right.avgReturnPct ?? Number.POSITIVE_INFINITY)
    || right.oversizedLegs - left.oversizedLegs
    || right.executionIssueLegs - left.executionIssueLegs
    || right.planRepairLegs - left.planRepairLegs
    || right.pricedLegs - left.pricedLegs
    || left.label.localeCompare(right.label)
  );
}

function buildStrategyBacktestDetail(
  groups: OpportunityReviewPlaybackStrategyBacktestGroup[],
  bestGroup: OpportunityReviewPlaybackStrategyBacktestGroup | undefined,
  weakestGroup: OpportunityReviewPlaybackStrategyBacktestGroup | undefined,
): string {
  if (groups.length === 0) return '还没有可聚合的策略族样本。';
  const pricedGroups = groups.filter((group) => group.pricedLegs > 0);
  if (pricedGroups.length === 0) return `已识别 ${groups.length} 个策略族，但 closed/partial leg 还缺少价格样本。`;
  const best = bestGroup
    ? `Best ${bestGroup.label}: ${bestGroup.pricedLegs} priced，avg ${bestGroup.avgReturnPct ?? 'n/a'}%，win ${bestGroup.winRatePct ?? 'n/a'}%。`
    : undefined;
  const weak = weakestGroup && weakestGroup.key !== bestGroup?.key
    ? `Weakest ${weakestGroup.label}: ${weakestGroup.pricedLegs} priced，avg ${weakestGroup.avgReturnPct ?? 'n/a'}%，issues ${weakestGroup.oversizedLegs + weakestGroup.executionIssueLegs + weakestGroup.planRepairLegs}。`
    : undefined;
  return [best, weak].filter(Boolean).join(' ');
}

function buildStrategyBacktestFilterLabel(filters: OpportunityReviewPlaybackFilters = {}): string {
  const strategyLabel = filters.backtestStrategy
    ? riskBacktestSegmentLabel('opportunity_type', filters.backtestStrategy)
    : undefined;
  const parts = [
    strategyLabel ? `Strategy ${strategyLabel}` : undefined,
    normalizeBacktestTicker(filters.backtestTicker) ? `Ticker ${normalizeBacktestTicker(filters.backtestTicker)}` : undefined,
    filters.backtestFrom ? `From ${filters.backtestFrom}` : undefined,
    filters.backtestTo ? `To ${filters.backtestTo}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : 'All history';
}

function buildStrategyBacktestSummary(
  riskBacktest: OpportunityReviewPlaybackRiskBacktestSummary,
  groups: OpportunityReviewPlaybackStrategyBacktestGroup[],
  opportunityCount: number,
  filters: OpportunityReviewPlaybackFilters = {},
): OpportunityReviewPlaybackStrategyBacktestSummary {
  const ticker = normalizeBacktestTicker(filters.backtestTicker);
  const strategy = filters.backtestStrategy;
  const strategyLabel = strategy ? riskBacktestSegmentLabel('opportunity_type', strategy) : undefined;
  const orderedGroups = [...groups].sort(compareStrategyBacktestGroups);
  const coveredGroups = orderedGroups.filter((group) => group.pricedLegs > 0);
  const bestGroup = coveredGroups[0];
  const weakestGroup = coveredGroups.length > 0
    ? [...coveredGroups].sort(compareWeakStrategyBacktestGroups)[0]
    : undefined;
  const status: OpportunityReviewPlaybackStrategyBacktestStatus = orderedGroups.length === 0 || riskBacktest.sampleSize === 0
    ? 'empty'
    : coveredGroups.length === orderedGroups.length
      ? 'ready'
      : 'partial';
  const headline = status === 'empty'
    ? '暂无策略回测样本'
    : status === 'partial'
      ? `${coveredGroups.length}/${orderedGroups.length} 个策略族已有价格样本`
      : `${orderedGroups.length} 个策略族已有回测样本`;
  const notes = [
    riskBacktest.opportunitiesWithPricedTrades !== undefined
      ? `${riskBacktest.opportunitiesWithPricedTrades}/${riskBacktest.opportunityCount ?? opportunityCount} 个机会已有 priced closed/partial leg。`
      : undefined,
    bestGroup ? `当前表现最好：${bestGroup.label}。` : undefined,
    weakestGroup ? `最需要复核：${weakestGroup.label}。` : undefined,
  ].filter((note): note is string => Boolean(note));

  return {
    status,
    headline,
    detail: buildStrategyBacktestDetail(orderedGroups, bestGroup, weakestGroup),
    filterLabel: buildStrategyBacktestFilterLabel(filters),
    ...(filters.backtestFrom ? { windowStart: filters.backtestFrom } : {}),
    ...(filters.backtestTo ? { windowEnd: filters.backtestTo } : {}),
    ...(ticker ? { ticker } : {}),
    ...(strategy ? { strategy } : {}),
    ...(strategyLabel ? { strategyLabel } : {}),
    totalStrategies: orderedGroups.length,
    coveredStrategies: coveredGroups.length,
    opportunityCount,
    pricedLegs: riskBacktest.pricedLegs,
    closedLegs: riskBacktest.closedLegs,
    notes,
    groups: orderedGroups,
    ...(bestGroup ? { bestGroup } : {}),
    ...(weakestGroup ? { weakestGroup } : {}),
  };
}

function buildMultiOpportunityRiskBacktest(
  items: OpportunityReviewPlaybackItem[],
  summariesById: Map<string, OpportunitySummaryRecord>,
  priceHistoryRecords: PriceHistorySeries[],
  filters: OpportunityReviewPlaybackFilters = {},
): MultiOpportunityRiskBacktestAggregate {
  const itemsByOpportunity = new Map<string, OpportunityReviewPlaybackItem[]>();
  for (const item of items) {
    const current = itemsByOpportunity.get(item.opportunityId) || [];
    current.push(item);
    itemsByOpportunity.set(item.opportunityId, current);
  }

  const allTrades: OpportunityReviewPlaybackTradeLeg[] = [];
  const segmentGroups = new Map<string, RiskBacktestSegmentAccumulator>();
  let opportunitiesWithTrades = 0;
  let opportunitiesWithPricedTrades = 0;

  for (const [opportunityId, opportunityItems] of itemsByOpportunity.entries()) {
    const summary = summariesById.get(opportunityId);
    const trades = buildReviewPlaybackTradeLegs(
      itemsByTimeAsc(opportunityItems),
      summary,
      priceHistoryRecords,
    );
    if (trades.length > 0) opportunitiesWithTrades += 1;
    if (trades.some((trade) => trade.status !== 'open' && trade.returnPct !== undefined)) {
      opportunitiesWithPricedTrades += 1;
    }
    allTrades.push(...trades);
    const opportunityType = summary?.type
      || opportunityItems.find((item) => item.opportunityType)?.opportunityType
      || 'unknown_type';
    addRiskBacktestSegment(
      segmentGroups,
      'opportunity_type',
      opportunityType,
      opportunityId,
      trades,
    );
    addRiskBacktestSegment(
      segmentGroups,
      'stage',
      summary?.stage || 'unknown_stage',
      opportunityId,
      trades,
    );
    addRiskBacktestSegment(
      segmentGroups,
      'status',
      summary?.status || 'unknown_status',
      opportunityId,
      trades,
    );
  }

  const position = buildPositionSummary(allTrades);
  const baseRiskBacktest = buildRiskBacktestSummary(allTrades, position);
  const segments = Array.from(segmentGroups.values())
    .map(buildRiskBacktestSegment)
    .sort((a, b) => (
      REVIEW_BACKTEST_SEGMENT_KIND_ORDER[a.kind] - REVIEW_BACKTEST_SEGMENT_KIND_ORDER[b.kind]
      || b.pricedLegs - a.pricedLegs
      || b.sampleSize - a.sampleSize
      || a.label.localeCompare(b.label)
    ));
  const notes = [
    ...baseRiskBacktest.notes,
    itemsByOpportunity.size > 0
      ? `跨 ${itemsByOpportunity.size} 个机会聚合，${opportunitiesWithPricedTrades} 个机会已有 priced closed/partial leg。`
      : undefined,
    opportunitiesWithTrades < itemsByOpportunity.size
      ? `${itemsByOpportunity.size - opportunitiesWithTrades} 个机会还没有 entry/exit 复盘腿。`
      : undefined,
  ].filter((note): note is string => Boolean(note));

  const riskBacktest: OpportunityReviewPlaybackRiskBacktestSummary = {
    ...baseRiskBacktest,
    opportunityCount: itemsByOpportunity.size,
    opportunitiesWithTrades,
    opportunitiesWithPricedTrades,
    notes,
    segments,
  };
  const strategyGroups = segments
    .filter((segment) => segment.kind === 'opportunity_type')
    .map(strategyBacktestGroupFromSegment);

  return {
    trades: allTrades,
    position,
    riskBacktest,
    strategyBacktest: buildStrategyBacktestSummary(riskBacktest, strategyGroups, itemsByOpportunity.size, filters),
  };
}

function priceHistoryAgeHours(updatedAt: string | undefined, generatedAt: string): number | undefined {
  const updatedMs = timestampMs(updatedAt);
  const generatedMs = timestampMs(generatedAt);
  if (updatedMs === undefined || generatedMs === undefined || generatedMs < updatedMs) return undefined;
  return roundOne((generatedMs - updatedMs) / (60 * 60 * 1000));
}

function buildReviewPlaybackPriceCacheSummary(
  selectedSummary: OpportunitySummaryRecord | undefined,
  items: OpportunityReviewPlaybackItem[],
  records: PriceHistorySeries[],
  generatedAt: string,
): OpportunityReviewPlaybackPriceCacheSummary {
  const candidates = candidateSymbolsForPerformance(selectedSummary, items);
  const match = findPriceHistorySeriesForReview(selectedSummary, items, records);
  if (!match) {
    return {
      status: candidates[0] ? 'missing' : 'unknown',
      staleAfterHours: REVIEW_PRICE_CACHE_STALE_AFTER_HOURS,
      ...(candidates[0] ? { symbol: candidates[0] } : {}),
      refreshPath: '/command-center',
    };
  }

  const sortedPoints = [...match.series.points]
    .sort((a, b) => (timestampMs(a.at) ?? 0) - (timestampMs(b.at) ?? 0));
  const oldestPointAt = sortedPoints[0]?.at;
  const newestPointAt = sortedPoints[sortedPoints.length - 1]?.at;
  const ageHours = priceHistoryAgeHours(match.series.updatedAt, generatedAt);
  const status: OpportunityReviewPlaybackPriceCacheStatus = (
    sortedPoints.length === 0
    || !match.series.updatedAt
    || ageHours === undefined
    || ageHours > REVIEW_PRICE_CACHE_STALE_AFTER_HOURS
  )
    ? 'stale'
    : 'fresh';

  return {
    status,
    staleAfterHours: REVIEW_PRICE_CACHE_STALE_AFTER_HOURS,
    symbol: match.symbol,
    ...(match.series.source ? { source: match.series.source } : {}),
    ...(match.series.updatedAt ? { updatedAt: match.series.updatedAt } : {}),
    ...(ageHours !== undefined ? { ageHours } : {}),
    pointCount: sortedPoints.length,
    ...(oldestPointAt ? { oldestPointAt } : {}),
    ...(newestPointAt ? { newestPointAt } : {}),
    refreshPath: '/command-center',
  };
}

function sortedHeatHistory(history: OpportunityHeatHistoryPoint[]): OpportunityHeatHistoryPoint[] {
  return [...history]
    .filter((point) => Number.isFinite(point.relayScore) && timestampMs(point.createdAt) !== undefined)
    .sort((a, b) => (timestampMs(a.createdAt) ?? 0) - (timestampMs(b.createdAt) ?? 0));
}

function heatMaxDrawdownPct(points: OpportunityHeatHistoryPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  let peak = points[0]?.relayScore ?? 0;
  let maxDrawdown = 0;
  for (const point of points.slice(1)) {
    if (point.relayScore > peak) {
      peak = point.relayScore;
      continue;
    }
    if (peak <= 0) continue;
    const drawdown = ((point.relayScore - peak) / peak) * 100;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  return roundOne(maxDrawdown);
}

function buildReviewPerformanceDetail(
  status: OpportunityReviewPlaybackPerformanceStatus,
  heatStart: number | undefined,
  heatEnd: number | undefined,
  heatDelta: number | undefined,
  heatDrawdown: number | undefined,
  riskEvents: number,
  triggeredCatalysts: number,
  returnPct: number | undefined,
  maxDrawdownPct: number | undefined,
  priceSource: OpportunityReviewPlaybackPriceSource | undefined,
): string {
  if (status === 'multi_opportunity') {
    return '当前结果横跨多个 Opportunity，事件可以横向扫描，但收益、回撤和持有期需要先收敛到单个机会。';
  }
  if (status === 'insufficient_data') {
    return '当前过滤条件下缺少 entry / exit / heat history，暂时只能作为事件空态处理。';
  }
  const heatPart = heatStart !== undefined && heatEnd !== undefined
    ? `Heat ${heatStart} → ${heatEnd}${heatDelta !== undefined ? `（${heatDelta >= 0 ? '+' : ''}${heatDelta}）` : ''}`
    : '暂无 heat history';
  const pricePart = returnPct !== undefined || maxDrawdownPct !== undefined
    ? `价格复盘 ${returnPct !== undefined ? `${returnPct >= 0 ? '+' : ''}${returnPct}%` : 'n/a'}，最大回撤 ${maxDrawdownPct !== undefined ? `${maxDrawdownPct}%` : 'n/a'}${priceSource ? `（${priceSource}）` : ''}`
    : undefined;
  const drawdownPart = maxDrawdownPct !== undefined
    ? undefined
    : heatDrawdown !== undefined
      ? `最大回撤代理 ${heatDrawdown}%`
      : '最大回撤待补价格或 heat history';
  return [pricePart, heatPart, drawdownPart]
    .filter(Boolean)
    .join('，')
    .concat(`；催化触发 ${triggeredCatalysts} 条，风险事件 ${riskEvents} 条。`);
}

function buildReviewPlaybackPerformance(
  items: OpportunityReviewPlaybackItem[],
  heatHistory: OpportunityHeatHistoryPoint[],
  selectedOpportunityId?: string,
  selectedSummary?: OpportunitySummaryRecord,
  tickerPerformanceRecords: TickerPerformance[] = [],
  priceHistoryRecords: PriceHistorySeries[] = [],
  generatedAt = new Date().toISOString(),
  summariesById: Map<string, OpportunitySummaryRecord> = new Map(),
  filters: OpportunityReviewPlaybackFilters = {},
): OpportunityReviewPlaybackPerformanceSummary {
  const opportunityIds = new Set(items.map((item) => item.opportunityId));
  const opportunityCount = selectedOpportunityId ? 1 : opportunityIds.size;
  const singleOpportunityId = opportunityIds.size === 1 ? Array.from(opportunityIds)[0] : undefined;
  const effectiveSelectedSummary = selectedSummary || (singleOpportunityId ? summariesById.get(singleOpportunityId) : undefined);
  const notes: string[] = [];
  const cachedPerformance = findTickerPerformance(effectiveSelectedSummary, items, tickerPerformanceRecords);
  const fallbackSymbol = candidateSymbolsForPerformance(effectiveSelectedSummary, items)[0] || cachedPerformance?.symbol;
  const priceCache: OpportunityReviewPlaybackPriceCacheSummary = opportunityCount > 1
    ? {
        status: 'unknown',
        staleAfterHours: REVIEW_PRICE_CACHE_STALE_AFTER_HOURS,
        refreshPath: '/command-center',
      }
    : buildReviewPlaybackPriceCacheSummary(
        effectiveSelectedSummary,
        items,
        priceHistoryRecords,
        generatedAt,
      );
  const heatPoints = sortedHeatHistory(heatHistory);
  const heatStart = heatPoints[0]?.relayScore;
  const heatEnd = heatPoints[heatPoints.length - 1]?.relayScore;
  const heatValues = heatPoints.map((point) => point.relayScore);
  const heatDelta = heatStart !== undefined && heatEnd !== undefined ? roundOne(heatEnd - heatStart) : undefined;
  const heatHigh = heatValues.length > 0 ? Math.max(...heatValues) : undefined;
  const heatLow = heatValues.length > 0 ? Math.min(...heatValues) : undefined;
  const heatDrawdown = heatMaxDrawdownPct(heatPoints);

  if (opportunityCount > 1) {
    const aggregate = buildMultiOpportunityRiskBacktest(items, summariesById, priceHistoryRecords, filters);
    const dataQuality: OpportunityReviewPlaybackPerformanceDataQuality = aggregate.riskBacktest.pricedLegs > 0
      ? 'price_confirmed'
      : items.length > 0
        ? 'event_only'
        : 'missing';
    const aggregateDetail = aggregate.riskBacktest.pricedLegs > 0
      ? `跨 ${aggregate.riskBacktest.opportunityCount || opportunityCount} 个机会聚合 ${aggregate.riskBacktest.pricedLegs}/${aggregate.riskBacktest.closedLegs} 笔 priced closed/partial leg；${aggregate.riskBacktest.detail}`
      : buildReviewPerformanceDetail('multi_opportunity', heatStart, heatEnd, heatDelta, heatDrawdown, 0, 0, undefined, undefined, undefined);
    return {
      status: 'multi_opportunity',
      headline: '选择单个 Opportunity 查看交易复盘',
      detail: aggregateDetail,
      nextStep: '想看逐笔上下文时在 Opportunity 过滤框输入具体 id；跨机会 Risk backtest 会继续保留策略族/阶段切片。',
      opportunityCount,
      triggeredCatalysts: items.filter((item) => item.category === 'catalyst').length,
      pretradeBlockHit: false,
      pretradeBlockers: 0,
      riskEvents: items.filter((item) => item.tone === 'negative' || item.tone === 'warning').length,
      dataQuality,
      notes: [
        '主 Performance summary 需要单机会上下文，避免把多个机会的 entry / exit 混在一起。',
        'Risk backtest 会先在每个机会内部配对 entry/exit，再做跨机会聚合。',
        ...aggregate.riskBacktest.notes.slice(0, 2),
      ],
      priceCache,
      trades: aggregate.trades,
      position: aggregate.position,
      riskBacktest: aggregate.riskBacktest,
      strategyBacktest: aggregate.strategyBacktest,
    };
  }

  const ordered = itemsByTimeAsc(items);
  const trades = buildReviewPlaybackTradeLegs(ordered, effectiveSelectedSummary, priceHistoryRecords);
  const position = buildPositionSummary(trades);
  const riskBacktest = buildRiskBacktestSummary(trades, position);
  const strategyKey = filters.backtestStrategy || effectiveSelectedSummary?.type || 'unknown_type';
  const strategyBacktest = buildStrategyBacktestSummary(
    riskBacktest,
    [strategyBacktestGroupFromSummary(
      strategyKey,
      riskBacktestSegmentLabel('opportunity_type', strategyKey),
      riskBacktest,
      opportunityCount,
    )],
    opportunityCount,
    filters,
  );
  const entryItem = ordered.find(isReviewEntrySignal) || ordered.find((item) => item.tone === 'positive');
  const entryMs = timestampMs(entryItem?.timestamp);
  const exitItem = [...ordered]
    .reverse()
    .find((item) => isReviewExitSignal(item) && (entryMs === undefined || (timestampMs(item.timestamp) ?? 0) >= entryMs));
  const latestItem = ordered[ordered.length - 1];
  const triggeredCatalysts = items.filter((item) => item.category === 'catalyst' && item.tone !== 'negative').length;
  const pretradeBlockers = items.filter((item) => (
    (item.category === 'pretrade' || item.category === 'catalyst')
    && (item.tone === 'negative' || item.status === 'block' || item.status === 'blocked')
  )).length;
  const pretradeBlockHit = pretradeBlockers > 0;
  const riskEvents = items.filter((item) => item.tone === 'negative' || item.tone === 'warning').length;
  const windowStartAt = entryItem?.timestamp || effectiveSelectedSummary?.createdAt || cachedPerformance?.discoveredAt;
  const windowEndAt = exitItem?.timestamp || latestItem?.timestamp || effectiveSelectedSummary?.updatedAt || cachedPerformance?.lastUpdated;
  const priceWindow = findPriceWindowPerformanceForReview(
    effectiveSelectedSummary,
    items,
    priceHistoryRecords,
    windowStartAt,
    windowEndAt,
  );
  const holdingDays = holdingDaysBetween(
    priceWindow?.entryAt || entryItem?.timestamp,
    priceWindow?.exitAt || exitItem?.timestamp || latestItem?.timestamp,
  );
  let entrySignal = entryItem ? performanceSignalFromItem(entryItem) : undefined;
  let exitSignal = exitItem ? performanceSignalFromItem(exitItem) : undefined;
  let priceSource: OpportunityReviewPlaybackPriceSource | undefined;
  let priceAsOf: string | undefined;
  let pricePointCount: number | undefined;
  let priceWindowStart: string | undefined;
  let priceWindowEnd: string | undefined;
  let returnPct: number | undefined;
  let maxDrawdownPct: number | undefined;
  let peakReturnPct: number | undefined;

  if (priceWindow) {
    priceSource = 'price_history_cache';
    priceAsOf = priceWindow.asOf;
    pricePointCount = priceWindow.pointCount;
    priceWindowStart = priceWindow.entryAt;
    priceWindowEnd = priceWindow.exitAt;
    returnPct = priceWindow.returnPct;
    maxDrawdownPct = priceWindow.maxDrawdownPct;
    peakReturnPct = priceWindow.peakReturnPct;
    entrySignal = entrySignal?.price !== undefined
      ? entrySignal
      : entrySignal
        ? { ...entrySignal, price: priceWindow.entryPrice, confidence: 'inferred' }
        : {
            at: priceWindow.entryAt,
            label: `${priceWindow.symbol} price window start`,
            eventId: `price_history:${priceWindow.symbol}:entry`,
            category: 'status',
            confidence: 'observed',
            price: priceWindow.entryPrice,
          };
    exitSignal = exitSignal?.price !== undefined
      ? exitSignal
      : exitSignal
        ? { ...exitSignal, price: priceWindow.exitPrice, confidence: 'inferred' }
        : {
            at: priceWindow.exitAt,
            label: `${priceWindow.symbol} price window end`,
            eventId: `price_history:${priceWindow.symbol}:exit`,
            category: 'status',
            confidence: 'observed',
            price: priceWindow.exitPrice,
          };
  } else if (entrySignal?.price !== undefined && exitSignal?.price !== undefined) {
    priceSource = 'event_meta';
    priceAsOf = exitSignal.at;
    returnPct = returnPctBetween(entrySignal.price, exitSignal.price);
    maxDrawdownPct = returnPct !== undefined ? Math.min(returnPct, 0) : undefined;
  } else if (
    cachedPerformance
    && cachedPerformance.priceAtDiscovery > 0
    && cachedPerformance.currentPrice > 0
  ) {
    const cacheEntry = performanceSignalFromCache(cachedPerformance, 'entry');
    const cacheExit = performanceSignalFromCache(cachedPerformance, 'exit');
    priceSource = 'performance_cache';
    priceAsOf = cachedPerformance.lastUpdated;
    returnPct = roundOne(cachedPerformance.changePercent);
    maxDrawdownPct = roundOne(cachedPerformance.maxDrawdown);
    peakReturnPct = roundOne(cachedPerformance.peakChangePercent);
    entrySignal = entrySignal?.price !== undefined
      ? entrySignal
      : entrySignal
        ? { ...entrySignal, price: cachedPerformance.priceAtDiscovery, confidence: 'inferred' }
        : cacheEntry;
    exitSignal = exitSignal?.price !== undefined
      ? exitSignal
      : exitSignal
        ? { ...exitSignal, price: cachedPerformance.currentPrice, confidence: 'inferred' }
        : cacheExit;
  }

  const dataQuality: OpportunityReviewPlaybackPerformanceDataQuality = returnPct !== undefined || maxDrawdownPct !== undefined
    ? 'price_confirmed'
    : heatPoints.length > 0
      ? 'heat_proxy'
      : items.length > 0
        ? 'event_only'
        : 'missing';
  const riskHitByHeat = heatDrawdown !== undefined && heatDrawdown <= -15;
  const riskHitByPrice = maxDrawdownPct !== undefined && maxDrawdownPct <= -15;
  const positiveFollowThrough = !pretradeBlockHit && !exitItem && ((heatDelta ?? 0) > 0 || triggeredCatalysts > 0);

  if (!entryItem && !exitItem && heatPoints.length === 0 && items.length === 0) {
    return {
      status: 'insufficient_data',
      headline: '暂无可复盘交易结果',
      detail: buildReviewPerformanceDetail('insufficient_data', heatStart, heatEnd, heatDelta, heatDrawdown, 0, 0, returnPct, maxDrawdownPct, priceSource),
      nextStep: '先完成 Mission、交易前检查或记录一次关键 catalyst，再生成复盘。',
      opportunityCount,
      triggeredCatalysts: 0,
      pretradeBlockHit: false,
      pretradeBlockers: 0,
      riskEvents: 0,
      dataQuality,
		      notes: ['缺少 entry、exit、价格和 heat history。'],
		      priceCache,
		      trades,
		      position,
          riskBacktest,
          strategyBacktest,
		    };
		  }

  if (dataQuality === 'event_only') {
    notes.push('当前 performance 只使用事件信号，尚未接入真实 entry/exit price。');
  }
  if (dataQuality === 'heat_proxy') {
    notes.push('Heat 变化和回撤是机会热度代理，不等同于真实交易收益。');
  }
  if (dataQuality === 'price_confirmed' && priceSource === 'event_meta') {
    notes.push('收益率来自事件 meta 中记录的 entry/exit price。');
  }
  if (dataQuality === 'price_confirmed' && priceSource === 'price_history_cache') {
    notes.push('收益率和回撤来自本地 price history cache 的 entry/exit 时间窗。');
  }
  if (priceCache.status === 'stale') {
    notes.push('Price history cache 已过期，建议刷新后再复核收益和回撤。');
  }
  if (priceCache.status === 'missing') {
    notes.push('当前 ticker 缺少 price history cache，可先到 Command Center 刷新价格历史。');
  }
  if (dataQuality === 'price_confirmed' && priceSource === 'performance_cache') {
    notes.push('收益率来自本地 performance tracker 缓存，适合日常复盘但不是逐笔成交记录。');
  }
  if (!entryItem) {
    notes.push('尚未找到明确 entry signal，暂用风险和 heat history 做保守复盘。');
  }
  if (!exitItem) {
    notes.push('尚未找到明确 exit/risk close signal。');
  }
  if (trades.length > 1) {
    notes.push(`已识别 ${trades.length} 段 entry/exit 复盘腿。`);
  }
	  if (trades.some((trade) => trade.status === 'open')) {
	    notes.push('存在未闭合 entry，等待后续 exit/risk event。');
	  }
	  if (position.partialLegs > 0) {
	    notes.push(`已识别 ${position.partialLegs} 笔 partial exit。`);
	  }
	  if (position.openExposurePct !== undefined) {
	    notes.push(`当前仍有约 ${position.openExposurePct}% open exposure。`);
	  }

  const status: OpportunityReviewPlaybackPerformanceStatus = pretradeBlockHit || Boolean(exitItem) || riskHitByHeat || riskHitByPrice
    ? 'risk_hit'
    : positiveFollowThrough
      ? 'positive_follow_through'
      : 'tracking';
  const headline = status === 'risk_hit'
    ? '风险信号已命中'
    : status === 'positive_follow_through'
      ? '热度跟随偏正向'
      : '已形成可复盘链路';
  const nextStep = status === 'risk_hit'
    ? '复核 exit/risk 事件，并把真实价格、收益率和回撤补进复盘。'
    : status === 'positive_follow_through'
      ? '补充 entry/exit price 后，把 heat 代理复盘升级为真实收益复盘。'
      : '继续等待 catalyst、Mission 或价格证据，形成完整 entry → exit 链路。';

  return {
    status,
    headline,
    detail: buildReviewPerformanceDetail(status, heatStart, heatEnd, heatDelta, heatDrawdown, riskEvents, triggeredCatalysts, returnPct, maxDrawdownPct, priceSource),
    nextStep,
    opportunityCount,
    triggeredCatalysts,
    pretradeBlockHit,
    pretradeBlockers,
    riskEvents,
	    dataQuality,
		    notes,
		    trades,
		    position,
        riskBacktest,
        strategyBacktest,
		    ...(fallbackSymbol ? { symbol: cachedPerformance?.symbol || fallbackSymbol } : {}),
    ...(priceSource ? { priceSource } : {}),
    ...(priceAsOf ? { priceAsOf } : {}),
    ...(pricePointCount !== undefined ? { pricePointCount } : {}),
    ...(priceWindowStart ? { priceWindowStart } : {}),
    ...(priceWindowEnd ? { priceWindowEnd } : {}),
    priceCache,
    ...(entrySignal ? { entrySignal } : {}),
    ...(exitSignal ? { exitSignal } : {}),
    ...(holdingDays !== undefined ? { holdingDays } : {}),
    ...(returnPct !== undefined ? { returnPct } : {}),
    ...(maxDrawdownPct !== undefined ? { maxDrawdownPct } : {}),
    ...(peakReturnPct !== undefined ? { peakReturnPct } : {}),
    ...(heatStart !== undefined ? { heatStart } : {}),
    ...(heatEnd !== undefined ? { heatEnd } : {}),
    ...(heatDelta !== undefined ? { heatDelta } : {}),
    ...(heatHigh !== undefined ? { heatHigh } : {}),
    ...(heatLow !== undefined ? { heatLow } : {}),
    ...(heatDrawdown !== undefined ? { heatMaxDrawdownPct: heatDrawdown } : {}),
  };
}

export async function listOpportunityReviewPlaybackForApi(
  limit = 50,
  filters: OpportunityReviewPlaybackFilters = {},
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
): Promise<OpportunityReviewPlaybackResponse> {
  const deps = withDependencies(dependencyOverrides);
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const fetchLimit = Math.max(cappedLimit, Math.min(1200, cappedLimit * 6));
  const summaryLimit = Math.max(100, Math.min(500, cappedLimit * 4));
  const [events, summaries, heatHistory, tickerPerformanceRecords, priceHistoryRecords] = await Promise.all([
    deps.listOpportunityEvents(filters.opportunityId, fetchLimit, REVIEW_PLAYBACK_EVENT_TYPES),
    deps.listOpportunitySummaries(summaryLimit),
    filters.opportunityId ? deps.getOpportunityHeatHistory(filters.opportunityId, 60) : Promise.resolve([]),
    Promise.resolve(deps.listTickerPerformance()),
    Promise.resolve(deps.listPriceHistory()),
  ]);
  const summariesById = new Map(summaries.map((summary) => [summary.id, summary]));
  const items = events
    .map((event) => reviewPlaybackItemFromEvent(event, summariesById))
    .filter((item) => !filters.category || item.category === filters.category)
    .filter((item) => !filters.tone || item.tone === filters.tone)
    .filter((item) => matchesReviewPlaybackSearch(item, filters.q))
    .slice(0, cappedLimit);
  const performanceItems = filterReviewPlaybackBacktestItems(items, filters, summariesById);
  const generatedAt = deps.now();

  return {
    generatedAt,
    metrics: buildReviewPlaybackMetrics(items),
    outcome: buildReviewPlaybackOutcome(items),
    performance: buildReviewPlaybackPerformance(
      performanceItems,
      heatHistory,
      filters.opportunityId,
      filters.opportunityId ? summariesById.get(filters.opportunityId) : undefined,
      tickerPerformanceRecords,
      priceHistoryRecords,
      generatedAt,
      summariesById,
      filters,
    ),
    items,
  };
}

export async function listOpportunityEventsForApi(
  limit = 50,
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
  types: OpportunityEventType[] = [],
) {
  const deps = withDependencies(dependencyOverrides);
  return deps.listOpportunityEvents(undefined, limit, types);
}

export async function listOpportunityEventsForOpportunityApi(
  opportunityId: string,
  limit = 50,
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
  types: OpportunityEventType[] = [],
) {
  const deps = withDependencies(dependencyOverrides);
  return deps.listOpportunityEvents(opportunityId, limit, types);
}

export async function listOpportunityFieldEvidenceForApi(
  pagination: Pick<PaginationRequest, 'limit' | 'offset'>,
  filters: OpportunityFieldEvidenceListFilters = {},
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
) {
  const deps = withDependencies(dependencyOverrides);
  return deps.listOpportunityFieldEvidenceIndex({
    limit: pagination.limit + 1,
    offset: pagination.offset,
    filters,
  });
}

export async function getOpportunityHeatHistoryForApi(
  opportunityId: string,
  limit = 8,
  dependencyOverrides: Partial<OpportunityQueryDependencies> = {},
) {
  const deps = withDependencies(dependencyOverrides);
  return deps.getOpportunityHeatHistory(opportunityId, limit);
}
