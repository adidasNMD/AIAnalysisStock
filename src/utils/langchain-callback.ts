import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { eventBus } from './event-bus';

export class SSEStreamHandler extends BaseCallbackHandler {
  name = 'SSEStreamHandler';
  private agentName: string;
  private missionId: string;
  
  constructor(agentName: string, missionId: string = 'global') {
    super();
    this.agentName = agentName;
    this.missionId = missionId;
  }

  async handleLLMNewToken(token: string) {
    if (token) {
      eventBus.emitLog(this.missionId, this.agentName, 'streaming', token);
    }
  }

  async handleToolStart(tool: { id: string[]; name: string }, input: string) {
    eventBus.emitLog(this.missionId, this.agentName, 'tool_call', `[Tool Exec] 🔧 ${tool.name} started with input: ${input.substring(0, 100)}...`);
  }

  async handleToolEnd(output: string) {
    eventBus.emitLog(this.missionId, this.agentName, 'tool_end', `[Tool Result] 收到 ${output.substring(0, 50)}... bytes 结果数据`);
  }

  async handleToolError(err: Error) {
    eventBus.emitLog(this.missionId, this.agentName, 'error', `[Tool Error] 工具执行失败: ${err.message}`);
  }

  async handleLLMError(err: Error) {
    eventBus.emitLog(this.missionId, this.agentName, 'error', `[LLM Error] 模型推理失败: ${err.message}`);
  }
}
