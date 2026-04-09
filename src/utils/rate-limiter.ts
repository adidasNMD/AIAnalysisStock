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

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens <= 0) {
      const waitMs = (1 / this.refillRatePerSecond) * 1000;
      await new Promise(r => setTimeout(r, waitMs));
      this.refill();
    }
    this.tokens--;
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
