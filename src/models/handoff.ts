/**
 * AgentHandoff — Agent 间结构化握手协议
 * 
 * 保持 Free-form Thought Flow 的文本传递优势，
 * 同时附加可编程的元数据，让下游 Agent 能感知上游状态。
 */
export interface AgentHandoff {
  /** Agent 名称 */
  agentName: string;

  /** 执行状态 */
  status: 'success' | 'degraded' | 'failed';

  /** Markdown 文本内容 (核心载荷，保留 Free-form 优势) */
  content: string;

  /** 文本长度 (字) */
  contentLength: number;

  /** 从文本中提取的 Ticker 列表 (可选) */
  extractedTickers?: string[];

  /** Agent 自信度 0-1 (可选) */
  confidence?: number;

  /** 耗时 (毫秒) */
  durationMs: number;

  /** 降级原因 (当 status 为 degraded/failed 时) */
  degradeReason?: string;

  /** 任意附加元数据 */
  metadata?: Record<string, any>;
}

/**
 * 分析深度级别
 * - quick: Scout → Analyst → 快速报告 (2 次 LLM)
 * - standard: Scout → Analyst → Strategist → Synthesis (4 次 LLM)
 * - deep: Scout → Analyst → Strategist → Council → Synthesis (10+ 次 LLM)
 */
export type AnalysisDepth = 'quick' | 'standard' | 'deep';

/**
 * Pipeline 执行结果（包含完整链路信息）
 */
export interface PipelineResult {
  /** 最终研报 */
  finalReport: string | null;

  /** 分析深度 */
  depth: AnalysisDepth;

  /** 各阶段 Handoff 记录 */
  handoffs: AgentHandoff[];

  /** 所有提取到的 Ticker */
  allTickers: string[];

  /** Pipeline 总耗时 */
  totalDurationMs: number;

  /** 是否提前中止 */
  aborted: boolean;
  abortReason?: string;
}

/**
 * 从文本中提取 $TICKER 格式的标的代码
 */
export function extractTickers(text: string): string[] {
  const matches = text.match(/\$([A-Z]{1,5})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace('$', '')))];
}

/**
 * 创建成功的 Handoff
 */
export function createHandoff(
  agentName: string,
  content: string,
  durationMs: number,
  metadata?: Record<string, any>
): AgentHandoff {
  const handoff: AgentHandoff = {
    agentName,
    status: 'success',
    content,
    contentLength: content.length,
    extractedTickers: extractTickers(content),
    durationMs,
  };
  if (metadata) {
    handoff.metadata = metadata;
  }
  return handoff;
}

/**
 * 创建降级的 Handoff (Agent 失败，使用上游文本继续)
 */
export function createDegradedHandoff(
  agentName: string,
  fallbackContent: string,
  durationMs: number,
  reason: string
): AgentHandoff {
  return {
    agentName,
    status: 'degraded',
    content: fallbackContent,
    contentLength: fallbackContent.length,
    durationMs,
    degradeReason: reason,
  };
}
