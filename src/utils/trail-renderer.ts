import * as fs from 'fs';
import * as path from 'path';
import type { DecisionTrailEntry } from '../workflows/mission-dispatcher';

function stageLabel(stage: DecisionTrailEntry['stage']): string {
  switch (stage) {
    case 'discovery_filter':
      return '发现阶段筛选';
    case 'consensus':
      return '双大脑共识';
    case 'sma_veto':
      return 'SMA250 均线否决';
  }
}

function formatMarketCap(marketCap?: number): string | null {
  if (marketCap == null) return null;
  if (marketCap >= 1e9) return `${(marketCap / 1e9).toFixed(2)}B`;
  return `${(marketCap / 1e6).toFixed(2)}M`;
}

function addLine(lines: string[], label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === '') return;
  lines.push(`${label}: ${value}`);
}

function listSection(title: string, items?: string[]): string[] {
  if (!items || items.length === 0) return [];
  const lines = [`**${title}**`];
  items.forEach((item, index) => {
    if (item) lines.push(`${index + 1}. ${item}`);
  });
  return lines.length > 1 ? lines : [];
}

function renderDetails(entry: DecisionTrailEntry): string {
  const details = entry.details;
  if (!details) return '';

  const lines: string[] = ['<details>', '<summary>📊 详细论据</summary>', ''];

  if (entry.stage === 'sma_veto') {
    addLine(lines, '**价格**', details.price);
    addLine(lines, '**SMA250**', details.sma250);
    addLine(lines, '**位置**', details.position);
  } else if (entry.stage === 'discovery_filter') {
    const cap = formatMarketCap(details.marketCap);
    addLine(lines, '**市值**', cap ? `$${cap}` : null);
    addLine(lines, '**阈值下限**', details.thresholdMin);
    addLine(lines, '**阈值上限**', details.thresholdMax);
  } else {
    lines.push('**双大脑裁决**');
    if (details.openclawVerdict != null) lines.push(`- OpenClaw: ${details.openclawVerdict}`);
    if (details.taVerdict != null) lines.push(`- TradingAgents: ${details.taVerdict}`);
    if (details.agreement != null) lines.push(`- 共识: ${details.agreement}`);
    if (details.openbbVerdict != null) lines.push(`- OpenBB: ${details.openbbVerdict}`);

    const bull = listSection('📈 看多论据 (Bull Arguments)', details.bullArguments);
    if (bull.length) lines.push('', ...bull);

    const bear = listSection('📉 看空论据 (Bear Arguments)', details.bearArguments);
    if (bear.length) lines.push('', ...bear);

    lines.push('', '**🏛️ 基金经理裁决**');
    addLine(lines, '- 动作', details.pmAction);
    if (details.pmConfidence !== undefined) addLine(lines, '- 信心度', `${(details.pmConfidence * 100).toFixed(0)}%`);
    addLine(lines, '- 理由', details.pmReasoning);

    lines.push('', '**⚖️ 风险辩论**');
    addLine(lines, '- 激进派', details.riskAggressiveView);
    addLine(lines, '- 保守派', details.riskConservativeView);
    addLine(lines, '- 中立派', details.riskNeutralView);

    addLine(lines, '', undefined);
    if (details.bullCase) lines.push(`**Bull Case 总结**: ${details.bullCase}`);
    if (details.bearCase) lines.push(`**Bear Case 总结**: ${details.bearCase}`);
  }

  lines.push('', '</details>');
  return lines.join('\n');
}

export function renderTrailMarkdown(trail: DecisionTrailEntry[], missionId: string): string {
  if (!trail || trail.length === 0) return '无决策记录';

  const uniqueTickers = [...new Set(trail.map(entry => entry.ticker))];
  const passCount = trail.filter(entry => entry.verdict === 'pass').length;
  const rejectCount = trail.filter(entry => entry.verdict === 'reject').length;

  const lines: string[] = [
    `# 🔍 决策漏斗 — Mission ${missionId}`,
    '',
    `> 生成时间: ${new Date().toISOString()}`,
    `> 标的数量: ${uniqueTickers.length} | 通过: ${passCount} | 筛除: ${rejectCount}`,
    '',
    '---',
  ];

  for (const ticker of uniqueTickers) {
    lines.push('', `## ${ticker}`);
    const entries = trail.filter(entry => entry.ticker === ticker);
    for (const entry of entries) {
      lines.push('', `### 阶段: ${stageLabel(entry.stage)}`);
      lines.push(`**裁决**: ${entry.verdict === 'pass' ? '✅ 通过' : '❌ 筛除'}`);
      lines.push(`**原因**: ${entry.reason}`);
      const details = renderDetails(entry);
      if (details) lines.push('', details);
      lines.push('', '---');
    }
  }

  return lines.join('\n').trimEnd();
}

export function saveTrailReport(trail: DecisionTrailEntry[], missionId: string): string {
  const content = renderTrailMarkdown(trail, missionId);
  const dateDir = path.join(process.cwd(), 'out', 'trails', new Date().toISOString().split('T')[0] || 'unknown');
  fs.mkdirSync(dateDir, { recursive: true });
  const filePath = path.join(dateDir, `${missionId}-trail.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
