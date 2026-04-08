import { NarrativeRecord, updateNarrative, loadNarratives } from '../../utils/narrative-store';
import { checkSMACross } from '../../tools/market-data';

// ==========================================
// NarrativeLifecycleEngine — 叙事生命周期引擎 (Free-form Text Flow 版本)
// 核心改变：使用 NarrativeRecord.coreTicker 字段（从文本正则提取）
// 代替旧版的 chainMapping.coreTickers[0]
// ==========================================

export class NarrativeLifecycleEngine {
  async evaluateAllActiveNarratives(): Promise<{ updated: number; messages: string[] }> {
    console.log(`\n[LifecycleEngine] 🔄 开始评估活跃叙事的生命周期状态...`);
    
    const narratives = await loadNarratives();
    const records = narratives.filter((r: any) => r.status === 'active');
    const messages: string[] = [];
    let updatedCount = 0;

    for (const record of records) {
      // 使用新版 coreTicker 字段（从文本正则提取）
      // 同时兼容旧版 chainMapping.coreTickers
      const coreTicker = record.coreTicker;

      if (!coreTicker) {
        continue; // 没有核心标的，无法进行量价评估
      }
      
      try {
        const smaResults = await checkSMACross(coreTicker, [20]);
        const sma20 = smaResults.find(r => r.period === 20);
        
        const isHealthy = sma20?.position === 'above';
        const isBroken = sma20?.position === 'below';
        
        let newStage = record.stage;
        let reason = '';

        if (record.stage === 'earlyFermentation' || record.stage === 'emergingConsensus') {
            if (isHealthy) {
                newStage = 'mainExpansion';
                reason = `龙头 ${coreTicker} 维持在 20日均线上方，趋势已确立，自动推进至 [主升浪]。请坚定持仓，防卖飞。`;
            }
        } 
        else if (record.stage === 'mainExpansion') {
            if (isHealthy) {
                reason = `龙头 ${coreTicker} 走势依然强劲 (站稳 20日线)。强制维持 [主升浪] 判定，不要被短期波动洗下车！`;
            } else if (isBroken) {
                newStage = 'narrativeFatigue';
                reason = `龙头 ${coreTicker} 跌破 20日均线生命线！自动降级为 [叙事疲劳]。建议减仓或止盈。`;
            }
        }
        else if (record.stage === 'narrativeFatigue') {
            if (isBroken) {
                newStage = 'postCollapse';
                reason = `叙事彻底衰竭，龙头持续走弱，进入 [崩溃期]。完全回避。`;
            } else if (isHealthy) {
                newStage = 'emergingConsensus';
                reason = `龙头重新站回 20 日线，叙事可能开启二波，回到 [共识重构] 阶段。`;
            }
        }

        if (newStage !== record.stage) {
            await updateNarrative(record.id, {
                stage: newStage,
                eventSummary: `生命周期引擎判定: 从 ${record.stage} 跃迁至 ${newStage}`
            });
            messages.push(`📌 [${record.title}] 阶段变更: ${newStage}\n   💡 推演逻辑: ${reason}`);
            updatedCount++;
        } else if (record.stage === 'mainExpansion' && isHealthy) {
            messages.push(`🛡️ [${record.title}] 镇痛维稳: ${reason}`);
        }

      } catch (e: any) {
        console.error(`[LifecycleEngine] 评估 ${record.title} 失败: ${e.message}`);
      }
    }

    console.log(`[LifecycleEngine] ✅ 评估完成。共评估 ${records.length} 个叙事，状态变更 ${updatedCount} 个。`);
    return { updated: updatedCount, messages };
  }
}
