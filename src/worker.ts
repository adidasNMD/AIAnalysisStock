import cron from 'node-cron';
import { AgentSwarmOrchestrator } from './workflows/swarm-pipeline';

console.log(`\n==================================================================`);
console.log(`⏱️ OPENCLAW AUTOPILOT DAEMON STARTED`);
console.log(`   (Awaiting scheduled polling intervals...)`);
console.log(`==================================================================\n`);

const orchestrator = new AgentSwarmOrchestrator();

// Scheduled to run every day at 08:30 AM (Pre-market scanner)
cron.schedule('30 08 * * *', async () => {
    console.log(`\n[CronDaemon] ⏰ Scheduled execution triggered "Pre-market Narrative Scanner"`);
    
    // In production, these would be loaded from a dynamically managed Watchlist Database
    const activeWatches = ['AI Infrastructure CapEx', 'Solana DeFi volume', 'Federal Reserve Rate Cut impact'];
    
    for (const query of activeWatches) {
        await orchestrator.executeMission(query);
    }
});

// Handle manual trigger arg for immediate testing
if (process.argv.includes('--run-now')) {
    console.log(`[Daemon] '--run-now' flag detected, forcing an immediate test run...`);
    orchestrator.executeMission('Federal Reserve emergency meeting rumor').catch(console.error);
}
