/**
 * Sineige Alpha Engine — 统一模型配置中心
 *
 * 从 config/models.yaml 读取所有 LLM 配置。
 * 所有服务（OpenClaw / TradingAgents / TrendRadar）统一从此处获取模型参数。
 *
 * 支持：
 * - 按用途分配（deep_think / quick_think）
 * - 按服务+角色覆盖（如 openclaw.council → deep_think）
 * - 在线热更新（Dashboard Settings 保存时重新加载）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as dotenv from 'dotenv';
import { eventBus } from './event-bus';

// 加载环境变量（优先 config/.env，其次根目录 .env）
const configEnvPath = path.join(process.cwd(), 'config', '.env');
const rootEnvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(configEnvPath)) {
  dotenv.config({ path: configEnvPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

// ===== 类型定义 =====

export interface ModelProfile {
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface ModelsConfig {
  defaults: {
    provider: string;
    base_url: string;
  };
  models: {
    deep_think: ModelProfile;
    quick_think: ModelProfile;
    [key: string]: ModelProfile;
  };
  services: {
    openclaw: Record<string, string>;
    trading_agents: Record<string, string>;
    trendradar: Record<string, string>;
  };
}

export interface ResolvedLLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  provider: string;
}

// ===== 配置文件路径 =====

const CONFIG_PATH = path.join(process.cwd(), 'config', 'models.yaml');

// ===== 内存缓存 =====

let cachedConfig: ModelsConfig | null = null;
let lastLoadTime = 0;
const CACHE_TTL_MS = 30_000; // 30秒缓存，支持热更新
let configWatcher: fs.FSWatcher | null = null;
let watcherDebounce: ReturnType<typeof setTimeout> | null = null;
let lastConfigFingerprint = '';

// ===== 核心函数 =====

/**
 * 加载 models.yaml 配置（带缓存）
 */
export function loadModelsConfig(): ModelsConfig {
  const now = Date.now();
  if (cachedConfig && (now - lastLoadTime) < CACHE_TTL_MS) {
    return cachedConfig;
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(`[ModelConfig] ⚠️ ${CONFIG_PATH} 不存在，使用默认配置`);
    return getDefaultConfig();
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = yaml.load(raw) as ModelsConfig;

    // 验证基本结构
    if (!parsed.defaults || !parsed.models) {
      console.warn('[ModelConfig] ⚠️ models.yaml 结构不完整，使用默认配置');
      return getDefaultConfig();
    }

    cachedConfig = parsed;
    lastLoadTime = now;
    console.log(`[ModelConfig] ✅ 已加载统一模型配置 (provider: ${parsed.defaults.provider})`);
    return parsed;
  } catch (e: any) {
    console.error(`[ModelConfig] ❌ 解析 models.yaml 失败: ${e.message}`);
    return getDefaultConfig();
  }
}

function getConfigFingerprint(): string {
  try {
    const stat = fs.statSync(CONFIG_PATH);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

function invalidateModelsConfigCache(): void {
  cachedConfig = null;
  lastLoadTime = 0;
}

function scheduleWatchedReload(reason: string): void {
  if (watcherDebounce) {
    clearTimeout(watcherDebounce);
  }

  watcherDebounce = setTimeout(() => {
    const nextFingerprint = getConfigFingerprint();
    if (nextFingerprint === lastConfigFingerprint) {
      return;
    }

    lastConfigFingerprint = nextFingerprint;
    invalidateModelsConfigCache();
    const config = loadModelsConfig();
    eventBus.emitSystem('info', 'Model config hot reloaded', {
      reason,
      provider: config.defaults.provider,
      configPath: CONFIG_PATH,
    });
  }, 150);
}

/**
 * 启动 models.yaml 文件监听。
 *
 * server 与 daemon 是两个独立 Node 进程，因此各自都需要自己的 watcher。
 */
export function startModelsConfigWatcher(): void {
  if (configWatcher) {
    return;
  }

  const configDir = path.dirname(CONFIG_PATH);
  const configFile = path.basename(CONFIG_PATH);
  const watchTarget = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : configDir;
  lastConfigFingerprint = getConfigFingerprint();

  try {
    configWatcher = fs.watch(watchTarget, { persistent: false }, (_eventType, filename) => {
      if (filename && path.basename(filename.toString()) !== configFile && watchTarget !== CONFIG_PATH) {
        return;
      }
      scheduleWatchedReload('file_change');
    });
    console.log(`[ModelConfig] 👀 watching ${CONFIG_PATH}`);
  } catch (e: any) {
    console.warn(`[ModelConfig] ⚠️ 无法监听 models.yaml: ${e.message}`);
  }
}

export function stopModelsConfigWatcher(): void {
  if (watcherDebounce) {
    clearTimeout(watcherDebounce);
    watcherDebounce = null;
  }
  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
  }
}

/**
 * 解析出具体的 LLM 调用参数
 *
 * @param service  - 'openclaw' | 'trading_agents' | 'trendradar'
 * @param role     - 'scout' | 'analyst' | 'council' | 'pm' 等
 * @returns 完整的 LLM 调用参数
 *
 * 解析优先级：
 * 1. services.openclaw.council → 找到 "deep_think"
 * 2. models.deep_think → { model: "GLM-5.1", temperature: 0.7, max_tokens: 8192 }
 * 3. defaults → { provider, base_url }
 * 4. 环境变量 → LLM_API_KEY
 */
export function resolveModelConfig(
  service: 'openclaw' | 'trading_agents' | 'trendradar',
  role: string
): ResolvedLLMConfig {
  const config = loadModelsConfig();

  // Step 1: 找到这个角色对应的 model profile 名称
  let profileName = 'deep_think'; // 默认用深度模型
  const serviceConfig = config.services?.[service];
  if (serviceConfig && serviceConfig[role]) {
    profileName = serviceConfig[role];
  }

  // Step 2: 获取 model profile 的具体参数
  const profile = config.models[profileName] || config.models.deep_think;

  // Step 3: 组装完整配置
  return {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: config.defaults.base_url || process.env.LLM_BASE_URL || '',
    model: profile.model,
    temperature: profile.temperature,
    maxTokens: profile.max_tokens,
    provider: config.defaults.provider,
  };
}

/**
 * 获取完整配置用于 API 返回（Dashboard Settings 展示）
 */
export function getFullConfig(): ModelsConfig {
  return loadModelsConfig();
}

/**
 * 保存配置（Dashboard Settings 编辑后调用）
 */
export function saveModelsConfig(newConfig: ModelsConfig): void {
  try {
    const yamlStr = yaml.dump(newConfig, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
    fs.writeFileSync(CONFIG_PATH, yamlStr, 'utf-8');
    // 清除缓存，下次读取时会重新加载
    invalidateModelsConfigCache();
    lastConfigFingerprint = getConfigFingerprint();
    console.log('[ModelConfig] ✅ 配置已保存并刷新');
  } catch (e: any) {
    console.error(`[ModelConfig] ❌ 保存配置失败: ${e.message}`);
    throw e;
  }
}

/**
 * 强制刷新缓存（用于外部更新后）
 */
export function reloadConfig(): ModelsConfig {
  invalidateModelsConfigCache();
  lastConfigFingerprint = getConfigFingerprint();
  return loadModelsConfig();
}

/**
 * 生成传给 TradingAgents API 的配置片段
 */
export function getTradingAgentsConfig(): Record<string, any> {
  const config = loadModelsConfig();
  const taService = config.services?.trading_agents || {};

  const resolveProfile = (role: string) => {
    const profileName = taService[role] || 'deep_think';
    return config.models[profileName] || config.models.deep_think;
  };

  return {
    llm_provider: config.defaults.provider,
    api_key: process.env.LLM_API_KEY || '',
    base_url: config.defaults.base_url,
    analysts_model: resolveProfile('analysts').model,
    researchers_model: resolveProfile('researchers').model,
    trader_model: resolveProfile('trader').model,
    risk_model: resolveProfile('risk_management').model,
    pm_model: resolveProfile('portfolio_manager').model,
  };
}

// ===== 默认配置 (fallback) =====

function getDefaultConfig(): ModelsConfig {
  return {
    defaults: {
      provider: 'zhipu',
      base_url: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4/',
    },
    models: {
      deep_think: {
        model: process.env.LLM_MODEL || 'GLM-5.1',
        temperature: 0.7,
        max_tokens: 8192,
      },
      quick_think: {
        model: process.env.LLM_MODEL || 'GLM-5.1',
        temperature: 0.5,
        max_tokens: 4096,
      },
    },
    services: {
      openclaw: {
        scout: 'quick_think',
        analyst: 'deep_think',
        strategist: 'deep_think',
        council: 'deep_think',
        synthesis: 'deep_think',
      },
      trading_agents: {
        analysts: 'quick_think',
        researchers: 'deep_think',
        trader: 'deep_think',
        risk_management: 'quick_think',
        portfolio_manager: 'deep_think',
      },
      trendradar: {
        ai_filter: 'quick_think',
        ai_translation: 'quick_think',
      },
    },
  };
}
