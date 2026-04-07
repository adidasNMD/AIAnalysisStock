import { EventEmitter } from 'events';

// 全局单例事件总线，负责收集全链路的 AI 动作和流式思维
class SwarmEventBus extends EventEmitter {
  constructor() {
    super();
    // 增加 Listener 限制避免内存泄露预警
    this.setMaxListeners(100);
  }

  // 广播一条 AI 思维片段 或 工具调用数据
  emitLog(missionId: string, agentName: string, phase: string, content: string, meta?: any) {
    this.emit('agent_log', {
      missionId,
      agentName,
      phase,
      content,
      timestamp: Date.now(),
      meta
    });
  }

  // 发送系统级提示/报错 (红色渲染的特殊日志等)
  emitSystem(status: 'info' | 'error' | 'fatal', message: string, detail?: any) {
    this.emit('agent_log', {
      missionId: 'system',
      agentName: 'System',
      phase: status,
      content: message,
      timestamp: Date.now(),
      meta: detail
    });
  }
}

export const eventBus = new SwarmEventBus();
