import * as fs from 'fs';
import * as path from 'path';

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
  missionId: string;
  query: string;
  startedAt: string;
  completedAt?: string;
  steps: AgentTrace[];
}

// 当前活跃的 Mission trace
let activeMission: MissionTrace | null = null;

/**
 * 开始一个新的 Mission 追踪
 */
export function startMissionTrace(query: string): string {
  const now = new Date();
  const missionId = `mission_${now.toISOString().replace(/[:.]/g, '-')}`;
  
  activeMission = {
    missionId,
    query,
    startedAt: now.toISOString(),
    steps: [],
  };

  console.log(`[AgentLogger] 📝 开始追踪 Mission: ${missionId}`);
  return missionId;
}

/**
 * 记录一个 Agent 步骤
 */
export function logAgentStep(
  agentName: string,
  phase: string,
  input: any,
  output: any,
  durationMs: number,
  meta?: Record<string, any>,
): void {
  const trace: AgentTrace = {
    agentName,
    timestamp: new Date().toISOString(),
    phase,
    input: typeof input === 'string' ? input.substring(0, 5000) : input,
    output: typeof output === 'string' ? output.substring(0, 5000) : output,
    durationMs,
    meta,
  };

  if (activeMission) {
    activeMission.steps.push(trace);
  }

  console.log(`[AgentLogger] 📎 ${agentName} | ${phase} | ${durationMs}ms`);
}

/**
 * 结束并保存 Mission 追踪
 */
export function endMissionTrace(): string | null {
  if (!activeMission) return null;

  activeMission.completedAt = new Date().toISOString();

  // 保存 JSON trace
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0] || '1970-01-01';
  const dirPath = path.join(TRACE_DIR, dateStr);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const safeQuery = activeMission.query.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 30);
  const tracePath = path.join(dirPath, `${activeMission.missionId}_${safeQuery}.json`);
  fs.writeFileSync(tracePath, JSON.stringify(activeMission, null, 2), 'utf-8');

  // 同时生成可读的 Markdown 报告
  const reportPath = tracePath.replace('.json', '_report.md');
  const report = generateTraceReport(activeMission);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`[AgentLogger] 💾 Mission Trace 已保存: ${tracePath}`);
  console.log(`[AgentLogger] 📊 可读报告已保存: ${reportPath}`);

  const result = tracePath;
  activeMission = null;
  return result;
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
