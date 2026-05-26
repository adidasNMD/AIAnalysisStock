import { z } from 'zod';
import { AgentTool } from './index';
import { FirecrawlCollector } from '../agents/collector/firecrawl';
import * as dotenv from 'dotenv';
dotenv.config();

export const firecrawlTool: AgentTool<{ query: string, limit?: number }> = {
  name: 'search_web_news_articles',
  description: 'Search the broader web for long-form news, analyst reports, earnings transcripts, and macroeconomic articles. Use this when you need deep, structured fundamental data rather than social rumors.',
  parameters: z.object({
    query: z.string().describe('The contextual search query, e.g., "Federal reserve rate hike supply chain impact 2026"'),
    limit: z.number().optional().describe('Number of lengthy articles to scrape, default is 3')
  }),
  execute: async (args, options) => {
    console.log(`\n[Tool Exec] 🔧 LLM invoked Firecrawl Tool: Scraping Deep Web for "${args.query}"`);
    const collector = new FirecrawlCollector(process.env.FIRECRAWL_API_KEY || process.env.TAVILY_API_KEY || '');
    const signals = await collector.scrapeNews(args.query, args.limit || 3, options);
    
    if (!signals.length) {
      return "No lengthy articles or reports found on the deep web.";
    }
    
    // Limit to 1500 chars per article to avoid blowing up the context window
    return signals.map(s => `[Title: ${s.metadata?.title} | Source: ${s.author}]:\n${s.content.substring(0, 1500)}...`).join('\n\n===WEB REPORT===\n\n');
  }
};
