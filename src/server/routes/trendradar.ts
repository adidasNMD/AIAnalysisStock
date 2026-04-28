import { Router, Request, Response } from 'express';
import sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export const trendRadarRouter = Router();

type TrendRadarRow = Record<string, unknown>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trendRadarOutputPath(...segments: string[]): string {
  return path.join(process.cwd(), 'vendors', 'trendradar', 'output', ...segments);
}

function attachRssDatabase(db: sqlite3.Database, rssDbPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    db.run(`ATTACH DATABASE '${rssDbPath}' AS rss_db`, (error) => {
      resolve(!error);
    });
  });
}

function runAll(db: sqlite3.Database, query: string): Promise<TrendRadarRow[]> {
  return new Promise((resolve, reject) => {
    db.all(query, [], (error: Error | null, rows: TrendRadarRow[]) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows || []);
    });
  });
}

function tableExists(db: sqlite3.Database, tableName: string): Promise<boolean> {
  return new Promise((resolve) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      tableName,
      (error, row) => {
        resolve(!error && Boolean(row));
      },
    );
  });
}

trendRadarRouter.get('/dates', (_req: Request, res: Response) => {
  try {
    const newsDir = trendRadarOutputPath('news');
    if (!fs.existsSync(newsDir)) {
      return res.json([]);
    }

    const dates = fs.readdirSync(newsDir)
      .filter(file => file.endsWith('.db'))
      .map(file => file.replace('.db', ''))
      .sort()
      .reverse();
    return res.json(dates);
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

trendRadarRouter.get('/reports', (_req: Request, res: Response) => {
  try {
    const htmlDir = trendRadarOutputPath('html');
    if (!fs.existsSync(htmlDir)) {
      return res.json([]);
    }

    const dates = fs.readdirSync(htmlDir)
      .filter(date => fs.statSync(path.join(htmlDir, date)).isDirectory())
      .sort()
      .reverse();
    const reports: Array<{ date: string; filename: string; time: string }> = [];
    for (const date of dates) {
      const dateDir = path.join(htmlDir, date);
      const files = fs.readdirSync(dateDir).filter(file => file.endsWith('.html')).sort().reverse();
      for (const filename of files) {
        reports.push({ date, filename, time: filename.replace('.html', '') });
      }
    }

    return res.json(reports);
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

trendRadarRouter.get('/reports/:date/:filename', (req: Request, res: Response) => {
  try {
    const reportPath = path.join(
      trendRadarOutputPath('html'),
      path.basename(req.params.date as string),
      path.basename(req.params.filename as string),
    );
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(reportPath, 'utf-8'));
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

trendRadarRouter.get('/latest', async (req: Request, res: Response) => {
  const newsDir = trendRadarOutputPath('news');
  if (!fs.existsSync(newsDir)) {
    return res.json({ date: null, items: [] });
  }

  const dbFiles = fs.readdirSync(newsDir).filter(file => file.endsWith('.db')).sort();
  if (dbFiles.length === 0) {
    return res.json({ date: null, items: [] });
  }

  const requestedDate = typeof req.query.date === 'string' ? req.query.date : null;
  const targetFile = requestedDate && dbFiles.includes(`${requestedDate}.db`)
    ? `${requestedDate}.db`
    : dbFiles[dbFiles.length - 1]!;
  const dbPath = path.join(newsDir, targetFile);
  const rssDbPath = trendRadarOutputPath('rss', targetFile);
  const dateStr = targetFile.replace('.db', '');
  const db = new sqlite3.Database(dbPath);

  try {
    const hasRss = fs.existsSync(rssDbPath) && await attachRssDatabase(db, rssDbPath);
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

    const items = await runAll(db, query);
    return res.json({ date: dateStr, items });
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  } finally {
    db.close();
  }
});

function buildRawTrendRadarQuery(hasAiTable: boolean, withRss: boolean): string {
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
  }

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

async function readRawTrendRadarFile(file: string): Promise<TrendRadarRow[]> {
  const dbPath = trendRadarOutputPath('news', file);
  const rssDbPath = trendRadarOutputPath('rss', file);
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  try {
    const hasAiTable = await tableExists(db, 'ai_filter_analyzed_news');
    const hasRss = fs.existsSync(rssDbPath) && await attachRssDatabase(db, rssDbPath);
    return await runAll(db, buildRawTrendRadarQuery(hasAiTable, hasRss));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

trendRadarRouter.get('/raw', async (_req: Request, res: Response) => {
  try {
    const outputDir = trendRadarOutputPath('news');
    if (!fs.existsSync(outputDir)) {
      return res.json({ date: null, items: [] });
    }

    const files = fs.readdirSync(outputDir).filter(file => file.endsWith('.db')).sort().reverse().slice(0, 7);
    if (files.length === 0) {
      return res.json({ date: null, items: [] });
    }

    const allItems = (await Promise.all(files.map(readRawTrendRadarFile))).flat();
    allItems.sort((a, b) => {
      const timeA = new Date(String(a.first_crawl_time || a.last_crawl_time || '')).getTime();
      const timeB = new Date(String(b.first_crawl_time || b.last_crawl_time || '')).getTime();
      return timeB - timeA;
    });

    const dateRangeStr = `${files[files.length - 1]?.replace('.db', '')} ~ ${files[0]?.replace('.db', '')}`;
    return res.json({ date: `最近七天 (${dateRangeStr})`, items: allItems });
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});
