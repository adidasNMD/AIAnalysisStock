import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeConfig, updateRuntimeConfig } from '../config';
import { T1_SENTINEL_ENABLED_DEFAULT, DEFAULT_LEADER_TICKERS } from '../config/constants';

afterEach(() => {
  updateRuntimeConfig({
    t1Enabled: T1_SENTINEL_ENABLED_DEFAULT,
    leaderTickers: [...DEFAULT_LEADER_TICKERS],
    sma250VetoEnabled: true,
  });
});

describe('getRuntimeConfig', () => {
  it('returns default config values', () => {
    const config = getRuntimeConfig();
    expect(config.t1Enabled).toBe(T1_SENTINEL_ENABLED_DEFAULT);
    expect(config.sma250VetoEnabled).toBe(true);
    expect(config.leaderTickers).toEqual([...DEFAULT_LEADER_TICKERS]);
  });

  it('returns a shallow copy (immutable)', () => {
    const config1 = getRuntimeConfig();
    const config2 = getRuntimeConfig();
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });

  it('modifying returned object does not affect internal state', () => {
    const config = getRuntimeConfig() as Record<string, unknown>;
    config.t1Enabled = !T1_SENTINEL_ENABLED_DEFAULT;
    (config as any).leaderTickers = ['FAKE'];

    const fresh = getRuntimeConfig();
    expect(fresh.t1Enabled).toBe(T1_SENTINEL_ENABLED_DEFAULT);
    expect(fresh.leaderTickers).toEqual([...DEFAULT_LEADER_TICKERS]);
  });
});

describe('updateRuntimeConfig', () => {
  it('patches t1Enabled toggle', () => {
    const updated = updateRuntimeConfig({ t1Enabled: true });
    expect(updated.t1Enabled).toBe(true);

    const fetched = getRuntimeConfig();
    expect(fetched.t1Enabled).toBe(true);
  });

  it('patches leaderTickers', () => {
    const updated = updateRuntimeConfig({ leaderTickers: ['AAPL', 'MSFT'] });
    expect(updated.leaderTickers).toEqual(['AAPL', 'MSFT']);
  });

  it('patches sma250VetoEnabled', () => {
    const updated = updateRuntimeConfig({ sma250VetoEnabled: false });
    expect(updated.sma250VetoEnabled).toBe(false);
  });

  it('partial patch preserves untouched fields', () => {
    updateRuntimeConfig({ t1Enabled: true });
    const config = getRuntimeConfig();
    expect(config.t1Enabled).toBe(true);
    expect(config.sma250VetoEnabled).toBe(true);
    expect(config.leaderTickers).toEqual([...DEFAULT_LEADER_TICKERS]);
  });

  it('returns a copy, not internal reference', () => {
    const returned = updateRuntimeConfig({ t1Enabled: true });
    returned.t1Enabled = false;

    const fetched = getRuntimeConfig();
    expect(fetched.t1Enabled).toBe(true);
  });
});
