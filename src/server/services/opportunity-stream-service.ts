import type { Request, Response } from 'express';
import { eventBus } from '../../utils/event-bus';
import { logger } from '../../utils/logger';
import { errorMessage } from '../route-helpers';
import {
  getLatestStreamEventId,
  getRuntimeEventSourceService,
  listOpportunityEventsAfter,
  listStreamEventsAfter,
  listStreamEventsSince,
  toOpportunityEventEnvelope,
  type OpportunityEventEnvelope,
  type OpportunityEventRecord,
} from '../../workflows';

export function getOpportunitySseReplayCursor(
  req: Pick<Request, 'query' | 'headers'>,
): string | undefined {
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

export function writeOpportunitySseEnvelope(
  res: Pick<Response, 'write'>,
  envelope: OpportunityEventEnvelope,
): void {
  res.write(`id: ${envelope.id}\n`);
  res.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

export async function attachOpportunityEventStream(req: Request, res: Response): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const connectedAt = new Date().toISOString();
  let lastSentEventId: string | null = null;
  const writeAndRemember = (envelope: OpportunityEventEnvelope) => {
    writeOpportunitySseEnvelope(res, envelope);
    lastSentEventId = envelope.id;
  };

  const onEvent = (data: unknown) => {
    const event = data as OpportunityEventRecord;
    writeAndRemember(toOpportunityEventEnvelope(event, { service: getRuntimeEventSourceService() }));
  };

  eventBus.on('opportunity_event', onEvent);

  const replayCursor = getOpportunitySseReplayCursor(req);
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
}
