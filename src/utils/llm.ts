import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  streamToConsole?: boolean;
  /** 模型分级：primary = 主力模型，secondary = 小模型（节省 Token） */
  tier?: 'primary' | 'secondary';
}

// ── Token Usage Metering (in-memory, no enforcement) ──

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalCalls: number;
}

const globalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalCalls: 0 };
const missionUsage = new Map<string, TokenUsage>();

export function trackTokenUsage(missionId: string | undefined, usage: { prompt_tokens?: number; completion_tokens?: number }) {
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  globalUsage.promptTokens += prompt;
  globalUsage.completionTokens += completion;
  globalUsage.totalCalls++;
  if (missionId) {
    const existing = missionUsage.get(missionId) || { promptTokens: 0, completionTokens: 0, totalCalls: 0 };
    existing.promptTokens += prompt;
    existing.completionTokens += completion;
    existing.totalCalls++;
    missionUsage.set(missionId, existing);
  }
}

export function getTokenUsage(): { global: TokenUsage; missions: Record<string, TokenUsage> } {
  return { global: { ...globalUsage }, missions: Object.fromEntries(missionUsage) };
}

/**
 * 通用大模型请求封装工具：
 * 不依赖任何特定厂商的 SDK（如 openai包），采用纯粹的 fetch 协议请求标准的 /v1/chat/completions 接口。
 * 这保证了系统可以无缝接入任何 OpenAI 兼容的中转代理、DeepSeek、Ollama 以及各种开源模型。
 */
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 180000; // 长达 3 分钟的超时时间，保证复杂的产业链分析不会中断
const FALLBACK_MODELS: string[] = [];

import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * 生成一个万能容错体系。
 * 针对用户“深度对话，不要硬性格式化，不要阻断”的核心指令：
 * 这个 Proxy 将劫持所有属性访问。不论下游通过什么复杂的对象链去拿数据，都不会再报 TypeError。
 */
function createGracefulFallback<T>(rawText: string): T {
  const handler: ProxyHandler<any> = {
    get: (target, prop) => {
      // 基础类型转换器，直接将文本外溢，真正做到“保留源对话”
      if (prop === 'toString' || prop === Symbol.toPrimitive || prop === 'valueOf') return () => rawText;
      if (prop === 'toJSON') return () => ({ unformattedContext: rawText });
      if (prop === 'then') return undefined; // 防止 Promise 链陷入死循环

      if (typeof prop === 'string') {
        if (prop === 'length') return 0;
        if (prop === 'map' || prop === 'filter' || prop === 'reduce' || prop === 'forEach') return () => [];
        if (prop === 'join') return () => rawText;
        if (prop === 'slice') return () => [];

        // 遇到未知的属性层级访问，继续无限潜套安全的 Proxy
        return new Proxy(target, handler);
      }
      return undefined;
    }
  };
  return new Proxy({ _gracefulRecovery: true, _text: rawText }, handler) as T;
}

export async function generateStructuredOutput<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LLMConfig>
): Promise<T> {
  const apiKey = config?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = config?.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  let model = config?.model || process.env.LLM_MODEL || 'gpt-4o-mini';

  // 动态生成严谨的 JSON Schema (避免传入 Name 参数产生 $ref 嵌套，直接打平)
  const jsonSchemaString = JSON.stringify(zodToJsonSchema(schema as any), null, 2);

  // 强制大模型输出 JSON 的指令提示词
  const finalSystemPrompt = `${systemPrompt}\n\n[CRITICAL INSTRUCTION]: You must return ONLY raw, valid JSON. \n1. Your JSON keys MUST exactly, literally match the keys specified in the 'properties' of the schema below (e.g. if the schema requires 'title', do NOT output 'event_title').\n2. Do NOT invent new keys.\n3. Do NOT wrap the output in markdown blockquotes like \`\`\`json. Return ONLY the JSON object string.\n\n### EXPECTED EXACT JSON SCHEMA:\n${jsonSchemaString}`;

  // 演示模式：当没有真实的 API Key 时，自动拦截并返回漂亮的 Mock 数据！
  if (process.env.MOCK_LLM === 'true' || apiKey.includes('your_gen')) {
    console.log('[MockLLM] 🟢 Intercepting request and returning simulated OpenClaw Swarm Data...');
    let mockResult: any = {};
    if (systemPrompt.includes('Data Scout')) {
      mockResult = {
        validInsights: [
          { source: 'WhiteHouse_RSS', content: 'URGENT: President announces $500B strategic reserve for sovereign AI data centers.', timestamp: Date.now() },
          { source: 'TechInsider', content: 'Supply chain checks indicate immediate bottlenecks will be in Optical Transceivers and Enterprise SSDs, not just GPUs.', timestamp: Date.now() }
        ]
      };
    } else if (systemPrompt.includes('Lead Market Analyst')) {
      if (userPrompt.includes('Event Title')) {
        mockResult = {
          title: 'Sovereign AI Infrastructure Mega-Buildout',
          description: 'US Government initiates direct funding for massive dedicated AI data centers, shifting market focus from GPU designers to hard infrastructure bottlenecks (Optical networks and Memory).',
          impactScore: 98
        };
      } else {
        mockResult = {
          title: 'US Sovereign AI Reserve Announcement',
          summary: 'White House announces a multi-billion dollar initiative to build state-backed AI data centers to maintain global tech dominance.',
          sourceSignalIds: ['mock1', 'mock2'],
          credibility: 10,
          novelty: 9,
          entities: ['White House', 'Data Centers', 'Optical Transceivers', 'NAND Flash']
        };
      }
    } else if (systemPrompt.includes('Quant Strategist')) {
      mockResult = {
        coreTickers: ['NVDA', 'CEG'],
        confirmTickers: ['SMCI', 'DELL'],
        mappingTickers: ['AAOI', 'WDC', 'MU'],
        logicDescription: 'As capital flows into massive sovereign AI clusters, the immediate bottleneck shifts from compute (NVDA) to data transfer (800G/1.6T Optical modules) and massive high-density storage (Enterprise SSDs).',
        deductionChain: [
          '1. Sovereign AI Reserve injects $500B directly into Data Center construction.',
          '2. Core Compute (NVDA GPUs) is already fully priced and capacity constrained.',
          '1. 顶层驱动: $500B 国家级战略AI数据中心发包法案。',
          '2. 对撞主干: 算力核心 (NVDA) 已被华尔街过度定价，目前上车超额赔率极低，属于高危区。',
          '3. 寻找堵点: 万卡集群的互联速率是第一痛点，硅光通信模块 (尤其是AAOI这类二线) 订单被迫井喷，筹码干净。',
          '4. 向下沉降: 超大参数预训练与推理需要极高并发读取，高毛利企业级闪存SSD与HBM (WDC, MU) 进入量价齐飞拐点。'
        ]
      };
    } else if (systemPrompt.includes('Master Arbitrator')) {
      mockResult = {
        bullCaseSummary: '【右侧跟风套利发令枪】经过议会六方维度的激辩，多方占据绝对主导权。这不是题材炒作，而是美国顶级政府信用背书与产业实质订单落地的双击。我们放弃已经在天上飞翔的英伟达，直接降维打击光模块和存储赛道。这些标的此前受制于传统消费电子的疲软被错杀，此时借助 AI 基础设施大爆发的“叙事外溢”，配合资金面上的空头回补，大概率将迎来数倍（Multi-bagger）的主升浪修复。',
        bearCaseSummary: '【反向冷却与防守漏洞】尽管多头情绪激昂，但不可忽视地缘政治的绞杀。光模块与存储行业极度依赖台积电（TSM）的 CoWoS 先进封装产能，若底层硅片与封装跟不上，所谓光模块订单只是纸上富贵。目前大盘科技股高管正在密集减持，此时去追高波动极大的科技基建二线股，若大盘出现流动性黑洞，极易死在山腰。',
        keyTriggers: ['下周二美国商务部正式公开对于数据中心芯片与光器件的关税豁免清单。', '光模块核心厂商业绩预演中超预期至少 50%，并在电话会上宣布产能近满。', '衍生标的日线级别放巨量突破 250 日牛熊分界线。'],
        ironcladStopLosses: ['法案在国会遭到党派阻击，被宣布延期表决超过2周以上。', '龙头股 NVDA 出现日线级别 5% 以上的放量跌破 50 日均线，引发板块逃亡。', '交易日内，标的带量跌破 20 日均线且 3 天内未收回有效破位，必须无条件清仓。']
      };
    } else {
      // Must be one of the 7 Council Personas (e.g. technicalRetail, institutional)
      const roleMatch = systemPrompt.match(/ROLE:\s*(.*?)\n/)?.[1] || 'Agent Persona';
      const isBear = roleMatch.includes('short') || roleMatch.includes('macro');

      const bearThesis = `从${roleMatch}的防守视角来看：二线跟风品种的业绩爆发经常极具欺骗性。光模块极度拥挤且订单能见度往往被华尔街刻意夸大，而存储作为强周期品，当前库存去化未达预期。此类滞后标的往往是在选为主力机构拉高出货核心龙头（如 NVDA）时，作为掩护资金撤退的烟雾弹被快速爆拉。不要轻易接盘。`;

      const bullThesis = `基于${roleMatch}逻辑的激进攻击：这是教科书级别的“右侧跟风套利”节点。主线逻辑（算力基建）已经被完全证实，聪明资金的逐利性必然像水流般寻找洼地。光通信和存储作为下一阶段大规模 AI 推理集群必不可少的基础设施，正是目前最好的补涨洼地，盈亏比较高。`;

      mockResult = {
        role: roleMatch, // ignored by schema, but added in council.ts
        thesis: isBear ? bearThesis : bullThesis,
        supportingPoints: isBear ?
          [
            '美债收益率曲线（2Y10Y）开始深度解挂（De-inversion），这是衰退期兑现的死亡交叉特征，资金正疯狂逃向避风港。',
            '劳动力市场数据恶化速度超过了美联储能用货币政策“对冲”的速度，货币传导实质上存在长达6-9个月的时滞。',
            'AI 浪潮相关的企业资本支出（CapEx）回报率开始受到华尔街质疑，科技股一旦指引不及预期，存在严重杀跌双杀风险。',
            '跨国利差缩窄，日元套利交易解套远未结束，降息将加速美元走弱，进而引发跨国资本的抛售螺旋。'
          ] :
          [
            '恐慌指数（VIX）在此前的抛售中已释放了历史极值的压力，空头动能彻底衰竭，形成完美的逼空前夜。',
            '无风险利率（RFR）的大幅下降将逼迫场外超过 6 万亿美元的货币基金被迫离开避风港，重新寻找高收益资产（TINA效应再现）。',
            '从严密的 DCF 估值模型来看，降息 50 个基点能直接让标普500的合理估值中枢立刻上浮至少 8%-12%。',
            '技术面上看，各大权重股均在长期 200 日均线上方形成了极其坚固的强支撑结构，下方抛压真空极度稀薄。'
          ],
        riskingPoints: isBear ?
          [
            '如果降息幅度超预期直接打压 75bps 并伴随联储的“白衣骑士”天量 QE，可能会用印钞强行把市场拉起。',
            '下周的通胀数据瞬间诡异反弹回升，逼迫空头担忧加息重提而提前平仓离场导致逼空。',
            '华尔街巨鳄联手护盘，利用巨额看涨期权Gamma Gamma squeeze机制制造短期的强逼空行情。'
          ] : [
            '降息反而引发了市场对于美国极度经济衰退的恐慌确认，引发类似于 2008 年雷曼时刻的无差别连环抛售。',
            '地缘政治（如中东局势突变或东欧战火扩散）突然爆发黑天鹅，使得全球流动性瞬间枯竭躲入黄金美债。',
            '长期美债收益率不降反升（因为交易员担忧恶性通胀二次反弹导致债券抛售潮），压垮股票估值。'
          ],
        sentimentScore: isBear ? -9 : 9
      };
    }

    if (config?.streamToConsole) {
      const mockStr = JSON.stringify(mockResult, null, 2);
      process.stdout.write(mockStr + '\n');
    }
    return mockResult as T;
  }

  // 带重试和超时的请求逻辑
  let lastError: Error | null = null;
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const currentModel = attempt === 0 ? model : (modelsToTry[Math.min(attempt, modelsToTry.length - 1)] || model);

    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000; // 指数退避: 2s, 4s
      console.log(`[LLM Utility] ⏳ 第 ${attempt + 1}/${MAX_RETRIES} 次重试 (${delay}ms 后)，使用模型: ${currentModel}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      let endpoint = '';
      let headers: any = {};
      let requestBody: any = {};
      const isAnthropic = !!process.env.ANTHROPIC_AUTH_TOKEN;

      if (isAnthropic) {
        const antBaseUrl = config?.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
        const antKey = config?.apiKey || process.env.ANTHROPIC_AUTH_TOKEN || '';
        const antModel = config?.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';

        endpoint = `${antBaseUrl.replace(/\/v1$/, '').replace(/\/$/, '')}/v1/messages`;
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': antKey,
          'Authorization': `Bearer ${antKey}`, // fallback for some proxies
          'anthropic-version': '2023-06-01'
        };
        requestBody = {
          model: currentModel === model ? antModel : currentModel,
          max_tokens: 8192, // 注意：Anthropic 官方硬性规定 max_tokens 单次生成不能超过 8192，强制拉到 1M 会导致直接返回空数组 []
          stream: config?.streamToConsole === true,
          system: finalSystemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        };
      } else {
        endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = {
          model: currentModel,
          stream: config?.streamToConsole === true,
          messages: [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: userPrompt }
          ]
        };
      }

      // 使用 AbortController 实现超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`\n====== [LLM API RAW ERROR HTTP ${response.status}] ======`);
        console.error(errorBody);
        console.error(`========================================================\n`);
        throw new Error(`LLM API 请求错误 (${response.status}): ${errorBody}`);
      }

      let rawContent = '';
      let responseData: any = null;

      // 提取 Agent Name，用于 UI 端展示
      let agentName = 'AI Agent';
      const roleMatch = systemPrompt.match(/(?:【角色】|ROLE:)\s*(.+)/);
      if (roleMatch && roleMatch[1]) agentName = roleMatch[1].trim();
      const eventBus = require('./event-bus').eventBus;

      if (requestBody.stream && response.body) {
        // Node 18+ native fetch ReadableStream implementation
        const body = response.body as any;
        let sseBuffer = '';
        for await (const chunk of body) {
          const decoded = new TextDecoder('utf-8').decode(chunk);
          const lines = decoded.split('\n').filter((l: string) => l.trim() !== '');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6));
                let token = '';
                if (isAnthropic) {
                  if (parsed.type === 'content_block_delta' && parsed.delta) {
                    token = parsed.delta.text || '';
                  }
                } else {
                  token = parsed.choices?.[0]?.delta?.content || '';
                }
                if (token) {
                  rawContent += token;
                  process.stdout.write(token);
                  sseBuffer += token;
                  if (sseBuffer.includes('\n') || sseBuffer.length > 30) {
                    eventBus.emitLog('global', agentName, 'streaming', sseBuffer);
                    sseBuffer = '';
                  }
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
        if (sseBuffer.length > 0) eventBus.emitLog('global', agentName, 'streaming', sseBuffer);
        process.stdout.write('\n');
      } else {
        responseData = await response.json();

        // 兼容两种响应格式
        if (isAnthropic && responseData.content && responseData.content.length > 0) {
          rawContent = responseData.content[0].text;
        } else {
          rawContent = responseData.choices?.[0]?.message?.content;
        }
        trackTokenUsage(undefined, responseData?.usage || {});
      }

      if (!rawContent) {
        console.warn(`[DEBUG LLM] Response data dumping:`, JSON.stringify(responseData || {}, null, 2));
        console.warn(`\n⚠️ [LLM Utility] 检测到大模型返回了彻底空的数据 (可能是 Proxy 抛弃或被 0 token 截断)。`);
        console.warn(`💡 [系统指令] 根据"不因为格式化阻断"要求，将采用【纯文本对话穿透兜底】向下流转。`);
        return createGracefulFallback('[模型此次请求没有返回任何实质文字]') as T;
      }

      // 提取 JSON 块（支持带有前后文对话的内容）
      let cleanedContent = rawContent;
      const jsonMatch = rawContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(cleanedContent);
      } catch (e: any) {
        console.warn(`\n====== [RAW OUTPUT PARSE ERROR] ======`);
        console.warn(`AI 没有按机器格式排版，而是输出了对话文本:\n${cleanedContent}`);
        console.warn(`💡 [系统指令] 按照“非强制格式化”原则，系统不进行报错阻断，已自动将对话原意通过 Proxy 发放给下游 Agent 继续深度推进！`);
        console.warn(`======================================\n`);
        return createGracefulFallback(cleanedContent) as T;
      }

      const parsedResult = schema.safeParse(parsedJson);
      if (!parsedResult.success) {
        console.warn(`\n⚠️ [LLM Utility] 宽松模式: AI 输出与预期结构不完全匹配 (缺失或类型错误)，已强制放行。\n不匹配细节: ${parsedResult.error.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ')}\n`);
      }
      return parsedJson as T;
    } catch (err: any) {
      lastError = err;
      const isTimeout = err.name === 'AbortError';
      const isParseError = err instanceof SyntaxError || (err.issues && Array.isArray(err.issues)); // ZodError checking
      const isRetryable = isTimeout || isParseError || (err.message && (err.message.includes('429') || err.message.includes('500') || err.message.includes('503')));

      console.error(`[LLM Utility] ❌ 请求失败 (attempt ${attempt + 1}/${MAX_RETRIES}): ${isTimeout ? '超时' : err.message}`);

      if (!isRetryable && attempt === 0) {
        // 非可重试错误，直接抛出
        throw err;
      }
    }
  }

  throw lastError || new Error('LLM 请求在所有重试后仍然失败。');
}

/**
 * 纯文本大模型请求 — 自由文本思考流的核心通道
 * 支持流式输出、3 次重试、180s 超时保护
 * 用于所有 Agent 的深度分析、辩论、研报生成等场景
 */
export async function generateTextCompletion(
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LLMConfig>
): Promise<string> {
  const apiKey = config?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = config?.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';

  // 模型分级：secondary tier 强制使用小模型以节省 Token
  const isSecondary = config?.tier === 'secondary';
  let model = isSecondary
    ? (process.env.LLM_SECONDARY_MODEL || 'gpt-4o-mini')
    : (config?.model || process.env.LLM_MODEL || 'gpt-4o-mini');

  if (isSecondary) {
    console.log(`[LLM Text] 💰 使用二级小模型: ${model} (节省 Token)`);
  }

  if (process.env.MOCK_LLM === 'true' || apiKey.includes('your_gen')) {
    console.log('[MockLLM] 🟢 Intercepting chat request...');
    return `# Mock 深度分析报告\n\n## 事件概述\n这是系统生成的模拟深度分析回复。\n\n## 产业链推导\n- 第一层：直接受益方（已充分定价）\n- 第二层：瓶颈堵点（光模块、先进封装）\n- 第三层：滞后洼地（散户套利主战场）\n\n## 核心标的\n- $NVDA — 赛道龙头，已充分定价\n- $AAOI — 光模块瓶颈，筹码干净\n- $WDC — 存储洼地，量价齐飞拐点\n\n## 多空辩论\n### 🐂 多方论据\n产业逻辑坚实，订单可见度高\n\n### 🐻 空方论据\n估值已高，地缘风险不可忽视\n\n## 铁血止损\n- 龙头跌破 20日均线\n- 法案延期超过 2 周\n\n## 结论\n**建议深入追踪**，当前处于右侧跟风套利的最佳窗口期。`;
  }

  // 带重试和超时的请求逻辑
  let lastError: Error | null = null;
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const currentModel = attempt === 0 ? model : (modelsToTry[Math.min(attempt, modelsToTry.length - 1)] || model);

    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[LLM Text] ⏳ 第 ${attempt + 1}/${MAX_RETRIES} 次重试 (${delay}ms 后)，使用模型: ${currentModel}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const isAnthropic = !!process.env.ANTHROPIC_AUTH_TOKEN;
      let endpoint = '';
      let headers: any = {};
      let requestBody: any = {};

      if (isAnthropic) {
        const antBaseUrl = config?.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
        const antKey = config?.apiKey || process.env.ANTHROPIC_AUTH_TOKEN || '';
        const antModel = config?.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';

        endpoint = `${antBaseUrl.replace(/\/v1$/, '').replace(/\/$/, '')}/v1/messages`;
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': antKey,
          'Authorization': `Bearer ${antKey}`,
          'anthropic-version': '2023-06-01'
        };
        requestBody = {
          model: currentModel === model ? antModel : currentModel,
          max_tokens: 8192,
          stream: config?.streamToConsole === true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        };
      } else {
        endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = {
          model: currentModel,
          stream: config?.streamToConsole === true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        };
      }

      // 使用 AbortController 实现超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`\n====== [LLM Text API RAW ERROR HTTP ${response.status}] ======`);
        console.error(errorBody);
        console.error(`=============================================================\n`);
        throw new Error(`LLM API 请求错误 (${response.status}): ${errorBody}`);
      }

      let rawContent = '';
      if (requestBody.stream && response.body) {
        const body = response.body as any;
        for await (const chunk of body) {
          const decoded = new TextDecoder('utf-8').decode(chunk);
          const lines = decoded.split('\n').filter(l => l.trim() !== '');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6));
                let token = '';
                if (isAnthropic) {
                  if (parsed.type === 'content_block_delta' && parsed.delta) {
                    token = parsed.delta.text || '';
                  }
                } else {
                  token = parsed.choices?.[0]?.delta?.content || '';
                }
                if (token) {
                  rawContent += token;
                  process.stdout.write(token);
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
        process.stdout.write('\n');
      } else {
        const responseData = await response.json();
        if (isAnthropic && responseData.content && responseData.content.length > 0) {
          rawContent = responseData.content[0].text;
        } else {
          rawContent = responseData.choices?.[0]?.message?.content;
        }
        trackTokenUsage(undefined, responseData?.usage || {});

        if (!rawContent) {
          console.error(`[DEBUG LLM Text] Response data dumping:`, JSON.stringify(responseData || {}, null, 2));
          console.warn(`\n⚠️ [LLM Text] 检测到大模型返回了空数据，进入重试...`);
          throw new Error('LLM 接口返回了空数据。');
        }
      }

      if (!rawContent || rawContent.trim().length === 0) {
        throw new Error('LLM 接口返回了空文本。');
      }

      return rawContent;

    } catch (err: any) {
      lastError = err;
      const isTimeout = err.name === 'AbortError';
      const isRetryable = isTimeout || (err.message && (err.message.includes('429') || err.message.includes('500') || err.message.includes('503') || err.message.includes('空数据') || err.message.includes('空文本')));

      console.error(`[LLM Text] ❌ 请求失败 (attempt ${attempt + 1}/${MAX_RETRIES}): ${isTimeout ? '超时' : err.message}`);

      if (!isRetryable && attempt === 0) {
        throw err;
      }
    }
  }

  throw lastError || new Error('LLM Text 请求在所有重试后仍然失败。');
}
