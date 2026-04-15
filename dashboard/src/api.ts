// In Docker (behind Nginx proxy), API is at /api
// In dev mode (Vite), API is at localhost:3000/api
const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

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
    completedAt?: number;
    error?: string;
  }>;
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

export interface OpportunityBoardHealthMetric {
  key: string;
  label: string;
  value: number;
  tone: OpportunityBoardHealthMetricTone;
  opportunityIds: string[];
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

export interface MissionFull {
  id: string;
  input: { mode: string; query: string; tickers?: string[]; depth?: string; source?: string };
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
  openbbData: Array<{
    ticker: string;
    core: any;
    auxiliary: any;
    background: any;
    verdict: 'PASS' | 'WARN' | 'FAIL';
    verdictReason: string;
  }>;
  macroData: any;
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
  degradedFlags?: string[];
}

export interface MissionEvidence {
  id: string;
  missionId: string;
  runId: string;
  capturedAt: string;
  status: string;
  completeness: 'full' | 'partial' | 'failed' | 'canceled';
  input: { mode: string; query: string; tickers?: string[]; depth?: string; source?: string };
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
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
};

export const fetchQueue = async (): Promise<TaskQueueResponse> => {
  const res = await fetch(`${API_BASE}/queue`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
};

export const fetchDynamicWatchlist = async (): Promise<DynamicTicker[]> => {
  const res = await fetch(`${API_BASE}/watchlist/dynamic`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
};

export const triggerMission = async (query: string, depth: 'quick' | 'standard' | 'deep' = 'deep'): Promise<CreateMissionResponse> => {
  const res = await fetch(`${API_BASE}/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, depth, source: 'manual' })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to trigger mission');
  }
  return res.json();
};

export const cancelMission = async (id: string): Promise<boolean> => {
  const res = await fetch(`${API_BASE}/queue/${id}`, { method: 'DELETE' });
  return res.ok;
};

export const fetchReports = async (): Promise<ReportItem[]> => {
  const res = await fetch(`${API_BASE}/reports`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
};

export const fetchReportContent = async (date: string, filename: string): Promise<string> => {
  const res = await fetch(`${API_BASE}/reports/content?${new URLSearchParams({ date, filename })}`);
  if (!res.ok) throw new Error('Failed');
  return (await res.json()).content;
};

export const fetchTraces = async (): Promise<TraceItem[]> => {
  const res = await fetch(`${API_BASE}/traces`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
};

export const fetchTraceContent = async (date: string, filename: string): Promise<any> => {
  const res = await fetch(`${API_BASE}/traces/content?${new URLSearchParams({ date, filename })}`);
  if (!res.ok) throw new Error('Failed');
  return (await res.json()).content;
};

// ===== 新增 API: Missions =====

export const fetchMissions = async (limit = 50): Promise<MissionSummary[]> => {
  try {
    const res = await fetch(`${API_BASE}/missions?limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const fetchOpportunities = async (limit = 50): Promise<OpportunitySummary[]> => {
  try {
    const res = await fetch(`${API_BASE}/opportunities?limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const fetchOpportunityDetail = async (id: string): Promise<OpportunitySummary | null> => {
  try {
    const res = await fetch(`${API_BASE}/opportunities/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
};

export const fetchOpportunityBoardHealth = async (limit = 50): Promise<OpportunityBoardHealthMap | null> => {
  try {
    const res = await fetch(`${API_BASE}/opportunities/board-health?limit=${limit}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
};

export const fetchOpportunityEvents = async (limit = 50): Promise<OpportunityEvent[]> => {
  try {
    const res = await fetch(`${API_BASE}/opportunity-events?limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const fetchOpportunityInbox = async (limit = 12): Promise<OpportunityInboxItem[]> => {
  try {
    const res = await fetch(`${API_BASE}/opportunities/inbox?limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const fetchOpportunityInboxItem = async (id: string): Promise<OpportunityInboxItem | null> => {
  try {
    const res = await fetch(`${API_BASE}/opportunities/inbox/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
};

export const fetchHeatTransferGraphs = async (): Promise<HeatTransferGraph[]> => {
  try {
    const res = await fetch(`${API_BASE}/opportunities/graphs/heat-transfer`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const syncHeatTransferGraphs = async (): Promise<{ syncedCount: number }> => {
  const res = await fetch(`${API_BASE}/opportunities/graphs/heat-transfer/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to sync heat transfer graphs');
  }
  return res.json();
};

export const refreshNewCodeRadar = async (): Promise<{
  filingCount: number;
  syncedCount: number;
  candidates: NewCodeRadarCandidate[];
}> => {
  const res = await fetch(`${API_BASE}/opportunities/radar/new-codes/refresh`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to refresh New Code Radar');
  }
  return res.json();
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

export const createOpportunity = async (input: CreateOpportunityInput): Promise<OpportunitySummary> => {
  const res = await fetch(`${API_BASE}/opportunities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create opportunity');
  }
  return res.json();
};

export const updateOpportunity = async (id: string, input: Partial<CreateOpportunityInput>): Promise<OpportunitySummary> => {
  const res = await fetch(`${API_BASE}/opportunities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update opportunity');
  }
  return res.json();
};

export const fetchMissionDetail = async (id: string): Promise<MissionFull | null> => {
  try {
    const res = await fetch(`${API_BASE}/missions/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
};

export const fetchMissionEvents = async (id: string): Promise<MissionEvent[]> => {
  try {
    const res = await fetch(`${API_BASE}/missions/${id}/events`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const fetchMissionRuns = async (id: string): Promise<MissionRun[]> => {
  try {
    const res = await fetch(`${API_BASE}/missions/${id}/runs`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
};

export const fetchMissionRunEvidence = async (missionId: string, runId: string): Promise<MissionEvidence | null> => {
  try {
    const res = await fetch(`${API_BASE}/missions/${missionId}/runs/${runId}/evidence`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
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
  const res = await fetch(`${API_BASE}/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, query, tickers, depth, source, opportunityId })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create mission');
  }
  return res.json();
};

export const retryMission = async (missionId: string, depth?: 'quick' | 'standard' | 'deep'): Promise<CreateMissionResponse> => {
  const res = await fetch(`${API_BASE}/missions/${missionId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(depth ? { depth } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to retry mission');
  }
  return res.json();
};

// ===== 新增 API: Config =====

export const fetchModelsConfig = async (): Promise<ModelsConfig | null> => {
  try {
    const res = await fetch(`${API_BASE}/config/models`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
};

export const saveModelsConfig = async (config: ModelsConfig): Promise<boolean> => {
  const res = await fetch(`${API_BASE}/config/models`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return res.ok;
};

// ===== 新增 API: Service Health =====

export const fetchServiceHealth = async (): Promise<ServiceHealth | null> => {
  try {
    const res = await fetch(`${API_BASE}/health/services`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
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
  try {
    const res = await fetch(`${API_BASE}/diagnostics`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
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
  try {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetch(`${API_BASE}/trendradar/latest${params}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
};

export const fetchTrendRadarDates = async (): Promise<string[]> => {
  try {
    const res = await fetch(`${API_BASE}/trendradar/dates`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
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
    input: any;
    output: any;
    durationMs: number;
  }>;
}

export const fetchTraceByMissionId = async (missionId: string): Promise<TraceContent | null> => {
  try {
    const res = await fetch(`${API_BASE}/traces/byMission/${encodeURIComponent(missionId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.content;
  } catch { return null; }
};

export const fetchTraceByMissionRun = async (missionId: string, runId: string): Promise<TraceContent | null> => {
  try {
    const res = await fetch(`${API_BASE}/traces/byMission/${encodeURIComponent(missionId)}/runs/${encodeURIComponent(runId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.content;
  } catch { return null; }
};
