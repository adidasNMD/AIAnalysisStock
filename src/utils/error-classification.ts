export type ExecutionFailureCode =
  | 'canceled'
  | 'timeout'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'validation_failed'
  | 'execution_failed';

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isCanceledError(error: unknown): boolean {
  return getErrorMessage(error) === 'Canceled by user';
}

export function classifyExecutionFailure(error: unknown): ExecutionFailureCode {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();
  const errorName = error instanceof Error ? error.name : '';

  if (isCanceledError(error)) {
    return 'canceled';
  }

  if (errorName === 'AbortError' || /timeout|timed out|etimedout|超时/.test(normalized)) {
    return 'timeout';
  }

  if (/429|rate.?limit|too many requests|限流/.test(normalized)) {
    return 'rate_limited';
  }

  if (/500|502|503|504|econnrefused|enotfound|service unavailable|bad gateway|gateway timeout|upstream/.test(normalized)) {
    return 'upstream_unavailable';
  }

  if (/hash mismatch|schema|validation|invalid request|parse/.test(normalized)) {
    return 'validation_failed';
  }

  return 'execution_failed';
}
