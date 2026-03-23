import { RawSignal } from '../../models/types';
import crypto from 'crypto';

export class NormalizerAgent {
  /**
   * Cleans and deduplicates a batch of raw signals to reduce noise before LLM extraction
   * 
   * @param signals Array of RawSignals from various collectors
   * @returns Cleaned and deduplicated array of RawSignals
   */
  async process(signals: RawSignal[]): Promise<RawSignal[]> {
    console.log(`\n[NormalizerAgent] 🧹 Ingested ${signals.length} raw signals for normalization.`);
    
    // 1. Filter out excessively short or empty noise
    let validSignals = signals.filter(s => {
      const content = s.content?.trim() || '';
      // Require at least brief semantic value
      return content.length > 15; 
    });
    
    // 2. Deduplicate based on aggressive content hashing and URL matching
    const seenHashes = new Set<string>();
    const seenUrls = new Set<string>();
    
    const deduped: RawSignal[] = [];
    
    for (const signal of validSignals) {
      // Create a normalized string to hash (ignoring case, whitespace, typical punctuation)
      const normalizedContent = signal.content
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
        
      const hash = crypto.createHash('md5').update(normalizedContent).digest('hex');
      
      const isDuplicateHash = seenHashes.has(hash);
      const isDuplicateUrl = signal.url ? seenUrls.has(signal.url) : false;
      
      if (!isDuplicateHash && !isDuplicateUrl) {
        seenHashes.add(hash);
        if (signal.url) seenUrls.add(signal.url);
        deduped.push(signal);
      }
    }
    
    console.log(`[NormalizerAgent] ✨ Normalization complete. Removed ${signals.length - deduped.length} duplicates/noise. Retained ${deduped.length} unique signals.`);
    return deduped;
  }
}
