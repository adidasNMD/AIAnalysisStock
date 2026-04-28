import { z } from 'zod';
import { AgentTool } from './index';
import { RawSignal } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// Reddit 免费采集器
// 使用 Reddit .json API（无需 API Key）
// ==========================================

const REDDIT_BASE = 'https://www.reddit.com';
const USER_AGENT = 'OpenClaw-Sentinel/1.0 (Stock Intelligence Bot)';

interface RequestOptions {
  signal?: AbortSignal;
}

function throwIfCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Canceled by user');
  }
}

// 预设的金融相关 subreddit 列表
export const DEFAULT_SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'options',
  'semiconductors',
  'nuclear',
  'stockmarket',
];

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  url: string;
  permalink: string;
  createdUtc: number;
  flair: string;
}

/**
 * 从 Reddit .json API 获取帖子
 */
async function fetchRedditJSON(endpoint: string, options: RequestOptions = {}): Promise<RedditPost[]> {
  throwIfCanceled(options.signal);
  const posts: RedditPost[] = [];

  try {
    const [path, queryStr] = endpoint.split('?');
    const url = `${REDDIT_BASE}${path}.json?raw_json=1&limit=25${queryStr ? '&' + queryStr : ''}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      console.error(`[Reddit] HTTP ${response.status} for ${endpoint}`);
      return posts;
    }

    const data: any = await response.json();
    const children = data?.data?.children || [];

    for (const child of children) {
      const post = child.data;
      if (!post || post.stickied) continue; // 跳过置顶帖

      posts.push({
        id: post.id || '',
        title: post.title || '',
        selftext: (post.selftext || '').substring(0, 1000), // 限制长度
        author: post.author || 'unknown',
        subreddit: post.subreddit || '',
        score: post.score || 0,
        upvoteRatio: post.upvote_ratio || 0,
        numComments: post.num_comments || 0,
        url: post.url || '',
        permalink: `https://www.reddit.com${post.permalink || ''}`,
        createdUtc: (post.created_utc || 0) * 1000,
        flair: post.link_flair_text || '',
      });
    }
  } catch (e: any) {
    throwIfCanceled(options.signal);
    const errorMsg = `[Reddit] Fetch failed for ${endpoint}: ${e.message}`;
    console.error(errorMsg);
    require('../utils/event-bus').eventBus.emitSystem('error', errorMsg);
  }

  return posts;
}

/**
 * 获取 subreddit 热帖
 */
export async function fetchHotPosts(subreddit: string, limit: number = 10, options: RequestOptions = {}): Promise<RedditPost[]> {
  const posts = await fetchRedditJSON(`/r/${subreddit}/hot`, options);
  return posts.slice(0, limit);
}

/**
 * 获取 subreddit 新帖
 */
export async function fetchNewPosts(subreddit: string, limit: number = 10, options: RequestOptions = {}): Promise<RedditPost[]> {
  const posts = await fetchRedditJSON(`/r/${subreddit}/new`, options);
  return posts.slice(0, limit);
}

/**
 * Reddit 关键词搜索
 */
export async function searchPosts(
  query: string,
  subreddit?: string,
  limit: number = 10,
  options: RequestOptions = {},
): Promise<RedditPost[]> {
  const endpoint = subreddit
    ? `/r/${subreddit}/search?q=${encodeURIComponent(query)}&restrict_sr=on&sort=relevance&t=day`
    : `/search?q=${encodeURIComponent(query)}&sort=relevance&t=day`;

  const posts = await fetchRedditJSON(endpoint, options);
  return posts.slice(0, limit);
}

/**
 * 批量扫描多个 subreddit 的热帖
 */
export async function scanMultipleSubreddits(
  subreddits: string[] = DEFAULT_SUBREDDITS,
  limit: number = 5,
  options: RequestOptions = {},
): Promise<RedditPost[]> {
  console.log(`[Reddit] 📡 批量扫描 ${subreddits.length} 个 subreddit...`);

  const allPosts: RedditPost[] = [];

  // 串行请求避免被 Reddit 限流
  for (const sub of subreddits) {
    try {
      throwIfCanceled(options.signal);
      const posts = await fetchHotPosts(sub, limit, options);
      allPosts.push(...posts);
      // 小延迟避免触发 Reddit 速率限制
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, 500);
        const onAbort = () => {
          clearTimeout(timeoutId);
          reject(new Error('Canceled by user'));
        };
        options.signal?.addEventListener('abort', onAbort, { once: true });
      });
    } catch (e: any) {
      throwIfCanceled(options.signal);
      console.error(`[Reddit] Failed to scan r/${sub}: ${e.message}`);
    }
  }

  console.log(`[Reddit] ✅ 扫描完成，共获取 ${allPosts.length} 条帖子`);
  return allPosts;
}

/**
 * 将 Reddit 帖子转换为 RawSignal 格式
 */
export function redditPostsToSignals(posts: RedditPost[]): RawSignal[] {
  return posts.map(post => ({
    id: `reddit_${post.id}_${Date.now()}`,
    sourceType: 'reddit' as const,
    content: `[r/${post.subreddit}] ${post.title}${post.selftext ? '\n' + post.selftext.substring(0, 500) : ''} (⬆️${post.score} 💬${post.numComments})`,
    timestamp: post.createdUtc || Date.now(),
    author: `u/${post.author}`,
    url: post.permalink,
    metadata: {
      subreddit: post.subreddit,
      score: post.score,
      upvoteRatio: post.upvoteRatio,
      numComments: post.numComments,
      flair: post.flair,
    },
  }));
}

/**
 * 从 Reddit 帖子中提取 ticker/cashtag
 */
export function extractTickersFromPosts(posts: RedditPost[]): Map<string, number> {
  const tickerCounts = new Map<string, number>();
  const tickerRegex = /\$([A-Z]{1,5})\b/g;

  for (const post of posts) {
    const text = `${post.title} ${post.selftext}`;
    let match;
    while ((match = tickerRegex.exec(text)) !== null) {
      const ticker = match[1]!;
      tickerCounts.set(ticker, (tickerCounts.get(ticker) || 0) + 1);
    }
  }

  return tickerCounts;
}

// ==========================================
// AgentTool 封装 — 供 DataScout 调用
// ==========================================

export const redditTool: AgentTool<{ query: string; limit?: number }> = {
  name: 'search_reddit_discussions',
  description: 'Search Reddit for real-time retail investor discussions, DD posts, sentiment spikes, and breaking narratives across financial subreddits. Use this for gauging crowd sentiment and finding emerging narratives.',
  parameters: z.object({
    query: z.string().describe('The search query. Can include stock symbols like "NVDA" or topics like "nuclear energy"'),
    limit: z.number().optional().describe('Number of posts to fetch per subreddit, default is 5'),
  }),
  execute: async (args, options) => {
    console.log(`\n[Tool Exec] 🔧 Reddit Tool: Searching for "${args.query}"`);

    // 搜索 + 热帖双管齐下
    const [searchResults, wsbHot, stocksHot] = await Promise.all([
      searchPosts(args.query, undefined, args.limit || 10, options),
      fetchHotPosts('wallstreetbets', 5, options),
      fetchHotPosts('stocks', 5, options),
    ]);

    const allPosts = [...searchResults, ...wsbHot, ...stocksHot];

    if (allPosts.length === 0) {
      return 'No Reddit discussions found for this query. The topic might be too niche or dormant.';
    }

    // 提取 ticker 热度
    const tickerCounts = extractTickersFromPosts(allPosts);
    const hotTickers = [...tickerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ticker, count]) => `$${ticker}(${count})`)
      .join(', ');

    let output = `=== Reddit Intelligence (${allPosts.length} posts) ===\n`;
    if (hotTickers) {
      output += `🔥 Hot Tickers: ${hotTickers}\n\n`;
    }

    output += allPosts
      .sort((a, b) => b.score - a.score) // 按热度排序
      .slice(0, 15)
      .map(p => `[r/${p.subreddit} | ⬆️${p.score} | 💬${p.numComments}] ${p.title}${p.selftext ? '\n  ' + p.selftext.substring(0, 200) : ''}`)
      .join('\n\n');

    return output;
  },
};
