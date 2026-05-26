import { z } from 'zod';
import { AgentTool } from '../../tools';
import { generateStructuredOutput, generateTextCompletion } from '../../utils/llm';

export interface AgentConfig {
  role: string;
  goal: string;
  instructions: string;
  tools?: AgentTool<any>[];
}

export interface AgentExecutionOptions {
  tier?: 'primary' | 'secondary';
  signal?: AbortSignal;
}

/**
 * 原生自治智能体基类 (Autonomous Agent Base Class)
 * 允许给大模型赋予特定的角色、目标和工具限制。
 */
export class AutonomousAgent {
  constructor(public config: AgentConfig) {}

  /**
   * @deprecated 使用 executeTextTask() 代替。JSON 强格式输出已被证明不可靠。
   * 执行带有强制结构化输出的任务
   */
  async executeTask<T>(
    taskPrompt: string,
    outputSchema: z.ZodType<T>,
    context: string = "",
    options: AgentExecutionOptions = {},
  ): Promise<T> {
    console.log(`\n[🤖 Node: ${this.config.role}] Initiating structured task...`);
    
    const systemPrompt = `You are an elite, autonomous AI agent operating in a strictly structured Swarm.
ROLE: ${this.config.role}
GOAL: ${this.config.goal}

STRICT INSTRUCTIONS:
${this.config.instructions}

${this.config.tools && this.config.tools.length > 0 ? `\nNote: You have delegated tools available (${this.config.tools.map(t => t.name).join(', ')}), but context from them will be provided in the user prompt.` : ''}
`;

    const userPrompt = `CONTEXT/MEMORY:\n${context}\n\nCURRENT TASK:\n${taskPrompt}`;

    const result = await generateStructuredOutput(outputSchema, systemPrompt, userPrompt, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
    console.log(`[✅ Node: ${this.config.role}] Structured task completed.`);
    return result;
  }

  /**
   * 执行自由文本分析任务 (Free-form Thought Flow)
   * 不再强制模型输出 JSON，让 LLM 充分发挥深度分析与长文写作能力。
   * Agent 之间通过纯 Markdown 文本进行传递。
   * 
   * @param tier 模型分级: 'primary' = 主力模型, 'secondary' = 小模型（节省 Token）
   */
  async executeTextTask(
    taskPrompt: string,
    context: string = "",
    options?: 'primary' | 'secondary' | AgentExecutionOptions,
  ): Promise<string> {
    const tier = typeof options === 'string' ? options : options?.tier;
    const signal = typeof options === 'object' ? options.signal : undefined;
    console.log(`\n[🤖 Node: ${this.config.role}] Initiating text analysis task...${tier === 'secondary' ? ' (💰 二级模型)' : ''}`);

    const systemPrompt = `你是一个顶级的自治 AI 分析智能体，正在一个多智能体蜂群 (Swarm) 中执行关键任务。

【角色】${this.config.role}
【目标】${this.config.goal}

【核心工作指令】
${this.config.instructions}

【输出格式要求】
1. 输出格式为结构清晰的 Markdown 中文长文。使用标题、列表、加粗、引用等格式增强可读性。
2. 不要输出 JSON。不要用 \`\`\`json 代码块。直接用自然语言和 Markdown 表达你的分析。
3. 你的分析必须极其详尽、深入、有逻辑链条。不要偷懒，不要只给结论不给推导过程。
4. 每一个论点都必须有具体的事实或逻辑支撑。

${this.config.tools && this.config.tools.length > 0 ? `\n【可用工具提示】: 你有 ${this.config.tools.map(t => t.name).join(', ')} 等工具的输出结果，已在下方上下文中提供。` : ''}
`;

    const userPrompt = context
      ? `=== 上游 Agent / 系统提供的上下文 ===\n${context}\n\n=== 当前任务 ===\n${taskPrompt}`
      : `=== 当前任务 ===\n${taskPrompt}`;

    const result = await generateTextCompletion(systemPrompt, userPrompt, {
      streamToConsole: true,
      ...(tier ? { tier } : {}),
      ...(signal ? { signal } : {}),
    });
    
    console.log(`[✅ Node: ${this.config.role}] Text analysis task completed. (${result.length} chars)`);
    return result;
  }
}
