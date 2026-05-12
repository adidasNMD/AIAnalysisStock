// Keep calls relative so Vite dev proxy and production reverse proxy share one path.
import { createApiClient, type QueryParams } from './lib/api-client';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const api = createApiClient(API_BASE);

function buildApiUrl(path: string, params?: QueryParams): string {
  const base = API_BASE.replace(/\/$/, '');
  const nextPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${nextPath}`;
  if (!params) return url;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `${url}?${serialized}` : url;
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PageEnvelope<T> {
  items: T[];
  pageInfo: PageInfo;
}

export interface PageRequest {
  limit?: number;
  cursor?: string | null;
}

type ListResponse<T> = T[] | PageEnvelope<T>;

export function emptyPage<T>(limit = 0): PageEnvelope<T> {
  return {
    items: [],
    pageInfo: {
      limit,
      nextCursor: null,
      hasMore: false,
    },
  };
}

export function isPageEnvelope<T>(value: unknown): value is PageEnvelope<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { items?: unknown; pageInfo?: unknown };
  if (!Array.isArray(candidate.items) || !candidate.pageInfo || typeof candidate.pageInfo !== 'object') {
    return false;
  }

  const pageInfo = candidate.pageInfo as { limit?: unknown; nextCursor?: unknown; hasMore?: unknown };
  return (
    typeof pageInfo.limit === 'number' &&
    typeof pageInfo.hasMore === 'boolean' &&
    (
      pageInfo.nextCursor === null ||
      pageInfo.nextCursor === undefined ||
      typeof pageInfo.nextCursor === 'string'
    )
  );
}

export function normalizePageResponse<T>(value: unknown, fallbackLimit: number): PageEnvelope<T> {
  if (isPageEnvelope<T>(value)) {
    return {
      items: value.items,
      pageInfo: {
        limit: Number.isFinite(value.pageInfo.limit) ? value.pageInfo.limit : fallbackLimit,
        nextCursor: value.pageInfo.nextCursor ?? null,
        hasMore: value.pageInfo.hasMore,
      },
    };
  }

  if (Array.isArray(value)) {
    return {
      items: value as T[],
      pageInfo: {
        limit: fallbackLimit,
        nextCursor: null,
        hasMore: false,
      },
    };
  }

  return emptyPage<T>(fallbackLimit);
}

function pageParams({ limit = 50, cursor }: PageRequest = {}): QueryParams {
  return {
    limit,
    cursor: cursor || undefined,
    envelope: 1,
  };
}

// ===== 原有类型 =====

export interface HealthStatus {
  status: string;
  isDegraded: boolean;
}

export interface TaskQueueResponse {
  summary: string;
  tasks: Array<{
    id: string;
    missionId?: string;
    runId?: string;
    query: string;
    depth: 'quick' | 'standard' | 'deep';
    status: 'pending' | 'running' | 'done' | 'failed' | 'canceled';
    progress?: 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis';
    source: string;
    createdAt: number;
    startedAt?: number;
    heartbeatAt?: number;
    cancelRequestedAt?: number;
    completedAt?: number;
    failureCode?: string;
    degradedFlags?: string;
    error?: string;
  }>;
}

export interface QueueRecoveryResponse {
  success: boolean;
  message: string;
  missionId?: string;
  runId?: string;
  taskId?: string;
}

export interface StaleQueueRecoveryResponse {
  success: boolean;
  message: string;
  totalRecovered: number;
  recoveredRunningTaskIds: string[];
  skippedActiveTaskIds: string[];
  staleThresholdMs: number;
  requeuedRuns: number;
}

export interface DynamicTicker {
  symbol: string;
  name: string;
  discoveredAt?: string;
  trendName?: string;
  chainLevel: 'sector_leader' | 'bottleneck' | 'hidden_gem';
  multibaggerScore: number;
  discoverySource: string;
  reasoning?: string;
  status: 'discovered' | 'watching' | 'focused' | 'expired';
  priceAtDiscovery?: number;
  currentPrice?: number;
  marketCap?: number;
}

export interface ReportItem {
  date: string;
  filename: string;
}

export interface TraceItem {
  date: string;
  filename: string;
}

// ===== 新增类型: Mission =====

export interface MissionConsensus {
  ticker: string;
  openclawVerdict: 'BUY' | 'HOLD' | 'SELL' | 'SKIP' | null;
  taVerdict: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
  agreement: 'agree' | 'disagree' | 'partial' | 'pending' | 'blocked';
  openbbVerdict: 'PASS' | 'WARN' | 'FAIL' | null;
}

export type MissionDiffCategory =
  | 'execution'
  | 'coverage'
  | 'consensus'
  | 'tradingAgents'
  | 'openbb'
  | 'trace';

export interface MissionDiffSummary {
  currentRunId: string;
  baselineRunId: string;
  currentAttempt: number;
  baselineAttempt: number;
  changed: boolean;
  changeCount: number;
  changedCategories: MissionDiffCategory[];
  highlights: string[];
  summary: string;
}

export type OpportunityType = 'ipo_spinout' | 'relay_chain' | 'proxy_narrative' | 'ad_hoc';

export type OpportunityStage =
  | 'radar'
  | 'framing'
  | 'tracking'
  | 'ready'
  | 'active'
  | 'cooldown'
  | 'archived';

export type OpportunityStatus = 'watching' | 'ready' | 'active' | 'degraded' | 'archived';

export interface OpportunityScores {
  purityScore: number;
  scarcityScore: number;
  tradeabilityScore: number;
  relayScore: number;
  catalystScore: number;
  policyScore: number;
}

export type OpportunityTemperature = 'cold' | 'warming' | 'hot' | 'crowded' | 'broken';

export interface OpportunityHeatProfile {
  temperature: OpportunityTemperature;
  bottleneckTickers: string[];
  laggardTickers: string[];
  junkTickers: string[];
  breadthScore?: number;
  validationStatus?: 'forming' | 'confirmed' | 'fragile' | 'broken';
  validationSummary?: string;
  edgeCount?: number;
  edges?: Array<{
    id: string;
    from: string;
    to: string;
    weight: number;
    kind: 'leader_to_bottleneck' | 'bottleneck_to_laggard' | 'leader_to_laggard';
    reason: string;
  }>;
  leaderHealth?: string;
  transmissionNote?: string;
}

export interface OpportunityProxyProfile {
  mappingTarget?: string;
  legitimacyScore: number;
  legibilityScore: number;
  tradeabilityScore: number;
  ruleStatus?: string;
  identityNote?: string;
  scarcityNote?: string;
}

export interface OpportunityFieldEvidence {
  source: string;
  confidence: OpportunityCatalystConfidence;
  note?: string;
  observedAt?: string;
}

export interface OpportunityIpoEvidence {
  officialTradingDate?: OpportunityFieldEvidence;
  spinoutDate?: OpportunityFieldEvidence;
  retainedStakePercent?: OpportunityFieldEvidence;
  lockupDate?: OpportunityFieldEvidence;
  greenshoeStatus?: OpportunityFieldEvidence;
  firstIndependentEarningsAt?: OpportunityFieldEvidence;
  firstCoverageAt?: OpportunityFieldEvidence;
}

export interface OpportunityIpoProfile {
  officialTradingDate?: string;
  spinoutDate?: string;
  retainedStakePercent?: number;
  lockupDate?: string;
  greenshoeStatus?: string;
  firstIndependentEarningsAt?: string;
  firstCoverageAt?: string;
  evidence?: OpportunityIpoEvidence;
}

export type OpportunityCatalystStatus = 'upcoming' | 'active' | 'observed' | 'missed';
export type OpportunityCatalystConfidence = 'confirmed' | 'inferred' | 'placeholder';

export type OpportunitySourceProvenanceKind = 'ipo_field' | 'catalyst' | 'mission' | 'event';
export type OpportunitySourceProvenanceConfidence = OpportunityCatalystConfidence | 'unknown';

export interface OpportunitySourceProvenanceItem {
  id: string;
  kind: OpportunitySourceProvenanceKind;
  field: string;
  label: string;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  value?: string;
  note?: string;
  observedAt?: string;
}

export interface OpportunitySourceProvenanceSummary {
  total: number;
  confirmed: number;
  inferred: number;
  placeholder: number;
  unknown: number;
  sources: string[];
  latestObservedAt?: string;
  items: OpportunitySourceProvenanceItem[];
}

export type OpportunityFieldEvidenceKind = 'record' | 'profile' | 'score' | 'source' | 'mission' | 'event';

export type OpportunityFieldEvidenceArtifactKind = 'mission' | 'event_log' | 'evidence' | 'trace' | 'report';

export interface OpportunityFieldEvidenceArtifactRef {
  missionId: string;
  kind: OpportunityFieldEvidenceArtifactKind;
  href: string;
  label: string;
  runId?: string;
  artifactId?: string;
  artifactPath?: string;
}

export interface OpportunityFieldEvidenceRef {
  id: string;
  kind: OpportunityFieldEvidenceKind;
  field: string;
  label: string;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  value?: string;
  note?: string;
  observedAt?: string;
  auditEventId?: string;
  artifact?: OpportunityFieldEvidenceArtifactRef;
}

export interface OpportunityFieldEvidenceSummary {
  total: number;
  fields: number;
  sources: string[];
  invalidated?: number;
  latestObservedAt?: string;
  items: OpportunityFieldEvidenceRef[];
}

export type OpportunityFieldEvidenceStatus = 'active' | 'invalidated';

export interface OpportunityFieldEvidenceIndexItem {
  id: string;
  opportunityId: string;
  field: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  status: OpportunityFieldEvidenceStatus;
  value?: string;
  note?: string;
  observedAt?: string;
  recordedAt: string;
  updatedAt: string;
  createdEventId?: string;
  invalidatedEventId?: string;
  restoredEventId?: string;
  opportunityTitle: string;
  opportunityType: OpportunityType;
  opportunityStage: OpportunityStage;
  opportunityStatus: OpportunityStatus;
  opportunityPrimaryTicker?: string;
  opportunityLatestMissionId?: string;
  opportunityLatestEventAt?: string;
}

export interface OpportunityFieldEvidenceIndexRequest extends PageRequest {
  opportunityId?: string;
  field?: string;
  source?: string;
  kind?: OpportunityFieldEvidenceKind | 'all';
  confidence?: OpportunitySourceProvenanceConfidence | 'all';
  status?: OpportunityFieldEvidenceStatus | 'all';
  q?: string;
}

export interface OpportunityFieldEvidenceBulkStatusItem {
  opportunityId: string;
  evidenceId: string;
  field?: string;
  source?: string;
}

export interface OpportunityFieldEvidenceBulkStatusInput {
  action: 'invalidate' | 'restore';
  reason: string;
  items: OpportunityFieldEvidenceBulkStatusItem[];
}

export interface OpportunityFieldEvidenceBulkStatusItemResult {
  index: number;
  opportunityId: string;
  evidenceId: string;
  action: OpportunityFieldEvidenceBulkStatusInput['action'];
  status: 'invalidated' | 'restored' | 'not_found' | 'failed';
  event?: OpportunityEvent;
  error?: string;
}

export interface OpportunityFieldEvidenceBulkStatusResult {
  status: 'completed';
  action: OpportunityFieldEvidenceBulkStatusInput['action'];
  total: number;
  invalidated: number;
  restored: number;
  notFound: number;
  failed: number;
  items: OpportunityFieldEvidenceBulkStatusItemResult[];
}

export type OpportunityFieldRegistryGroup =
  | 'record'
  | 'score'
  | 'heat'
  | 'proxy'
  | 'ipo'
  | 'catalyst'
  | 'mission'
  | 'event'
  | 'custom';

export interface OpportunityFieldRegistryEntry {
  field: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  group: OpportunityFieldRegistryGroup;
  base?: {
    field: string;
    label: string;
    kind: OpportunityFieldEvidenceKind;
    source: string;
    confidence: OpportunitySourceProvenanceConfidence;
    group: OpportunityFieldRegistryGroup;
  };
  overriddenFields: Array<'label' | 'kind' | 'source' | 'confidence'>;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type OpportunityFieldRegistryAuditAction = 'upsert' | 'delete';
export type OpportunityFieldRegistryAuditField = 'label' | 'kind' | 'source' | 'confidence' | 'note';

export interface OpportunityFieldRegistryOverrideSnapshot {
  field: string;
  label?: string;
  kind?: OpportunityFieldEvidenceKind;
  source?: string;
  confidence?: OpportunitySourceProvenanceConfidence;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface OpportunityFieldRegistryAuditEntry {
  id: string;
  field: string;
  action: OpportunityFieldRegistryAuditAction;
  changedFields: OpportunityFieldRegistryAuditField[];
  before?: OpportunityFieldRegistryOverrideSnapshot;
  after?: OpportunityFieldRegistryOverrideSnapshot;
  note?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface OpportunityFieldRegistryDiffBucket {
  key: string;
  count: number;
}

export interface OpportunityFieldRegistryDiffField {
  field: string;
  label: string;
  group: OpportunityFieldRegistryGroup;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  changedFields: Array<'label' | 'kind' | 'source' | 'confidence'>;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
  base?: {
    label: string;
    kind: OpportunityFieldEvidenceKind;
    source: string;
    confidence: OpportunitySourceProvenanceConfidence;
  };
}

export interface OpportunityFieldRegistryDiffReport {
  generatedAt: string;
  totalFields: number;
  baseFields: number;
  customFields: number;
  overriddenFields: number;
  overrideCoveragePercent: number;
  byGroup: OpportunityFieldRegistryDiffBucket[];
  byKind: OpportunityFieldRegistryDiffBucket[];
  byConfidence: OpportunityFieldRegistryDiffBucket[];
  changedFieldCounts: OpportunityFieldRegistryDiffBucket[];
  fields: OpportunityFieldRegistryDiffField[];
  recentAudit: OpportunityFieldRegistryAuditEntry[];
}

export interface OpportunityFieldRegistryExportPayload {
  version: 1;
  exportedAt: string;
  items: OpportunityFieldRegistryOverrideSnapshot[];
  registry: OpportunityFieldRegistryEntry[];
  report: OpportunityFieldRegistryDiffReport;
}

export interface OpportunityCatalystItem {
  label: string;
  dueAt?: string;
  status: OpportunityCatalystStatus;
  note?: string;
  source?: string;
  confidence?: OpportunityCatalystConfidence;
}

export type OpportunityDiffCategory =
  | 'stage'
  | 'status'
  | 'tickers'
  | 'catalyst'
  | 'heat'
  | 'proxy'
  | 'ipo';

export interface OpportunityDiffSummary {
  currentSnapshotId: string;
  baselineSnapshotId: string;
  changed: boolean;
  changeCount: number;
  changedCategories: OpportunityDiffCategory[];
  highlights: string[];
  summary: string;
}

export type NewCodeRadarStatus = 'filing' | 'pricing' | 'trading_soon';

export interface NewCodeRadarCandidate {
  key: string;
  companyName: string;
  title: string;
  query: string;
  status: NewCodeRadarStatus;
  summary: string;
  latestFilingType?: string;
  latestFiledAt?: string;
  filingCount: number;
  ipoProfile?: OpportunityIpoProfile;
  catalystCalendar: OpportunityCatalystItem[];
  linkedOpportunityId?: string;
}

export interface HeatTransferGraph {
  id: string;
  theme: string;
  leaderTicker?: string;
  leaderScore?: number;
  bottleneckTickers: string[];
  laggardTickers: string[];
  junkTickers: string[];
  breadthScore: number;
  relayScore: number;
  temperature: OpportunityTemperature;
  validationStatus: 'forming' | 'confirmed' | 'fragile' | 'broken';
  validationSummary: string;
  edgeCount: number;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    weight: number;
    kind: 'leader_to_bottleneck' | 'bottleneck_to_laggard' | 'leader_to_laggard';
    reason: string;
  }>;
  transmissionSummary: string;
  linkedOpportunityId?: string;
}

export interface OpportunityInboxReason {
  code:
    | 'degraded'
    | 'catalyst_due'
    | 'new_code_window'
    | 'relay_ready'
    | 'relay_inflecting'
    | 'proxy_ignited'
    | 'action_signal'
    | 'review_signal'
    | 'thesis_changed'
    | 'mission_changed'
    | 'analysis_missing'
    | 'watch';
  label: string;
  detail?: string;
  priority: number;
}

export interface OpportunityEvent {
  id: string;
  opportunityId: string;
  type:
    | 'created'
    | 'updated'
    | 'mission_linked'
    | 'mission_queued'
    | 'mission_completed'
    | 'mission_failed'
    | 'mission_canceled'
    | 'signal_changed'
    | 'thesis_upgraded'
    | 'thesis_degraded'
    | 'leader_broken'
    | 'relay_triggered'
    | 'proxy_ignited'
    | 'catalyst_due'
    | 'catalyst_reminder_updated'
    | 'pretrade_confirmed'
    | 'pretrade_unconfirmed'
    | 'field_evidence_recorded'
    | 'field_evidence_invalidated'
    | 'field_evidence_restored';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export type OpportunityEventType = OpportunityEvent['type'];

export interface OpportunityEventRequest {
  limit?: number;
  types?: OpportunityEventType[];
}

export type OpportunityCatalystReminderPreference =
  | 'acknowledge'
  | 'snooze'
  | 'reopen'
  | 'subscribe'
  | 'unsubscribe';

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

export interface OpportunityCatalystReminderAuditRequest {
  limit?: number;
  opportunityId?: string;
  preference?: OpportunityCatalystReminderPreference | 'all';
  q?: string;
  activeOnly?: boolean;
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

export interface OpportunityPreTradeAuditRequest {
  limit?: number;
  opportunityId?: string;
  category?: OpportunityPreTradeAuditCategory | 'all';
  status?: OpportunityPreTradeAuditStatus | 'all';
  q?: string;
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

export interface OpportunityReviewPlaybackRequest {
  limit?: number;
  opportunityId?: string;
  category?: OpportunityReviewPlaybackCategory | 'all';
  tone?: OpportunityReviewPlaybackTone | 'all';
  q?: string;
  backtestFrom?: string;
  backtestTo?: string;
  backtestTicker?: string;
  backtestStrategy?: OpportunityType;
}

export interface OpportunityPriceHistorySeriesDiagnostics {
  symbol: string;
  status: 'fresh' | 'stale' | 'missing' | 'orphan';
  pointCount: number;
  updatedAt?: string;
  oldestPointAt?: string;
  newestPointAt?: string;
  source?: string;
  ageHours?: number;
}

export interface OpportunityPriceHistoryDiagnostics {
  generatedAt: string;
  cachePath: string;
  staleAfterHours: number;
  trackedSymbols: string[];
  cachedSymbols: string[];
  metrics: {
    tracked: number;
    cached: number;
    fresh: number;
    stale: number;
    missing: number;
    orphan: number;
    totalPoints: number;
    coveragePct: number;
  };
  series: OpportunityPriceHistorySeriesDiagnostics[];
}

export interface OpportunityPriceHistoryRefreshInput {
  symbols?: string[];
  limit?: number;
  force?: boolean;
  staleAfterHours?: number;
}

export interface OpportunityPriceHistoryRefreshResult {
  success: boolean;
  generatedAt: string;
  cachePath: string;
  requestedSymbols: string[];
  refreshed: number;
  skippedFresh: number;
  failed: number;
  write?: {
    filePath: string;
    seriesCount: number;
    totalPoints: number;
    updatedAt: string;
  };
  items: Array<{
    symbol: string;
    status: 'refreshed' | 'skipped_fresh' | 'failed';
    fetchedPoints: number;
    cachedPoints: number;
    updatedAt?: string;
    error?: string;
  }>;
  diagnostics: OpportunityPriceHistoryDiagnostics;
}

export interface OpportunitySummary {
  id: string;
  type: OpportunityType;
  stage: OpportunityStage;
  status: OpportunityStatus;
  title: string;
  query: string;
  thesis?: string;
  summary?: string;
  primaryTicker?: string;
  leaderTicker?: string;
  proxyTicker?: string;
  relatedTickers: string[];
  relayTickers: string[];
  nextCatalystAt?: string;
  supplyOverhang?: string;
  policyStatus?: string;
  scores: OpportunityScores;
  heatProfile?: OpportunityHeatProfile;
  proxyProfile?: OpportunityProxyProfile;
  ipoProfile?: OpportunityIpoProfile;
  catalystCalendar: OpportunityCatalystItem[];
  latestMissionId?: string;
  latestEventType?: OpportunityEvent['type'];
  latestEventMessage?: string;
  latestEventAt?: string;
  createdAt: string;
  updatedAt: string;
  latestMission?: {
    id: string;
    query: string;
    status: string;
    updatedAt: string;
    source?: string;
  };
  latestRun?: MissionRun;
  latestDiff?: MissionDiffSummary;
  latestOpportunityDiff?: OpportunityDiffSummary;
  recentHeatHistory?: OpportunityHeatHistoryPoint[];
  heatInflection?: OpportunityHeatInflection | null;
  whyNowSummary?: string;
  playbook?: OpportunityPlaybook;
  suggestedMission?: OpportunitySuggestedMission;
  suggestedMissions?: OpportunitySuggestedMission[];
  recentActionTimeline?: OpportunityActionTimelineEntry[];
  sourceProvenance?: OpportunitySourceProvenanceSummary;
  fieldEvidence?: OpportunityFieldEvidenceSummary;
}

export type OpportunityBoardType = Exclude<OpportunityType, 'ad_hoc'>;
export type OpportunityBoardHealthMetricTone = 'neutral' | 'positive' | 'warning' | 'negative';

export interface OpportunityBoardHealthMetricDetail {
  opportunityId: string;
  title: string;
  reason: string;
  evidence?: string;
  eventId?: string;
  eventLabel?: string;
}

export interface OpportunityBoardHealthMetric {
  key: string;
  label: string;
  value: number;
  tone: OpportunityBoardHealthMetricTone;
  opportunityIds: string[];
  explanation?: string;
  details?: OpportunityBoardHealthMetricDetail[];
}

export interface OpportunityBoardHealthSummary {
  type: OpportunityBoardType;
  headline: string;
  summary: string;
  metrics: OpportunityBoardHealthMetric[];
}

export type OpportunityBoardHealthMap = Record<OpportunityBoardType, OpportunityBoardHealthSummary>;

export interface OpportunityInboxItem extends OpportunitySummary {
  inboxScore: number;
  inboxSummary: string;
  recommendedAction: 'analyze' | 'review' | 'monitor';
  inboxReasons: OpportunityInboxReason[];
  actionLabel?: string;
  actionDetail?: string;
  actionDecision?: OpportunityActionTimelineDecision;
  actionDriver?: OpportunityActionTimelineDriver;
  actionTimestamp?: string;
}

export type OpportunityHeatInflectionKind =
  | 'formation'
  | 'confirmation'
  | 'acceleration'
  | 'weakening'
  | 'breakdown'
  | 'rebuild';

export interface OpportunityHeatInflection {
  kind: OpportunityHeatInflectionKind;
  summary: string;
  happenedAt: string;
  scoreDelta: number;
  breadthDelta?: number;
  fromStatus?: 'forming' | 'confirmed' | 'fragile' | 'broken';
  toStatus?: 'forming' | 'confirmed' | 'fragile' | 'broken';
}

export type OpportunityPlaybookStance = 'prepare' | 'act' | 'review';

export interface OpportunityPlaybookItem {
  label: string;
  status: 'ready' | 'watch' | 'missing';
  note?: string;
}

export interface OpportunityPlaybook {
  title: string;
  stance: OpportunityPlaybookStance;
  objective: string;
  whyNow: string;
  checklist: OpportunityPlaybookItem[];
  nextStep: string;
}

export interface OpportunitySuggestedMission {
  id: string;
  label: string;
  mode: 'explore' | 'analyze' | 'review';
  query: string;
  tickers?: string[];
  depth: 'quick' | 'standard' | 'deep';
  source: string;
  whenToUse?: string;
  rationale: string;
}

export type OpportunityActionTimelineKind = 'opportunity' | 'mission';
export type OpportunityActionTimelineCategory = 'signal' | 'calendar' | 'execution' | 'thesis';
export type OpportunityActionTimelineSource = 'manual' | 'automation' | 'system';
export type OpportunityActionTimelineDecision = 'upgrade' | 'degrade' | 'act' | 'review' | 'monitor';
export type OpportunityActionTimelineDriver = 'heat' | 'rule' | 'calendar' | 'execution' | 'manual' | 'system';

export interface OpportunityActionTimelineEntry {
  id: string;
  timestamp: string;
  kind: OpportunityActionTimelineKind;
  category: OpportunityActionTimelineCategory;
  source: OpportunityActionTimelineSource;
  decision: OpportunityActionTimelineDecision;
  driver: OpportunityActionTimelineDriver;
  label: string;
  detail: string;
  reasonSummary?: string;
  tone: 'neutral' | 'positive' | 'warning' | 'negative';
}

export interface OpportunityHeatHistoryPoint {
  snapshotId: string;
  createdAt: string;
  relayScore: number;
  breadthScore?: number;
  temperature?: OpportunityTemperature;
  validationStatus?: 'forming' | 'confirmed' | 'fragile' | 'broken';
  validationSummary?: string;
  leaderTicker?: string;
  bottleneckCount: number;
  laggardCount: number;
}

export interface MissionRecoveryEventSummary {
  id: string;
  timestamp: string;
  action: string;
  label: string;
  reusedExistingRetry: boolean;
  message?: string;
  depth?: 'quick' | 'standard' | 'deep';
  costHint?: MissionRecoveryCostHint;
  taskId?: string;
  runId?: string;
  idempotencyKey?: string;
  dedupeKey?: string;
}

export interface MissionSummary {
  id: string;
  mode: 'explore' | 'analyze' | 'review';
  query: string;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  openclawTickers: string[];
  taCount: number;
  consensus: MissionConsensus[];
  totalDurationMs: number;
  latestRun?: MissionRun;
  latestDiff?: MissionDiffSummary;
  latestRecoveryEvent?: MissionRecoveryEventSummary;
}

export interface OpenBBCoreMetrics {
  priceVsSma20?: 'above' | 'below' | string;
  marketCap?: number;
  institutionalOwnership?: number;
  insiderNetDirection?: string;
  [key: string]: unknown;
}

export interface OpenBBAuxiliaryMetrics {
  peRatio?: number;
  psRatio?: number;
  revenueGrowthYoY?: number;
  freeCashFlow?: number;
  [key: string]: unknown;
}

export interface OpenBBBackgroundMetrics {
  rsi14?: number;
  [key: string]: unknown;
}

export interface OpenBBTickerData {
  ticker: string;
  core: OpenBBCoreMetrics;
  auxiliary: OpenBBAuxiliaryMetrics;
  background: OpenBBBackgroundMetrics;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  verdictReason: string;
}

export interface MissionFull {
  id: string;
  input: { mode: string; query: string; tickers?: string[]; depth?: string; source?: string; opportunityId?: string };
  status: string;
  createdAt: string;
  updatedAt: string;
  openclawReport: string | null;
  openclawTickers: string[];
  openclawDurationMs: number;
  taResults: Array<{
    ticker: string;
    date: string;
    status: string;
    analystReports: { market: string; sentiment: string; news: string; fundamentals: string };
    investmentDebate: { bullArguments: string[]; bearArguments: string[]; judgeDecision: string; rounds: number };
    traderPlan: string;
    riskDebate: { aggressiveView: string; conservativeView: string; neutralView: string; rounds: number };
    portfolioManagerDecision: { action: string; allocation: string; stopLoss: string; confidence: number; reasoning: string };
    duration: number;
    error?: string;
  }>;
  taDurationMs: number;
  openbbData: OpenBBTickerData[];
  macroData: unknown;
  consensus: MissionConsensus[];
  totalDurationMs: number;
}

export interface MissionEvent {
  id: string;
  missionId: string;
  timestamp: string;
  type: 'created' | 'queued' | 'started' | 'stage' | 'completed' | 'failed' | 'canceled';
  message: string;
  status?: string;
  phase?: 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis';
  meta?: Record<string, unknown>;
}

export interface MissionRun {
  id: string;
  missionId: string;
  taskId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  stage: 'queued' | 'dispatch' | 'scout' | 'analyst' | 'strategist' | 'council' | 'synthesis' | 'completed' | 'failed' | 'canceled';
  attempt: number;
  workerLeaseId?: string;
  createdAt: string;
  startedAt?: string;
  heartbeatAt?: string;
  completedAt?: string;
  failureMessage?: string;
  cancelRequestedAt?: string;
  failureCode?: string;
  degradedFlags?: string[];
}

export interface MissionRecoveryAction {
  id: 'retry_same' | 'retry_quick' | 'retry_deep' | 'review_recovery' | 'inspect_trace' | 'check_services';
  label: string;
  detail: string;
  kind: 'retry' | 'retry_depth' | 'review' | 'inspect' | 'diagnostic';
  depth?: 'quick' | 'standard' | 'deep';
  priority: number;
  costHint?: MissionRecoveryCostHint;
}

export interface MissionRecoveryCostHint {
  tier: 'low' | 'medium' | 'high';
  label: string;
  estimate: string;
  detail: string;
}

export interface MissionRecoverySuggestion {
  missionId: string;
  recoverable: boolean;
  latestRun?: MissionRun;
  summary: {
    label: string;
    detail: string;
    severity: 'info' | 'warning' | 'critical';
  };
  suggestedActions: MissionRecoveryAction[];
  reason: {
    status: string;
    runStatus?: MissionRun['status'];
    stage?: MissionRun['stage'];
    failureCode?: string;
    failureMessage?: string;
    degradedFlags?: string[];
    cancelRequestedAt?: string;
  };
}

export interface MissionEvidence {
  id: string;
  missionId: string;
  runId: string;
  capturedAt: string;
  status: string;
  completeness: 'full' | 'partial' | 'failed' | 'canceled';
  input: { mode: string; query: string; tickers?: string[]; depth?: string; source?: string; opportunityId?: string };
  openclawReport: string | null;
  openclawTickers: string[];
  openclawDurationMs: number;
  taResults: MissionFull['taResults'];
  taDurationMs: number;
  openbbData: MissionFull['openbbData'];
  macroData: MissionFull['macroData'];
  consensus: MissionConsensus[];
  totalDurationMs: number;
}

export interface ServiceHealth {
  openclaw: { status: string; port: number };
  openbb: { status: string; port: number };
  tradingAgents: { status: string; port: number };
  trendradar: { status: string; note?: string };
}

export interface ModelsConfig {
  defaults: { provider: string; base_url: string };
  models: Record<string, { model: string; temperature: number; max_tokens: number }>;
  services: Record<string, Record<string, string>>;
}

// ===== 原有 API =====

export const fetchHealth = async (): Promise<HealthStatus> => {
  return api.get<HealthStatus>('/health', { errorMessage: 'Failed' });
};

export const fetchQueue = async (): Promise<TaskQueueResponse> => {
  return api.get<TaskQueueResponse>('/queue', { errorMessage: 'Failed' });
};

export const fetchDynamicWatchlist = async (): Promise<DynamicTicker[]> => {
  return api.get<DynamicTicker[]>('/watchlist/dynamic', { errorMessage: 'Failed' });
};

export const triggerMission = async (query: string, depth: 'quick' | 'standard' | 'deep' = 'deep'): Promise<CreateMissionResponse> => {
  return api.post<CreateMissionResponse>('/trigger', { query, depth, source: 'manual' }, {
    errorMessage: 'Failed to trigger mission',
  });
};

export const cancelMission = async (id: string): Promise<boolean> => {
  return api.deleteOk(`/queue/${encodeURIComponent(id)}`);
};

export const recoverQueueTask = async (id: string): Promise<QueueRecoveryResponse> => {
  return api.post<QueueRecoveryResponse>(`/queue/${encodeURIComponent(id)}/recover`, undefined, {
    errorMessage: 'Failed to recover task',
  });
};

export const recoverStaleQueueTasks = async (staleThresholdMs?: number): Promise<StaleQueueRecoveryResponse> => {
  return api.post<StaleQueueRecoveryResponse>(
    '/queue/recover-stale',
    staleThresholdMs ? { staleThresholdMs } : {},
    { errorMessage: 'Failed to recover stale tasks' },
  );
};

export const fetchReports = async (): Promise<ReportItem[]> => {
  return api.get<ReportItem[]>('/reports', { errorMessage: 'Failed' });
};

export const fetchReportContent = async (date: string, filename: string): Promise<string> => {
  const data = await api.get<{ content: string }>('/reports/content', {
    params: { date, filename },
    errorMessage: 'Failed',
  });
  return data.content;
};

export const fetchTraces = async (): Promise<TraceItem[]> => {
  return api.get<TraceItem[]>('/traces', { errorMessage: 'Failed' });
};

export const fetchTraceContent = async (date: string, filename: string): Promise<unknown> => {
  const data = await api.get<{ content: unknown }>('/traces/content', {
    params: { date, filename },
    errorMessage: 'Failed',
  });
  return data.content;
};

// ===== 新增 API: Missions =====

export const fetchMissionsPage = async (request: PageRequest = {}): Promise<PageEnvelope<MissionSummary>> => {
  const limit = request.limit ?? 50;
  const response = await api.get<ListResponse<MissionSummary>>('/missions', {
    params: pageParams({ ...request, limit }),
    fallback: emptyPage<MissionSummary>(limit),
  });
  return normalizePageResponse<MissionSummary>(response, limit);
};

export const fetchMissions = async (limit = 50): Promise<MissionSummary[]> => {
  return (await fetchMissionsPage({ limit })).items;
};

export const fetchOpportunitiesPage = async (request: PageRequest = {}): Promise<PageEnvelope<OpportunitySummary>> => {
  const limit = request.limit ?? 50;
  const response = await api.get<ListResponse<OpportunitySummary>>('/opportunities', {
    params: pageParams({ ...request, limit }),
    fallback: emptyPage<OpportunitySummary>(limit),
  });
  return normalizePageResponse<OpportunitySummary>(response, limit);
};

export const fetchOpportunities = async (limit = 50): Promise<OpportunitySummary[]> => {
  return (await fetchOpportunitiesPage({ limit })).items;
};

export const fetchOpportunityDetail = async (id: string): Promise<OpportunitySummary | null> => {
  return api.get<OpportunitySummary | null>(`/opportunities/${encodeURIComponent(id)}`, { fallback: null });
};

export const fetchOpportunityBoardHealth = async (limit = 50): Promise<OpportunityBoardHealthMap | null> => {
  return api.get<OpportunityBoardHealthMap | null>('/opportunities/board-health', {
    params: { limit },
    fallback: null,
  });
};

function opportunityEventParams(request: number | OpportunityEventRequest = 50): QueryParams {
  if (typeof request === 'number') return { limit: request };
  return {
    limit: request.limit ?? 50,
    types: request.types && request.types.length > 0 ? request.types.join(',') : undefined,
  };
}

export const fetchOpportunityEvents = async (
  request: number | OpportunityEventRequest = 50,
): Promise<OpportunityEvent[]> => {
  return api.get<OpportunityEvent[]>('/opportunity-events', {
    params: opportunityEventParams(request),
    fallback: [],
  });
};

export const fetchOpportunityEventsForOpportunity = async (
  id: string,
  request: number | OpportunityEventRequest = 50,
): Promise<OpportunityEvent[]> => {
  return api.get<OpportunityEvent[]>(`/opportunities/${encodeURIComponent(id)}/events`, {
    params: opportunityEventParams(request),
    fallback: [],
  });
};

function catalystReminderAuditParams(request: OpportunityCatalystReminderAuditRequest = {}): QueryParams {
  return {
    limit: request.limit ?? 50,
    opportunityId: request.opportunityId,
    preference: request.preference && request.preference !== 'all' ? request.preference : undefined,
    q: request.q,
    activeOnly: request.activeOnly ? 1 : undefined,
  };
}

export const fetchOpportunityCatalystReminderAudit = async (
  request: OpportunityCatalystReminderAuditRequest = {},
): Promise<OpportunityCatalystReminderAuditResponse> => {
  return api.get<OpportunityCatalystReminderAuditResponse>('/opportunity-catalyst-reminders', {
    params: catalystReminderAuditParams(request),
    fallback: {
      generatedAt: '',
      metrics: {
        total: 0,
        acknowledged: 0,
        snoozed: 0,
        reopened: 0,
        subscribed: 0,
        unsubscribed: 0,
        activeSubscriptions: 0,
      },
      items: [],
    },
  });
};

export const opportunityCatalystReminderCalendarUrl = (
  request: OpportunityCatalystReminderAuditRequest = {},
): string => buildApiUrl('/opportunity-catalyst-reminders.ics', catalystReminderAuditParams({
  limit: 200,
  activeOnly: true,
  ...request,
}));

function preTradeAuditParams(request: OpportunityPreTradeAuditRequest = {}): QueryParams {
  return {
    limit: request.limit ?? 50,
    opportunityId: request.opportunityId,
    category: request.category && request.category !== 'all' ? request.category : undefined,
    status: request.status && request.status !== 'all' ? request.status : undefined,
    q: request.q,
  };
}

export const fetchOpportunityPreTradeAudit = async (
  request: OpportunityPreTradeAuditRequest = {},
): Promise<OpportunityPreTradeAuditResponse> => {
  return api.get<OpportunityPreTradeAuditResponse>('/opportunity-pretrade-audit', {
    params: preTradeAuditParams(request),
    fallback: {
      generatedAt: '',
      metrics: {
        total: 0,
        confirmations: 0,
        reopened: 0,
        blockers: 0,
        evidence: 0,
        blocked: 0,
        ready: 0,
      },
      items: [],
    },
  });
};

function reviewPlaybackParams(request: OpportunityReviewPlaybackRequest = {}): QueryParams {
  return {
    limit: request.limit ?? 50,
    opportunityId: request.opportunityId,
    category: request.category && request.category !== 'all' ? request.category : undefined,
    tone: request.tone && request.tone !== 'all' ? request.tone : undefined,
    q: request.q,
    backtestFrom: request.backtestFrom,
    backtestTo: request.backtestTo,
    backtestTicker: request.backtestTicker,
    backtestStrategy: request.backtestStrategy,
  };
}

export const fetchOpportunityReviewPlayback = async (
  request: OpportunityReviewPlaybackRequest = {},
): Promise<OpportunityReviewPlaybackResponse> => {
  return api.get<OpportunityReviewPlaybackResponse>('/opportunity-review-playback', {
    params: reviewPlaybackParams(request),
    fallback: {
      generatedAt: '',
      metrics: {
        total: 0,
        missions: 0,
        pretrade: 0,
        evidence: 0,
        catalysts: 0,
        risks: 0,
        positives: 0,
        warnings: 0,
      },
      outcome: {
        status: 'quiet',
        headline: '暂无复盘信号',
        detail: '',
        nextStep: '',
        score: 0,
        blockers: 0,
        failedMissions: 0,
        completedMissions: 0,
        evidenceRecorded: 0,
        evidenceInvalidated: 0,
      },
      performance: {
        status: 'insufficient_data',
        headline: '暂无可复盘交易结果',
        detail: '',
        nextStep: '',
        opportunityCount: 0,
        triggeredCatalysts: 0,
        pretradeBlockHit: false,
        pretradeBlockers: 0,
        riskEvents: 0,
	        dataQuality: 'missing',
	        notes: [],
	        trades: [],
	        position: {
	          closedLegs: 0,
	          partialLegs: 0,
	          openLegs: 0,
	          sizedLegs: 0,
          notes: [],
          exitAttributions: [],
          executionQuality: [],
          planRepairSuggestions: [],
          sizingRules: [],
        },
        riskBacktest: {
          verdict: 'no_trades',
          label: 'No trades',
          detail: '',
          sampleSize: 0,
          closedLegs: 0,
          pricedLegs: 0,
          oversizedLegs: 0,
          planRepairLegs: 0,
          executionIssueLegs: 0,
          notes: [],
        },
        strategyBacktest: {
          status: 'empty',
          headline: '暂无策略回测样本',
          detail: '',
          filterLabel: 'All history',
          totalStrategies: 0,
          coveredStrategies: 0,
          opportunityCount: 0,
          pricedLegs: 0,
          closedLegs: 0,
          notes: [],
          groups: [],
        },
      },
      items: [],
    },
  });
};

export const fetchOpportunityFieldEvidencePage = async (
  request: OpportunityFieldEvidenceIndexRequest = {},
): Promise<PageEnvelope<OpportunityFieldEvidenceIndexItem>> => {
  const limit = request.limit ?? 50;
  const response = await api.get<ListResponse<OpportunityFieldEvidenceIndexItem>>('/opportunity-field-evidence', {
    params: {
      ...pageParams({ ...request, limit }),
      opportunityId: request.opportunityId,
      field: request.field,
      source: request.source,
      kind: request.kind && request.kind !== 'all' ? request.kind : undefined,
      confidence: request.confidence && request.confidence !== 'all' ? request.confidence : undefined,
      status: request.status && request.status !== 'all' ? request.status : undefined,
      q: request.q,
    },
    fallback: emptyPage<OpportunityFieldEvidenceIndexItem>(limit),
  });
  return normalizePageResponse<OpportunityFieldEvidenceIndexItem>(response, limit);
};

export const updateOpportunityFieldEvidenceBulkStatus = async (
  input: OpportunityFieldEvidenceBulkStatusInput,
): Promise<OpportunityFieldEvidenceBulkStatusResult> => {
  return api.post<OpportunityFieldEvidenceBulkStatusResult>(
    '/opportunity-field-evidence/bulk-status',
    input,
    { errorMessage: 'Failed to update field evidence status' },
  );
};

export const fetchOpportunityInbox = async (limit = 12): Promise<OpportunityInboxItem[]> => {
  return api.get<OpportunityInboxItem[]>('/opportunities/inbox', { params: { limit }, fallback: [] });
};

export const fetchOpportunityInboxItem = async (id: string): Promise<OpportunityInboxItem | null> => {
  return api.get<OpportunityInboxItem | null>(`/opportunities/inbox/${encodeURIComponent(id)}`, {
    fallback: null,
  });
};

export const fetchHeatTransferGraphs = async (): Promise<HeatTransferGraph[]> => {
  return api.get<HeatTransferGraph[]>('/opportunities/graphs/heat-transfer', { fallback: [] });
};

export const syncHeatTransferGraphs = async (): Promise<{ syncedCount: number }> => {
  return api.post<{ syncedCount: number }>('/opportunities/graphs/heat-transfer/sync', undefined, {
    errorMessage: 'Failed to sync heat transfer graphs',
  });
};

export const refreshNewCodeRadar = async (): Promise<{
  filingCount: number;
  syncedCount: number;
  candidates: NewCodeRadarCandidate[];
}> => {
  return api.post<{
    filingCount: number;
    syncedCount: number;
    candidates: NewCodeRadarCandidate[];
  }>('/opportunities/radar/new-codes/refresh', undefined, {
    errorMessage: 'Failed to refresh New Code Radar',
  });
};

export const fetchOpportunityPriceHistoryDiagnostics = async (
  staleAfterHours = 24,
): Promise<OpportunityPriceHistoryDiagnostics | null> => {
  return api.get<OpportunityPriceHistoryDiagnostics | null>('/opportunities/price-history/diagnostics', {
    params: { staleAfterHours },
    fallback: null,
  });
};

export const refreshOpportunityPriceHistory = async (
  input: OpportunityPriceHistoryRefreshInput = {},
): Promise<OpportunityPriceHistoryRefreshResult> => {
  return api.post<OpportunityPriceHistoryRefreshResult>('/opportunities/price-history/refresh', input, {
    errorMessage: 'Failed to refresh price history',
  });
};

export interface CreateOpportunityInput {
  type: OpportunityType;
  title: string;
  query?: string;
  thesis?: string;
  summary?: string;
  stage?: OpportunityStage;
  status?: OpportunityStatus;
  primaryTicker?: string;
  leaderTicker?: string;
  proxyTicker?: string;
  relatedTickers?: string[];
  relayTickers?: string[];
  nextCatalystAt?: string;
  supplyOverhang?: string;
  policyStatus?: string;
  scores?: Partial<OpportunityScores>;
  heatProfile?: Partial<OpportunityHeatProfile>;
  proxyProfile?: Partial<OpportunityProxyProfile>;
  ipoProfile?: OpportunityIpoProfile;
  catalystCalendar?: OpportunityCatalystItem[];
}

export type UpdateOpportunityInput = Partial<Omit<
  CreateOpportunityInput,
  'nextCatalystAt' | 'supplyOverhang' | 'policyStatus'
>> & {
  nextCatalystAt?: string | null;
  supplyOverhang?: string | null;
  policyStatus?: string | null;
};

export type PreTradeConfirmationActionKind =
  | 'review_missed'
  | 'verify_today'
  | 'prepare'
  | 'fill_date'
  | 'review_observed'
  | 'watch';

export type PreTradeConfirmationCatalystUrgency =
  | 'missed'
  | 'overdue'
  | 'today'
  | 'soon'
  | 'missing_date'
  | 'observed'
  | 'watch';

export type PreTradeConfirmationReadiness = 'ready' | 'watch' | 'blocked';

export interface RecordPreTradeConfirmationInput {
  itemId: string;
  label: string;
  status: 'pass' | 'warn' | 'block';
  completed: boolean;
  evidence?: string;
  actionKind?: PreTradeConfirmationActionKind;
  catalystUrgency?: PreTradeConfirmationCatalystUrgency;
  readiness?: PreTradeConfirmationReadiness;
  score?: number;
}

export interface PreTradeConfirmationAudit {
  event: OpportunityEvent;
  opportunity: OpportunitySummary | null;
}

export interface RecordCatalystReminderPreferenceInput {
  reminderId: string;
  catalystLabel: string;
  catalystDueAt?: string;
  catalystStatus?: 'upcoming' | 'active' | 'observed' | 'missed';
  urgency: PreTradeConfirmationCatalystUrgency;
  actionKind: PreTradeConfirmationActionKind;
  preference: 'acknowledge' | 'snooze' | 'reopen' | 'subscribe' | 'unsubscribe';
  snoozedUntil?: string;
  subscriptionLeadDays?: number;
  note?: string;
}

export interface CatalystReminderPreferenceAudit {
  event: OpportunityEvent;
  opportunity: OpportunitySummary | null;
}

export interface RecordOpportunityFieldEvidenceInput {
  field: string;
  label?: string;
  kind?: OpportunityFieldEvidenceKind;
  source?: string;
  confidence?: OpportunitySourceProvenanceConfidence;
  value?: string;
  note?: string;
  observedAt?: string;
}

export interface RecordOpportunityFieldEvidenceBatchItem extends RecordOpportunityFieldEvidenceInput {
  clientId?: string;
}

export interface RecordOpportunityFieldEvidenceBatchInput {
  batchId?: string;
  items: RecordOpportunityFieldEvidenceBatchItem[];
}

export interface InvalidateOpportunityFieldEvidenceInput {
  reason: string;
  field?: string;
  source?: string;
}

export interface RestoreOpportunityFieldEvidenceInput {
  reason: string;
  field?: string;
  source?: string;
}

export interface UpsertOpportunityFieldRegistryInput {
  label?: string;
  kind?: OpportunityFieldEvidenceKind;
  source?: string;
  confidence?: OpportunitySourceProvenanceConfidence;
  note?: string;
  updatedBy?: string;
}

export interface ImportOpportunityFieldRegistryItem extends UpsertOpportunityFieldRegistryInput {
  field: string;
  updatedAt?: string;
}

export interface ImportOpportunityFieldRegistryInput {
  dryRun?: boolean;
  updatedBy?: string;
  items: ImportOpportunityFieldRegistryItem[];
}

export interface OpportunityFieldRegistryImportResultItem {
  index: number;
  field: string;
  status: 'created' | 'updated' | 'unchanged' | 'failed';
  changedFields: Array<'label' | 'kind' | 'source' | 'confidence' | 'note'>;
  before?: OpportunityFieldRegistryOverrideSnapshot;
  after?: OpportunityFieldRegistryOverrideSnapshot;
  effective?: OpportunityFieldRegistryEntry;
  audit?: OpportunityFieldRegistryAuditEntry;
  error?: string;
}

export interface OpportunityFieldRegistryImportResult {
  checkedAt: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  items: OpportunityFieldRegistryImportResultItem[];
  registry: OpportunityFieldRegistryEntry[];
  report: OpportunityFieldRegistryDiffReport;
}

export interface OpportunityFieldRegistryMutationResult {
  override?: Partial<OpportunityFieldRegistryEntry> & { field: string };
  effective?: OpportunityFieldRegistryEntry;
  audit?: OpportunityFieldRegistryAuditEntry;
  deleted?: boolean;
  registry?: OpportunityFieldRegistryEntry[];
}

export interface OpportunityFieldEvidenceAudit {
  event: OpportunityEvent;
  opportunity: OpportunitySummary | null;
}

export interface OpportunityFieldEvidenceBatchItemResult {
  index: number;
  clientId?: string;
  field: string;
  status: 'recorded' | 'duplicate' | 'failed';
  event?: OpportunityEvent;
  error?: string;
}

export interface OpportunityFieldEvidenceBatchAudit {
  batchId?: string;
  total: number;
  recorded: number;
  duplicates: number;
  failed: number;
  items: OpportunityFieldEvidenceBatchItemResult[];
  opportunity: OpportunitySummary | null;
}

export const createOpportunity = async (input: CreateOpportunityInput): Promise<OpportunitySummary> => {
  return api.post<OpportunitySummary>('/opportunities', input, {
    errorMessage: 'Failed to create opportunity',
  });
};

export const updateOpportunity = async (id: string, input: UpdateOpportunityInput): Promise<OpportunitySummary> => {
  return api.patch<OpportunitySummary>(`/opportunities/${encodeURIComponent(id)}`, input, {
    errorMessage: 'Failed to update opportunity',
  });
};

export const recordPreTradeConfirmation = async (
  id: string,
  input: RecordPreTradeConfirmationInput,
): Promise<PreTradeConfirmationAudit> => {
  return api.post<PreTradeConfirmationAudit>(
    `/opportunities/${encodeURIComponent(id)}/pretrade-confirmations`,
    input,
    { errorMessage: 'Failed to record pre-trade confirmation' },
  );
};

export const recordCatalystReminderPreference = async (
  id: string,
  input: RecordCatalystReminderPreferenceInput,
): Promise<CatalystReminderPreferenceAudit> => {
  return api.post<CatalystReminderPreferenceAudit>(
    `/opportunities/${encodeURIComponent(id)}/catalyst-reminders`,
    input,
    { errorMessage: 'Failed to record catalyst reminder preference' },
  );
};

export const recordOpportunityFieldEvidence = async (
  id: string,
  input: RecordOpportunityFieldEvidenceInput,
): Promise<OpportunityFieldEvidenceAudit> => {
  return api.post<OpportunityFieldEvidenceAudit>(
    `/opportunities/${encodeURIComponent(id)}/field-evidence`,
    input,
    { errorMessage: 'Failed to record field evidence' },
  );
};

export const recordOpportunityFieldEvidenceBatch = async (
  id: string,
  input: RecordOpportunityFieldEvidenceBatchInput,
): Promise<OpportunityFieldEvidenceBatchAudit> => {
  return api.post<OpportunityFieldEvidenceBatchAudit>(
    `/opportunities/${encodeURIComponent(id)}/field-evidence/batch`,
    input,
    { errorMessage: 'Failed to record field evidence batch' },
  );
};

export const invalidateOpportunityFieldEvidence = async (
  id: string,
  evidenceId: string,
  input: InvalidateOpportunityFieldEvidenceInput,
): Promise<OpportunityFieldEvidenceAudit> => {
  return api.post<OpportunityFieldEvidenceAudit>(
    `/opportunities/${encodeURIComponent(id)}/field-evidence/${encodeURIComponent(evidenceId)}/invalidate`,
    input,
    { errorMessage: 'Failed to invalidate field evidence' },
  );
};

export const restoreOpportunityFieldEvidence = async (
  id: string,
  evidenceId: string,
  input: RestoreOpportunityFieldEvidenceInput,
): Promise<OpportunityFieldEvidenceAudit> => {
  return api.post<OpportunityFieldEvidenceAudit>(
    `/opportunities/${encodeURIComponent(id)}/field-evidence/${encodeURIComponent(evidenceId)}/restore`,
    input,
    { errorMessage: 'Failed to restore field evidence' },
  );
};

export const fetchOpportunityFieldRegistry = async (): Promise<OpportunityFieldRegistryEntry[]> => {
  return api.get<OpportunityFieldRegistryEntry[]>('/opportunity-field-registry', { fallback: [] });
};

export const fetchOpportunityFieldRegistryAudit = async (input: {
  field?: string;
  limit?: number;
} = {}): Promise<OpportunityFieldRegistryAuditEntry[]> => {
  const params = new URLSearchParams();
  if (input.field) params.set('field', input.field);
  if (input.limit) params.set('limit', String(input.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return api.get<OpportunityFieldRegistryAuditEntry[]>(`/opportunity-field-registry/history${suffix}`, { fallback: [] });
};

export const fetchOpportunityFieldRegistryReport = async (): Promise<OpportunityFieldRegistryDiffReport | null> => {
  return api.get<OpportunityFieldRegistryDiffReport | null>('/opportunity-field-registry/report', { fallback: null });
};

export const exportOpportunityFieldRegistry = async (): Promise<OpportunityFieldRegistryExportPayload> => {
  return api.get<OpportunityFieldRegistryExportPayload>('/opportunity-field-registry/export', {
    errorMessage: 'Failed to export field registry',
  });
};

export const importOpportunityFieldRegistry = async (
  input: ImportOpportunityFieldRegistryInput,
): Promise<OpportunityFieldRegistryImportResult> => {
  return api.post<OpportunityFieldRegistryImportResult>(
    '/opportunity-field-registry/import',
    input,
    { errorMessage: 'Failed to import field registry' },
  );
};

export const upsertOpportunityFieldRegistry = async (
  field: string,
  input: UpsertOpportunityFieldRegistryInput,
): Promise<OpportunityFieldRegistryMutationResult> => {
  return api.put<OpportunityFieldRegistryMutationResult>(
    `/opportunity-field-registry/${encodeURIComponent(field)}`,
    input,
    { errorMessage: 'Failed to update field registry' },
  );
};

export const deleteOpportunityFieldRegistry = async (
  field: string,
): Promise<OpportunityFieldRegistryMutationResult> => {
  return api.delete<OpportunityFieldRegistryMutationResult>(
    `/opportunity-field-registry/${encodeURIComponent(field)}`,
    { errorMessage: 'Failed to reset field registry' },
  );
};

export const fetchMissionDetail = async (id: string): Promise<MissionFull | null> => {
  return api.get<MissionFull | null>(`/missions/${encodeURIComponent(id)}`, { fallback: null });
};

export const fetchMissionEvents = async (id: string): Promise<MissionEvent[]> => {
  return api.get<MissionEvent[]>(`/missions/${encodeURIComponent(id)}/events`, { fallback: [] });
};

export const fetchMissionRuns = async (id: string): Promise<MissionRun[]> => {
  return api.get<MissionRun[]>(`/missions/${encodeURIComponent(id)}/runs`, { fallback: [] });
};

export const fetchMissionRecovery = async (id: string): Promise<MissionRecoverySuggestion | null> => {
  return api.get<MissionRecoverySuggestion | null>(`/missions/${encodeURIComponent(id)}/recovery`, {
    fallback: null,
  });
};

export const fetchMissionRunEvidence = async (missionId: string, runId: string): Promise<MissionEvidence | null> => {
  return api.get<MissionEvidence | null>(
    `/missions/${encodeURIComponent(missionId)}/runs/${encodeURIComponent(runId)}/evidence`,
    { fallback: null },
  );
};

export interface CreateMissionResponse {
  success: boolean;
  message: string;
  missionId: string;
  runId?: string;
  recoveryAudit?: {
    operation: 'mission_retry';
    action: 'queued_new_retry' | 'reused_existing_retry';
    reusedExistingRetry: boolean;
    depth?: 'quick' | 'standard' | 'deep';
    costHint?: MissionRecoveryCostHint;
    idempotencyKey?: string;
  };
}

export const createMission = async (
  mode: string,
  query: string,
  tickers?: string[],
  depth = 'deep',
  opportunityId?: string,
  source = 'manual',
): Promise<CreateMissionResponse> => {
  return api.post<CreateMissionResponse>('/missions', { mode, query, tickers, depth, source, opportunityId }, {
    errorMessage: 'Failed to create mission',
  });
};

export const retryMission = async (missionId: string, depth?: 'quick' | 'standard' | 'deep'): Promise<CreateMissionResponse> => {
  return api.post<CreateMissionResponse>(
    `/missions/${encodeURIComponent(missionId)}/retry`,
    depth ? { depth } : {},
    { errorMessage: 'Failed to retry mission' },
  );
};

// ===== 新增 API: Config =====

export const fetchModelsConfig = async (): Promise<ModelsConfig | null> => {
  return api.get<ModelsConfig | null>('/config/models', { fallback: null });
};

export const saveModelsConfig = async (config: ModelsConfig): Promise<boolean> => {
  return api.putOk('/config/models', config);
};

// ===== 新增 API: Service Health =====

export const fetchServiceHealth = async (): Promise<ServiceHealth | null> => {
  return api.get<ServiceHealth | null>('/health/services', { fallback: null });
};

export interface DbMigrationStatus {
  id: string;
  description: string;
  checksum: string;
  appliedAt: string | null;
  durationMs: number;
  status: string;
  error: string | null;
  known: boolean;
  checksumMatches: boolean | null;
  expectedChecksum?: string;
}

export interface DbMigrationDiagnostics {
  status: 'ok' | 'degraded';
  total: number;
  applied: number;
  failed: number;
  missing: number;
  mismatched: number;
  migrations: DbMigrationStatus[];
}

export const fetchDbMigrationDiagnostics = async (): Promise<DbMigrationDiagnostics | null> => {
  return api.get<DbMigrationDiagnostics | null>('/diagnostics/db-migrations', { fallback: null });
};

export type MissionArtifactHealthStatus = 'ok' | 'warning' | 'degraded';
export type MissionArtifactHealthIssueCode =
  | 'missing'
  | 'unreadable'
  | 'integrity_missing'
  | 'checksum_mismatch'
  | 'size_mismatch';

export interface MissionArtifactHealthIssue {
  code: MissionArtifactHealthIssueCode;
  artifactId: string;
  missionId: string;
  kind: string;
  artifactPath: string;
  runId?: string;
  expectedSha256?: string;
  actualSha256?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
  message: string;
}

export interface MissionArtifactKindHealth {
  total: number;
  present: number;
  issues: number;
}

export interface MissionArtifactHealthDiagnostics {
  status: MissionArtifactHealthStatus;
  checkedAt: string;
  total: number;
  present: number;
  missing: number;
  unreadable: number;
  integrityMissing: number;
  checksumMismatch: number;
  sizeMismatch: number;
  byKind: Record<string, MissionArtifactKindHealth>;
  issues: MissionArtifactHealthIssue[];
}

export interface MissionArtifactBackfillResult {
  checkedAt: string;
  missionsScanned: number;
  missionArtifactsUpserted: number;
  eventRowsScanned: number;
  eventLogArtifactsUpserted: number;
  evidenceRefsScanned: number;
  evidenceArtifactsUpserted: number;
  totalArtifactsUpserted: number;
  filesPresent: number;
  filesMissing: number;
  filesUnreadable: number;
}

export interface MissionArtifactIntegrityRefreshResult {
  checkedAt: string;
  total: number;
  filesPresent: number;
  filesMissing: number;
  filesUnreadable: number;
  integrityMissing: number;
  checksumMismatches: number;
  sizeMismatches: number;
  refreshed: number;
  skippedMismatches: number;
  refreshedArtifactIds: string[];
}

export type MissionArtifactRepairPlanStatus = 'ok' | 'actionable' | 'blocked';
export type MissionArtifactRepairActionKind =
  | 'refresh_integrity'
  | 'verify_and_overwrite_integrity'
  | 'restore_artifact'
  | 'fix_permissions';
export type MissionArtifactRepairActionSafety = 'automatic' | 'manual_review' | 'blocked';

export interface MissionArtifactRepairAction {
  artifactId: string;
  missionId: string;
  kind: string;
  artifactPath: string;
  issueCode: MissionArtifactHealthIssueCode;
  action: MissionArtifactRepairActionKind;
  safety: MissionArtifactRepairActionSafety;
  reason: string;
  runId?: string;
  api?: {
    method: 'POST';
    path: string;
    body?: Record<string, unknown>;
  };
}

export interface MissionArtifactRepairPlan {
  status: MissionArtifactRepairPlanStatus;
  checkedAt: string;
  totalArtifacts: number;
  totalActions: number;
  automaticActions: number;
  manualReviewActions: number;
  blockedActions: number;
  sampledActions: MissionArtifactRepairAction[];
}

export interface MissionArtifactRepairResult {
  checkedAt: string;
  requestedArtifactIds: string[];
  notFoundArtifactIds: string[];
  totalArtifacts: number;
  totalActions: number;
  eligibleActions: number;
  applied: number;
  skippedHealthy: number;
  skippedManualReview: number;
  blocked: number;
  updatedArtifactIds: string[];
  skippedActions: MissionArtifactRepairAction[];
}

export interface MissionCanonicalBackfillResult {
  checkedAt: string;
  missionsScanned: number;
  inserted: number;
  refreshed: number;
  inputPayloadFallbacks: number;
  latestRunsLinked: number;
  latestEventsLinked: number;
  artifactIntegrityRecorded: number;
  filesPresent: number;
  filesMissing: number;
  filesUnreadable: number;
}

export type MissionCanonicalCoverageStatus = 'ok' | 'warning' | 'degraded';
export type MissionCanonicalCoverageIssueCode =
  | 'missing_canonical'
  | 'orphan_canonical'
  | 'stale_canonical'
  | 'artifact_path_mismatch'
  | 'artifact_missing'
  | 'artifact_unreadable'
  | 'integrity_missing'
  | 'checksum_mismatch'
  | 'size_mismatch';

export interface MissionCanonicalCoverageIssue {
  code: MissionCanonicalCoverageIssueCode;
  missionId: string;
  message: string;
  indexUpdatedAt?: string;
  canonicalUpdatedAt?: string;
  artifactPath?: string;
  expectedSha256?: string;
  actualSha256?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
}

export interface MissionCanonicalCoverageDiagnostics {
  status: MissionCanonicalCoverageStatus;
  checkedAt: string;
  indexTotal: number;
  canonicalTotal: number;
  covered: number;
  missingCanonical: number;
  orphanCanonical: number;
  staleCanonical: number;
  artifactPathMismatch: number;
  artifactMissing: number;
  artifactUnreadable: number;
  integrityMissing: number;
  checksumMismatch: number;
  sizeMismatch: number;
  issues: MissionCanonicalCoverageIssue[];
}

export type OpportunityFieldEvidenceCoverageStatus = 'ok' | 'warning' | 'degraded';
export type OpportunityFieldEvidenceCoverageIssueCode =
  | 'missing_canonical'
  | 'orphan_canonical'
  | 'status_mismatch'
  | 'missing_field';

export interface OpportunityFieldEvidenceCoverageIssue {
  code: OpportunityFieldEvidenceCoverageIssueCode;
  evidenceId?: string;
  opportunityId?: string;
  field?: string;
  eventStatus?: 'active' | 'invalidated';
  canonicalStatus?: 'active' | 'invalidated';
  message: string;
}

export interface OpportunityFieldEvidenceCoverageDiagnostics {
  status: OpportunityFieldEvidenceCoverageStatus;
  checkedAt: string;
  recordedEvents: number;
  canonicalRows: number;
  covered: number;
  missingCanonical: number;
  orphanCanonical: number;
  statusMismatch: number;
  missingField: number;
  invalidatedEvents: number;
  restoredEvents: number;
  issues: OpportunityFieldEvidenceCoverageIssue[];
}

export interface OpportunityFieldEvidenceBackfillResult {
  checkedAt: string;
  eventsScanned: number;
  recordedEvents: number;
  invalidatedEvents: number;
  restoredEvents: number;
  inserted: number;
  refreshed: number;
  invalidated: number;
  restored: number;
  skippedMissingField: number;
}

export type OpportunityFieldEvidenceRepairPlanStatus = 'ok' | 'actionable' | 'blocked';
export type OpportunityFieldEvidenceRepairActionKind =
  | 'backfill_canonical'
  | 'sync_status'
  | 'review_orphan'
  | 'repair_event_metadata';
export type OpportunityFieldEvidenceRepairActionSafety = 'automatic' | 'manual_review' | 'blocked';

export interface OpportunityFieldEvidenceRepairAction {
  evidenceId: string;
  issueCode: OpportunityFieldEvidenceCoverageIssueCode;
  action: OpportunityFieldEvidenceRepairActionKind;
  safety: OpportunityFieldEvidenceRepairActionSafety;
  reason: string;
  opportunityId?: string;
  field?: string;
  eventStatus?: 'active' | 'invalidated';
  canonicalStatus?: 'active' | 'invalidated';
  api?: {
    method: 'POST';
    path: string;
    body?: Record<string, unknown>;
  };
}

export interface OpportunityFieldEvidenceRepairPlan {
  status: OpportunityFieldEvidenceRepairPlanStatus;
  checkedAt: string;
  recordedEvents: number;
  canonicalRows: number;
  totalActions: number;
  automaticActions: number;
  manualReviewActions: number;
  blockedActions: number;
  sampledActions: OpportunityFieldEvidenceRepairAction[];
}

export interface OpportunityFieldEvidenceRepairResult {
  checkedAt: string;
  requestedEvidenceIds: string[];
  notFoundEvidenceIds: string[];
  totalEvidence: number;
  totalActions: number;
  eligibleActions: number;
  applied: number;
  skippedHealthy: number;
  skippedManualReview: number;
  blocked: number;
  updatedEvidenceIds: string[];
  skippedActions: OpportunityFieldEvidenceRepairAction[];
}

export const fetchMissionArtifactHealthDiagnostics = async (): Promise<MissionArtifactHealthDiagnostics | null> => {
  return api.get<MissionArtifactHealthDiagnostics | null>('/diagnostics/mission-artifacts', { fallback: null });
};

export const fetchMissionArtifactRepairPlan = async (): Promise<MissionArtifactRepairPlan | null> => {
  return api.get<MissionArtifactRepairPlan | null>('/diagnostics/mission-artifacts/repair-plan', { fallback: null });
};

export const repairMissionArtifacts = async (
  artifactIds?: string[],
  includeManualReview = false,
): Promise<MissionArtifactRepairResult> => {
  return api.post<MissionArtifactRepairResult>(
    '/diagnostics/mission-artifacts/repair',
    { artifactIds, includeManualReview },
    { errorMessage: 'Failed to repair mission artifacts' },
  );
};

export const fetchMissionCanonicalCoverageDiagnostics = async (): Promise<MissionCanonicalCoverageDiagnostics | null> => {
  return api.get<MissionCanonicalCoverageDiagnostics | null>('/diagnostics/missions', { fallback: null });
};

export const fetchOpportunityFieldEvidenceCoverageDiagnostics = async (): Promise<OpportunityFieldEvidenceCoverageDiagnostics | null> => {
  return api.get<OpportunityFieldEvidenceCoverageDiagnostics | null>('/diagnostics/opportunity-field-evidence', { fallback: null });
};

export const fetchOpportunityFieldEvidenceRepairPlan = async (): Promise<OpportunityFieldEvidenceRepairPlan | null> => {
  return api.get<OpportunityFieldEvidenceRepairPlan | null>('/diagnostics/opportunity-field-evidence/repair-plan', { fallback: null });
};

export const backfillCanonicalMissions = async (): Promise<MissionCanonicalBackfillResult> => {
  return api.post<MissionCanonicalBackfillResult>('/diagnostics/missions/backfill', undefined, {
    errorMessage: 'Failed to backfill canonical missions',
  });
};

export const backfillOpportunityFieldEvidence = async (): Promise<OpportunityFieldEvidenceBackfillResult> => {
  return api.post<OpportunityFieldEvidenceBackfillResult>('/diagnostics/opportunity-field-evidence/backfill', undefined, {
    errorMessage: 'Failed to backfill opportunity field evidence',
  });
};

export const repairOpportunityFieldEvidence = async (
  evidenceIds?: string[],
): Promise<OpportunityFieldEvidenceRepairResult> => {
  return api.post<OpportunityFieldEvidenceRepairResult>(
    '/diagnostics/opportunity-field-evidence/repair',
    { evidenceIds },
    { errorMessage: 'Failed to repair opportunity field evidence' },
  );
};

export const backfillMissionArtifacts = async (): Promise<MissionArtifactBackfillResult> => {
  return api.post<MissionArtifactBackfillResult>('/diagnostics/mission-artifacts/backfill', undefined, {
    errorMessage: 'Failed to backfill mission artifacts',
  });
};

export const refreshMissionArtifactIntegrity = async (
  overwriteMismatches = false,
): Promise<MissionArtifactIntegrityRefreshResult> => {
  return api.post<MissionArtifactIntegrityRefreshResult>(
    '/diagnostics/mission-artifacts/refresh-integrity',
    { overwriteMismatches },
    { errorMessage: 'Failed to refresh mission artifact integrity' },
  );
};

export interface DiagnosticsResult {
  timestamp: string;
  probes: {
    llm: { status: 'ok' | 'degraded' | 'error' | 'warning'; latency: number; details: string };
    openbb: { status: 'ok' | 'degraded' | 'error' | 'warning'; latency: number; details: string };
    tradingAgents: { status: 'ok' | 'degraded' | 'error' | 'warning'; latency: number; details: string };
    trendRadar: { status: 'ok' | 'degraded' | 'error' | 'warning'; latency: number; details: string };
  };
}

export const fetchDiagnostics = async (): Promise<DiagnosticsResult | null> => {
  return api.get<DiagnosticsResult | null>('/diagnostics', { fallback: null });
};

// ===== 新增 API: TrendRadar 原生全景雷达 =====

export interface TrendRadarResult {
  date: string | null;
  items: Array<{
    id: number;
    title: string;
    url: string;
    rank: number;
    first_crawl_time: string;
    last_crawl_time: string;
    crawl_count: number;
    platform_name: string;
  }>;
}

export const fetchTrendRadarLatest = async (date?: string): Promise<TrendRadarResult | null> => {
  return api.get<TrendRadarResult | null>('/trendradar/latest', {
    params: date ? { date } : undefined,
    fallback: null,
  });
};

export const fetchTrendRadarDates = async (): Promise<string[]> => {
  return api.get<string[]>('/trendradar/dates', { fallback: [] });
};

// ===== 新增 API: Trace Content =====

export interface TraceContent {
  traceId: string;
  missionId: string;
  runId?: string;
  query: string;
  startedAt: string;
  completedAt?: string;
  steps: Array<{
    agentName: string;
    timestamp: string;
    phase: string;
    input: unknown;
    output: unknown;
    durationMs: number;
  }>;
}

export const fetchTraceByMissionId = async (missionId: string): Promise<TraceContent | null> => {
  const data = await api.get<{ content: TraceContent } | null>(
    `/traces/byMission/${encodeURIComponent(missionId)}`,
    { fallback: null },
  );
  return data?.content || null;
};

export const fetchTraceByMissionRun = async (missionId: string, runId: string): Promise<TraceContent | null> => {
  const data = await api.get<{ content: TraceContent } | null>(
    `/traces/byMission/${encodeURIComponent(missionId)}/runs/${encodeURIComponent(runId)}`,
    { fallback: null },
  );
  return data?.content || null;
};
