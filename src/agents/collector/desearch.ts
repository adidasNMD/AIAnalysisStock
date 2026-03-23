import { RawSignal } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

export class DesearchCollector {
  private apiKey: string;
  private baseUrl = 'https://api.desearch.ai'; 

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch recent tweets for a specific keyword, narrative, or cashtag
   */
  async fetchRecentTweets(query: string, limit: number = 20): Promise<RawSignal[]> {
    if (!this.apiKey || this.apiKey.includes('your_')) {
      console.warn(`[DesearchCollector] ⚠️ API Key is missing or invalid. Returning MOCK data for query: "${query}"`);
      return this.getMockData(query);
    }

    try {
      const url = `${this.baseUrl}/twitter?query=${encodeURIComponent(query)}&count=${limit}&sort=Latest`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Desearch API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Map API response to our extremely strict Zod schemas
      // The API returns an array directly, not nested in data.tweets
      const tweetsArray = Array.isArray(data) ? data : (data.tweets || []);
      
      return tweetsArray.map((tweet: any) => ({
        id: `desearch_${tweet.id || uuidv4()}`,
        sourceType: 'twitter' as const,
        content: tweet.text || tweet.content || '',
        timestamp: tweet.created_at ? new Date(tweet.created_at).getTime() : Date.now(),
        author: tweet.user?.username || tweet.author?.username || 'unknown',
        url: tweet.url || `https://twitter.com/x/status/${tweet.id}`,
        metadata: {
          metrics: {
            likes: tweet.like_count,
            retweets: tweet.retweet_count
          },
          query
        }
      }));
    } catch (e) {
      console.error('[DesearchCollector] Fetch Error:', e);
      return [];
    }
  }

  private getMockData(query: string): RawSignal[] {
    return [
      {
        id: `mock_tw_${Date.now()}_1`,
        sourceType: 'twitter',
        content: `Just heard massive supply chain rumors about $${query.replace(/[^a-zA-Z]/g, '')}. Suppliers in Taiwan are expanding capacity 3x for next quarter! This changes the entire revenue guidance.`,
        timestamp: Date.now() - 1000 * 60 * 30, // 30 mins ago
        author: 'SemiConductorInsider',
        url: 'https://twitter.com/mock/status/1',
        metadata: { metrics: { retweets: 120, likes: 450 }, query }
      },
      {
        id: `mock_tw_${Date.now()}_2`,
        sourceType: 'twitter',
        content: `$${query.replace(/[^a-zA-Z]/g, '')} options flow is insane today. Someone just bought 50k calls significantly out of the money expiring next week. Smart money is positioning for something big.`,
        timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
        author: 'OptionsWhale',
        url: 'https://twitter.com/mock/status/2',
        metadata: { metrics: { retweets: 45, likes: 110 }, query }
      }
    ];
  }
}
