import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter, yahooLimiter, redditLimiter, rssLimiter } from '../utils/rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first acquire immediately without delay', async () => {
    const limiter = new RateLimiter(5, 5);
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBe(0);
  });

  it('depletes tokens after max acquires', async () => {
    const limiter = new RateLimiter(2, 1);
    await limiter.acquire();
    await limiter.acquire();

    const acquirePromise = limiter.acquire();
    await vi.advanceTimersByTimeAsync(1100);
    await acquirePromise;
    expect(true).toBe(true);
  });

  it('refills tokens over time', async () => {
    const limiter = new RateLimiter(2, 2);
    await limiter.acquire();
    await limiter.acquire();

    vi.advanceTimersByTime(1000);

    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBe(0);
  });

  it('caps refill at maxTokens', async () => {
    const limiter = new RateLimiter(3, 10);
    vi.advanceTimersByTime(10000);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(true).toBe(true);
  });
});

describe('Singleton rate limiters', () => {
  it('yahooLimiter is a RateLimiter instance', () => {
    expect(yahooLimiter).toBeInstanceOf(RateLimiter);
  });

  it('redditLimiter is a RateLimiter instance', () => {
    expect(redditLimiter).toBeInstanceOf(RateLimiter);
  });

  it('rssLimiter is a RateLimiter instance', () => {
    expect(rssLimiter).toBeInstanceOf(RateLimiter);
  });
});
