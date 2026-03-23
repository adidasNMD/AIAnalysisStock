import { RawSignal } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

export class FirecrawlCollector {
  private apiKey: string;
  private baseUrl = 'https://api.firecrawl.dev/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search and scrape long-form news articles and blog posts
   */
  async scrapeNews(query: string, limit: number = 5): Promise<RawSignal[]> {
    if (!this.apiKey || this.apiKey.includes('your_')) {
      console.warn(`[FirecrawlCollector] ⚠️ API Key is missing or invalid. Returning MOCK data for query: "${query}"`);
      return this.getMockData(query);
    }

    try {
      const url = `${this.baseUrl}/search-and-scrape`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, limit })
      });

      if (!response.ok) {
        throw new Error(`Firecrawl API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Map API response to strict Zod schema definition
      return data.results.map((article: any) => ({
        id: `fc_${uuidv4()}`,
        sourceType: 'news' as const,
        content: article.content || article.markdown,
        timestamp: article.publishedAt ? new Date(article.publishedAt).getTime() : Date.now(),
        author: article.author || article.domain || 'unknown_publisher',
        url: article.url,
        metadata: {
          title: article.title,
          query
        }
      }));
    } catch (e) {
      console.error('[FirecrawlCollector] Fetch Error:', e);
      return []; // Return empty array to prevent crashing downstream orchestrators
    }
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
