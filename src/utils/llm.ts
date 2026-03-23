import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 通用大模型请求封装工具：
 * 不依赖任何特定厂商的 SDK（如 openai包），采用纯粹的 fetch 协议请求标准的 /v1/chat/completions 接口。
 * 这保证了系统可以无缝接入任何 OpenAI 兼容的中转代理、DeepSeek、Ollama 以及各种开源模型。
 */
export async function generateStructuredOutput<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LLMConfig>
): Promise<T> {
  const apiKey = config?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = config?.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  let model = config?.model || process.env.LLM_MODEL || 'gpt-4o-mini';

  // 强制大模型输出 JSON 的指令提示词
  const finalSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must return ONLY raw valid JSON matching the exact schema requirements. Do not wrap it in markdown blockquotes like '\`\`\`json'. Return nothing but the JSON object.`;

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
       
       const bearThesis = `从${roleMatch}的防守视角来看：二线跟风品种的业绩爆发经常极具欺骗性。光模块极度拥挤且订单能见度往往被华尔街刻意夸大，而存储作为强周期品，当前库存去化未达预期。此类滞后标的往往是在主力机构拉高出货核心龙头（如 NVDA）时，作为掩护资金撤退的烟雾弹被快速爆拉。不要轻易接盘。`;
       
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
    return mockResult as T;
  }

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
    // 大多数现代模型/中转支持简单的 json_object 声明，如果不兼容可将此行注释
    response_format: { type: "json_object" } 
  };

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM API 请求错误 (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  
  if (!rawContent) {
    throw new Error('LLM 接口返回了空数据或异常格式。');
  }

  try {
    // 兼容部分未完全听从指令的模型，手动清除可能存在的 ```json 前缀
    const cleanedContent = rawContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    const parsedJson = JSON.parse(cleanedContent);
    
    // Zod 会在这最后一道防线极其严格地检查数据是否合法
    return schema.parse(parsedJson);
  } catch (err: any) {
    console.error('[LLM Utility] 数据结构解析或验证失败:', err.message);
    throw new Error('模型输出无法匹配预期的 Zod 数据约束。');
  }
}
