import * as fs from 'fs';
import * as path from 'path';

const NARRATIVES_PATH = path.join(process.cwd(), 'data', 'narratives.json');

/**
 * NarrativeRecord — 叙事记录 (Free-form Text Flow 版本)
 * 
 * 核心改变：chainMapping 和 debateSnapshot 从结构化对象改为纯文本字段
 */
export interface NarrativeRecord {
  id: string;
  title: string;
  description: string;
  impactScore: number;
  createdAt: string;
  lastUpdatedAt: string;
  
  /** 策略师的产业链研报原文（纯文本） */
  analysisText: string;
  /** 辩论备忘录原文（纯文本） */
  debateText: string;

  /** @deprecated 旧版结构化映射，保留用于向后兼容读取 */
  chainMapping?: {
    coreTickers: string[];
    confirmTickers: string[];
    mappingTickers: string[];
    logicDescription: string;
    deductionChain: string[];
  } | null;
  /** @deprecated 旧版辩论快照，保留用于向后兼容读取 */
  debateSnapshot?: {
    bullCore: string;
    bearCore: string;
    keyTriggers: string[];
    ironcladStopLosses: string[];
  } | null;

  /** 从分析文本中提取的核心龙头 ticker（用于生命周期引擎 SMA 检测） */
  coreTicker?: string | undefined;

  eventHistory: Array<{
    date: string;
    event: string;
  }>;
  stage: 'earlyFermentation' | 'emergingConsensus' | 'mainExpansion' | 'crowdedClimax' | 'narrativeFatigue' | 'postCollapse';
  status: 'active' | 'paused' | 'invalidated';
}

/**
 * 从文本中提取 ticker 代码（$AAOI 格式）
 */
function extractTickersFromText(text: string): string[] {
  const matches = text.match(/\$([A-Z]{1,5})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace('$', '')))];
}

/**
 * 加载所有历史叙事（自动兼容旧版数据格式）
 */
export function loadNarratives(): NarrativeRecord[] {
  try {
    if (fs.existsSync(NARRATIVES_PATH)) {
      const rawRecords = JSON.parse(fs.readFileSync(NARRATIVES_PATH, 'utf-8'));
      // 自动适配旧数据格式
      return rawRecords.map((r: any) => {
        // 如果是旧版数据（有 chainMapping 对象但没有 analysisText），自动转换
        if (r.chainMapping && typeof r.chainMapping === 'object' && !r.analysisText) {
          r.analysisText = `产业链映射:\n- 核心标的: ${r.chainMapping.coreTickers?.join(', ') || '无'}\n- 验证标的: ${r.chainMapping.confirmTickers?.join(', ') || '无'}\n- 洼地标的: ${r.chainMapping.mappingTickers?.join(', ') || '无'}\n- 逻辑: ${r.chainMapping.logicDescription || ''}\n- 推导链: ${r.chainMapping.deductionChain?.join(' → ') || ''}`;
          // 尝试提取 coreTicker
          if (!r.coreTicker && r.chainMapping.coreTickers?.length > 0) {
            r.coreTicker = r.chainMapping.coreTickers[0];
          }
        }
        if (r.debateSnapshot && typeof r.debateSnapshot === 'object' && !r.debateText) {
          r.debateText = `多方论据: ${r.debateSnapshot.bullCore || ''}\n空方论据: ${r.debateSnapshot.bearCore || ''}\n催化条件: ${r.debateSnapshot.keyTriggers?.join(', ') || ''}\n止损条件: ${r.debateSnapshot.ironcladStopLosses?.join(', ') || ''}`;
        }
        // 确保新字段存在
        if (!r.analysisText) r.analysisText = '';
        if (!r.debateText) r.debateText = '';
        return r as NarrativeRecord;
      });
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

    // 方法2: 从 analysisText 中提取的 ticker 匹配
    if (record.analysisText) {
      const tickers = extractTickersFromText(record.analysisText);
      const tickerMatch = tickers.some(t => titleLower.includes(t.toLowerCase()));
      if (tickerMatch) return record;
    }

    // 方法3: 旧版 chainMapping 兼容
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
 * 创建新的叙事记录 (Free-form Text Flow 版本)
 */
export function createNarrative(
  title: string,
  analysisText: string,
  debateText: string,
): NarrativeRecord {
  const now = new Date().toISOString().split('T')[0] || '';
  
  // 从分析文本中自动提取核心 ticker
  const tickers = extractTickersFromText(analysisText);
  const coreTicker: string | undefined = tickers.length > 0 ? tickers[0] : undefined;

  const record: NarrativeRecord = {
    id: `topic_${Date.now()}`,
    title,
    description: analysisText.substring(0, 300),
    impactScore: 0, // 不再由 JSON 提供分数
    createdAt: now,
    lastUpdatedAt: now,
    analysisText,
    debateText,
    coreTicker,
    eventHistory: [{
      date: now,
      event: `首次发现: ${title}`
    }],
    stage: 'earlyFermentation',
    status: 'active'
  };

  const records = loadNarratives();
  records.push(record);
  saveNarratives(records);

  console.log(`[NarrativeStore] 🆕 新建叙事记录: "${record.title}" ${coreTicker ? `(龙头: $${coreTicker})` : ''}`);
  return record;
}

/**
 * 增量更新已有叙事 (Free-form Text Flow 版本)
 */
export function updateNarrative(
  id: string,
  updates: {
    eventSummary?: string;
    analysisText?: string;
    debateText?: string;
    stage?: NarrativeRecord['stage'];
  }
): NarrativeRecord | null {
  const records = loadNarratives();
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return null;

  const record = records[index]!;
  const now = new Date().toISOString().split('T')[0] || '';
  
  record.lastUpdatedAt = now;

  if (updates.stage) {
    record.stage = updates.stage;
  }

  if (updates.eventSummary) {
    record.eventHistory.push({
      date: now,
      event: updates.eventSummary
    });
  }

  if (updates.analysisText) {
    record.analysisText = updates.analysisText;
    record.description = updates.analysisText.substring(0, 300);
    // 更新 coreTicker
    const tickers = extractTickersFromText(updates.analysisText);
    if (tickers.length > 0) {
      record.coreTicker = tickers[0];
    }
  }

  if (updates.debateText) {
    record.debateText = updates.debateText;
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
      let ctx = `【${r.title}】| 首次发现: ${r.createdAt} | 最后更新: ${r.lastUpdatedAt}`;
      if (r.coreTicker) {
        ctx += ` | 龙头: $${r.coreTicker}`;
      }
      if (r.analysisText) {
        ctx += `\n  产业链分析摘要: ${r.analysisText.substring(0, 300)}`;
      }
      if (r.debateText) {
        ctx += `\n  辩论摘要: ${r.debateText.substring(0, 200)}`;
      }
      ctx += `\n  事件轨迹: ${r.eventHistory.slice(-3).map(e => `[${e.date}] ${e.event}`).join(' → ')}`;
      return ctx;
    }).join('\n\n') +
    '\n=== END ===';
}
