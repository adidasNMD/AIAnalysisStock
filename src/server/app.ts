import express, { Request, Response } from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { healthMonitor } from '../utils/health-monitor';
import { taskQueue } from '../utils/task-queue';
import { loadNarratives } from '../utils/narrative-store';
import { getActiveTickers } from '../utils/dynamic-watchlist';
import { eventBus } from '../utils/event-bus';
import { getFullConfig, saveModelsConfig, reloadConfig } from '../utils/model-config';
import { getRuntimeConfig, updateRuntimeConfig } from '../config';
import { checkOpenBBHealth } from '../utils/openbb-provider';
import { checkTAHealth } from '../utils/ta-client';
import { listMissions, getMission, dispatchMission, type MissionInput } from '../workflows';
import { diagnosticsHandler } from './routes/diagnostics';
import { rssProxyHandler } from './routes/rss-proxy';
import * as fs from 'fs';
import * as path from 'path';

export const app = express();

app.use(cors());
app.use(express.json());

// API: 代理内部 RSS 数据 (X / Reddit bypass)
app.get('/api/rss/:source', rssProxyHandler);

// API: 系统诊断与健康探针
app.get('/api/diagnostics', diagnosticsHandler);

// API: 核心调度健康状态 (原有)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: healthMonitor.getStatusSummary(),
    isDegraded: healthMonitor.shouldSkipAnalysis()
  });
});

// API: 任务队列查看
app.get('/api/queue', async (req: Request, res: Response) => {
  try {
    const summary = await taskQueue.getStatusSummary();
    const tasks = await taskQueue.getAll();
    res.json({
      summary,
      tasks: tasks.sort((a, b) => b.createdAt - a.createdAt)
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 手动下发任务 (Manual Trigger)
app.post('/api/trigger', async (req: Request, res: Response) => {
  const { query, depth, source = 'manual' } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  const success = await taskQueue.enqueue(query, depth || 'deep', source, 100); // 手动触发最高优先级
  if (success) {
    res.json({ success: true, message: 'Mission queued successfully' });
  } else {
    res.status(400).json({ error: 'Task already in queue or running' });
  }
});

// API: 强制中止任务 (Cancel Mission)
app.delete('/api/queue/:id', async (req: Request, res: Response) => {
  try {
    await taskQueue.cancelTask(req.params.id as string);
    res.json({ success: true, message: 'Mission canceled' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 获取所有叙事记忆
app.get('/api/narratives', async (req: Request, res: Response) => {
  try {
    const narratives = await loadNarratives();
    res.json(narratives);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 获取现在的动态标的池
app.get('/api/watchlist/dynamic', (req: Request, res: Response) => {
  try {
    const dynamicTickers = getActiveTickers();
    res.json(dynamicTickers);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 获取静态 Watchlist
app.get('/api/watchlist/static', (req: Request, res: Response) => {
  try {
    const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
    if (fs.existsSync(watchlistPath)) {
      const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
      res.json(data.tickers || []);
    } else {
      res.json([]);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: Server-Sent Events (SSE) 直播流，推送 Agent 思考过程
app.get('/api/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const onLog = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  req.on('close', () => {
    eventBus.removeListener('agent_log', onLog);
  });
});

// API: 获取所有叙事记忆
app.get('/api/reports', (req: Request, res: Response) => {
  try {
    const reportsDir = path.join(process.cwd(), 'out', 'reports');
    if (!fs.existsSync(reportsDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(reportsDir).filter(d => fs.statSync(path.join(reportsDir, d)).isDirectory());
    const reports = [];
    for (const date of dates) {
      const dateDir = path.join(reportsDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        reports.push({ date, filename: file });
      }
    }
    res.json(reports.sort((a, b) => (b.date + b.filename).localeCompare(a.date + a.filename)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/reports/content', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.query;
    if (!date || !filename || typeof date !== 'string' || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Missing date or filename' });
    }
    const reportPath = path.join(process.cwd(), 'out', 'reports', path.basename(date), path.basename(filename));
    
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const content = fs.readFileSync(reportPath, 'utf-8');
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 获取所有 Trace
app.get('/api/traces', (req: Request, res: Response) => {
  try {
    const tracesDir = path.join(process.cwd(), 'out', 'traces');
    if (!fs.existsSync(tracesDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(tracesDir).filter(d => fs.statSync(path.join(tracesDir, d)).isDirectory());
    const traces = [];
    for (const date of dates) {
      const dateDir = path.join(tracesDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        traces.push({ date, filename: file });
      }
    }
    res.json(traces.sort((a, b) => (b.date + b.filename).localeCompare(a.date + a.filename)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/traces/content', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.query;
    if (!date || !filename || typeof date !== 'string' || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Missing date or filename' });
    }
    const tracePath = path.join(process.cwd(), 'out', 'traces', path.basename(date), path.basename(filename));
    
    if (!fs.existsSync(tracePath)) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    
    const content = fs.readFileSync(tracePath, 'utf-8');
    res.json({ content: JSON.parse(content) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 根据 Mission ID 直接定位 Trace（消灭 N+1）
app.get('/api/traces/byMission/:missionId', (req: Request, res: Response) => {
  try {
    const missionId = req.params.missionId as string;
    const tracesDir = path.join(process.cwd(), 'out', 'traces');
    if (!fs.existsSync(tracesDir)) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    const dates = fs.readdirSync(tracesDir)
      .filter(d => fs.statSync(path.join(tracesDir, d)).isDirectory())
      .sort()
      .reverse(); // 最新日期优先

    for (const date of dates) {
      const dateDir = path.join(tracesDir, date);
      const match = fs.readdirSync(dateDir)
        .find(f => f.endsWith('.json') && f.includes(missionId));
      if (match) {
        const content = fs.readFileSync(path.join(dateDir, match), 'utf-8');
        return res.json({ content: JSON.parse(content) });
      }
    }
    res.status(404).json({ error: 'Trace not found for mission' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 新增 API: TrendRadar 实时雷达数据
// ================================================================

// 获取可查询的日期列表
app.get('/api/trendradar/dates', (req: Request, res: Response) => {
  try {
    const newsDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'news');
    if (!fs.existsSync(newsDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(newsDir)
      .filter(f => f.endsWith('.db'))
      .map(f => f.replace('.db', ''))
      .sort()
      .reverse();
    res.json(dates);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── TrendRadar HTML 报告 API ──

// 列出所有可用的 HTML 报告
app.get('/api/trendradar/reports', (req: Request, res: Response) => {
  try {
    const htmlDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'html');
    if (!fs.existsSync(htmlDir)) {
      return res.json([]);
    }
    const dates = fs.readdirSync(htmlDir)
      .filter(d => fs.statSync(path.join(htmlDir, d)).isDirectory())
      .sort()
      .reverse();
    const reports: { date: string; filename: string; time: string }[] = [];
    for (const date of dates) {
      const dateDir = path.join(htmlDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.html')).sort().reverse();
      for (const file of files) {
        reports.push({ date, filename: file, time: file.replace('.html', '') });
      }
    }
    res.json(reports);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 提供单个 HTML 报告的内容（直接作为 HTML 返回，可嵌入 iframe）
app.get('/api/trendradar/reports/:date/:filename', (req: Request, res: Response) => {
  try {
    const { date, filename } = req.params;
    const safeDateStr = path.basename(date as string);
    const safeFilename = path.basename(filename as string);
    const reportPath = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'html', safeDateStr, safeFilename);
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const content = fs.readFileSync(reportPath, 'utf-8');
    res.send(content);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取 TrendRadar 数据（支持 ?date= 指定日期，默认最新）
app.get('/api/trendradar/latest', (req: Request, res: Response) => {
  try {
    const newsDir = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'news');
    if (!fs.existsSync(newsDir)) {
      return res.json({ date: null, items: [] });
    }
    
    const dbFiles = fs.readdirSync(newsDir).filter(f => f.endsWith('.db')).sort();
    if (dbFiles.length === 0) {
      return res.json({ date: null, items: [] });
    }
    
    // 支持指定日期，否则取最新
    const requestedDate = typeof req.query.date === 'string' ? req.query.date : null;
    let targetFile: string;
    if (requestedDate && dbFiles.includes(`${requestedDate}.db`)) {
      targetFile = `${requestedDate}.db`;
    } else {
      targetFile = dbFiles[dbFiles.length - 1]!; // 回溯修复：之前获取的最新文件应为数组最后一个
    }
    
    const dbPath = path.join(newsDir, targetFile);
    const rssDbPath = path.join(process.cwd(), 'vendors', 'trendradar', 'output', 'rss', targetFile);
    const dateStr = targetFile.replace('.db', '');
    
    const db = new sqlite3.Database(dbPath);
    
    const hasRss = fs.existsSync(rssDbPath);
    const query = hasRss ? `
      SELECT n.id, n.title, n.url, n.rank, n.first_crawl_time, n.last_crawl_time, n.crawl_count, p.name as platform_name 
      FROM news_items n 
      JOIN platforms p ON n.platform_id = p.id 
      JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
      WHERE fn.matched = 1
      UNION ALL
      SELECT r.id, r.title, r.url, -1 as rank, r.first_crawl_time, r.last_crawl_time, r.crawl_count, f.name as platform_name 
      FROM rss_db.rss_items r
      JOIN rss_db.rss_feeds f ON r.feed_id = f.id
      JOIN ai_filter_analyzed_news fn ON r.id = fn.news_item_id AND fn.source_type = 'rss'
      WHERE fn.matched = 1
      ORDER BY last_crawl_time DESC, rank ASC 
      LIMIT 100
    ` : `
      SELECT n.id, n.title, n.url, n.rank, n.first_crawl_time, n.last_crawl_time, n.crawl_count, p.name as platform_name 
      FROM news_items n 
      JOIN platforms p ON n.platform_id = p.id 
      JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
      WHERE fn.matched = 1
      ORDER BY n.last_crawl_time DESC, n.rank ASC 
      LIMIT 100
    `;

    const executeQuery = () => {
      db.all(query, [], (err: Error | null, rows: any[]) => {
        db.close();
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ date: dateStr, items: rows });
      });
    };

    if (hasRss) {
      db.run(`ATTACH DATABASE '${rssDbPath}' AS rss_db`, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        executeQuery();
      });
    } else {
      executeQuery();
    }
    
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 新增 API: 返回原汁原味的未筛选数据以及筛选状态
app.get('/api/trendradar/raw', async (req: Request, res: Response) => {
  try {
    const outputDir = path.join(__dirname, '../../vendors/trendradar/output/news');
    if (!fs.existsSync(outputDir)) {
      return res.json({ date: null, items: [] });
    }

    // 获取最近七天的数据库文件
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.db')).sort().reverse().slice(0, 7);
    if (files.length === 0) {
      return res.json({ date: null, items: [] });
    }

    let allItems: any[] = [];
    const dateRangeStr = `${files[files.length - 1]?.replace('.db', '')} ~ ${files[0]?.replace('.db', '')}`;

    for (const file of files) {
      const dbPath = path.join(outputDir, file);
      const rssDbPath = path.join(__dirname, '../../vendors/trendradar/output/rss', file);
      const hasRss = fs.existsSync(rssDbPath);

      await new Promise<void>((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) { resolve(); return; } // 跳过打不开的数据库
        });

        // 先检查 ai_filter_analyzed_news 表是否存在
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_filter_analyzed_news'", (err, row) => {
          const hasAiTable = !err && !!row;

          const buildQuery = (withRss: boolean) => {
            if (hasAiTable) {
              return withRss ? `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, IFNULL(fn.matched, -1) as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
                LEFT JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
                UNION ALL
                SELECT r.id, r.title, r.url, r.first_crawl_time, r.last_crawl_time, f.name as platform_name, 'rss' as source_type, IFNULL(fn.matched, -1) as matched, NULL as matched_tag
                FROM rss_db.rss_items r
                JOIN rss_db.rss_feeds f ON r.feed_id = f.id
                LEFT JOIN ai_filter_analyzed_news fn ON r.id = fn.news_item_id AND fn.source_type = 'rss'
              ` : `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, IFNULL(fn.matched, -1) as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
                LEFT JOIN ai_filter_analyzed_news fn ON n.id = fn.news_item_id AND fn.source_type = 'hotlist'
              `;
            } else {
              // 老数据库没有 ai_filter 表，直接查原始数据
              return withRss ? `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, -1 as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
                UNION ALL
                SELECT r.id, r.title, r.url, r.first_crawl_time, r.last_crawl_time, f.name as platform_name, 'rss' as source_type, -1 as matched, NULL as matched_tag
                FROM rss_db.rss_items r
                JOIN rss_db.rss_feeds f ON r.feed_id = f.id
              ` : `
                SELECT n.id, n.title, n.url, n.first_crawl_time, n.last_crawl_time, p.name as platform_name, 'hotlist' as source_type, -1 as matched, NULL as matched_tag
                FROM news_items n 
                JOIN platforms p ON n.platform_id = p.id 
              `;
            }
          };

          const query = buildQuery(hasRss);

          const executeQuery = () => {
            db.all(query, [], (err2: Error | null, rows: any[]) => {
              db.close();
              if (!err2 && rows) allItems = allItems.concat(rows);
              resolve();
            });
          };

          if (hasRss) {
            db.run(`ATTACH DATABASE '${rssDbPath}' AS rss_db`, (attachErr) => {
              if (attachErr) {
                // RSS 附加失败，退化为仅热榜查询
                const fallbackQuery = buildQuery(false);
                db.all(fallbackQuery, [], (err3: Error | null, rows: any[]) => {
                  db.close();
                  if (!err3 && rows) allItems = allItems.concat(rows);
                  resolve();
                });
              } else {
                executeQuery();
              }
            });
          } else {
            executeQuery();
          }
        });
      });
    }

    // 按时间先后排序（降序：最新在最前，或者升序） 用户说：按时间先后排序
    // 这里使用第一获取时间降序，如果用户想要升序可以改这里。默认降序体验更好
    allItems.sort((a, b) => {
      const timeA = new Date(a.first_crawl_time || a.last_crawl_time).getTime();
      const timeB = new Date(b.first_crawl_time || b.last_crawl_time).getTime();
      return timeB - timeA; // 降序
    });

    res.json({ date: `最近七天 (${dateRangeStr})`, items: allItems });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ================================================================
// 新增 API: 统一模型配置中心
// ================================================================

// API: 读取模型配置
app.get('/api/config/models', (req: Request, res: Response) => {
  try {
    const config = getFullConfig();
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 保存模型配置 (Dashboard Settings 页面调用)
app.put('/api/config/models', (req: Request, res: Response) => {
  try {
    saveModelsConfig(req.body);
    const updated = reloadConfig();
    res.json({ success: true, config: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 运行时特性配置 (T1 开关 / leader tickers / SMA250 veto)
app.get('/api/config', (req: Request, res: Response) => {
  res.json(getRuntimeConfig());
});

app.patch('/api/config', (req: Request, res: Response) => {
  const allowed = ['t1Enabled', 'leaderTickers', 'sma250VetoEnabled'];
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }
  const updated = updateRuntimeConfig(patch);
  res.json(updated);
});

// ================================================================
// 新增 API: 多服务健康检查
// ================================================================

// API: 全部服务健康状态一览
async function checkTrendRadarHealth(): Promise<{status: string, note: string}> {
  try {
    const fs = require('fs');
    const path = require('path');
    const logs = [
      path.join(__dirname, '../../vendors/trendradar/crawler.log'),
      path.join(__dirname, '../../vendors/trendradar/manual_run.log')
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
    // 判断进程活跃或最后存活：如果超 3 小时没更新，标记为离线
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    
    const readLen = Math.min(stats.size, 5000);
    const fd = fs.openSync(latestLogFile, 'r');
    const buffer = Buffer.alloc(readLen);
    fs.readSync(fd, buffer, 0, readLen, stats.size - readLen);
    fs.closeSync(fd);
    
    const content = buffer.toString('utf-8');
    fs.closeSync(fs.openSync(latestLogFile, 'r')); // dummy close? No, already closed

    // 监测致命词汇
    if (content.match(/Timeout|APITimeoutError|Traceback|Error communicating|ConnectionRefusedError/i)) {
      return { status: 'error', note: '触发警报: 日志出现报错或大模型超时' };
    }

    if (stats.mtimeMs < threeHoursAgo) {
      return { status: 'offline', note: '长达3小时没运作，爬虫可能停转' };
    }

    return { status: 'running', note: '爬虫运作正常，无报错' };
  } catch (e: any) {
    return { status: 'unknown', note: '读取监控日志失败' };
  }
}

app.get('/api/health/services', async (req: Request, res: Response) => {
  try {
    const [openbbOk, taOk, trHealth] = await Promise.all([
      checkOpenBBHealth(),
      checkTAHealth(),
      checkTrendRadarHealth(),
    ]);

    res.json({
      openclaw: { status: 'running', port: 3000 },
      openbb: { status: openbbOk ? 'running' : 'offline', port: 8000 },
      tradingAgents: { status: taOk ? 'running' : 'offline', port: 8001 },
      trendradar: trHealth,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 新增 API: 统一 Mission 管理
// ================================================================

// API: 列出所有 Mission
app.get('/api/missions', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const missions = listMissions(limit);
    // 返回轻量列表（不含完整报告内容）
    const summaries = missions.map(m => ({
      id: m.id,
      mode: m.input.mode,
      query: m.input.query,
      source: m.input.source,
      status: m.status,
      createdAt: m.createdAt,
      openclawTickers: m.openclawTickers,
      taCount: m.taResults.length,
      consensus: m.consensus,
      totalDurationMs: m.totalDurationMs,
    }));
    res.json(summaries);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: Mission 实时事件流（SSE）— 必须在 :id 路由之前
app.get('/api/missions/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onLog = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  // 发送心跳保持连接
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.removeListener('agent_log', onLog);
  });
});

// API: 获取单个 Mission 完整详情
app.get('/api/missions/:id', (req: Request, res: Response) => {
  try {
    const mission = getMission(req.params.id as string);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    res.json(mission);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: 创建并触发 Mission（Dashboard Command Center 调用）
app.post('/api/missions', async (req: Request, res: Response) => {
  try {
    const { mode, query, tickers, depth, source } = req.body as MissionInput;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const input: MissionInput = {
      mode: mode || 'explore',
      query,
      tickers: tickers || [],
      depth: depth || 'deep',
      source: source || 'manual',
    };

    // 立即返回 Mission ID，后台异步执行
    res.json({ success: true, message: 'Mission dispatched', missionId: `pending_${Date.now()}` });

    // 同时也向旧的 taskQueue 入队（保持向后兼容）
    await taskQueue.enqueue(query, depth || 'deep', source || 'manual', 100);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 监听端口，供 worker.ts 调用
export function startServer(port = 3000) {
  app.listen(port, () => {
    console.log(`\n[API Server] 📡 Intelligence Desk API is running on http://localhost:${port}`);
  });
}
