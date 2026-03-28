import dotenv from 'dotenv';
dotenv.config();
import { AgentSwarmOrchestrator } from './workflows/swarm-pipeline';
import { TrendRadar } from './agents/trend/trend-radar';
import { evolveWatchlist } from './agents/discovery/watchlist-evolver';
import { saveReport } from './utils/storage';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('\n=============================================');
    console.log('🚀 OpenClaw 全自动热点发现 + 深度分析测试');
    console.log('=============================================\n');

    // =============================================
    // Step 0: 观察池自进化 — LLM 产业链推导新关键词
    // =============================================
    console.log('[Test] 🧬 Step 0: 启动观察池自进化（产业链推导新搜索维度）...\n');
    try {
      const { addedKeywords, addedSubreddits, addedETFs } = await evolveWatchlist();
      console.log(`[Test] 🧬 进化结果: +${addedKeywords.length} 关键词, +${addedSubreddits.length} Reddit源, +${addedETFs.length} ETF`);
    } catch (e: any) {
      console.error(`[Test] ⚠️ 观察池进化失败（不影响后续流程）: ${e.message}`);
    }

    // =============================================
    // Step 1: TrendRadar 自动发现当前最热门的话题
    // =============================================
    console.log('\n[Test] 📡 Step 1: 启动 TrendRadar 扫描当前市场热点...\n');
    
    const trendRadar = new TrendRadar();
    const trendAnalysis = await trendRadar.scan();

    // 从趋势报告中提取最有价值的话题作为深度分析的 query
    // 策略：取报告前 300 字的核心摘要作为主题
    let hotQuery = '';
    
    if (trendAnalysis.report && trendAnalysis.report.length > 50) {
      // 尝试从报告中提取第一个标题作为话题
      const headingMatch = trendAnalysis.report.match(/##\s*(.+)/);
      if (headingMatch && headingMatch[1]) {
        hotQuery = headingMatch[1].replace(/[#*`]/g, '').trim().substring(0, 80);
      }
      
      // 如果没找到标题，取报告前200字的核心内容
      if (!hotQuery || hotQuery.length < 10) {
        hotQuery = trendAnalysis.report
          .replace(/[#*`\n]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 100);
      }
    }
    
    // 如果 TrendRadar 未能产出有效结果，使用当前日期的通用热点查询
    if (!hotQuery || hotQuery.length < 10) {
      hotQuery = 'AI infrastructure semiconductor supply chain latest catalyst';
      console.log(`[Test] ⚠️ TrendRadar 未能提取具体热点，使用通用查询: "${hotQuery}"`);
    } else {
      console.log(`\n[Test] 🔥 TrendRadar 发现的最热话题: "${hotQuery}"`);
    }

    if (trendAnalysis.mentionedTickers.length > 0) {
      console.log(`[Test] 📌 热门标的: ${trendAnalysis.mentionedTickers.map(t => `$${t}`).join(', ')}`);
    }

    // =============================================
    // 第二步：Swarm Pipeline 对热点话题进行深度分析
    // =============================================
    console.log(`\n[Test] 🧠 Step 2: 启动 Swarm Pipeline 深度分析: "${hotQuery}"\n`);

    const orchestrator = new AgentSwarmOrchestrator();
    
    try {
        const report = await orchestrator.executeMission(hotQuery);
        console.log('\n\n✅ 全自动热点分析完毕！\n');
        
        if (report) {
            // 使用 saveReport 按 out/reports/YYYY-MM-DD/HH-mm-ss_query.md 归档
            const savedPath = saveReport(hotQuery, report);
            console.log(`📄 研报已保存至: ${savedPath}`);
            console.log(`📊 报告长度: ${report.length} 字`);
        } else {
            console.log('⚠️ 未能生成有效研报 (数据不足或被分析师判定为无需追踪)。');
        }
    } catch (e: any) {
        console.error('\n❌ 运行出错:', e.message);
    }

    process.exit(0);
}

main();
