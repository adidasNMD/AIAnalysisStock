import { getDb } from '../db';
import { Database } from 'sqlite';

export interface NarrativeRecord {
  id: string;
  title: string;
  description: string;
  impactScore: number;
  createdAt: string;
  lastUpdatedAt: string;
  
  analysisText: string;
  debateText: string;
  
  coreTicker?: string | undefined;

  eventHistory: Array<{
    date: string;
    event: string;
  }>;
  stage: 'earlyFermentation' | 'emergingConsensus' | 'mainExpansion' | 'crowdedClimax' | 'narrativeFatigue' | 'postCollapse';
  status: 'active' | 'paused' | 'invalidated';
}

function extractTickersFromText(text: string): string[] {
  const matches = text.match(/\$([A-Z]{1,5})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace('$', '')))];
}

export async function loadNarratives(): Promise<NarrativeRecord[]> {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM narratives');
    
    return rows.map(r => {
      let meta: Record<string, any> = {};
      try { meta = JSON.parse(r.meta || '{}'); } catch {}
      
      const record: NarrativeRecord = {
        id: r.id,
        title: r.title ?? r.symbol,
        description: meta.description || '',
        impactScore: r.impactScore ?? meta.impactScore ?? 0,
        createdAt: new Date(r.timestamp).toISOString(),
        lastUpdatedAt: r.lastUpdatedAt
          ? new Date(r.lastUpdatedAt).toISOString()
          : new Date(r.timestamp).toISOString(),
        analysisText: r.content,
        debateText: meta.debateText || '',
        coreTicker: r.coreTicker ?? meta.coreTicker ?? undefined,
        eventHistory: meta.eventHistory || [],
        stage: r.stage ?? meta.stage ?? 'earlyFermentation',
        status: r.status ?? meta.status ?? 'active'
      };
      
      return record;
    });
  } catch (e: any) {
    console.error(`[NarrativeStore] ⚠️ 加载叙事库失败: ${e.message}`);
    return [];
  }
}

export async function findRelatedNarrative(
  title: string, 
): Promise<NarrativeRecord | null> {
  const titleLower = title.toLowerCase();
  const records = await loadNarratives();
  
  for (const record of records) {
    const recordTitle = record.title.toLowerCase();
    
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 3);
    const matchCount = titleWords.filter(w => recordTitle.includes(w)).length;
    if (titleWords.length > 0 && matchCount / titleWords.length > 0.4) {
      return record;
    }

    if (record.analysisText) {
      const tickers = extractTickersFromText(record.analysisText);
      const tickerMatch = tickers.some(t => titleLower.includes(t.toLowerCase()));
      if (tickerMatch) return record;
    }
  }

  return null;
}

export async function createNarrative(
  title: string,
  analysisText: string,
  debateText: string,
): Promise<NarrativeRecord> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0] || '';
  
  const tickers = extractTickersFromText(analysisText);
  const coreTicker: string | undefined = tickers.length > 0 ? tickers[0] : undefined;

  const meta = {
    description: analysisText.substring(0, 300),
    debateText,
    coreTicker,
    eventHistory: [{ date: dateStr, event: `首次发现: ${title}` }],
    stage: 'earlyFermentation',
    status: 'active'
  };

  const id = `topic_${Date.now()}`;
  const nowMs = now.getTime();
  
  const db = await getDb();
  await db.run(
    `INSERT INTO narratives (id, symbol, timestamp, category, content, meta, title, stage, status, impactScore, coreTicker, lastUpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, title, nowMs, 'narrative', analysisText, JSON.stringify(meta),
    title, 'earlyFermentation', 'active', 0, coreTicker ?? null, nowMs
  );

  console.log(`[NarrativeStore] 🆕 新建叙事记录: "${title}" ${coreTicker ? `(龙头: $${coreTicker})` : ''}`);
  
  return (await loadNarratives()).find(n => n.id === id)!;
}

export async function updateNarrative(
  id: string,
  updates: {
    eventSummary?: string;
    analysisText?: string;
    debateText?: string;
    stage?: NarrativeRecord['stage'];
  }
): Promise<NarrativeRecord | null> {
  const records = await loadNarratives();
  const record = records.find(r => r.id === id);
  if (!record) return null;

  const nowStr = new Date().toISOString().split('T')[0] || '';
  
  let newStage = record.stage;
  if (updates.stage) newStage = updates.stage;

  let newHistory = [...record.eventHistory];
  if (updates.eventSummary) {
    newHistory.push({ date: nowStr, event: updates.eventSummary });
  }

  let newAnalysis = record.analysisText;
  let newDesc = record.description;
  let newCore = record.coreTicker;
  
  if (updates.analysisText) {
    newAnalysis = updates.analysisText;
    newDesc = updates.analysisText.substring(0, 300);
    const tickers = extractTickersFromText(updates.analysisText);
    if (tickers.length > 0) newCore = tickers[0];
  }

  let newDebate = record.debateText;
  if (updates.debateText) newDebate = updates.debateText;

  const meta = {
    description: newDesc,
    debateText: newDebate,
    coreTicker: newCore,
    eventHistory: newHistory,
    stage: newStage,
    status: record.status
  };

  const nowMs = Date.now();
  const db = await getDb();
  await db.run(
    `UPDATE narratives SET content = ?, meta = ?, timestamp = ?, stage = ?, status = ?, coreTicker = ?, lastUpdatedAt = ? WHERE id = ?`,
    newAnalysis, JSON.stringify(meta), nowMs, newStage, record.status, newCore ?? null, nowMs, id
  );

  console.log(`[NarrativeStore] ♻️ 更新叙事记录: "${record.title}" (事件数: ${newHistory.length})`);
  return (await loadNarratives()).find(n => n.id === id)!;
}

export async function getNarrativeContext(maxRecords: number = 5): Promise<string> {
  const records = (await loadNarratives())
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
      ctx += `\n  事件轨迹: ${r.eventHistory.slice(-3).map((e: any) => `[${e.date}] ${e.event}`).join(' → ')}`;
      return ctx;
    }).join('\n\n') +
    '\n=== END ===';
}
