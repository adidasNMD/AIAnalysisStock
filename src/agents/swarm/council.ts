import { AutonomousAgent } from '../core/agent';

interface AgentRequestOptions {
  signal?: AbortSignal;
}

function throwIfCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Canceled by user');
  }
}

function isCanceledError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Canceled by user';
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfCanceled(signal);
  let onAbort: (() => void) | null = null;
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    onAbort = () => {
      clearTimeout(timeoutId);
      reject(new Error('Canceled by user'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  }).finally(() => {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
}

const ALL_COUNCIL_ROLES = [
  { role: '技术派散户 (Technical Retail Trader)', perspective: '纯技术面分析，关注K线形态、均线系统、量价关系、MACD/RSI 指标。你只看图表，不关心基本面。' },
  { role: '情绪派散户 / WSB 风格 (Emotional Retail / WSB)', perspective: '你是 Reddit WSB 风格的激进散户。你关注 meme 潜力、短期挤空（short squeeze）、gamma squeeze 机会。用激进的语气表达观点。' },
  { role: '机构席位 (Institutional Desk)', perspective: '你代表大型机构的交易台。关注流动性、大单暗盘、期权未平仓量(OI)变化、机构持仓报告(13F)、ETF 资金流向。' },
  { role: '职业空头 (Short Seller)', perspective: '你是一个专业做空者。你的工作就是找漏洞和看跌理由。关注估值泡沫、高管减持、会计陷阱、同业竞争风险、产能过剩。' },
  { role: '宏观经济分析师 (Macro Economist)', perspective: '你关注美联储利率政策、收益率曲线、美元指数、全球资金流动、地缘政治、关税政策对该叙事的影响。' },
  { role: '价值投资者 (Value Investor)', perspective: '你信奉巴菲特/格雷厄姆。用 DCF、P/E、P/B、自由现金流等估值框架冷静评估。你讨厌追高和投机。' },
  { role: '量化资金 (Quant Fund)', perspective: '你代表量化交易策略。关注统计套利、因子暴露、波动率微笑曲面、期限结构、跨资产相关性。用数据说话。' },
  { role: '供应链分析师 (Supply Chain Analyst)', perspective: '你关注上游/下游扰动、物流瓶颈、库存周期、订单能见度、产能利用率和交期变化。你从供应链韧性和传导路径判断叙事真假。' },
  { role: '科技产业观察者 (Tech Industry Observer)', perspective: '你关注产品迭代节奏、采用曲线、竞争壁垒、平台生态、开发者采纳和技术替代风险。你判断技术叙事是否真的会转化为收入。' },
  { role: '事件驱动交易员 (Event-Driven Trader)', perspective: '你专注催化剂、财报、并购、监管事件、产品发布和指引变化。你关心事件时间表、预期差和事件后波动收敛。' },
  { role: '期权做市商 (Options Market Maker)', perspective: '你关注隐含波动率、偏斜(skew)、期限结构、异常期权成交、Gamma 暴露和对冲流。你从衍生品定价判断市场预期。' },
];

function selectCouncilRoles(count: number = 7): typeof ALL_COUNCIL_ROLES {
  const shuffled = [...ALL_COUNCIL_ROLES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * CouncilArbitratorGroup — 多视角辩论议会
 * 
 * 输入: 策略师的产业链研报文本
 * 输出: 一篇完整的《多视角辩论交易备忘录》(string)
 * 
 * 7 个人格 Agent 并发输出纯文本观点，仲裁 Agent 汇总输出最终辩论报告。
 */
export class CouncilArbitratorGroup {
  async convene(strategyReport: string, investorProfile?: string, options: AgentRequestOptions = {}): Promise<string> {
    const councilRoles = selectCouncilRoles();
    console.log(`\n[CouncilArbitrator] ⚖️ Convening the high council Swarm (${councilRoles.length} agents)...`);

    // 分批执行人格 Agent（每批 2 个，批间间隔 3 秒，避免打爆 API 代理）
    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 3000;
    const perspectives: string[] = [];

    for (let i = 0; i < councilRoles.length; i += BATCH_SIZE) {
      throwIfCanceled(options.signal);
      const batch = councilRoles.slice(i, i + BATCH_SIZE);
      
      if (i > 0) {
        console.log(`[CouncilArbitrator] ⏳ 等待 ${BATCH_DELAY_MS / 1000}s 后启动下一批人格...`);
        await abortableDelay(BATCH_DELAY_MS, options.signal);
      }
      
      console.log(`[CouncilArbitrator] 🎭 启动第 ${Math.floor(i / BATCH_SIZE) + 1} 批人格 (${batch.map(b => b.role.split(' (')[0]).join(', ')})...`);

      const batchResults = await Promise.all(batch.map(async ({ role, perspective }) => {
        const agent = new AutonomousAgent({
          role,
          goal: `从 ${role} 的立场深度分析当前叙事和标的。`,
          instructions: `${perspective}

你必须：
1. 阐述你的核心论点（至少 2-3 段深度分析）
2. 列出 4-5 个具体的支撑论据
3. 列出 3-4 个你认为的最大风险/反方逻辑
4. 给出你对该叙事的情绪倾向：极度看多 / 看多 / 中性 / 看空 / 极度看空
5. 所有输出使用中文`
        });

        try {
          throwIfCanceled(options.signal);
          const opinion = await agent.executeTextTask(
            `基于上游策略师的产业链研报，从你的人格立场发表深度交易观点。`,
            strategyReport,
            { ...(options.signal ? { signal: options.signal } : {}) },
          );
          return `### 🎭 ${role}\n\n${opinion}`;
        } catch (e: any) {
          if (isCanceledError(e)) throw e;
          console.error(`[Council] ⚠️ 人格 ${role} 发言失败: ${e.message}`);
          return `### 🎭 ${role}\n\n> ⚠️ 该人格 Agent 发言失败: ${e.message}`;
        }
      }));

      perspectives.push(...batchResults);
    }

    const allPerspectivesText = perspectives.join('\n\n---\n\n');

    console.log(`\n[CouncilArbitrator] ⚖️ ${perspectives.length} 个人格完成发言，提交仲裁...`);

    // 仲裁 Agent：汇总所有观点，输出最终辩论报告
    const arbitrator = new AutonomousAgent({
      role: '首席仲裁官 (Master Arbitrator)',
      goal: '在多方激烈辩论后，以绝对客观的立场提炼出最终的多空核心论据和可执行的交易策略。',
      instructions: `你是华尔街最高风控委员会的首席仲裁官。
你刚刚聆听了 7 位不同立场的分析师的激烈辩论。
你必须：
1. 客观提炼多方和空方各自最强的硬逻辑
2. 识别双方的共识点和分歧点
3. 给出具体的催化事件（向上突破的触发条件）
4. 给出极其严格的铁血止损条件（叙事被证伪、必须立即退出的条件）
5. 不允许和稀泥，必须有明确的偏向判断
6. 所有输出使用中文`
    });

    throwIfCanceled(options.signal);
    const debateReport = await arbitrator.executeTextTask(
      `作为首席仲裁官，基于以下 7 位分析师的辩论证词，撰写最终的《多视角辩论交易备忘录》。
${investorProfile ? `\n=== 投资者画像（请据此调整操作建议的风格和仓位建议）===\n${investorProfile.substring(0, 1500)}\n` : ''}
要求的报告结构：

## ⚔️ 辩论总览
简要概括各方的核心分歧

## 🐂 多方核心论据提纯
提炼多方最强的 3-5 个硬逻辑论据

## 🐻 空方核心论据提纯
提炼空方最强的 3-5 个硬逻辑论据

## 🎯 向上突破催化条件
列出 3-5 个具体的、可量化验证的催化事件

## 🚨 铁血止损 / 叙事证伪条件
列出 3-5 个必须立即退出的铁血止损条件（极其重要！）

## 📊 仲裁裁决
你的最终判断：该叙事目前的多空胜率、建议仓位比例、操作策略`,
      `=== 策略师产业链研报 ===\n${strategyReport}\n\n=== 议会辩论证词 ===\n${allPerspectivesText}`,
      { ...(options.signal ? { signal: options.signal } : {}) },
    );

    // 组装完整辩论报告（包含每个人格的原始发言 + 仲裁结论）
    const fullReport = `${debateReport}\n\n---\n\n## 👥 议会完整证词\n\n${allPerspectivesText}`;

    console.log(`[CouncilArbitrator] 🏆 辩论报告完成 (${fullReport.length} 字)`);
    return fullReport;
  }

  /**
   * 单次 LLM 调用模拟全部人格辩论 (Token 成本降至 ~1/8)
   * 
   * 适用于 quick/standard 分析模式。
   * 一次 LLM 调用中同时扮演所有 7 个人格，输出完整辩论报告。
   */
  async singlePassDebate(strategyReport: string, investorProfile?: string, options: AgentRequestOptions = {}): Promise<string> {
    console.log(`\n[CouncilArbitrator] ⚡ 启动单次辩论模式 (Single-pass, 1 次 LLM 调用)...`);

    const councilRoles = selectCouncilRoles();
    const rolesDescription = councilRoles.map((r, i) => `${i + 1}. **${r.role}**: ${r.perspective}`).join('\n');

    const agent = new AutonomousAgent({
      role: '首席仲裁官 + 7 人格议会 (Single-pass Mode)',
      goal: '在一次分析中同时扮演 7 个不同立场的分析师，完成多空辩论并给出仲裁结论。',
      instructions: `你需要在这一次回复中完成完整的多视角辩论。

你将依次从以下 7 个人格的立场发表简要观点（每个人格 2-3 段），然后作为首席仲裁官做出最终裁决。

七个人格角色：
${rolesDescription}

输出结构要求：
1. 每个人格的简要观点（标注 🎭 + 角色名）
2. ⚔️ 辩论总览 — 核心分歧概括
3. 🐂 多方核心论据提纯 (3-5 个)
4. 🐻 空方核心论据提纯 (3-5 个)
5. 🎯 向上突破催化条件 (3-5 个)
6. 🚨 铁血止损 / 叙事证伪条件 (3-5 个)
7. 📊 仲裁裁决 — 多空胜率、建议仓位、操作策略

所有输出使用中文。`
    });

    const context = `=== 策略师产业链研报 ===\n${strategyReport}\n${investorProfile ? `\n=== 投资者画像 ===\n${investorProfile.substring(0, 1500)}\n` : ''}`;

    const debateReport = await agent.executeTextTask(
      `基于上游策略师的产业链研报，依次从 7 个不同人格的立场发表观点，然后作为首席仲裁官给出最终裁决。`,
      context,
      { ...(options.signal ? { signal: options.signal } : {}) },
    );

    console.log(`[CouncilArbitrator] 🏆 单次辩论报告完成 (${debateReport.length} 字)`);
    return debateReport;
  }
}
