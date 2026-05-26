import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOpportunityFieldEvidenceRepairPlan,
  fetchOpportunityEventsForOpportunity,
  fetchOpportunityCatalystReminderAudit,
  fetchOpportunityFieldEvidencePage,
  fetchOpportunityFieldRegistryAudit,
  fetchOpportunityFieldRegistryReport,
  fetchOpportunityPriceHistoryDiagnostics,
  fetchOpportunityPreTradeAudit,
  fetchOpportunityReviewPlayback,
  exportOpportunityFieldRegistry,
  importOpportunityFieldRegistry,
  fetchMissions,
  fetchOpportunitiesPage,
  invalidateOpportunityFieldEvidence,
  normalizePageResponse,
  opportunityCatalystReminderCalendarUrl,
  recordCatalystReminderPreference,
  recordOpportunityFieldEvidence,
  recordOpportunityFieldEvidenceBatch,
  recordPreTradeConfirmation,
  repairOpportunityFieldEvidence,
  refreshOpportunityPriceHistory,
  restoreOpportunityFieldEvidence,
  updateOpportunityFieldEvidenceBulkStatus,
} from '../../dashboard/src/api';
import { ApiError, createApiClient } from '../../dashboard/src/lib/api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('dashboard api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds relative API URLs with query params and parses JSON responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api/');

    await expect(client.get<{ ok: boolean }>('/missions', {
      params: { limit: 25, skipped: null, q: 'AI infra' },
    })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/missions?limit=25&q=AI+infra', {
      method: 'GET',
      headers: expect.any(Headers),
    });
  });

  it('sends JSON request bodies for mutating calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'op-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.post<{ id: string }>('/opportunities', { title: 'AI infra' })).resolves.toEqual({
      id: 'op-1',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'AI infra' }));
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('throws ApiError with server-provided error text when no fallback is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid stage' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.patch('/opportunities/op-1', { stage: 'bad' })).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid stage',
      status: 400,
      body: { error: 'Invalid stage' },
    } satisfies Partial<ApiError>);
  });

  it('returns fallback values on non-ok responses and network failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'offline' }, 503))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.get<string[]>('/opportunities', { fallback: [] })).resolves.toEqual([]);
    await expect(client.get<string[]>('/opportunities', { fallback: [] })).resolves.toEqual([]);
  });

  it('returns false from putOk when the server rejects the update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad config' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('/api');

    await expect(client.putOk('/config/models', { defaults: {} })).resolves.toBe(false);
  });

  it('normalizes legacy array responses into a page envelope', () => {
    expect(normalizePageResponse([{ id: 'row-1' }], 25)).toEqual({
      items: [{ id: 'row-1' }],
      pageInfo: {
        limit: 25,
        nextCursor: null,
        hasMore: false,
      },
    });
  });

  it('requests opt-in page envelopes for opportunities', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: 'op-1', title: 'AI infra' }],
      pageInfo: {
        limit: 2,
        nextCursor: 'cursor-2',
        hasMore: true,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const page = await fetchOpportunitiesPage({ limit: 2, cursor: 'cursor-1' });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities?limit=2&cursor=cursor-1&envelope=1', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    expect(page.items[0]?.id).toBe('op-1');
    expect(page.pageInfo.nextCursor).toBe('cursor-2');
  });

  it('keeps legacy mission callers on arrays while using the page contract internally', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: 'mission-1', query: 'AI infra' }],
      pageInfo: {
        limit: 3,
        nextCursor: null,
        hasMore: false,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const missions = await fetchMissions(3);

    expect(fetchMock).toHaveBeenCalledWith('/api/missions?limit=3&envelope=1', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    expect(missions).toEqual([{ id: 'mission-1', query: 'AI infra' }]);
  });

  it('records pre-trade confirmations as opportunity audit events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      event: { id: 'evt-1', type: 'pretrade_confirmed' },
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordPreTradeConfirmation('opp-1', {
      itemId: 'catalyst_window',
      label: 'Catalyst window',
      status: 'block',
      completed: true,
      evidence: 'source note',
      actionKind: 'fill_date',
      catalystUrgency: 'missing_date',
      readiness: 'blocked',
      score: 65,
    })).resolves.toEqual({
      event: { id: 'evt-1', type: 'pretrade_confirmed' },
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/pretrade-confirmations', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        itemId: 'catalyst_window',
        label: 'Catalyst window',
        status: 'block',
        completed: true,
        evidence: 'source note',
        actionKind: 'fill_date',
        catalystUrgency: 'missing_date',
        readiness: 'blocked',
        score: 65,
      }),
    });
  });

  it('records catalyst reminder preferences as opportunity audit events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      event: { id: 'evt-reminder-1', type: 'catalyst_reminder_updated' },
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordCatalystReminderPreference('opp-1', {
      reminderId: 'opp-1:Earnings:2026-05-11:0',
      catalystLabel: 'Earnings',
      catalystDueAt: '2026-05-11T00:00:00.000Z',
      catalystStatus: 'upcoming',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'snooze',
      snoozedUntil: '2026-05-10T12:00:00.000Z',
      note: 'Snoozed from strip',
    })).resolves.toEqual({
      event: { id: 'evt-reminder-1', type: 'catalyst_reminder_updated' },
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/catalyst-reminders', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        reminderId: 'opp-1:Earnings:2026-05-11:0',
        catalystLabel: 'Earnings',
        catalystDueAt: '2026-05-11T00:00:00.000Z',
        catalystStatus: 'upcoming',
        urgency: 'soon',
        actionKind: 'prepare',
        preference: 'snooze',
        snoozedUntil: '2026-05-10T12:00:00.000Z',
        note: 'Snoozed from strip',
      }),
    });
  });

  it('records catalyst reminder subscription preferences with lead time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      event: { id: 'evt-reminder-subscribe-1', type: 'catalyst_reminder_updated' },
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordCatalystReminderPreference('opp-1', {
      reminderId: 'opp-1:Earnings:2026-05-11:0',
      catalystLabel: 'Earnings',
      catalystDueAt: '2026-05-11T00:00:00.000Z',
      catalystStatus: 'upcoming',
      urgency: 'soon',
      actionKind: 'prepare',
      preference: 'subscribe',
      subscriptionLeadDays: 3,
      note: 'Subscribed from strip',
    })).resolves.toEqual({
      event: { id: 'evt-reminder-subscribe-1', type: 'catalyst_reminder_updated' },
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/catalyst-reminders', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        reminderId: 'opp-1:Earnings:2026-05-11:0',
        catalystLabel: 'Earnings',
        catalystDueAt: '2026-05-11T00:00:00.000Z',
        catalystStatus: 'upcoming',
        urgency: 'soon',
        actionKind: 'prepare',
        preference: 'subscribe',
        subscriptionLeadDays: 3,
        note: 'Subscribed from strip',
      }),
    });
  });

  it('fetches opportunity events with type filters for an opportunity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      { id: 'evt-1', type: 'pretrade_confirmed' },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityEventsForOpportunity('opp-1', {
      limit: 25,
      types: ['pretrade_confirmed', 'pretrade_unconfirmed'],
    })).resolves.toEqual([
      { id: 'evt-1', type: 'pretrade_confirmed' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/opportunities/opp-1/events?limit=25&types=pretrade_confirmed%2Cpretrade_unconfirmed',
      {
        method: 'GET',
        headers: expect.any(Headers),
      },
    );
  });

  it('fetches catalyst reminder audits and builds calendar export URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      generatedAt: '2026-05-10T00:00:00.000Z',
      metrics: {
        total: 1,
        acknowledged: 0,
        snoozed: 0,
        reopened: 0,
        subscribed: 1,
        unsubscribed: 0,
        activeSubscriptions: 1,
      },
      items: [{
        id: 'evt-1',
        eventId: 'evt-1',
        opportunityId: 'opp-1',
        reminderId: 'reminder-1',
        catalystLabel: 'Earnings',
        preference: 'subscribe',
        message: 'Catalyst reminder subscribed',
        timestamp: '2026-05-10T00:00:00.000Z',
        activeSubscription: true,
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityCatalystReminderAudit({
      limit: 25,
      preference: 'subscribe',
      activeOnly: true,
      q: 'Earnings',
      opportunityId: 'opp-1',
    })).resolves.toMatchObject({
      metrics: { activeSubscriptions: 1 },
      items: [{ reminderId: 'reminder-1', activeSubscription: true }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/opportunity-catalyst-reminders?limit=25&opportunityId=opp-1&preference=subscribe&q=Earnings&activeOnly=1',
      {
        method: 'GET',
        headers: expect.any(Headers),
      },
    );
    expect(opportunityCatalystReminderCalendarUrl({
      preference: 'subscribe',
      activeOnly: true,
      q: 'Earnings',
    })).toBe('/api/opportunity-catalyst-reminders.ics?limit=200&preference=subscribe&q=Earnings&activeOnly=1');
  });

  it('fetches pre-trade audit rows with encoded filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      generatedAt: '2026-05-10T00:00:00.000Z',
      metrics: {
        total: 1,
        confirmations: 0,
        reopened: 0,
        blockers: 1,
        evidence: 0,
        blocked: 1,
        ready: 0,
      },
      items: [{
        id: 'evt-1',
        eventId: 'evt-1',
        opportunityId: 'opp-1',
        category: 'catalyst_blocker',
        eventType: 'catalyst_reminder_updated',
        label: 'Coverage date pending',
        detail: 'Urgency missing_date',
        timestamp: '2026-05-10T00:00:00.000Z',
        status: 'block',
        readiness: 'blocked',
        message: 'Catalyst reminder subscribed',
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityPreTradeAudit({
      limit: 25,
      opportunityId: 'opp-1',
      category: 'catalyst_blocker',
      status: 'block',
      q: 'coverage',
    })).resolves.toMatchObject({
      metrics: { blockers: 1 },
      items: [{ category: 'catalyst_blocker', status: 'block' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/opportunity-pretrade-audit?limit=25&opportunityId=opp-1&category=catalyst_blocker&status=block&q=coverage',
      {
        method: 'GET',
        headers: expect.any(Headers),
      },
    );
  });

  it('fetches review playback rows with encoded filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      generatedAt: '2026-05-10T00:00:00.000Z',
      metrics: {
        total: 1,
        missions: 1,
        pretrade: 0,
        evidence: 0,
        catalysts: 0,
        risks: 1,
        positives: 0,
        warnings: 0,
      },
      outcome: {
        status: 'review',
        headline: '1 条需要复核',
        detail: 'Mission 失败 1 条。',
        nextStep: '复核失败 Mission。',
        score: 25,
        blockers: 0,
        failedMissions: 1,
        completedMissions: 0,
        evidenceRecorded: 0,
        evidenceInvalidated: 0,
      },
      performance: {
        status: 'risk_hit',
        headline: '风险信号已命中',
        detail: '当前只有事件信号。',
        nextStep: '复核失败 Mission。',
        opportunityCount: 1,
        triggeredCatalysts: 0,
        pretradeBlockHit: false,
        pretradeBlockers: 0,
        riskEvents: 1,
        dataQuality: 'event_only',
        notes: ['当前 performance 只使用事件信号。'],
        exitSignal: {
          at: '2026-05-10T00:00:00.000Z',
          label: 'Mission failed',
          eventId: 'evt-1',
          category: 'mission',
          confidence: 'observed',
        },
      },
      items: [{
        id: 'evt-1',
        eventId: 'evt-1',
        opportunityId: 'opp-1',
        opportunityTitle: 'AI relay chain',
        timestamp: '2026-05-10T00:00:00.000Z',
        category: 'mission',
        tone: 'negative',
        eventType: 'mission_failed',
        label: 'Mission failed',
        detail: 'TradingAgents timeout',
        chips: ['MISSION', 'NEGATIVE'],
        missionId: 'mission-1',
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityReviewPlayback({
      limit: 25,
      opportunityId: 'opp-1',
      category: 'mission',
      tone: 'negative',
      q: 'timeout',
    })).resolves.toMatchObject({
      metrics: { risks: 1 },
      outcome: { status: 'review', failedMissions: 1 },
      performance: { status: 'risk_hit', riskEvents: 1 },
      items: [{ category: 'mission', tone: 'negative', missionId: 'mission-1' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/opportunity-review-playback?limit=25&opportunityId=opp-1&category=mission&tone=negative&q=timeout',
      {
        method: 'GET',
        headers: expect.any(Headers),
      },
    );
  });

  it('fetches and refreshes opportunity price history diagnostics', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        generatedAt: '2026-05-10T12:00:00.000Z',
        cachePath: 'data/price-history.json',
        staleAfterHours: 12,
        trackedSymbols: ['AAOI'],
        cachedSymbols: ['AAOI'],
        metrics: {
          tracked: 1,
          cached: 1,
          fresh: 1,
          stale: 0,
          missing: 0,
          orphan: 0,
          totalPoints: 30,
          coveragePct: 100,
        },
        series: [{
          symbol: 'AAOI',
          status: 'fresh',
          pointCount: 30,
          updatedAt: '2026-05-10T00:00:00.000Z',
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        generatedAt: '2026-05-10T12:00:00.000Z',
        cachePath: 'data/price-history.json',
        requestedSymbols: ['AAOI'],
        refreshed: 1,
        skippedFresh: 0,
        failed: 0,
        items: [{
          symbol: 'AAOI',
          status: 'refreshed',
          fetchedPoints: 60,
          cachedPoints: 60,
        }],
        diagnostics: {
          generatedAt: '2026-05-10T12:00:00.000Z',
          cachePath: 'data/price-history.json',
          staleAfterHours: 12,
          trackedSymbols: ['AAOI'],
          cachedSymbols: ['AAOI'],
          metrics: {
            tracked: 1,
            cached: 1,
            fresh: 1,
            stale: 0,
            missing: 0,
            orphan: 0,
            totalPoints: 60,
            coveragePct: 100,
          },
          series: [],
        },
      }, 202));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityPriceHistoryDiagnostics(12)).resolves.toMatchObject({
      metrics: { coveragePct: 100 },
      series: [{ symbol: 'AAOI', status: 'fresh' }],
    });
    await expect(refreshOpportunityPriceHistory({
      symbols: ['AAOI'],
      limit: 60,
      force: true,
      staleAfterHours: 12,
    })).resolves.toMatchObject({
      success: true,
      refreshed: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/opportunities/price-history/diagnostics?staleAfterHours=12', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/opportunities/price-history/refresh', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        symbols: ['AAOI'],
        limit: 60,
        force: true,
        staleAfterHours: 12,
      }),
    });
  });

  it('records field evidence audit payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      event: { id: 'evt-1', type: 'field_evidence_recorded' },
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordOpportunityFieldEvidence('opp-1', {
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'score',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'Reviewed latest evidence pack.',
    })).resolves.toEqual({
      event: { id: 'evt-1', type: 'field_evidence_recorded' },
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/field-evidence', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        field: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
        source: 'manual_review',
        confidence: 'confirmed',
        note: 'Reviewed latest evidence pack.',
      }),
    });
  });

  it('fetches field evidence page envelopes with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: 'evidence-1', opportunityId: 'opp-1', field: 'scores.relayScore' }],
      pageInfo: {
        limit: 25,
        nextCursor: 'cursor-2',
        hasMore: true,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityFieldEvidencePage({
      limit: 25,
      cursor: 'cursor-1',
      q: 'relay',
      status: 'active',
      confidence: 'confirmed',
      kind: 'score',
      source: 'manual_review',
    })).resolves.toEqual({
      items: [{ id: 'evidence-1', opportunityId: 'opp-1', field: 'scores.relayScore' }],
      pageInfo: {
        limit: 25,
        nextCursor: 'cursor-2',
        hasMore: true,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/opportunity-field-evidence?limit=25&cursor=cursor-1&envelope=1&source=manual_review&kind=score&confidence=confirmed&status=active&q=relay',
      {
        method: 'GET',
        headers: expect.any(Headers),
      },
    );
  });

  it('updates field evidence status in bulk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: 'completed',
      action: 'invalidate',
      total: 1,
      invalidated: 1,
      restored: 0,
      notFound: 0,
      failed: 0,
      items: [{
        index: 0,
        opportunityId: 'opp-1',
        evidenceId: 'evt-1',
        action: 'invalidate',
        status: 'invalidated',
      }],
    }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateOpportunityFieldEvidenceBulkStatus({
      action: 'invalidate',
      reason: 'Batch review.',
      items: [{
        opportunityId: 'opp-1',
        evidenceId: 'evt-1',
        field: 'scores.relayScore',
        source: 'manual_review',
      }],
    })).resolves.toEqual({
      status: 'completed',
      action: 'invalidate',
      total: 1,
      invalidated: 1,
      restored: 0,
      notFound: 0,
      failed: 0,
      items: [{
        index: 0,
        opportunityId: 'opp-1',
        evidenceId: 'evt-1',
        action: 'invalidate',
        status: 'invalidated',
      }],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunity-field-evidence/bulk-status', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        action: 'invalidate',
        reason: 'Batch review.',
        items: [{
          opportunityId: 'opp-1',
          evidenceId: 'evt-1',
          field: 'scores.relayScore',
          source: 'manual_review',
        }],
      }),
    });
  });

  it('fetches and runs field evidence repair plans', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        status: 'actionable',
        checkedAt: '2026-05-09T00:00:00.000Z',
        recordedEvents: 2,
        canonicalRows: 1,
        totalActions: 1,
        automaticActions: 1,
        manualReviewActions: 0,
        blockedActions: 0,
        sampledActions: [{
          evidenceId: 'evt-1',
          issueCode: 'missing_canonical',
          action: 'backfill_canonical',
          safety: 'automatic',
          reason: 'Replay event metadata.',
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        checkedAt: '2026-05-09T00:00:01.000Z',
        requestedEvidenceIds: ['evt-1'],
        notFoundEvidenceIds: [],
        totalEvidence: 2,
        totalActions: 1,
        eligibleActions: 1,
        applied: 1,
        skippedHealthy: 0,
        skippedManualReview: 0,
        blocked: 0,
        updatedEvidenceIds: ['evt-1'],
        skippedActions: [],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityFieldEvidenceRepairPlan()).resolves.toMatchObject({
      status: 'actionable',
      automaticActions: 1,
    });
    await expect(repairOpportunityFieldEvidence(['evt-1'])).resolves.toMatchObject({
      applied: 1,
      updatedEvidenceIds: ['evt-1'],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/diagnostics/opportunity-field-evidence/repair-plan', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/diagnostics/opportunity-field-evidence/repair', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ evidenceIds: ['evt-1'] }),
    });
  });

  it('records field evidence batch audit payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      batchId: 'batch-1',
      total: 1,
      recorded: 1,
      duplicates: 0,
      failed: 0,
      items: [{ index: 0, clientId: 'draft-1', field: 'scores.relayScore', status: 'recorded' }],
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordOpportunityFieldEvidenceBatch('opp-1', {
      batchId: 'batch-1',
      items: [{
        clientId: 'draft-1',
        field: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
        source: 'manual_review',
        confidence: 'confirmed',
        value: '82',
        note: 'Reviewed latest evidence pack.',
      }],
    })).resolves.toEqual({
      batchId: 'batch-1',
      total: 1,
      recorded: 1,
      duplicates: 0,
      failed: 0,
      items: [{ index: 0, clientId: 'draft-1', field: 'scores.relayScore', status: 'recorded' }],
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/field-evidence/batch', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        batchId: 'batch-1',
        items: [{
          clientId: 'draft-1',
          field: 'scores.relayScore',
          label: 'Relay score',
          kind: 'score',
          source: 'manual_review',
          confidence: 'confirmed',
          value: '82',
          note: 'Reviewed latest evidence pack.',
        }],
      }),
    });
  });

  it('fetches field registry audit history with encoded filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      { id: 'audit-1', field: 'scores.relayScore', action: 'upsert' },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityFieldRegistryAudit({
      field: 'scores.relayScore',
      limit: 5,
    })).resolves.toEqual([
      { id: 'audit-1', field: 'scores.relayScore', action: 'upsert' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunity-field-registry/history?field=scores.relayScore&limit=5', {
      method: 'GET',
      headers: expect.any(Headers),
    });
  });

  it('fetches field registry report, export, and import payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        totalFields: 2,
        overriddenFields: 1,
        fields: [{ field: 'scores.relayScore' }],
        recentAudit: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        version: 1,
        items: [{ field: 'scores.relayScore', label: 'Relay momentum score' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        dryRun: true,
        total: 1,
        created: 1,
        updated: 0,
        unchanged: 0,
        failed: 0,
        items: [{ index: 0, field: 'scores.relayScore', status: 'created' }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunityFieldRegistryReport()).resolves.toEqual(expect.objectContaining({
      totalFields: 2,
      overriddenFields: 1,
    }));
    await expect(exportOpportunityFieldRegistry()).resolves.toEqual(expect.objectContaining({
      version: 1,
      items: [expect.objectContaining({ field: 'scores.relayScore' })],
    }));
    await expect(importOpportunityFieldRegistry({
      dryRun: true,
      updatedBy: 'dashboard-import',
      items: [{
        field: 'scores.relayScore',
        label: 'Relay momentum score',
        source: 'manual_registry',
      }],
    })).resolves.toEqual(expect.objectContaining({
      dryRun: true,
      created: 1,
    }));

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/opportunity-field-registry/report', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/opportunity-field-registry/export', {
      method: 'GET',
      headers: expect.any(Headers),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/opportunity-field-registry/import', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        dryRun: true,
        updatedBy: 'dashboard-import',
        items: [{
          field: 'scores.relayScore',
          label: 'Relay momentum score',
          source: 'manual_registry',
        }],
      }),
    });
  });

  it('invalidates field evidence audit payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      event: { id: 'evt-2', type: 'field_evidence_invalidated' },
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(invalidateOpportunityFieldEvidence('opp-1', 'evt-1', {
      reason: 'Manual review superseded this evidence.',
      field: 'scores.relayScore',
      source: 'manual_review',
    })).resolves.toEqual({
      event: { id: 'evt-2', type: 'field_evidence_invalidated' },
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/field-evidence/evt-1/invalidate', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        reason: 'Manual review superseded this evidence.',
        field: 'scores.relayScore',
        source: 'manual_review',
      }),
    });
  });

  it('restores field evidence audit payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      event: { id: 'evt-3', type: 'field_evidence_restored' },
      opportunity: { id: 'opp-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreOpportunityFieldEvidence('opp-1', 'evt-1', {
      reason: 'Manual review restored this evidence.',
      field: 'scores.relayScore',
      source: 'manual_review',
    })).resolves.toEqual({
      event: { id: 'evt-3', type: 'field_evidence_restored' },
      opportunity: { id: 'opp-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/opportunities/opp-1/field-evidence/evt-1/restore', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({
        reason: 'Manual review restored this evidence.',
        field: 'scores.relayScore',
        source: 'manual_review',
      }),
    });
  });
});
