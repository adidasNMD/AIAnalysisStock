import { z } from 'zod';
import { AutonomousAgent } from '../core/agent';
import { desearchTool } from '../../tools/desearch';
import { firecrawlTool } from '../../tools/firecrawl';
import { redditTool } from '../../tools/reddit';
import { RawSignal } from '../../models/types';

export class DataScoutAgent extends AutonomousAgent {
  constructor() {
    super({
      role: 'Data Scout & Information Gatherer',
      goal: 'Acquire raw signals from Reddit, Twitter, and the Web, then filter out pure noise.',
      tools: [redditTool, desearchTool, firecrawlTool],
      instructions: 'You are the vanguard. Use your tools to find data, then return a structured array of valid intelligence signals.'
    });
  }

  async scout(query: string): Promise<RawSignal[]> {
    console.log(`\n[DataScout] 🕵️‍♂️ Commencing scouting mission to execute Search Tools for: "${query}"`);
    
    let combinedSignals = "";

    // 1. Reddit 免费采集（始终执行，最可靠的免费数据源）
    try {
       const redditData = await redditTool.execute({ query, limit: 10 });
       combinedSignals += `\n[Reddit Data]:\n${redditData}`;
    } catch(e: any) {
        console.error(`[DataScout] Reddit fallback: ${e.message}`);
    }
    
    // 2. X/Twitter Desearch（付费 API，可能降级为 Mock）
    try {
       const xData = await desearchTool.execute({ query, limit: 10 });
       combinedSignals += `\n[X/Twitter Data]:\n${xData}`;
    } catch(e: any) {
        console.error(`[DataScout] Desearch fallback: ${e.message}`);
    }
    
    // 3. Firecrawl 深度文章（付费 API，可能降级为 Mock）
    try {
       const webData = await firecrawlTool.execute({ query, limit: 2 });
       combinedSignals += `\n[Web Data]:\n${webData}`;
    } catch(e: any) {
        console.error(`[DataScout] Firecrawl fallback: ${e.message}`);
    }

    const FilteredSchema = z.object({
       validInsights: z.array(z.object({
         source: z.string(),
         content: z.string(),
         timestamp: z.number()
       }))
     });

     const res = await this.executeTask(
       `Review the collected raw data below. Extract ONLY the valid, market-moving intelligence insights. Ignore spam, bots, and irrelevant chatter.`,
       FilteredSchema,
       combinedSignals
     );

     return res.validInsights.map((i, idx) => ({
       id: `scout_${idx}_${Date.now()}`,
       sourceType: 'twitter' as const,
       content: i.content,
       timestamp: i.timestamp || Date.now(),
       author: i.source || 'Scout',
       url: ''
     }));
  }
}
