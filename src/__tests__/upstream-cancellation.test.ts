import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkOpenBBHealth } from '../utils/openbb-provider';
import { analyzeMultipleTickers, analyzeTicker } from '../utils/ta-client';
import { fetchGoogleNewsRSS } from '../tools/google-news';
import { CollectorAgent } from '../agents/collector';

function createAbortAwareFetch(onSignal?: (signal: AbortSignal) => void) {
  return vi.fn((_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const signal = init?.signal;
    if (!signal) {
      return Promise.reject(new Error('missing abort signal'));
    }

    onSignal?.(signal);
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error('Aborted'));
        return;
      }

      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('Aborted')), { once: true });
    });
  });
}

describe('upstream cancellation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aborts in-flight TradingAgents requests when the mission signal is canceled', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = createAbortAwareFetch((signal) => {
      requestSignal = signal;
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const promise = analyzeTicker('NVDA', '2026-05-08', undefined, { signal: controller.signal });

    expect(requestSignal).toBeDefined();
    controller.abort(new Error('Canceled by user'));

    await expect(promise).rejects.toThrow('Canceled by user');
    expect(requestSignal?.aborted).toBe(true);
  });

  it('stops TradingAgents batch execution if progress handling requests cancellation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();

    await expect(
      analyzeMultipleTickers(
        ['NVDA', 'AMD'],
        '2026-05-08',
        () => controller.abort(new Error('Canceled by user')),
        { signal: controller.signal },
      ),
    ).rejects.toThrow('Canceled by user');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts in-flight OpenBB health checks when the mission signal is canceled', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = createAbortAwareFetch((signal) => {
      requestSignal = signal;
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const promise = checkOpenBBHealth({ signal: controller.signal });

    expect(requestSignal).toBeDefined();
    controller.abort(new Error('Canceled by user'));

    await expect(promise).rejects.toThrow('Canceled by user');
    expect(requestSignal?.aborted).toBe(true);
  });

  it('aborts in-flight Google News RSS fetches from OpenClaw scout', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = createAbortAwareFetch((signal) => {
      requestSignal = signal;
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const promise = fetchGoogleNewsRSS('AI infrastructure', 'en', 5, { signal: controller.signal });

    expect(requestSignal).toBeDefined();
    controller.abort(new Error('Canceled by user'));

    await expect(promise).rejects.toThrow('Canceled by user');
    expect(requestSignal?.aborted).toBe(true);
  });

  it('does not start legacy collector sweeps when already canceled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    controller.abort(new Error('Canceled by user'));

    await expect(
      new CollectorAgent().collectSignals('AI infrastructure', { signal: controller.signal }),
    ).rejects.toThrow('Canceled by user');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
