import { sendMessage } from './telegram';
import { logger } from './logger';

/**
 * HealthMonitor — API 连通性检测 + 自动降级
 * 
 * 功能：
 * 1. 启动时 LLM API 连通性检测
 * 2. 运行时连续失败计数器
 * 3. 超阈值后自动进入降级模式（只推送原始数据，暂停 LLM 分析）
 * 4. Telegram 推送健康警报
 * 5. 自动恢复检测
 */
export class HealthMonitor {
  private consecutiveFailures = 0;
  private degradedMode = false;
  private lastHealthCheck = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private startTime = Date.now();

  /** 连续失败多少次后进入降级模式 */
  private readonly FAILURE_THRESHOLD: number;
  /** 降级模式持续多少毫秒后尝试恢复检测 */
  private readonly RECOVERY_COOLDOWN_MS: number;

  constructor(
    failureThreshold = 5,
    recoveryCooldownMs = 10 * 60 * 1000 // 10 分钟
  ) {
    this.FAILURE_THRESHOLD = failureThreshold;
    this.RECOVERY_COOLDOWN_MS = recoveryCooldownMs;
  }

  /**
   * 启动时调用 — 检测 LLM API 是否可达
   */
  async checkConnectivity(): Promise<boolean> {
    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '';
    
    if (!apiKey || apiKey.includes('your_')) {
      logger.warn('[HealthMonitor] ⚠️ 未检测到有效的 API Key。系统将在 Mock 模式下运行。');
      return false;
    }

    const isAnthropic = !!process.env.ANTHROPIC_AUTH_TOKEN;
    
    try {
      if (isAnthropic) {
        const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
        const endpoint = `${baseUrl.replace(/\/v1$/, '').replace(/\/$/, '')}/v1/messages`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s 超时

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        // 任何非网络错误的响应都说明 API 可达
        logger.info(`[HealthMonitor] ✅ Anthropic API 连通性检测通过 (HTTP ${response.status})`);
        return true;
      } else {
        const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
        const endpoint = `${baseUrl.replace(/\/$/, '')}/models`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        logger.info(`[HealthMonitor] ✅ OpenAI 兼容 API 连通性检测通过 (HTTP ${response.status})`);
        return true;
      }
    } catch (e: any) {
      const reason = e.name === 'AbortError' ? '连接超时' : e.message;
      logger.error(`[HealthMonitor] ❌ API 连通性检测失败: ${reason}`);
      await this.pushAlert(`🔴 *API 连通性检测失败*\n\n原因: ${reason}\n系统将在降级模式下运行（仅推送原始数据，暂停 LLM 分析）。`);
      this.degradedMode = true;
      return false;
    }
  }

  /**
   * 每次 LLM 调用成功后调用
   */
  recordSuccess() {
    this.totalCalls++;
    if (this.consecutiveFailures > 0) {
      logger.info(`[HealthMonitor] 📗 LLM 调用恢复正常 (之前连续失败 ${this.consecutiveFailures} 次)`);
    }
    this.consecutiveFailures = 0;
    
    // 如果在降级模式中恢复了，自动退出降级
    if (this.degradedMode) {
      this.degradedMode = false;
      logger.info(`[HealthMonitor] 🟢 自动退出降级模式！LLM 服务已恢复。`);
      this.pushAlert('🟢 *系统恢复通知*\n\nLLM 服务已恢复，降级模式已关闭。').catch(() => {});
    }
  }

  /**
   * 每次 LLM 调用失败后调用
   */
  recordFailure(error?: string) {
    this.totalCalls++;
    this.totalFailures++;
    this.consecutiveFailures++;

    logger.error(`[HealthMonitor] 📕 LLM 调用失败 (连续第 ${this.consecutiveFailures} 次)${error ? `: ${error}` : ''}`);

    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD && !this.degradedMode) {
      this.degradedMode = true;
      this.lastHealthCheck = Date.now();
      logger.error(`[HealthMonitor] 🔴 连续失败 ${this.consecutiveFailures} 次，进入降级模式！暂停 LLM 分析任务。`);
      this.pushAlert(
        `🔴 *系统降级警报*\n\nLLM 服务连续失败 ${this.consecutiveFailures} 次。\n最后错误: ${error || '未知'}\n\n系统已自动进入降级模式：\n- 暂停所有 LLM 分析任务\n- 继续推送原始价量数据\n- ${this.RECOVERY_COOLDOWN_MS / 60000} 分钟后尝试恢复检测`
      ).catch(() => {});
    }
  }

  /**
   * 是否应该跳过 LLM 分析（降级模式中）
   */
  shouldSkipAnalysis(): boolean {
    if (!this.degradedMode) return false;

    // 检查是否到了恢复冷却时间
    if (Date.now() - this.lastHealthCheck > this.RECOVERY_COOLDOWN_MS) {
      logger.info(`[HealthMonitor] 🔄 降级冷却期结束，下一次调用将尝试恢复...`);
      this.degradedMode = false; // 允许下一次调用尝试
      return false;
    }

    return true;
  }

  /**
   * 获取健康状态摘要
   */
  getStatusSummary(): string {
    const uptimeMin = Math.floor((Date.now() - this.startTime) / 60000);
    const failRate = this.totalCalls > 0 ? ((this.totalFailures / this.totalCalls) * 100).toFixed(1) : '0';
    const status = this.degradedMode ? '🔴 降级' : '🟢 正常';
    
    return [
      `系统状态: ${status}`,
      `运行时间: ${uptimeMin} 分钟`,
      `总调用: ${this.totalCalls} 次`,
      `失败: ${this.totalFailures} 次 (${failRate}%)`,
      `连续失败: ${this.consecutiveFailures} 次`,
    ].join(' | ');
  }

  /**
   * 推送 Telegram 健康警报
   */
  private async pushAlert(message: string) {
    try {
      await sendMessage(`🏥 *健康监控*\n\n${message}`);
    } catch {
      // Telegram push 自己失败了也不能阻断
      logger.error('[HealthMonitor] Telegram 健康警报推送失败');
    }
  }
}

/**
 * 全局单例
 */
export const healthMonitor = new HealthMonitor();
