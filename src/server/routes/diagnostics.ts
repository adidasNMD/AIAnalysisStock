import { Request, Response } from 'express';
import { checkOpenBBHealth } from '../../utils/openbb-provider';
import { checkTAHealth } from '../../utils/ta-client';
import { getFullConfig } from '../../utils/model-config';
import * as fs from 'fs';
import * as path from 'path';

export async function diagnosticsHandler(req: Request, res: Response) {
  const results: any = {
    timestamp: new Date().toISOString(),
    probes: {}
  };

  // 1. LLM Brain
  try {
    const config = getFullConfig();
    const hasConfig = !!(config.defaults?.provider && config.models?.deep_think);
    results.probes.llm = {
      status: hasConfig ? 'ok' : 'degraded',
      latency: 0,
      details: hasConfig ? `Provider: ${config.defaults.provider}, Deep Think: ${config.models.deep_think?.model}` : 'Missing LLM config'
    };
  } catch (e: any) {
    results.probes.llm = { status: 'error', latency: 0, details: e.message };
  }

  // 2. OpenBB & Provider API (例如: FMP/YFinance)
  try {
    const t0 = Date.now();
    const isOnline = await checkOpenBBHealth();
    const latency = Date.now() - t0;
    
    // 发起极其轻量的探测。如果是 yfinance 免费源，严禁高频查询 AAPL 导致 IP 被封
    let providerStatus = 'ok';
    let providerDetails = 'OpenBB service online';
    if (isOnline) {
      providerStatus = 'ok';
      providerDetails = 'OpenBB Internal Gateway Active (Provider probing skipped to save quota)';
    }

    results.probes.openbb = {
      status: isOnline ? providerStatus as 'ok'|'error' : 'error',
      latency,
      details: isOnline ? providerDetails : 'OpenBB Gateway Offline'
    };
  } catch (e: any) {
    results.probes.openbb = { status: 'error', latency: 0, details: e.message };
  }

  // 3. TradingAgents (TA)
  try {
    const t0 = Date.now();
    const isOnline = await checkTAHealth();
    const latency = Date.now() - t0;
    results.probes.tradingAgents = {
      status: isOnline ? 'ok' : 'error',
      latency,
      details: isOnline ? 'TA Service Online' : 'TA Service Offline (check port 8001)'
    };
  } catch (e: any) {
    results.probes.tradingAgents = { status: 'error', latency: 0, details: e.message };
  }

  // 4. TrendRadar SQLite
  try {
    const newsDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'news');
    if (fs.existsSync(newsDir)) {
      const dbFiles = fs.readdirSync(newsDir).filter(f => f.endsWith('.db')).sort();
      if (dbFiles.length > 0) {
        const latestDbPath = path.join(newsDir, dbFiles[dbFiles.length - 1]!);
        const stats = fs.statSync(latestDbPath);
        const ageMs = Date.now() - stats.mtimeMs;
        // 如果数据已过时超过 24h (86400000ms)，认为是 warning
        results.probes.trendRadar = {
          status: ageMs > 86400000 ? 'warning' : 'ok',
          latency: 0,
          details: `Latest DB: ${dbFiles[dbFiles.length - 1]} (${Math.round(ageMs / 60000)} mins ago)`
        };
      } else {
        results.probes.trendRadar = { status: 'warning', latency: 0, details: 'No DB files found' };
      }
    } else {
      results.probes.trendRadar = { status: 'error', latency: 0, details: 'TrendRadar output dir not found' };
    }
  } catch (e: any) {
    results.probes.trendRadar = { status: 'error', latency: 0, details: e.message };
  }

  res.json(results);
}
