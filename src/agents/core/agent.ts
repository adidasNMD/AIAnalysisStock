import { z } from 'zod';
import { AgentTool } from '../../tools';
import { generateStructuredOutput } from '../../utils/llm';

export interface AgentConfig {
  role: string;
  goal: string;
  instructions: string;
  tools?: AgentTool<any>[];
}

/**
 * 原生自治智能体基类 (Autonomous Agent Base Class)
 * 允许给大模型赋予特定的角色、目标和工具限制。
 */
export class AutonomousAgent {
  constructor(public config: AgentConfig) {}

  /**
   * 执行带有强制结构化输出的任务
   */
  async executeTask<T>(taskPrompt: string, outputSchema: z.ZodType<T>, context: string = ""): Promise<T> {
    console.log(`\n[🤖 Node: ${this.config.role}] Initiating task...`);
    
    const systemPrompt = `You are an elite, autonomous AI agent operating in a strictly structured Swarm.
ROLE: ${this.config.role}
GOAL: ${this.config.goal}

STRICT INSTRUCTIONS:
${this.config.instructions}

${this.config.tools && this.config.tools.length > 0 ? `\nNote: You have delegated tools available (${this.config.tools.map(t => t.name).join(', ')}), but context from them will be provided in the user prompt.` : ''}
`;

    const userPrompt = `CONTEXT/MEMORY:\n${context}\n\nCURRENT TASK:\n${taskPrompt}`;

    const result = await generateStructuredOutput(outputSchema, systemPrompt, userPrompt);
    console.log(`[✅ Node: ${this.config.role}] Task completed successfully.`);
    return result;
  }
}
