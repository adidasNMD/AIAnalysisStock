import { Router, Request, Response } from 'express';
import {
  encodePageCursor,
  parsePositiveIntQuery,
  parsePaginationQuery,
  sendBadRequest,
  sendInternalError,
  sendNotFound,
} from '../route-helpers';
import {
  getOpportunityHeatTransferGraphsForApi,
  getOpportunityPriceHistoryDiagnosticsForApi,
  refreshNewCodeRadarForApi,
  refreshOpportunityPriceHistoryForApi,
  syncOpportunityHeatTransferGraphsForApi,
} from '../services/opportunity-operations-service';
import {
  buildOpportunityCatalystReminderCalendarForApi,
  getOpportunityHeatHistoryForApi,
  listOpportunityCatalystReminderAuditForApi,
  listOpportunityFieldEvidenceForApi,
  listOpportunityEventsForApi,
  listOpportunityEventsForOpportunityApi,
  listOpportunityPreTradeAuditForApi,
  listOpportunityReviewPlaybackForApi,
  parseOpportunityCatalystReminderFilters,
  parseOpportunityFieldEvidenceFilters,
  parseOpportunityEventTypeFilter,
  parseOpportunityPreTradeAuditFilters,
  parseOpportunityReviewPlaybackFilters,
} from '../services/opportunity-query-service';
import { attachOpportunityEventStream } from '../services/opportunity-stream-service';
import {
  createOpportunityForApi,
  getOpportunityBoardHealth,
  getOpportunityInboxItem,
  getOpportunitySummary,
  invalidateFieldEvidenceForApi,
  deleteOpportunityFieldRegistryForApi,
  exportOpportunityFieldRegistryForApi,
  getOpportunityFieldRegistryDiffReportForApi,
  importOpportunityFieldRegistryForApi,
  listOpportunityFieldRegistryAuditForApi,
  listOpportunityFieldRegistryForApi,
  listOpportunityInboxItems,
  listOpportunitySummaries,
  listOpportunitySummariesPage,
  recordCatalystReminderPreferenceForApi,
  recordFieldEvidenceBatchForApi,
  recordFieldEvidenceForApi,
  recordPreTradeConfirmationForApi,
  restoreFieldEvidenceForApi,
  upsertOpportunityFieldRegistryForApi,
  updateFieldEvidenceBulkStatusForApi,
  updateOpportunityForApi,
} from '../services/opportunity-service';
import {
  createOpportunityPayloadSchema,
  catalystReminderPreferencePayloadSchema,
  fieldEvidenceBatchPayloadSchema,
  fieldEvidenceBulkStatusPayloadSchema,
  fieldEvidenceInvalidationPayloadSchema,
  fieldEvidencePayloadSchema,
  fieldRegistryImportPayloadSchema,
  fieldRegistryOverridePayloadSchema,
  fieldEvidenceRestorationPayloadSchema,
  preTradeConfirmationPayloadSchema,
  priceHistoryRefreshPayloadSchema,
  sendValidationError,
  updateOpportunityPayloadSchema,
} from '../validation';

export const opportunitiesRouter = Router();

opportunitiesRouter.get('/opportunities/graphs/heat-transfer', async (_req: Request, res: Response) => {
  try {
    res.json(await getOpportunityHeatTransferGraphsForApi());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/graphs/heat-transfer/sync', async (_req: Request, res: Response) => {
  try {
    res.json(await syncOpportunityHeatTransferGraphsForApi());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/radar/new-codes/refresh', async (_req: Request, res: Response) => {
  try {
    res.json(await refreshNewCodeRadarForApi());
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/price-history/diagnostics', async (req: Request, res: Response) => {
  try {
    const staleAfterHours = parsePositiveIntQuery(req.query.staleAfterHours, 24);
    return res.json(await getOpportunityPriceHistoryDiagnosticsForApi({ staleAfterHours }));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/price-history/refresh', async (req: Request, res: Response) => {
  try {
    const parsed = priceHistoryRefreshPayloadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid price history refresh payload');
    }
    const payload = {
      ...(parsed.data.symbols ? { symbols: parsed.data.symbols } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
      ...(parsed.data.force !== undefined ? { force: parsed.data.force } : {}),
      ...(parsed.data.staleAfterHours !== undefined ? { staleAfterHours: parsed.data.staleAfterHours } : {}),
    };
    return res.status(202).json(await refreshOpportunityPriceHistoryForApi(payload));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/inbox', async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveIntQuery(req.query.limit, 12);
    res.json(await listOpportunityInboxItems(limit, 200));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/inbox/:id', async (req: Request, res: Response) => {
  try {
    const item = await getOpportunityInboxItem(req.params.id as string);
    if (!item) {
      return sendNotFound(res, 'Inbox item not found');
    }
    return res.json(item);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/board-health', async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveIntQuery(req.query.limit, 50);
    return res.json(await getOpportunityBoardHealth(limit));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities', async (req: Request, res: Response) => {
  try {
    const pagination = parsePaginationQuery(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100,
    });
    if (pagination.envelope) {
      return res.json(await listOpportunitySummariesPage(pagination));
    }
    res.json(await listOpportunitySummaries(pagination.limit));
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-events', async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveIntQuery(req.query.limit, 50);
    const filter = parseOpportunityEventTypeFilter(req.query.types ?? req.query.type);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid opportunity event type filter', {
        invalidTypes: filter.invalid,
      });
    }
    return res.json(await listOpportunityEventsForApi(limit, {}, filter.types));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-field-evidence', async (req: Request, res: Response) => {
  try {
    const pagination = parsePaginationQuery(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const filter = parseOpportunityFieldEvidenceFilters(req.query as Record<string, unknown>);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid opportunity field evidence filter', {
        invalidFilters: filter.invalid,
      });
    }
    const rows = await listOpportunityFieldEvidenceForApi(pagination, filter.filters);
    const items = rows.slice(0, pagination.limit);
    if (pagination.envelope) {
      const hasMore = rows.length > pagination.limit;
      return res.json({
        items,
        pageInfo: {
          limit: pagination.limit,
          nextCursor: hasMore ? encodePageCursor(pagination.offset + pagination.limit) : null,
          hasMore,
        },
      });
    }
    return res.json(items);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-pretrade-audit', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parsePositiveIntQuery(req.query.limit, 50), 500);
    const filter = parseOpportunityPreTradeAuditFilters(req.query as Record<string, unknown>);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid pre-trade audit filter', {
        invalidFilters: filter.invalid,
      });
    }
    return res.json(await listOpportunityPreTradeAuditForApi(limit, filter.filters));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-review-playback', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parsePositiveIntQuery(req.query.limit, 50), 500);
    const filter = parseOpportunityReviewPlaybackFilters(req.query as Record<string, unknown>);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid review playback filter', {
        invalidFilters: filter.invalid,
      });
    }
    return res.json(await listOpportunityReviewPlaybackForApi(limit, filter.filters));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-catalyst-reminders', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parsePositiveIntQuery(req.query.limit, 50), 500);
    const filter = parseOpportunityCatalystReminderFilters(req.query as Record<string, unknown>);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid catalyst reminder filter', {
        invalidFilters: filter.invalid,
      });
    }
    return res.json(await listOpportunityCatalystReminderAuditForApi(limit, filter.filters));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-catalyst-reminders.ics', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parsePositiveIntQuery(req.query.limit, 200), 500);
    const filter = parseOpportunityCatalystReminderFilters(req.query as Record<string, unknown>);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid catalyst reminder calendar filter', {
        invalidFilters: filter.invalid,
      });
    }
    const calendar = await buildOpportunityCatalystReminderCalendarForApi(limit, filter.filters);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="opportunity-catalyst-reminders.ics"');
    res.setHeader('X-Calendar-Item-Count', String(calendar.itemCount));
    return res.send(calendar.content);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunity-field-evidence/bulk-status', async (req: Request, res: Response) => {
  try {
    const parsed = fieldEvidenceBulkStatusPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field evidence bulk status payload');
    }
    const result = await updateFieldEvidenceBulkStatusForApi(parsed.data);
    return res.status(result.failed > 0 || result.notFound > 0 ? 207 : 201).json(result);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/stream', async (req: Request, res: Response) => {
  await attachOpportunityEventStream(req, res);
});

opportunitiesRouter.get('/opportunity-field-registry', async (_req: Request, res: Response) => {
  try {
    return res.json(await listOpportunityFieldRegistryForApi());
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-field-registry/history', async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveIntQuery(req.query.limit, 20);
    const field = typeof req.query.field === 'string' ? req.query.field : undefined;
    return res.json(await listOpportunityFieldRegistryAuditForApi({ field, limit }));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-field-registry/report', async (_req: Request, res: Response) => {
  try {
    return res.json(await getOpportunityFieldRegistryDiffReportForApi());
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunity-field-registry/export', async (_req: Request, res: Response) => {
  try {
    return res.json(await exportOpportunityFieldRegistryForApi());
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunity-field-registry/import', async (req: Request, res: Response) => {
  try {
    const parsed = fieldRegistryImportPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field registry import payload');
    }
    const result = await importOpportunityFieldRegistryForApi(parsed.data);
    const statusCode = result.failed > 0 ? 207 : parsed.data.dryRun ? 200 : 201;
    return res.status(statusCode).json(result);
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.put('/opportunity-field-registry/:field', async (req: Request, res: Response) => {
  try {
    const parsed = fieldRegistryOverridePayloadSchema.safeParse({
      ...req.body,
      field: req.params.field,
    });
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field registry override payload');
    }
    return res.json(await upsertOpportunityFieldRegistryForApi(parsed.data));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.delete('/opportunity-field-registry/:field', async (req: Request, res: Response) => {
  try {
    return res.json(await deleteOpportunityFieldRegistryForApi(req.params.field as string));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const summary = await getOpportunitySummary(req.params.id as string);
    if (!summary) {
      return sendNotFound(res, 'Opportunity not found');
    }
    return res.json(summary);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/:id/events', async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveIntQuery(req.query.limit, 50);
    const filter = parseOpportunityEventTypeFilter(req.query.types ?? req.query.type);
    if (filter.invalid.length > 0) {
      return sendBadRequest(res, 'Invalid opportunity event type filter', {
        invalidTypes: filter.invalid,
      });
    }
    return res.json(await listOpportunityEventsForOpportunityApi(req.params.id as string, limit, {}, filter.types));
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.get('/opportunities/:id/heat-history', async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveIntQuery(req.query.limit, 8);
    res.json(await getOpportunityHeatHistoryForApi(req.params.id as string, limit));
  } catch (error: unknown) {
    sendInternalError(res, error);
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
      return sendBadRequest(res, result.error, result.details);
    }
    res.status(201).json(result.opportunity);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/:id/pretrade-confirmations', async (req: Request, res: Response) => {
  try {
    const parsed = preTradeConfirmationPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid pre-trade confirmation payload');
    }
    const result = await recordPreTradeConfirmationForApi(req.params.id as string, parsed.data);
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Opportunity not found');
    }
    return res.status(201).json({
      event: result.event,
      opportunity: result.summary,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/:id/catalyst-reminders', async (req: Request, res: Response) => {
  try {
    const parsed = catalystReminderPreferencePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid catalyst reminder preference payload');
    }
    const result = await recordCatalystReminderPreferenceForApi(req.params.id as string, parsed.data);
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Opportunity not found');
    }
    return res.status(201).json({
      event: result.event,
      opportunity: result.summary,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/:id/field-evidence', async (req: Request, res: Response) => {
  try {
    const parsed = fieldEvidencePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field evidence payload');
    }
    const result = await recordFieldEvidenceForApi(req.params.id as string, parsed.data);
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Opportunity not found');
    }
    return res.status(201).json({
      event: result.event,
      opportunity: result.summary,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/:id/field-evidence/batch', async (req: Request, res: Response) => {
  try {
    const parsed = fieldEvidenceBatchPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field evidence batch payload');
    }
    const result = await recordFieldEvidenceBatchForApi(req.params.id as string, parsed.data);
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Opportunity not found');
    }
    return res.status(result.failed > 0 ? 207 : 201).json({
      batchId: result.batchId,
      total: result.total,
      recorded: result.recorded,
      duplicates: result.duplicates,
      failed: result.failed,
      items: result.items,
      opportunity: result.summary,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/:id/field-evidence/:evidenceId/invalidate', async (req: Request, res: Response) => {
  try {
    const parsed = fieldEvidenceInvalidationPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field evidence invalidation payload');
    }
    const result = await invalidateFieldEvidenceForApi(
      req.params.id as string,
      req.params.evidenceId as string,
      parsed.data,
    );
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Opportunity not found');
    }
    if (result.status === 'evidence_not_found') {
      return sendNotFound(res, 'Field evidence not found');
    }
    return res.status(201).json({
      event: result.event,
      opportunity: result.summary,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
  }
});

opportunitiesRouter.post('/opportunities/:id/field-evidence/:evidenceId/restore', async (req: Request, res: Response) => {
  try {
    const parsed = fieldEvidenceRestorationPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error, 'Invalid field evidence restoration payload');
    }
    const result = await restoreFieldEvidenceForApi(
      req.params.id as string,
      req.params.evidenceId as string,
      parsed.data,
    );
    if (result.status === 'not_found') {
      return sendNotFound(res, 'Opportunity not found');
    }
    if (result.status === 'evidence_not_found') {
      return sendNotFound(res, 'Field evidence not found');
    }
    return res.status(201).json({
      event: result.event,
      opportunity: result.summary,
    });
  } catch (error: unknown) {
    return sendInternalError(res, error);
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
      return sendNotFound(res, 'Opportunity not found');
    }
    if (result.status === 'invalid') {
      return sendBadRequest(res, result.error, result.details);
    }
    res.json(result.summary);
  } catch (error: unknown) {
    sendInternalError(res, error);
  }
});
