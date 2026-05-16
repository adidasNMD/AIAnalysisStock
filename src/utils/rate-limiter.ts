export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private maxTokens: number,
    private refillRatePerSecond: number
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    this.throwIfCanceled(signal);
    this.refill();
    if (this.tokens <= 0) {
      const waitMs = (1 / this.refillRatePerSecond) * 1000;
      await this.delay(waitMs, signal);
      this.refill();
    }
    this.throwIfCanceled(signal);
    this.tokens--;
  }

  private throwIfCanceled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Canceled by user');
    }
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    this.throwIfCanceled(signal);
    let onAbort: (() => void) | undefined;
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      onAbort = () => {
        clearTimeout(timeoutId);
        reject(signal?.reason instanceof Error ? signal.reason : new Error('Canceled by user'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
      }
    }).finally(() => {
      if (onAbort) {
        signal?.removeEventListener('abort', onAbort);
      }
    });
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefill = now;
  }
}

// Yahoo Finance: max 5 requests/second
export const yahooLimiter = new RateLimiter(5, 5);
// Reddit: max 2 requests/second
export const redditLimiter = new RateLimiter(2, 2);
// Google News RSS: max 3 requests/second
export const rssLimiter = new RateLimiter(3, 3);
