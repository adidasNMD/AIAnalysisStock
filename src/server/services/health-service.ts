import * as fs from 'fs';
import * as path from 'path';
import { healthMonitor } from '../../utils/health-monitor';
import { checkOpenBBHealth } from '../../utils/openbb-provider';
import { checkTAHealth } from '../../utils/ta-client';

export interface TrendRadarHealth {
  status: string;
  note: string;
}

export function getCoreHealth() {
  return {
    status: healthMonitor.getStatusSummary(),
    isDegraded: healthMonitor.shouldSkipAnalysis(),
  };
}

export async function checkTrendRadarHealth(): Promise<TrendRadarHealth> {
  try {
    const logs = [
      path.join(process.cwd(), 'vendors', 'trendradar', 'crawler.log'),
      path.join(process.cwd(), 'vendors', 'trendradar', 'manual_run.log'),
    ];

    let latestLogFile = '';
    let latestTime = 0;

    for (const file of logs) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          latestLogFile = file;
        }
      }
    }

    if (!latestLogFile) {
      return { status: 'unknown', note: '未发现爬虫日志' };
    }

    const stats = fs.statSync(latestLogFile);
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const readLen = Math.min(stats.size, 5000);
    const buffer = Buffer.alloc(readLen);
    const fd = fs.openSync(latestLogFile, 'r');
    try {
      fs.readSync(fd, buffer, 0, readLen, Math.max(0, stats.size - readLen));
    } finally {
      fs.closeSync(fd);
    }

    const content = buffer.toString('utf-8');
    if (content.match(/Timeout|APITimeoutError|Traceback|Error communicating|ConnectionRefusedError/i)) {
      return { status: 'error', note: '触发警报: 日志出现报错或大模型超时' };
    }

    if (stats.mtimeMs < threeHoursAgo) {
      return { status: 'offline', note: '长达3小时没运作，爬虫可能停转' };
    }

    return { status: 'running', note: '爬虫运作正常，无报错' };
  } catch {
    return { status: 'unknown', note: '读取监控日志失败' };
  }
}

export async function getExternalServiceHealth() {
  const [openbbOk, taOk, trendRadarHealth] = await Promise.all([
    checkOpenBBHealth(),
    checkTAHealth(),
    checkTrendRadarHealth(),
  ]);

  return {
    openclaw: { status: 'running', port: 3000 },
    openbb: { status: openbbOk ? 'running' : 'offline', port: 8000 },
    tradingAgents: { status: taOk ? 'running' : 'offline', port: 8001 },
    trendradar: trendRadarHealth,
  };
}
