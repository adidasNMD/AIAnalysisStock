// Keep calls relative so Vite dev proxy and production reverse proxy share one path.
import { createApiClient } from './lib/api-client';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const api = createApiClient(API_BASE);

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
    | 'catalyst_due';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
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

export const fetchMissions = async (limit = 50): Promise<MissionSummary[]> => {
  return api.get<MissionSummary[]>('/missions', { params: { limit }, fallback: [] });
};

export const fetchOpportunities = async (limit = 50): Promise<OpportunitySummary[]> => {
  return api.get<OpportunitySummary[]>('/opportunities', { params: { limit }, fallback: [] });
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

export const fetchOpportunityEvents = async (limit = 50): Promise<OpportunityEvent[]> => {
  return api.get<OpportunityEvent[]>('/opportunity-events', { params: { limit }, fallback: [] });
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
