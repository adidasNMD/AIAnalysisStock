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
  chainLevel: number;
  multibaggerScore: number;
  discoverySource: string;
  status: 'watching' | 'focused' | 'aging';
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

export const createMission = async (mode: string, query: string, tickers?: string[], depth = 'deep'): Promise<CreateMissionResponse> => {
  const res = await fetch(`${API_BASE}/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, query, tickers, depth, source: 'manual' })
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
