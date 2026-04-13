import type { TAAnalysisResult } from '../utils/ta-client';
import type { OpenBBTickerData } from '../utils/openbb-provider';
import type { RejectedTicker } from '../agents/discovery/ticker-discovery';
import type { OpenClawStructuredVerdict } from '../models/types';

export type MissionStatus =
  | 'triggered'
  | 'main_running'
  | 'main_complete'
  | 'ta_running'
  | 'fully_enriched'
  | 'main_only'
  | 'failed';

export type MissionMode = 'explore' | 'analyze' | 'review';

export interface MissionInput {
  mode: MissionMode;
  query: string;
  tickers?: string[];
  depth?: 'quick' | 'standard' | 'deep';
  source?: string;
  date?: string;
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
