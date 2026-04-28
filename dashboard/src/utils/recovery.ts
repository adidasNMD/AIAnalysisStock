type FailureTone = 'danger' | 'warning' | 'info';

export interface FailureCodeInfo {
  label: string;
  detail: string;
  tone: FailureTone;
}

const FAILURE_CODE_INFO: Record<string, FailureCodeInfo> = {
  canceled: {
    label: '已取消',
    detail: '用户或系统主动取消了任务，可以按需要恢复原 Mission。',
    tone: 'info',
  },
  timeout: {
    label: '执行超时',
    detail: '外部模型或数据源响应过慢，建议先 Quick 重跑确认链路恢复。',
    tone: 'warning',
  },
  rate_limited: {
    label: '接口限流',
    detail: '上游服务返回限流信号，等待一段时间或降低并发后再恢复。',
    tone: 'warning',
  },
  upstream_unavailable: {
    label: '上游不可用',
    detail: '依赖服务不可用或网关异常，建议先检查健康状态。',
    tone: 'danger',
  },
  validation_failed: {
    label: '输入校验失败',
    detail: 'Mission 输入或 payload hash 不一致，恢复前应先检查原始输入。',
    tone: 'danger',
  },
  execution_failed: {
    label: '执行失败',
    detail: '执行链路出现未细分异常，可以恢复任务并查看 trace。',
    tone: 'danger',
  },
};

export function getFailureCodeInfo(code?: string): FailureCodeInfo | null {
  if (!code) return null;
  return FAILURE_CODE_INFO[code] || {
    label: code,
    detail: `未识别的失败码：${code}`,
    tone: 'warning',
  };
}
