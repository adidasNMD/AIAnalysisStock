import { z } from 'zod';
import { AutonomousAgent } from '../core/agent';
import { desearchTool } from '../../tools/desearch';
import { firecrawlTool } from '../../tools/firecrawl';
import { RawSignal } from '../../models/types';

export class DataScoutAgent extends AutonomousAgent {
  constructor() {
    super({
      role: 'Data Scout & Information Gatherer',
      goal: 'Acquire raw signals from Twitter and the Web, then filter out pure noise.',
      tools: [desearchTool, firecrawlTool],
      instructions: 'You are the vanguard. Use your tools to find data, then return a structured array of valid intelligence signals.'
    });
  }

  async scout(query: string): Promise<RawSignal[]> {
    console.log(`\n[DataScout] 🕵️‍♂️ Commencing scouting mission to execute Search Tools for: "${query}"`);
    
    let combinedSignals = "";
    
    try {
       const xData = await desearchTool.execute({ query, limit: 10 });
       combinedSignals += `\n[X/Twitter Data]:\n${xData}`;
    } catch(e: any) {
        console.error(`[DataScout] Desearch fallback: ${e.message}`);
    }
    
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
       sourceType: 'twitter',
       content: i.content,
       timestamp: i.timestamp || Date.now(),
       author: i.source || 'Scout',
       url: ''
     }));
  }
}
