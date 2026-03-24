import { AgentSwarmOrchestrator } from './workflows/swarm-pipeline';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log(`\n==================================================================`);
  console.log(`🦅 OPENCLAW AUTONOMOUS INTELLIGENCE DESK (V4)`);
  console.log(`   (Powered by Reddit + Desearch.ai 🔥 + Generic LLM Schema Reasoning 🧠)`);
  console.log(`==================================================================\n`);

  rl.question('Enter a market narrative or ticker to investigate (e.g., "NVDA Blackwell" or "Solana ETF"): ', async (query) => {
    if (!query) {
      console.log('❌ Query is empty. Shutting down desk.');
      rl.close();
      return;
    }
    
    console.log(`\n[Agent Orchestrator] Dispatching search & intelligence forces for: "${query}"...`);
    const orchestrator = new AgentSwarmOrchestrator();
    await orchestrator.executeMission(query);
    
    rl.close();
  });
}

// 启动入口
main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
