import { Router, Request, Response } from 'express';
import { getActiveTickers } from '../../utils/dynamic-watchlist';
import { eventBus } from '../../utils/event-bus';
import { loadNarratives } from '../../utils/narrative-store';
import { sendInternalError } from '../route-helpers';
import * as fs from 'fs';
import * as path from 'path';

export const systemRouter = Router();

systemRouter.get('/narratives', async (_req: Request, res: Response) => {
  try {
    res.json(await loadNarratives());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

systemRouter.get('/watchlist/dynamic', (_req: Request, res: Response) => {
  try {
    res.json(getActiveTickers());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

systemRouter.get('/watchlist/static', (_req: Request, res: Response) => {
  try {
    const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
    if (!fs.existsSync(watchlistPath)) {
      return res.json([]);
    }
    const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8')) as {
      tickers?: unknown[];
    };
    return res.json(data.tickers || []);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

systemRouter.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onLog = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventBus.on('agent_log', onLog);

  req.on('close', () => {
    eventBus.removeListener('agent_log', onLog);
  });
});
