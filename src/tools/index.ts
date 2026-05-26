import { z } from 'zod';

/**
 * 原生 Tool 接口契约规范 (OpenClaw / Vercel AI / OpenAI 兼容格式)
 * 所有大模型可以自主调用的外部能力（如搜索、发推、读库）都必须满足此接口。
 */
export interface AgentTool<T = any> {
  // 面向大模型的纯面向对象的函数名
  name: string;
  // 给大模型看的详细说明：什么时候用？该怎么用？
  description: string;
  // 强类型限定的大模型入参（大模型一旦输出违法参数将直接被 Zod 拦截阻断）
  parameters: z.ZodType<any>;
  // 真实的运行时执行体，必须返回字符串结果喂回给大模型
  execute: (args: T, options?: { signal?: AbortSignal }) => Promise<string>;
}
