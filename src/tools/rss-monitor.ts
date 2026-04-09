import Parser from 'rss-parser';
import { rssLimiter } from '../utils/rate-limiter';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'OpenClaw-Sentinel/1.0' }
});

export interface RSSAlert {
  source: string;
  title: string;
  link: string;
  pubDate: string;
  matchedKeywords: string[];
  snippet: string;
}

// 已推送过的条目哈希缓存（避免重复推送）
const seenHashes = new Set<string>();

function hashItem(source: string, title: string): string {
  return `${source}::${title}`.toLowerCase().trim();
}

/**
 * 拉取单个 RSS 源并按关键词过滤
 */
export async function pollFeed(
  sourceName: string,
  url: string,
  keywords: string[]
): Promise<RSSAlert[]> {
  const alerts: RSSAlert[] = [];

  try {
    await rssLimiter.acquire();
    const feed = await parser.parseURL(url);
    const items = feed.items || [];

    for (const item of items.slice(0, 20)) { // 只看最近 20 条
      const title = item.title || '';
      const content = item.contentSnippet || item.content || '';
      const combined = `${title} ${content}`.toLowerCase();

      const hash = hashItem(sourceName, title);
      if (seenHashes.has(hash)) continue;

      // 关键词匹配
      const matched = keywords.filter(kw => combined.includes(kw.toLowerCase()));
      if (matched.length > 0) {
        seenHashes.add(hash);
        alerts.push({
          source: sourceName,
          title,
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || '',
          matchedKeywords: matched,
          snippet: (content || '').substring(0, 300)
        });
      }
    }
  } catch (e: any) {
    console.error(`[RSSMonitor] ⚠️ Failed to poll ${sourceName}: ${e.message}`);
  }

  return alerts;
}

/**
 * 批量轮询所有配置的事件源
 */
export async function pollAllFeeds(
  eventSources: Array<{ name: string; url: string; keywords: string[] }>
): Promise<RSSAlert[]> {
  console.log(`[RSSMonitor] 📡 轮询 ${eventSources.length} 个事件源...`);
  
  const allAlerts: RSSAlert[] = [];

  for (const source of eventSources) {
    const alerts = await pollFeed(source.name, source.url, source.keywords);
    allAlerts.push(...alerts);
  }

  if (allAlerts.length > 0) {
    console.log(`[RSSMonitor] 🔔 发现 ${allAlerts.length} 条匹配事件！`);
    allAlerts.forEach(a => {
      console.log(`  📌 [${a.source}] ${a.title} (匹配: ${a.matchedKeywords.join(', ')})`);
    });
  } else {
    console.log(`[RSSMonitor] ✅ 无匹配事件。`);
  }

  return allAlerts;
}

/**
 * 将 RSS 警报转换为可喂给 AI 分析的文本
 */
export function alertsToContext(alerts: RSSAlert[]): string {
  if (alerts.length === 0) return '';
  return alerts.map(a => 
    `[${a.source} | ${a.pubDate}] ${a.title}\n关键词命中: ${a.matchedKeywords.join(', ')}\n${a.snippet}`
  ).join('\n\n---\n\n');
}
