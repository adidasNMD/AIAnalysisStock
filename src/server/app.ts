import express from 'express';
import cors from 'cors';
import { logger } from '../utils/logger';
import { artifactsRouter } from './routes/artifacts';
import { configRouter } from './routes/config';
import { diagnosticsHandler } from './routes/diagnostics';
import { missionsRouter } from './routes/missions';
import { opportunitiesRouter } from './routes/opportunities';
import { rssProxyHandler } from './routes/rss-proxy';
import { systemRouter } from './routes/system';
import { trendRadarRouter } from './routes/trendradar';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/rss/:source', rssProxyHandler);
app.get('/api/diagnostics', diagnosticsHandler);

app.use('/api/missions', missionsRouter);
app.use('/api', configRouter);
app.use('/api', opportunitiesRouter);
app.use('/api', systemRouter);
app.use('/api', artifactsRouter);
app.use('/api/trendradar', trendRadarRouter);

export function startServer(port = 3000) {
  app.listen(port, () => {
    logger.info(`[API Server] 📡 Intelligence Desk API is running on http://localhost:${port}`);
  });
}
