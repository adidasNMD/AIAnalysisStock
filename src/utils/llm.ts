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
