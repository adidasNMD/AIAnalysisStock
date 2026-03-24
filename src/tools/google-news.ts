import Parser from 'rss-parser';
import { RawSignal } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// Google News RSS 采集器
// 完全免费，无需 API Key
// ==========================================

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'OpenClaw-Sentinel/1.0' },
});

const GOOGLE_NEWS_RSS_BASE = 'https://news.google.com/rss/search';

// 预设的财经关键词
export const DEFAULT_NEWS_KEYWORDS = [
  'AI data center',
  'nuclear power plant',
  'semiconductor shortage',
  'GPU demand supply',
  'optical transceiver 800G',
  'CoreWeave IPO',
  'SMR reactor nuclear',
  'enterprise SSD demand',
  'AI infrastructure capex',
];

export interface GoogleNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
}

/**
 * 获取 Google News RSS 搜索结果
 */
export async function fetchGoogleNewsRSS(
  query: string,
  lang: string = 'en',
  limit: number = 10
): Promise<GoogleNewsItem[]> {
  const items: GoogleNewsItem[] = [];

  try {
    const url = `${GOOGLE_NEWS_RSS_BASE}?q=${encodeURIComponent(query)}&hl=${lang}&gl=US&ceid=US:en`;
    const feed = await parser.parseURL(url);

    for (const entry of (feed.items || []).slice(0, limit)) {
      items.push({
        title: entry.title || '',
        link: entry.link || '',
        pubDate: entry.pubDate || entry.isoDate || '',
        source: entry.source?.name || extractSourceFromTitle(entry.title || ''),
        snippet: (entry.contentSnippet || entry.content || '').substring(0, 300),
      });
    }
  } catch (e: any) {
    console.error(`[GoogleNews] ⚠️ RSS fetch failed for "${query}": ${e.message}`);
  }

  return items;
}

/**
 * 从 Google News 标题中提取来源（格式: "Title - Source"）
 */
function extractSourceFromTitle(title: string): string {
  const parts = title.split(' - ');
  return parts.length > 1 ? parts[parts.length - 1]!.trim() : 'Unknown';
}

/**
 * 批量扫描多个关键词
 */
export async function scanMultipleKeywords(
  keywords: string[] = DEFAULT_NEWS_KEYWORDS,
  limit: number = 5
): Promise<GoogleNewsItem[]> {
  console.log(`[GoogleNews] 📰 扫描 ${keywords.length} 个关键词...`);

  const allItems: GoogleNewsItem[] = [];
  const seenTitles = new Set<string>();

  for (const keyword of keywords) {
    try {
      const items = await fetchGoogleNewsRSS(keyword, 'en', limit);
      for (const item of items) {
        // 标题去重
        const titleKey = item.title.toLowerCase().trim();
        if (!seenTitles.has(titleKey)) {
          seenTitles.add(titleKey);
          allItems.push(item);
        }
      }
      // 小延迟避免触发 Google 速率限制
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e: any) {
      console.error(`[GoogleNews] Failed for "${keyword}": ${e.message}`);
    }
  }

  console.log(`[GoogleNews] ✅ 扫描完成，共获取 ${allItems.length} 条新闻（已去重）`);
  return allItems;
}

/**
 * 将 Google News 条目转换为 RawSignal 格式
 */
export function googleNewsToSignals(items: GoogleNewsItem[]): RawSignal[] {
  return items.map(item => ({
    id: `gnews_${uuidv4()}`,
    sourceType: 'google_news' as const,
    content: `[${item.source}] ${item.title}\n${item.snippet}`,
    timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
    author: item.source,
    url: item.link,
    metadata: {
      source: item.source,
      pubDate: item.pubDate,
    },
  }));
}

/**
 * 计算关键词在新闻中的出现频率（用于 TrendRadar）
 */
export function calculateNewsFrequency(items: GoogleNewsItem[]): Map<string, number> {
  const frequency = new Map<string, number>();
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  for (const item of items) {
    const pubTime = item.pubDate ? new Date(item.pubDate).getTime() : now;
    const hoursAgo = Math.floor((now - pubTime) / ONE_HOUR);

    // 越新的新闻权重越高
    const recencyWeight = hoursAgo < 1 ? 3 : hoursAgo < 6 ? 2 : 1;

    // 提取标题中的关键词
    const words = item.title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3) {
        frequency.set(word, (frequency.get(word) || 0) + recencyWeight);
      }
    }
  }

  return frequency;
}
