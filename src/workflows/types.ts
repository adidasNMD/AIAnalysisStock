import type { TAAnalysisResult } from '../utils/ta-client';
import type { OpenBBTickerData } from '../utils/openbb-provider';
import type { RejectedTicker } from '../agents/discovery/ticker-discovery';
import type { OpenClawStructuredVerdict } from '../models/types';

export type MissionStatus =
  | 'queued'
  | 'triggered'
  | 'main_running'
  | 'main_complete'
  | 'ta_running'
  | 'fully_enriched'
  | 'main_only'
  | 'canceled'
  | 'failed';

export type MissionMode = 'explore' | 'analyze' | 'review';

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
  breadthScore?: number | undefined;
  validationStatus?: HeatTransferValidationStatus | undefined;
  validationSummary?: string | undefined;
  edgeCount?: number | undefined;
  edges?: HeatTransferEdge[] | undefined;
  leaderHealth?: string | undefined;
  transmissionNote?: string | undefined;
}

export interface OpportunityProxyProfile {
  mappingTarget?: string | undefined;
  legitimacyScore: number;
  legibilityScore: number;
  tradeabilityScore: number;
  ruleStatus?: string | undefined;
  identityNote?: string | undefined;
  scarcityNote?: string | undefined;
}

export interface OpportunityFieldEvidence {
  source: string;
  confidence: OpportunityCatalystConfidence;
  note?: string | undefined;
  observedAt?: string | undefined;
}

export interface OpportunityIpoEvidence {
  officialTradingDate?: OpportunityFieldEvidence | undefined;
  spinoutDate?: OpportunityFieldEvidence | undefined;
  retainedStakePercent?: OpportunityFieldEvidence | undefined;
  lockupDate?: OpportunityFieldEvidence | undefined;
  greenshoeStatus?: OpportunityFieldEvidence | undefined;
  firstIndependentEarningsAt?: OpportunityFieldEvidence | undefined;
  firstCoverageAt?: OpportunityFieldEvidence | undefined;
}

export interface OpportunityIpoProfile {
  officialTradingDate?: string | undefined;
  spinoutDate?: string | undefined;
  retainedStakePercent?: number | undefined;
  lockupDate?: string | undefined;
  greenshoeStatus?: string | undefined;
  firstIndependentEarningsAt?: string | undefined;
  firstCoverageAt?: string | undefined;
  evidence?: OpportunityIpoEvidence | undefined;
}

export type OpportunityCatalystStatus = 'upcoming' | 'active' | 'observed' | 'missed';
export type OpportunityCatalystConfidence = 'confirmed' | 'inferred' | 'placeholder';

export interface OpportunityCatalystItem {
  label: string;
  dueAt?: string | undefined;
  status: OpportunityCatalystStatus;
  note?: string | undefined;
  source?: string | undefined;
  confidence?: OpportunityCatalystConfidence | undefined;
}

export interface OpportunityRecord {
  id: string;
  type: OpportunityType;
  stage: OpportunityStage;
  status: OpportunityStatus;
  title: string;
  query: string;
  thesis?: string | undefined;
  summary?: string | undefined;
  primaryTicker?: string | undefined;
  leaderTicker?: string | undefined;
  proxyTicker?: string | undefined;
  relatedTickers: string[];
  relayTickers: string[];
  nextCatalystAt?: string | undefined;
  supplyOverhang?: string | undefined;
  policyStatus?: string | undefined;
  scores: OpportunityScores;
  heatProfile?: OpportunityHeatProfile | undefined;
  proxyProfile?: OpportunityProxyProfile | undefined;
  ipoProfile?: OpportunityIpoProfile | undefined;
  catalystCalendar: OpportunityCatalystItem[];
  latestMissionId?: string | undefined;
  latestEventType?: OpportunityEventType | undefined;
  latestEventMessage?: string | undefined;
  latestEventAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityMissionSummary {
  id: string;
  query: string;
  status: string;
  updatedAt: string;
  source?: string | undefined;
}

export interface OpportunitySnapshotRecord {
  id: string;
  opportunityId: string;
  createdAt: string;
  payload: OpportunityRecord;
}

export interface OpportunitySummaryRecord extends OpportunityRecord {
  latestMission?: OpportunityMissionSummary | undefined;
  latestRun?: MissionRunRecord | undefined;
  latestDiff?: MissionDiffSummary | null | undefined;
  latestOpportunityDiff?: OpportunityDiffSummary | null | undefined;
  recentHeatHistory?: OpportunityHeatHistoryPoint[] | undefined;
  heatInflection?: OpportunityHeatInflection | null | undefined;
  whyNowSummary?: string | undefined;
  playbook?: OpportunityPlaybook | undefined;
  suggestedMission?: OpportunitySuggestedMission | undefined;
  suggestedMissions?: OpportunitySuggestedMission[] | undefined;
  recentActionTimeline?: OpportunityActionTimelineEntry[] | undefined;
}

export type OpportunityBoardType = Exclude<OpportunityType, 'ad_hoc'>;
export type OpportunityBoardHealthMetricTone = 'neutral' | 'positive' | 'warning' | 'negative';

export interface OpportunityBoardHealthMetricDetail {
  opportunityId: string;
  title: string;
  reason: string;
  evidence?: string | undefined;
  eventId?: string | undefined;
  eventLabel?: string | undefined;
}

export interface OpportunityBoardHealthMetric {
  key: string;
  label: string;
  value: number;
  tone: OpportunityBoardHealthMetricTone;
  opportunityIds: string[];
  explanation?: string | undefined;
  details?: OpportunityBoardHealthMetricDetail[] | undefined;
}

export interface OpportunityBoardHealthSummary {
  type: OpportunityBoardType;
  headline: string;
  summary: string;
  metrics: OpportunityBoardHealthMetric[];
}

export type OpportunityBoardHealthMap = Record<OpportunityBoardType, OpportunityBoardHealthSummary>;

export type NewCodeRadarStatus = 'filing' | 'pricing' | 'trading_soon';

export interface NewCodeRadarCandidate {
  key: string;
  companyName: string;
  title: string;
  query: string;
  status: NewCodeRadarStatus;
  summary: string;
  latestFilingType?: string | undefined;
  latestFiledAt?: string | undefined;
  filingCount: number;
  ipoProfile?: OpportunityIpoProfile | undefined;
  catalystCalendar: OpportunityCatalystItem[];
  linkedOpportunityId?: string | undefined;
}

export type HeatTransferEdgeKind =
  | 'leader_to_bottleneck'
  | 'bottleneck_to_laggard'
  | 'leader_to_laggard';

export interface HeatTransferEdge {
  id: string;
  from: string;
  to: string;
  weight: number;
  kind: HeatTransferEdgeKind;
  reason: string;
}

export type HeatTransferValidationStatus = 'forming' | 'confirmed' | 'fragile' | 'broken';

export interface HeatTransferGraph {
  id: string;
  theme: string;
  leaderTicker?: string | undefined;
  leaderScore?: number | undefined;
  bottleneckTickers: string[];
  laggardTickers: string[];
  junkTickers: string[];
  breadthScore: number;
  relayScore: number;
  temperature: OpportunityTemperature;
  validationStatus: HeatTransferValidationStatus;
  validationSummary: string;
  edgeCount: number;
  edges: HeatTransferEdge[];
  transmissionSummary: string;
  linkedOpportunityId?: string | undefined;
}

export type OpportunityInboxReasonCode =
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

export interface OpportunityInboxReason {
  code: OpportunityInboxReasonCode;
  label: string;
  detail?: string | undefined;
  priority: number;
}

export interface OpportunityInboxItem extends OpportunitySummaryRecord {
  inboxScore: number;
  inboxSummary: string;
  recommendedAction: 'analyze' | 'review' | 'monitor';
  inboxReasons: OpportunityInboxReason[];
  actionLabel?: string | undefined;
  actionDetail?: string | undefined;
  actionDecision?: OpportunityActionTimelineDecision | undefined;
  actionDriver?: OpportunityActionTimelineDriver | undefined;
  actionTimestamp?: string | undefined;
}

export interface OpportunityHeatHistoryPoint {
  snapshotId: string;
  createdAt: string;
  relayScore: number;
  breadthScore?: number | undefined;
  temperature?: OpportunityTemperature | undefined;
  validationStatus?: HeatTransferValidationStatus | undefined;
  validationSummary?: string | undefined;
  leaderTicker?: string | undefined;
  bottleneckCount: number;
  laggardCount: number;
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
  breadthDelta?: number | undefined;
  fromStatus?: HeatTransferValidationStatus | undefined;
  toStatus?: HeatTransferValidationStatus | undefined;
}

export type OpportunityPlaybookStance = 'prepare' | 'act' | 'review';

export interface OpportunityPlaybookItem {
  label: string;
  status: 'ready' | 'watch' | 'missing';
  note?: string | undefined;
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
  mode: MissionMode;
  query: string;
  tickers?: string[] | undefined;
  depth: 'quick' | 'standard' | 'deep';
  source: string;
  whenToUse?: string | undefined;
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
  reasonSummary?: string | undefined;
  tone: 'neutral' | 'positive' | 'warning' | 'negative';
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

export type OpportunityEventType =
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

export interface OpportunityEventRecord {
  id: string;
  opportunityId: string;
  type: OpportunityEventType;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown> | undefined;
}

export interface StreamEnvelope<TPayload> {
  id: string;
  stream: 'mission' | 'opportunity' | 'system';
  type: string;
  version: 1;
  occurredAt: string;
  entityId?: string | undefined;
  payload: TPayload;
  source: {
    service: 'api' | 'daemon' | 'trendradar' | 'trading_agents' | 'openbb' | 'system';
    runId?: string | undefined;
  };
}

export type OpportunityEventEnvelope = StreamEnvelope<OpportunityEventRecord>;

export type MissionRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export type MissionRunStage =
  | 'queued'
  | 'dispatch'
  | 'scout'
  | 'analyst'
  | 'strategist'
  | 'council'
  | 'synthesis'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface MissionRunRecord {
  id: string;
  missionId: string;
  taskId?: string;
  status: MissionRunStatus;
  stage: MissionRunStage;
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

export type MissionEvidenceCompleteness = 'full' | 'partial' | 'failed' | 'canceled';

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

export interface MissionInput {
  mode: MissionMode;
  query: string;
  tickers?: string[] | undefined;
  depth?: 'quick' | 'standard' | 'deep' | undefined;
  source?: string | undefined;
  date?: string | undefined;
  opportunityId?: string | undefined;
}

export interface UnifiedMission {
  id: string;
  traceId?: string;
  input: MissionInput;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;

  openclawReport: string | null;
  openclawTickers: string[];
  openclawDurationMs: number;

  taResults: TAAnalysisResult[];
  taDurationMs: number;

  openbbData: OpenBBTickerData[];
  macroData: any;

  consensus: TickerConsensus[];

  discoveryRejections?: RejectedTicker[];
  decisionTrail?: DecisionTrailEntry[];
  structuredVerdicts?: Record<string, OpenClawStructuredVerdict>;

  totalDurationMs: number;
}

export interface MissionEvidenceRecord {
  id: string;
  missionId: string;
  runId: string;
  capturedAt: string;
  status: MissionStatus;
  completeness: MissionEvidenceCompleteness;
  input: MissionInput;
  openclawReport: string | null;
  openclawTickers: string[];
  openclawDurationMs: number;
  taResults: TAAnalysisResult[];
  taDurationMs: number;
  openbbData: OpenBBTickerData[];
  macroData: any;
  consensus: TickerConsensus[];
  discoveryRejections?: RejectedTicker[];
  decisionTrail?: DecisionTrailEntry[];
  structuredVerdicts?: Record<string, OpenClawStructuredVerdict>;
  totalDurationMs: number;
}

export interface TickerConsensus {
  ticker: string;
  openclawVerdict: 'BUY' | 'HOLD' | 'SELL' | 'SKIP' | null;
  taVerdict: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
  agreement: 'agree' | 'disagree' | 'partial' | 'pending' | 'blocked';
  openbbVerdict: 'PASS' | 'WARN' | 'FAIL' | null;
  vetoed: boolean;
  vetoReason?: string;
  bullCase?: string;
  bearCase?: string;
}

export interface ConsensusResult {
  ticker: string;
  agreement?: TickerConsensus['agreement'];
  vetoed?: boolean;
  vetoReason?: string;
  openclawVerdict?: TickerConsensus['openclawVerdict'];
  overallAction: 'BUY' | 'SELL' | 'HOLD' | 'AVOID';
  confidence: number;           // 0-100
  taSignal: string;             // TradingAgents signal
  openbbSignal: string;         // OpenBB signal
  sma250Vetoed: boolean;
  antiSellGuardTriggered: boolean;
  entrySignalAligned: boolean;
  reasoning: string;
  decisionTrail: DecisionTrailEntry[];
}

export interface DecisionTrailEntry {
  ticker: string;
  stage: 'discovery_filter' | 'consensus' | 'sma_veto';
  verdict: 'pass' | 'reject';
  reason: string;
  details?: {
    marketCap?: number;
    thresholdMin?: number;
    thresholdMax?: number;
    openclawVerdict?: string | null;
    taVerdict?: string | null;
    agreement?: string | undefined;
    bullCase?: string | undefined;
    bearCase?: string | undefined;
    bullArguments?: string[] | undefined;
    bearArguments?: string[] | undefined;
    judgeDecision?: string | undefined;
    pmAction?: string | undefined;
    pmReasoning?: string | undefined;
    pmConfidence?: number | undefined;
    riskAggressiveView?: string | undefined;
    riskConservativeView?: string | undefined;
    riskNeutralView?: string | undefined;
    openbbVerdict?: string | null;
    price?: number | undefined;
    sma250?: number | undefined;
    position?: string | undefined;
  };
}
