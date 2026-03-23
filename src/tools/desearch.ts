import { z } from 'zod';
import { AgentTool } from './index';
import { DesearchCollector } from '../agents/collector/desearch';
import * as dotenv from 'dotenv';
dotenv.config();

export const desearchTool: AgentTool<{ query: string, limit?: number }> = {
  name: 'search_x_twitter_realtime',
  description: 'Search X (formerly Twitter) in real-time for highly volatile market sentiment, options flow whispers, short squeezes, and breaking social narratives. Use this exclusively when you need live reactions or rumors from traders.',
  parameters: z.object({
    query: z.string().describe('The strict search query. Can include cashtags like "$NVDA" or boolean operators like "NVIDIA options"'),
    limit: z.number().optional().describe('Number of tweets to fetch, default is 15')
  }),
  execute: async (args) => {
    console.log(`\n[Tool Exec] 🔧 LLM invoked Desearch Tool: Searching X for "${args.query}"`);
    const collector = new DesearchCollector(process.env.DESEARCH_API_KEY || '');
    const signals = await collector.fetchRecentTweets(args.query, args.limit || 15);
    
    if (!signals.length) {
      return "No results found on X/Twitter. The narrative might be dead or the query too strict.";
    }
    
    return signals.map(s => `[User: ${s.author} | Time: ${new Date(s.timestamp).toISOString()}]:\n${s.content}`).join('\n\n---TWEET---\n\n');
  }
};
