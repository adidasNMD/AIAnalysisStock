import { T1_SENTINEL_ENABLED_DEFAULT, DEFAULT_LEADER_TICKERS } from './constants';

interface RuntimeConfig {
  t1Enabled: boolean;
  leaderTickers: string[];
  sma250VetoEnabled: boolean;
}

let currentConfig: RuntimeConfig = {
  t1Enabled: T1_SENTINEL_ENABLED_DEFAULT,
  leaderTickers: [...DEFAULT_LEADER_TICKERS],
  sma250VetoEnabled: true,
};

export function getRuntimeConfig(): Readonly<RuntimeConfig> {
  return { ...currentConfig };
}

export function updateRuntimeConfig(patch: Partial<RuntimeConfig>): RuntimeConfig {
  currentConfig = { ...currentConfig, ...patch };
  return { ...currentConfig };
}
