import { DesearchCollector } from './agents/collector/desearch';
import * as dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  const apiKey = process.env.DESEARCH_API_KEY;
  if (!apiKey || apiKey.includes('your_')) {
    console.error('❌ Missing or invalid DESEARCH_API_KEY in .env');
    return;
  }
  
  console.log(`[Test] Using Desearch API Key: ${apiKey.substring(0, 8)}...`);
  const collector = new DesearchCollector(apiKey);
  
  const query = 'NVIDIA OR NVDA options';
  console.log(`[Test] 📡 Sending live request to Desearch.ai for query: "${query}"...`);
  
  try {
    const start = Date.now();
    const signals = await collector.fetchRecentTweets(query, 3);
    const duration = Date.now() - start;
    
    console.log(`\n[Test] ✅ Request completed in ${duration}ms. Received ${signals.length} real signals:`);
    console.log(JSON.stringify(signals, null, 2));
  } catch (error) {
    console.error('[Test] ❌ Error executing live search:', error);
  }
}

runTest();
