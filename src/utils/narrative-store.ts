import * as fs from 'fs';
import * as path from 'path';
import { NarrativeTopic, ChainMapping, DebateResult } from '../models/types';

const NARRATIVES_PATH = path.join(process.cwd(), 'data', 'narratives.json');

export interface NarrativeRecord {
  id: string;
  title: string;
  description: string;
  impactScore: number;
  createdAt: string;
  lastUpdatedAt: string;
  chainMapping: {
    coreTickers: string[];
    confirmTickers: string[];
    mappingTickers: string[];
    logicDescription: string;
    deductionChain: string[];
  } | null;
  debateSnapshot: {
    bullCore: string;
    bearCore: string;
    keyTriggers: string[];
    ironcladStopLosses: string[];
  } | null;
  eventHistory: Array<{
    date: string;
    event: string;
  }>;
  stage: 'earlyFermentation' | 'emergingConsensus' | 'mainExpansion' | 'crowdedClimax' | 'narrativeFatigue' | 'postCollapse';
  status: 'active' | 'paused' | 'invalidated';
}

/**
 * 加载所有历史叙事
 */
export function loadNarratives(): NarrativeRecord[] {
  try {
    if (fs.existsSync(NARRATIVES_PATH)) {
      return JSON.parse(fs.readFileSync(NARRATIVES_PATH, 'utf-8'));
    }
  } catch (e: any) {
    console.error(`[NarrativeStore] ⚠️ 加载叙事库失败: ${e.message}`);
  }
  return [];
}

/**
 * 保存叙事库
 */
function saveNarratives(records: NarrativeRecord[]): void {
  const dir = path.dirname(NARRATIVES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(NARRATIVES_PATH, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`[NarrativeStore] 💾 叙事库已保存 (${records.length} 条记录)`);
}

/**
 * 模糊匹配：查找与当前事件相关的历史叙事
 */
export function findRelatedNarrative(
  title: string, 
  records: NarrativeRecord[]
): NarrativeRecord | null {
  const titleLower = title.toLowerCase();
  
  for (const record of records) {
    const recordTitle = record.title.toLowerCase();
    
    // 方法1：标题关键词高度重叠
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 3);
    const matchCount = titleWords.filter(w => recordTitle.includes(w)).length;
    if (titleWords.length > 0 && matchCount / titleWords.length > 0.4) {
      return record;
    }

    // 方法2: 相关标的重叠
    if (record.chainMapping) {
      const allTickers = [
        ...record.chainMapping.coreTickers,
        ...record.chainMapping.confirmTickers,
        ...record.chainMapping.mappingTickers
      ];
      const tickerMatch = allTickers.some(t => titleLower.includes(t.toLowerCase()));
      if (tickerMatch) return record;
    }
  }

  return null;
}

/**
 * 创建新的叙事记录
 */
export function createNarrative(
  topic: NarrativeTopic,
  mapping: ChainMapping | null,
  debate: DebateResult | null
): NarrativeRecord {
  const now = new Date().toISOString().split('T')[0] || '';
  
  const record: NarrativeRecord = {
    id: topic.id,
    title: topic.title,
    description: topic.description,
    impactScore: topic.impactScore,
    createdAt: now,
    lastUpdatedAt: now,
    chainMapping: mapping ? {
      coreTickers: mapping.coreTickers,
      confirmTickers: mapping.confirmTickers,
      mappingTickers: mapping.mappingTickers,
      logicDescription: mapping.logicDescription || '',
      deductionChain: mapping.deductionChain || []
    } : null,
    debateSnapshot: debate ? {
      bullCore: debate.bullCaseSummary || '',
      bearCore: debate.bearCaseSummary || '',
      keyTriggers: debate.keyTriggers || [],
      ironcladStopLosses: debate.ironcladStopLosses || []
    } : null,
    eventHistory: [{
      date: now,
      event: `首次发现: ${topic.title}`
    }],
    stage: 'earlyFermentation',
    status: 'active'
  };

  const records = loadNarratives();
  records.push(record);
  saveNarratives(records);

  console.log(`[NarrativeStore] 🆕 新建叙事记录: "${record.title}"`);
  return record;
}

/**
 * 增量更新已有叙事
 */
export function updateNarrative(
  id: string,
  updates: {
    eventSummary?: string;
    impactScore?: number;
    mapping?: ChainMapping;
    debate?: DebateResult;
  }
): NarrativeRecord | null {
  const records = loadNarratives();
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return null;

  const record = records[index]!;
  const now = new Date().toISOString().split('T')[0] || '';
  
  record.lastUpdatedAt = now;

  if (updates.impactScore) {
    record.impactScore = updates.impactScore;
  }

  if (updates.eventSummary) {
    record.eventHistory.push({
      date: now,
      event: updates.eventSummary
    });
  }

  if (updates.mapping) {
    record.chainMapping = {
      coreTickers: updates.mapping.coreTickers,
      confirmTickers: updates.mapping.confirmTickers,
      mappingTickers: updates.mapping.mappingTickers,
      logicDescription: updates.mapping.logicDescription || '',
      deductionChain: updates.mapping.deductionChain || []
    };
  }

  if (updates.debate) {
    record.debateSnapshot = {
      bullCore: updates.debate.bullCaseSummary || '',
      bearCore: updates.debate.bearCaseSummary || '',
      keyTriggers: updates.debate.keyTriggers || [],
      ironcladStopLosses: updates.debate.ironcladStopLosses || []
    };
  }

  records[index] = record;
  saveNarratives(records);

  console.log(`[NarrativeStore] ♻️ 更新叙事记录: "${record.title}" (事件数: ${record.eventHistory.length})`);
  return record;
}

/**
 * 为 Agent 生成历史叙事上下文摘要
 */
export function getNarrativeContext(maxRecords: number = 5): string {
  const records = loadNarratives()
    .filter(r => r.status === 'active')
    .slice(-maxRecords);

  if (records.length === 0) return '';

  return `\n=== 历史叙事追踪记忆 (${records.length} 条活跃叙事) ===\n` +
    records.map(r => {
      let ctx = `【${r.title}】(冲击力: ${r.impactScore}) | 首次发现: ${r.createdAt} | 最后更新: ${r.lastUpdatedAt}`;
      if (r.chainMapping) {
        ctx += `\n  核心标的: ${r.chainMapping.coreTickers.join(', ')} | 洼地标的: ${r.chainMapping.mappingTickers.join(', ')}`;
      }
      if (r.debateSnapshot) {
        ctx += `\n  多方: ${r.debateSnapshot.bullCore.substring(0, 100)}`;
        ctx += `\n  空方: ${r.debateSnapshot.bearCore.substring(0, 100)}`;
      }
      ctx += `\n  事件轨迹: ${r.eventHistory.slice(-3).map(e => `[${e.date}] ${e.event}`).join(' → ')}`;
      return ctx;
    }).join('\n\n') +
    '\n=== END ===';
}
