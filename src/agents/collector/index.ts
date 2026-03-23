import { DesearchCollector } from './desearch';
import { FirecrawlCollector } from './firecrawl';
import { RawSignal } from '../../models/types';
import * as dotenv from 'dotenv';
dotenv.config();

export class CollectorAgent {
  private twitterCollector: DesearchCollector;
  private newsCollector: FirecrawlCollector;

  constructor() {
    this.twitterCollector = new DesearchCollector(process.env.DESEARCH_API_KEY || '');
    this.newsCollector = new FirecrawlCollector(process.env.FIRECRAWL_API_KEY || process.env.TAVILY_API_KEY || '');
  }

  /**
   * Execute holistic data collection for a specific narrative, ticker, or entity
   * 
   * @param topicOrTicker The central thesis or company to investigate
   * @returns Aggregated array of raw intelligence signals ready for normalisation
   */
  async collectSignals(topicOrTicker: string): Promise<RawSignal[]> {
    console.log(`\n[CollectorAgent] 🔍 Starting multi-source extraction sweep for: "${topicOrTicker}"...`);
    
    // Fetch signals concurrently from our multi-agents to reduce latency
    const [twitterSignals, newsSignals] = await Promise.all([
      this.twitterCollector.fetchRecentTweets(topicOrTicker, 15),
      this.newsCollector.scrapeNews(topicOrTicker, 3)
    ]);

    const aggregatedSignals = [...twitterSignals, ...newsSignals];
    console.log(`[CollectorAgent] ✅ Sweep complete. Total Raw Signals Found: ${aggregatedSignals.length}`);
    
    return aggregatedSignals;
  }
}
