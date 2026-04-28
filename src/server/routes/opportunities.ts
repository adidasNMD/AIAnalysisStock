import { Router, Request, Response } from 'express';
import { getActiveTickers } from '../../utils/dynamic-watchlist';
import { eventBus } from '../../utils/event-bus';
import { logger } from '../../utils/logger';
import { watchIPO } from '../../tools/edgar-monitor';
import {
  buildHeatTransferGraphs,
  buildNewCodeRadarCandidates,
  getLatestStreamEventId,
  getRuntimeEventSourceService,
  getOpportunityHeatHistory,
  listOpportunities,
  listOpportunityEvents,
  listOpportunityEventsAfter,
  listStreamEventsAfter,
  listStreamEventsSince,
  syncHeatTransferGraphOpportunities,
  syncNewCodeRadarOpportunities,
  toOpportunityEventEnvelope,
  type OpportunityEventEnvelope,
  type OpportunityEventRecord,
} from '../../workflows';
import {
  createOpportunityForApi,
  getOpportunityBoardHealth,
  getOpportunityInboxItem,
  getOpportunitySummary,
  listOpportunityInboxItems,
  listOpportunitySummaries,
  updateOpportunityForApi,
} from '../services/opportunity-service';
import {
  createOpportunityPayloadSchema,
  sendValidationError,
  updateOpportunityPayloadSchema,
} from '../validation';
import * as fs from 'fs';
import * as path from 'path';

export const opportunitiesRouter = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadEdgarWatchCompanies(): string[] {
  const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
  if (!fs.existsSync(watchlistPath)) return [];
  const data = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8')) as {
    tickers?: Array<{ name?: string; alerts?: { edgarWatch?: boolean } }>;
  };
  return (data.tickers || [])
    .filter((ticker) => ticker.alerts?.edgarWatch && ticker.name)
    .map((ticker) => ticker.name as string);
}

function getSseReplayCursor(req: Request): string | undefined {
  const queryCursor = req.query.since;
  if (typeof queryCursor === 'string' && queryCursor.trim()) {
    return queryCursor.trim();
  }

  const headerCursor = req.headers['last-event-id'];
  if (typeof headerCursor === 'string' && headerCursor.trim()) {
    return headerCursor.trim();
  }
  if (Array.isArray(headerCursor) && typeof headerCursor[0] === 'string' && headerCursor[0].trim()) {
    return headerCursor[0].trim();
  }

  return undefined;
}

function writeSseEnvelope(res: Response, envelope: OpportunityEventEnvelope): void {
  res.write(`id: ${envelope.id}\n`);
  res.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

opportunitiesRouter.get('/opportunities/graphs/heat-transfer', async (_req: Request, res: Response) => {
  try {
    const opportunities = await listOpportunities(500);
    res.json(buildHeatTransferGraphs(getActiveTickers(), opportunities));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.post('/opportunities/graphs/heat-transfer/sync', async (_req: Request, res: Response) => {
  try {
    const synced = await syncHeatTransferGraphOpportunities(getActiveTickers());
    res.json({
      success: true,
      syncedCount: synced.length,
      opportunities: synced,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.post('/opportunities/radar/new-codes/refresh', async (_req: Request, res: Response) => {
  try {
    const companies = loadEdgarWatchCompanies();
    const filings = await watchIPO(companies);
    const synced = await syncNewCodeRadarOpportunities(filings);
    const candidates = buildNewCodeRadarCandidates(filings, synced);
    res.json({
      success: true,
      companyCount: companies.length,
      filingCount: filings.length,
      syncedCount: synced.length,
      candidates,
      opportunities: synced,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/inbox', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 12;
    res.json(await listOpportunityInboxItems(limit, 200));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/inbox/:id', async (req: Request, res: Response) => {
  try {
    const item = await getOpportunityInboxItem(req.params.id as string);
    if (!item) {
      return res.status(404).json({ error: 'Inbox item not found' });
    }
    return res.json(item);
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/board-health', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    return res.json(await getOpportunityBoardHealth(limit));
  } catch (error: unknown) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(await listOpportunitySummaries(limit));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunity-events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(await listOpportunityEvents(undefined, limit));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/stream', async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const connectedAt = new Date().toISOString();
  let lastSentEventId: string | null = null;
  const writeAndRemember = (envelope: OpportunityEventEnvelope) => {
    writeSseEnvelope(res, envelope);
    lastSentEventId = envelope.id;
  };

  const onEvent = (data: unknown) => {
    const event = data as OpportunityEventRecord;
    writeAndRemember(toOpportunityEventEnvelope(event, { service: getRuntimeEventSourceService() }));
  };

  eventBus.on('opportunity_event', onEvent);

  const replayCursor = getSseReplayCursor(req);
  if (replayCursor) {
    try {
      const replayEnvelopes = await listStreamEventsAfter<OpportunityEventRecord>('opportunity', replayCursor, 100);
      if (replayEnvelopes.length > 0) {
        replayEnvelopes.forEach(writeAndRemember);
      } else {
        const replayEvents = await listOpportunityEventsAfter(replayCursor, 100);
        replayEvents.forEach((event) => {
          writeAndRemember(toOpportunityEventEnvelope(event, { service: getRuntimeEventSourceService() }));
        });
      }
    } catch (error: unknown) {
      logger.warn(`[SSE] Opportunity replay failed: ${errorMessage(error)}`);
    }
  } else {
    lastSentEventId = await getLatestStreamEventId('opportunity');
  }

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);
  const durableTail = setInterval(() => {
    const eventLoader = lastSentEventId
      ? listStreamEventsAfter<OpportunityEventRecord>('opportunity', lastSentEventId, 100)
      : listStreamEventsSince<OpportunityEventRecord>('opportunity', connectedAt, 100);
    void eventLoader
      .then((events) => {
        events.forEach(writeAndRemember);
      })
      .catch((error: unknown) => {
        logger.warn(`[SSE] Opportunity durable tail failed: ${errorMessage(error)}`);
      });
  }, 3000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(durableTail);
    eventBus.removeListener('opportunity_event', onEvent);
  });
});

opportunitiesRouter.get('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const summary = await getOpportunitySummary(req.params.id as string);
    if (!summary) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    return res.json(summary);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/:id/events', async (req: Request, res: Response) => {
  try {
    res.json(await listOpportunityEvents(req.params.id as string, parseInt(req.query.limit as string, 10) || 50));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.get('/opportunities/:id/heat-history', async (req: Request, res: Response) => {
  try {
    res.json(await getOpportunityHeatHistory(req.params.id as string, parseInt(req.query.limit as string, 10) || 8));
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.post('/opportunities', async (req: Request, res: Response) => {
  try {
    const parsed = createOpportunityPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid opportunity payload');
    }
    const result = await createOpportunityForApi(parsed.data);
    if (result.status === 'invalid') {
      return res.status(400).json({ error: result.error, details: result.details });
    }
    res.status(201).json(result.opportunity);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

opportunitiesRouter.patch('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const parsed = updateOpportunityPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid opportunity payload');
    }
    const result = await updateOpportunityForApi(req.params.id as string, parsed.data);
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    if (result.status === 'invalid') {
      return res.status(400).json({ error: result.error, details: result.details });
    }
    res.json(result.summary);
  } catch (error: unknown) {
    res.status(500).json({ error: errorMessage(error) });
  }
});
