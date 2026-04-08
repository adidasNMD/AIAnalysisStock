import { NarrativeRecord, updateNarrative, loadNarratives } from '../../utils/narrative-store';
import { checkSMACross } from '../../tools/market-data';

// ==========================================
// NarrativeLifecycleEngine — 叙事生命周期引擎 (Free-form Text Flow 版本)
// 核心改变：使用 NarrativeRecord.coreTicker 字段（从文本正则提取）
// 代替旧版的 chainMapping.coreTickers[0]
// ==========================================

export class NarrativeLifecycleEngine {
  async evaluateAllActiveNarratives(): Promise<{
    updated: number;
    messages: string[];
    antiSellGuards: Array<{ ticker: string; reason: string }>;
  }> {
    console.log(`\n[LifecycleEngine] 🔄 开始评估活跃叙事的生命周期状态...`);
    
    const narratives = await loadNarratives();
    const records = narratives.filter((r: any) => r.status === 'active');
    const messages: string[] = [];
    let updatedCount = 0;
    const antiSellGuards: Array<{ ticker: string; reason: string }> = [];

    for (const record of records) {
      const coreTicker = record.coreTicker;

      if (!coreTicker) {
        continue;
      }
      
      try {
        // 20日和50日均线的综合健康判断
        const smaResults = await checkSMACross(coreTicker, [20, 50]);
        const sma20 = smaResults.find((r: any) => r.period === 20);
        const sma50 = smaResults.find((r: any) => r.period === 50);
        
        const isHealthy = sma20?.position === 'above';
        const isBroken = sma20?.position === 'below';
        
        let newStage = record.stage;
        let reason = '';

        // Composite health: 20日线健康且50日线也在上方
        const leaderHealthy = isHealthy && (sma50?.position === 'above');
        
        if (record.stage === 'earlyFermentation' || record.stage === 'emergingConsensus') {
            if (leaderHealthy) {
                newStage = 'mainExpansion';
                reason = `龙头 ${coreTicker} 维持在 20日均线上方，50日均线也在上方，趋势已确立，自动推进至 [主升浪]。请坚定持仓，防卖飞。`;
            }
        } 
        else if (record.stage === 'mainExpansion') {
            if (leaderHealthy && sma50?.position === 'below') {
                newStage = 'crowdedClimax';
                reason = `龙头 ${coreTicker} 进入拥挤顶，20日线健康但50日线下穿，进入 Crowded Climax。`;
            } else if (leaderHealthy && sma50?.position === 'above') {
                newStage = 'mainExpansion';
                reason = `龙头 ${coreTicker} 继续领涨，维持主升浪。`;
            } else if (isHealthy) {
                reason = `龙头 ${coreTicker} 依然健康，维持 [主升浪]。`;
            } else if (isBroken) {
                newStage = 'narrativeFatigue';
                reason = `STOP_LOSS_TRIGGER: 龙头 ${coreTicker} 跌破 20日均线，进入 [叙事疲劳]。`;
            }
        }
        else if (record.stage === 'crowdedClimax') {
            if (isHealthy && (sma50?.position === 'above')) {
                newStage = 'mainExpansion';
                reason = `龙头 ${coreTicker} 重新站回50日线以上，回到 [主升浪]。`;
            } else if (isBroken) {
                newStage = 'narrativeFatigue';
                reason = `STOP_LOSS_TRIGGER: 龙头 ${coreTicker} 跌破 20日均线，进入 [叙事疲劳]。`;
            } else {
                reason = `拥挤顶行情延续中。`;
            }
        }
        else if (record.stage === 'narrativeFatigue') {
            if (isBroken) {
                newStage = 'postCollapse';
                reason = `STOP_LOSS_TRIGGER: 龙头 ${coreTicker} 叙事疲劳并跌破关键线，进入 [崩溃期]。`;
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

            // Anti-Sell Guard: 在进入 mainExpansion 且满足 leaderHealthy 时注册防卖飞
            if (newStage === 'mainExpansion' && leaderHealthy) {
              antiSellGuards.push({ ticker: coreTicker, reason: `龙头 ${coreTicker} 健康，启用 Anti-Sell Guard 防卖飞` });
              messages.push(`🛡️ [ANTI_SELL_GUARD] 龙头 ${coreTicker} 健康，防卖飞策略启用`);
            }

            updatedCount++;
        } else if (record.stage === 'mainExpansion' && isHealthy) {
            messages.push(`🛡️ [MAIN_EXPANSION] ${coreTicker} 形态稳健：${reason}`);
        }

      } catch (e: any) {
        console.error(`[LifecycleEngine] 评估 ${record.title} 失败: ${e.message}`);
      }
    }

    console.log(`[LifecycleEngine] ✅ 评估完成。共评估 ${records.length} 个叙事，状态变更 ${updatedCount} 个。`);
    return { updated: updatedCount, messages, antiSellGuards };
  }
}
