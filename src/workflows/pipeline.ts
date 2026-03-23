import { CollectorAgent } from '../agents/collector';
import { NormalizerAgent } from '../agents/normalizer';
import { EventExtractorAgent } from '../agents/intelligence/extractor';
import { EarlyDiscoveryAgent } from '../agents/intelligence/discovery';
import { LifecycleEngine } from '../agents/lifecycle/engine';
import { ChainMappingEngine } from '../agents/intelligence/mapper';
import { PerspectivesAgent } from '../agents/intelligence/perspectives';
import { DebateAgent } from '../agents/intelligence/debate';
import { SynthesisAgent } from '../agents/intelligence/synthesis';
import * as fs from 'fs';
import * as path from 'path';

export class OpenClawPipeline {
  private collector = new CollectorAgent();
  private normalizer = new NormalizerAgent();
  private extractor = new EventExtractorAgent();
  private discovery = new EarlyDiscoveryAgent();
  private lifecycle = new LifecycleEngine();
  private mapper = new ChainMappingEngine();
  private perspectives = new PerspectivesAgent();
  private debate = new DebateAgent();
  private synthesis = new SynthesisAgent();

  /**
   * Run the end-to-end intelligence pipeline for a given query/topic
   */
  async runPipeline(query: string): Promise<string | null> {
    console.log(`\n======================================================`);
    console.log(`🚀 OPENCLAW END-TO-END PIPELINE INITIATED: [${query}]`);
    console.log(`======================================================\n`);

    // 1. Collect & Normalize Pipeline (The Ears)
    const rawSignals = await this.collector.collectSignals(query);
    const cleanSignals = await this.normalizer.process(rawSignals);
    
    if (cleanSignals.length === 0) {
      console.log('❌ Pipeline aborted: Insufficient clean signals retrieved.');
      return null;
    }

    // 2. Event Extractor Pipeline (The Sorter)
    const event = await this.extractor.extractEvent(cleanSignals, query);
    if (!event) {
      console.log('❌ Pipeline aborted: LLM Extractor failed to solidify an event.');
      return null;
    }

    // 3. Early Narrative Discovery Pipeline (The Filter)
    let topic = await this.discovery.evaluateEvent(event);
    if (!topic) {
      console.log('❌ Pipeline aborted: Event lacked the impact or novelty to spawn a full Narrative workflow.');
      return null;
    }

    // 4. Lifecycle Engine Pipeline (The Tracker)
    topic = this.lifecycle.evaluateStateTransition(topic, [event]);

    // 5. Chain Mapping Pipeline (The Quant)
    const mapping = await this.mapper.mapTickers(topic);
    if (!mapping) {
      console.log('❌ Pipeline aborted: Failed to map actionable target tickers.');
      return null;
    }

    // 6. Multi-Perspective Combat Pipeline (The Council)
    const cards = await this.perspectives.generateAllPerspectives(topic);

    // 7. Debate Arbitration (The Judge)
    const debateResult = await this.debate.executeDebate(topic, cards);
    if (!debateResult) {
      console.log('❌ Pipeline aborted: Debate Arbitration crashed.');
      return null;
    }

    // 8. Output Synthesis
    const reportMarkdown = this.synthesis.generateDailyBrief(topic, mapping, debateResult);

    // Persist Output
    const outDir = path.join(__dirname, '../../out');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const filename = `Brief_${query.replace(/[^a-zA-Z]/g, '')}_${Date.now()}.md`;
    const fullPath = path.join(outDir, filename);
    fs.writeFileSync(fullPath, reportMarkdown);

    console.log(`\n========== 🏆 PIPELINE SUCCESS ==========`);
    console.log(`Report successfully written to ${fullPath}`);
    
    return reportMarkdown;
  }
}
