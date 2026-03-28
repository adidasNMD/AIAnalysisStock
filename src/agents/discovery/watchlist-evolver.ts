import * as fs from 'fs';
import * as path from 'path';
import { generateTextCompletion } from '../../utils/llm';
import { loadNarratives } from '../../utils/narrative-store';
import { getActiveTickers } from '../../utils/dynamic-watchlist';

// ==========================================
// WatchlistEvolver — 观察池自进化引擎
// 
// 让 LLM 基于已有分析成果，自动推导产业链上下游，
// 发现新的搜索关键词、新的板块 ETF、新的 Reddit 源，
// 并写回 watchlist.json 持续进化。
// ==========================================

const WATCHLIST_PATH = path.join(process.cwd(), 'data', 'watchlist.json');

interface WatchlistConfig {
  tickers: any[];
  sectorETFs: Array<{ symbol: string; name: string; sector: string }>;
  redditSources: Array<{ subreddit: string; type: string; limit: number }>;
  googleNewsKeywords: string[];
  // LLM 进化追踪
  evolverLog?: Array<{
    date: string;
    addedKeywords: string[];
    addedSubreddits: string[];
    addedETFs: string[];
    reasoning: string;
  }>;
}

function loadWatchlistConfig(): WatchlistConfig {
  try {
    if (fs.existsSync(WATCHLIST_PATH)) {
      return JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
    }
  } catch (e: any) {
    console.error(`[WatchlistEvolver] ⚠️ 加载 watchlist.json 失败: ${e.message}`);
  }
  return { tickers: [], sectorETFs: [], redditSources: [], googleNewsKeywords: [] };
}

function saveWatchlistConfig(config: WatchlistConfig): void {
  const dir = path.dirname(WATCHLIST_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`[WatchlistEvolver] 💾 watchlist.json 已更新`);
}

/**
 * 核心方法：让 LLM 基于当前系统积累的知识，推导新的搜索维度
 */
export async function evolveWatchlist(): Promise<{
  addedKeywords: string[];
  addedSubreddits: string[];
  addedETFs: string[];
}> {
  console.log(`\n[WatchlistEvolver] 🧬 =====================================`);
  console.log(`[WatchlistEvolver] 🧬 启动观察池自进化...`);
  console.log(`[WatchlistEvolver] 🧬 =====================================\n`);

  const config = loadWatchlistConfig();

  // 收集当前系统已有的知识作为 LLM 上下文
  const activeTickers = getActiveTickers();
  const narratives = loadNarratives().filter(n => n.status === 'active');

  const currentKeywords = config.googleNewsKeywords || [];
  const currentSubreddits = (config.redditSources || []).map(r => r.subreddit);
  const currentETFs = (config.sectorETFs || []).map(e => `${e.symbol}(${e.name})`);

  let context = `=== 当前系统已有的搜索关键词 ===\n${currentKeywords.join('\n')}\n`;
  context += `\n=== 当前监控的 Reddit 子版 ===\n${currentSubreddits.join(', ')}\n`;
  context += `\n=== 当前监控的板块 ETF ===\n${currentETFs.join(', ')}\n`;

  if (activeTickers.length > 0) {
    context += `\n=== 动态观察池中的标的 ===\n`;
    context += activeTickers.map(t => `$${t.symbol} (${t.name}) — ${t.trendName} — ${t.reasoning.substring(0, 80)}`).join('\n');
  }

  if (narratives.length > 0) {
    context += `\n\n=== 系统追踪中的叙事主题 ===\n`;
    context += narratives.map(n => `${n.title}: ${n.analysisText?.substring(0, 200) || n.description}`).join('\n\n');
  }

  const systemPrompt = `你是一个科技产业链情报分析师。你的任务是基于当前系统已经在追踪的赛道和标的，进行产业链上下游推导，发现新的搜索维度。

你关注的核心领域：港股 + 美股，聚焦科技和金融科技赛道。

推导规则：
1. 从已有赛道出发，推导上下游。例如：
   - GPU 需求 → 上游：光模块、先进封装、HBM内存、液冷散热 → 下游：AI SaaS、推理芯片
   - 数据中心 → 上游：核电/清洁能源、电力设备 → 下游：云服务、AI应用
   - 港股科技 → 延伸：恒生科技指数成分股、国产替代、信创
2. 发现当前遗漏的搜索盲区
3. 推荐新的 Reddit 子版（如 r/chipdesign、r/datacenter 等）
4. 推荐新的板块 ETF
5. 推荐的关键词要精准，适合 Google News RSS 搜索`;

  const userPrompt = `${context}

请基于以上已有信息，进行产业链推导，输出以下三部分（严格按格式）：

===NEW_KEYWORDS===
每行一个新的 Google News 搜索关键词（中英文都要有），不要重复已有的。
至少 8 个，最多 15 个。

===NEW_SUBREDDITS===
每行一个新的 Reddit 子版名称（不带 r/），不要重复已有的。
至少 3 个，最多 8 个。

===NEW_ETFS===
每行一个新的板块 ETF，格式: SYMBOL|中文名|sector_code
不要重复已有的。至少 2 个，最多 5 个。

===REASONING===
用 2-3 段话说明你的推导逻辑：从哪些已有赛道出发，推导出了哪些新的上下游维度。`;

  console.log(`[WatchlistEvolver] 🧠 提交 LLM 进行产业链推导...`);
  const result = await generateTextCompletion(systemPrompt, userPrompt, { streamToConsole: true });

  // 解析 LLM 输出
  const addedKeywords: string[] = [];
  const addedSubreddits: string[] = [];
  const addedETFs: string[] = [];
  let reasoning = '';

  const keywordsMatch = result.match(/===NEW_KEYWORDS===([\s\S]*?)(?====|$)/);
  const subredditsMatch = result.match(/===NEW_SUBREDDITS===([\s\S]*?)(?====|$)/);
  const etfsMatch = result.match(/===NEW_ETFS===([\s\S]*?)(?====|$)/);
  const reasoningMatch = result.match(/===REASONING===([\s\S]*?)$/);

  if (keywordsMatch) {
    const lines = keywordsMatch[1]!.split('\n')
      .map(l => l.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter(l => l.length > 3 && l.length < 60);
    for (const kw of lines) {
      if (!currentKeywords.some(existing => existing.toLowerCase() === kw.toLowerCase())) {
        addedKeywords.push(kw);
      }
    }
  }

  if (subredditsMatch) {
    const lines = subredditsMatch[1]!.split('\n')
      .map(l => l.replace(/^[-•*\d.]+\s*/, '').replace(/^r\//, '').trim().toLowerCase())
      .filter(l => l.length > 2 && l.length < 30 && !l.includes(' '));
    for (const sub of lines) {
      if (!currentSubreddits.includes(sub)) {
        addedSubreddits.push(sub);
      }
    }
  }

  if (etfsMatch) {
    const lines = etfsMatch[1]!.split('\n')
      .map(l => l.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter(l => l.includes('|'));
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
        const symbol = parts[0].replace(/\$/g, '').toUpperCase();
        if (!config.sectorETFs.some(e => e.symbol === symbol)) {
          addedETFs.push(line);
        }
      }
    }
  }

  if (reasoningMatch) {
    reasoning = reasoningMatch[1]!.trim();
  }

  // 写回 watchlist.json
  let changed = false;

  if (addedKeywords.length > 0) {
    config.googleNewsKeywords = [...config.googleNewsKeywords, ...addedKeywords];
    changed = true;
    console.log(`\n[WatchlistEvolver] 🔑 新增 ${addedKeywords.length} 个搜索关键词:`);
    addedKeywords.forEach(kw => console.log(`  + ${kw}`));
  }

  if (addedSubreddits.length > 0) {
    for (const sub of addedSubreddits) {
      config.redditSources.push({ subreddit: sub, type: 'hot', limit: 10 });
    }
    changed = true;
    console.log(`\n[WatchlistEvolver] 📱 新增 ${addedSubreddits.length} 个 Reddit 源:`);
    addedSubreddits.forEach(sub => console.log(`  + r/${sub}`));
  }

  if (addedETFs.length > 0) {
    for (const etfLine of addedETFs) {
      const parts = etfLine.split('|').map(p => p.trim());
      if (parts[0] && parts[1] && parts[2]) {
        config.sectorETFs.push({
          symbol: parts[0].replace(/\$/g, '').toUpperCase(),
          name: parts[1],
          sector: parts[2],
        });
      }
    }
    changed = true;
    console.log(`\n[WatchlistEvolver] 📊 新增 ${addedETFs.length} 个板块 ETF:`);
    addedETFs.forEach(etf => console.log(`  + ${etf}`));
  }

  // 记录进化日志
  if (changed) {
    if (!config.evolverLog) config.evolverLog = [];
    config.evolverLog.push({
      date: new Date().toISOString(),
      addedKeywords,
      addedSubreddits,
      addedETFs,
      reasoning: reasoning.substring(0, 500),
    });

    // 只保留最近 10 次进化记录
    if (config.evolverLog.length > 10) {
      config.evolverLog = config.evolverLog.slice(-10);
    }

    saveWatchlistConfig(config);
    console.log(`\n[WatchlistEvolver] ✅ 观察池进化完成！watchlist.json 已更新。`);
  } else {
    console.log(`\n[WatchlistEvolver] ℹ️ 本次推导未发现新的搜索维度（已有覆盖充分）。`);
  }

  return { addedKeywords, addedSubreddits, addedETFs };
}
