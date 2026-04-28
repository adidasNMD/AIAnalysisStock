import { RawSignal } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

interface RequestOptions {
  signal?: AbortSignal;
}

function throwIfCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Canceled by user');
  }
}

export class FirecrawlCollector {
  private apiKey: string;
  private baseUrl = 'https://api.firecrawl.dev/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search and scrape long-form news articles and blog posts
   */
  async scrapeNews(query: string, limit: number = 5, options: RequestOptions = {}): Promise<RawSignal[]> {
    throwIfCanceled(options.signal);
    const { eventBus } = require('../../utils/event-bus');
    let signals: RawSignal[] = [];

    // Attempt 1: Firecrawl
    if (this.apiKey && this.apiKey.startsWith('fc-') && !this.apiKey.includes('your_')) {
      try {
        console.log(`[WebCollector] 🟢 Attempting Firecrawl API for: ${query}`);
        const response = await fetch(`${this.baseUrl}/search`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        if (!response.ok) throw new Error(`Firecrawl Error: ${response.status}`);
        const responseJson = await response.json();
        const results = responseJson.data || responseJson.results || [];
        signals = results.map((a: any) => this._formatSignal(a.markdown || a.content, a.url, a.title, a.author, query));
        if (signals.length > 0) return signals;
      } catch (e: any) {
        throwIfCanceled(options.signal);
        console.warn(`[WebCollector] ⚠️ Firecrawl failed or out of credits, cascading to fallbacks: ${e.message}`);
      }
    }

    // Attempt 2: Tavily (if TAVILY_API_KEY exists)
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey && tavilyKey.startsWith('tvly-') && !tavilyKey.includes('your_')) {
      try {
        console.log(`[WebCollector] 🔵 Attempting Tavily API for: ${query}`);
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query, search_depth: "advanced", max_results: limit, include_raw_content: true }),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        if (!response.ok) throw new Error(`Tavily Error: ${response.status}`);
        const data = await response.json();
        signals = (data.results || []).map((a: any) => this._formatSignal(a.raw_content || a.content, a.url, a.title, a.url, query));
        if (signals.length > 0) return signals;
      } catch (e: any) {
        throwIfCanceled(options.signal);
        console.warn(`[WebCollector] ⚠️ Tavily failed, cascading to fallback: ${e.message}`);
      }
    }

    // Attempt 3: Geek Fallback (Reddit JSON Search) - Completely Free, no bot blocks, native Markdown
    try {
      console.log(`[WebCollector] 🟣 Attempting Free Geek Fallback (Reddit Raw JSON) for: ${query}`);
      const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}`;
      const response = await fetch(redditUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIAnalysisStock/1.0' },
        ...(options.signal ? { signal: options.signal } : {}),
      });
      
      if (!response.ok) throw new Error(`Reddit API Error: ${response.status}`);
      
      const data = await response.json();
      const posts = data.data?.children || [];
      
      signals = posts.map((post: any) => {
        const p = post.data;
        // Reddit provides native markdown in `selftext` and text context. 
        const content = `Title: ${p.title}\nSubreddit: r/${p.subreddit}\nUpvotes: ${p.score}\n\n${p.selftext || p.url}`;
        return this._formatSignal(content, `https://reddit.com${p.permalink}`, p.title, `reddit_${p.author}`, query);
      });

      console.log(`[WebCollector] 🔎 Found ${signals.length} high-value Reddit intelligence threads...`);
      return signals;
      
    } catch (e: any) {
      throwIfCanceled(options.signal);
      console.error(`[WebCollector] ❌ All scraping fallbacks utterly failed: ${e.message}`);
      eventBus.emitSystem('error', `[WebCollector] 网页抓取三层回退全部失败: ${e.message}`);
      return [];
    }
  }

  private _formatSignal(content: string, url: string, title: string, author: string, query: string): RawSignal {
    return {
      id: `web_${uuidv4()}`,
      sourceType: 'news' as const,
      content: content || '',
      timestamp: Date.now(),
      author: author || 'unknown_publisher',
      url: url || '',
      metadata: { title: title || 'Scraped Document', query }
    };
  }

  private getMockData(query: string): RawSignal[] {
    return [
      {
        id: `mock_news_${Date.now()}_1`,
        sourceType: 'news',
        content: `Industry Report: The demand for ${query} related infrastructure is causing a global shortage. Key players in the supply chain are raising prices by 15% starting next month. Analysts predict this supply-demand mismatch will persist until mid-2027, drastically lifting margins for semiconductor fabricators and downstream integrators.`,
        timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
        author: 'TechFinance Journal',
        url: 'https://news.mock/article/1',
        metadata: { title: `Critical shortages expected in ${query} sector`, query }
      }
    ];
  }
}
