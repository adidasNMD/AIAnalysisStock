import { FirecrawlCollector } from './src/agents/collector/firecrawl';
import * as dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log('--- STARTING WEB COLLECTOR TESTS ---');
  const collector = new FirecrawlCollector(process.env.FIRECRAWL_API_KEY || '');
  console.log(`\n> Testing query: "SpaceX Starship launch 2026"`);
  
  const signals = await collector.scrapeNews('SpaceX Starship launch 2026', 1);
  
  console.log(`\n--- RESULTS ---`);
  console.log(`Total Signals Extracted: ${signals.length}`);
  if (signals.length > 0) {
    const s = signals[0]!;
    console.log(`Sample [Source: ${s.author}] - ${s.metadata?.title}`);
    console.log(`Content Snippet Preview:`);
    console.log(s.content.substring(0, 300) + '...');
  }
}

runTest().catch(console.error);
