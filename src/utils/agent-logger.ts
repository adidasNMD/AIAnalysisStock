import * as fs from 'fs';
import * as path from 'path';
import { eventBus } from './event-bus';

// ==========================================
// AgentLogger — Agent 全链路追踪日志
// 保存每个 Agent 的原始请求/返回数据
// ==========================================

const TRACE_DIR = path.join(process.cwd(), 'out', 'traces');

export interface AgentTrace {
  agentName: string;
  timestamp: string;
  phase: string;
  input: any;
  output: any;
  durationMs: number;
  meta?: Record<string, any> | undefined;
}

// 每次 Mission 的完整追踪记录
export interface MissionTrace {
  traceId: string;
  missionId: string;
  runId?: string;
  query: string;
  startedAt: string;
  completedAt?: string;
  steps: AgentTrace[];
}

interface StartMissionTraceOptions {
  missionId?: string;
  runId?: string;
  traceId?: string;
}

// 当前活跃的 Mission trace
const activeMissions = new Map<string, MissionTrace>();

function currentLocalIsoTime(): string {
  const now = new Date();
  const tzoffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzoffset).toISOString().slice(0, -1);
}

function buildTraceFileStem(trace: MissionTrace): string {
  const safeQuery = trace.query.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 30);
  if (trace.runId) {
    return `${trace.missionId}__${trace.runId}_${safeQuery}`;
  }
  return `${trace.missionId}_${safeQuery}`;
}

function traceDateDir(isoTime: string): string {
  const dateStr = isoTime.split('T')[0] || '1970-01-01';
  return path.join(TRACE_DIR, dateStr);
}

function readTraceFile(tracePath: string): MissionTrace | null {
  try {
    return JSON.parse(fs.readFileSync(tracePath, 'utf-8')) as MissionTrace;
  } catch {
    return null;
  }
}

/**
 * 开始一个新的 Mission 追踪
 */
export function startMissionTrace(query: string, options: StartMissionTraceOptions = {}): string {
  const localISOTime = currentLocalIsoTime();
  const missionId = options.missionId || `mission_${localISOTime.replace(/[:.]/g, '-')}`;
  const traceId = options.traceId || options.runId || missionId;

  activeMissions.set(traceId, {
    traceId,
    missionId,
    ...(options.runId ? { runId: options.runId } : {}),
    query,
    startedAt: localISOTime,
    steps: [],
  });

  console.log(`[AgentLogger] 📝 开始追踪 Mission: ${missionId}${options.runId ? ` run=${options.runId}` : ''}`);
  return traceId;
}

/**
 * 记录一个 Agent 步骤
 */
export function logAgentStep(
  traceId: string,
  agentName: string,
  phase: string,
  input: any,
  output: any,
  durationMs: number,
  meta?: Record<string, any>,
): void {
  const localISOTime = currentLocalIsoTime();

  const trace: AgentTrace = {
    agentName,
    timestamp: localISOTime,
    phase,
    input: input, // 不要截断，保留完整的输入上下文以便回溯
    output: output, // 不要截断，保留完整的深度思考过程和输出
    durationMs,
    meta,
  };

  const activeMission = activeMissions.get(traceId);
  if (activeMission) {
    activeMission.steps.push(trace);
    let textOut = typeof output === 'string' ? output : JSON.stringify(output);
    eventBus.emitLog(activeMission.missionId, agentName, phase, textOut, {
      ...(meta || {}),
      ...(activeMission.runId ? { runId: activeMission.runId } : {}),
      traceId,
    });
  }

  console.log(`[AgentLogger] 📎 ${agentName} | ${phase} | ${durationMs}ms`);
}

/**
 * 结束并保存 Mission 追踪
 */
export function endMissionTrace(traceId: string): string | null {
  const activeMission = activeMissions.get(traceId);
  if (!activeMission) return null;

  const localISOTime = currentLocalIsoTime();
  activeMission.completedAt = localISOTime;

  // 保存 JSON trace
  const dirPath = traceDateDir(localISOTime);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const tracePath = path.join(dirPath, `${buildTraceFileStem(activeMission)}.json`);
  fs.writeFileSync(tracePath, JSON.stringify(activeMission, null, 2), 'utf-8');

  // 同时生成可读的 Markdown 报告
  const reportPath = tracePath.replace('.json', '_report.md');
  const report = generateTraceReport(activeMission);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`[AgentLogger] 💾 Mission Trace 已保存: ${tracePath}`);
  console.log(`[AgentLogger] 📊 可读报告已保存: ${reportPath}`);

  const result = tracePath;
  activeMissions.delete(traceId);
  return result;
}

export function getTraceByMissionId(missionId: string): MissionTrace | null {
  if (!fs.existsSync(TRACE_DIR)) return null;

  const dates = fs.readdirSync(TRACE_DIR)
    .filter((dir) => fs.statSync(path.join(TRACE_DIR, dir)).isDirectory())
    .sort()
    .reverse();

  for (const date of dates) {
    const dateDir = path.join(TRACE_DIR, date);
    const files = fs.readdirSync(dateDir)
      .filter((file) => file.endsWith('.json') && (file.startsWith(`${missionId}__`) || file.startsWith(`${missionId}_`)))
      .sort()
      .reverse();

    for (const file of files) {
      const trace = readTraceFile(path.join(dateDir, file));
      if (trace && trace.missionId === missionId) {
        return trace;
      }
    }
  }

  return null;
}

export function getTraceByRunId(missionId: string, runId: string): MissionTrace | null {
  if (!fs.existsSync(TRACE_DIR)) return null;

  const dates = fs.readdirSync(TRACE_DIR)
    .filter((dir) => fs.statSync(path.join(TRACE_DIR, dir)).isDirectory())
    .sort()
    .reverse();

  for (const date of dates) {
    const dateDir = path.join(TRACE_DIR, date);
    const files = fs.readdirSync(dateDir)
      .filter((file) => file.endsWith('.json') && file.startsWith(`${missionId}__${runId}_`))
      .sort()
      .reverse();

    for (const file of files) {
      const trace = readTraceFile(path.join(dateDir, file));
      if (trace && trace.missionId === missionId && trace.runId === runId) {
        return trace;
      }
    }
  }

  return null;
}

/**
 * 将 Mission Trace 转换为可读的 Markdown 报告
 */
function generateTraceReport(mission: MissionTrace): string {
  let md = `# 🔬 Mission 全链路分析报告\n\n`;
  md += `**查询主题**: ${mission.query}\n`;
  md += `**开始时间**: ${mission.startedAt}\n`;
  md += `**结束时间**: ${mission.completedAt || '进行中'}\n`;
  md += `**Agent 步骤数**: ${mission.steps.length}\n\n`;
  md += `---\n\n`;

  for (let i = 0; i < mission.steps.length; i++) {
    const step = mission.steps[i]!;
    md += `## Step ${i + 1}: ${step.agentName} — ${step.phase}\n\n`;
    md += `⏱️ 耗时: ${step.durationMs}ms | 🕐 ${step.timestamp}\n\n`;

    // 输入
    md += `### 📥 输入\n\n`;
    if (typeof step.input === 'string') {
      md += `\`\`\`\n${step.input.substring(0, 2000)}\n\`\`\`\n\n`;
    } else {
      md += `\`\`\`json\n${JSON.stringify(step.input, null, 2).substring(0, 2000)}\n\`\`\`\n\n`;
    }

    // 输出
    md += `### 📤 输出\n\n`;
    if (typeof step.output === 'string') {
      md += `\`\`\`\n${step.output.substring(0, 3000)}\n\`\`\`\n\n`;
    } else {
      md += `\`\`\`json\n${JSON.stringify(step.output, null, 2).substring(0, 3000)}\n\`\`\`\n\n`;
    }

    if (step.meta) {
      md += `### 📎 元数据\n\n`;
      md += `\`\`\`json\n${JSON.stringify(step.meta, null, 2)}\n\`\`\`\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

// ==========================================
// TrendRadar 市场情报日报生成
// ==========================================

/**
 * 保存 TrendRadar 扫描的完整情报报告
 */
export function saveTrendReport(
  analysis: any,
  discoveredTickers: Array<{ symbol: string; name: string; chainLevel: string; multibaggerScore: number; reasoning: string }>,
  rawData: { redditCount: number; newsCount: number; sectorCount: number },
): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0] || '1970-01-01';
  const timeStr = [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
  ].join('-');

  let md = `# 📡 TrendRadar 市场情报扫描报告\n\n`;
  md += `**扫描时间**: ${now.toISOString()}\n`;
  md += `**数据源**: Reddit ${rawData.redditCount}条 | 新闻 ${rawData.newsCount}条 | 板块ETF ${rawData.sectorCount}只\n`;
  md += `**市场情绪**: ${analysis.marketSentiment}\n\n`;
  md += `---\n\n`;

  // 趋势主题详解
  md += `## 🔥 热门趋势主题\n\n`;
  for (const topic of analysis.topics) {
    const momentumIcon = topic.momentum === 'accelerating' ? '🚀' : topic.momentum === 'decelerating' ? '📉' : '➡️';
    const catalystIcon = topic.hasCatalyst ? '✅' : '❌';
    const phaseLabel = topic.phase === 'emerging' ? '🌱新兴' : topic.phase === 'trending' ? '📈趋势中' : '📉衰退';
    
    md += `### ${momentumIcon} ${topic.name} — 评分 ${topic.score}/100\n\n`;
    md += `| 维度 | 状态 |\n|------|------|\n`;
    md += `| 动量 | ${topic.momentum} |\n`;
    md += `| 阶段 | ${phaseLabel} |\n`;
    md += `| 催化 | ${catalystIcon} ${topic.catalystDescription || '无'} |\n`;
    md += `| 标的 | ${topic.tickers.join(', ')} |\n`;
    md += `| ETF | ${topic.relatedETFs.join(', ')} |\n`;
    if (topic.supplyChainHint) {
      md += `| 瓶颈 | ${topic.supplyChainHint} |\n`;
    }
    md += `| 来源 | ${topic.sources.join(', ')} |\n\n`;
  }

  // 发现的标的
  if (discoveredTickers.length > 0) {
    md += `## 🆕 新发现的标的\n\n`;
    md += `| 代码 | 名称 | 层级 | 评分 | 推导逻辑 |\n`;
    md += `|------|------|------|------|----------|\n`;
    for (const t of discoveredTickers) {
      md += `| **${t.symbol}** | ${t.name} | ${t.chainLevel} | ${t.multibaggerScore} | ${t.reasoning.substring(0, 80)} |\n`;
    }
    md += `\n`;
  }

  // 市场总结
  md += `## 📋 市场全景总结\n\n`;
  md += `${analysis.summary}\n\n`;
  md += `---\n*Generated by OpenClaw TrendRadar*\n`;

  // 保存
  const dirPath = path.join(process.cwd(), 'out', 'intelligence', dateStr);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filename = `${timeStr}_trend_radar.md`;
  const fullPath = path.join(dirPath, filename);
  fs.writeFileSync(fullPath, md, 'utf-8');

  console.log(`[AgentLogger] 📊 TrendRadar 情报报告已保存: ${fullPath}`);
  return fullPath;
}
