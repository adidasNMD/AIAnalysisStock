import { describe, expect, it } from 'vitest';
import { classifyExecutionFailure, isCanceledError } from '../utils/error-classification';

describe('execution error classification', () => {
  it('identifies user cancellation without treating every AbortError as canceled', () => {
    expect(classifyExecutionFailure(new Error('Canceled by user'))).toBe('canceled');
    expect(isCanceledError(new Error('Canceled by user'))).toBe(true);

    const timeout = new Error('The operation was aborted');
    timeout.name = 'AbortError';
    expect(classifyExecutionFailure(timeout)).toBe('timeout');
  });

  it('groups common upstream failure modes into actionable failure codes', () => {
    expect(classifyExecutionFailure(new Error('LLM API 请求错误 (429): rate limit exceeded'))).toBe('rate_limited');
    expect(classifyExecutionFailure(new Error('LLM API 请求错误 (503): service unavailable'))).toBe('upstream_unavailable');
    expect(classifyExecutionFailure(new Error('Mission input payload hash mismatch'))).toBe('validation_failed');
    expect(classifyExecutionFailure(new Error('Unexpected council failure'))).toBe('execution_failed');
  });
});
