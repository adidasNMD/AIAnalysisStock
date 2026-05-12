import { describe, expect, it, vi } from 'vitest';
import type { OpportunityQueryDependencies } from '../server/services/opportunity-query-service';
import type { OpportunityEventRecord } from '../workflows';

describe('opportunity query service', () => {
  it('lists global opportunity events with an explicit limit', async () => {
    const { listOpportunityEventsForApi } = await import('../server/services/opportunity-query-service');
    const events = [{ id: 'event-1', type: 'updated' }];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
    };

    const result = await listOpportunityEventsForApi(25, deps);

    expect(deps.listOpportunityEvents).toHaveBeenCalledWith(undefined, 25, []);
    expect(result).toEqual(events);
  });

  it('parses opportunity event type filters from csv or repeated query values', async () => {
    const { parseOpportunityEventTypeFilter } = await import('../server/services/opportunity-query-service');

    expect(parseOpportunityEventTypeFilter('pretrade_confirmed, catalyst_reminder_updated, field_evidence_recorded, field_evidence_invalidated, field_evidence_restored, mission_failed')).toEqual({
      types: ['pretrade_confirmed', 'catalyst_reminder_updated', 'field_evidence_recorded', 'field_evidence_invalidated', 'field_evidence_restored', 'mission_failed'],
      invalid: [],
    });
    expect(parseOpportunityEventTypeFilter(['pretrade_unconfirmed', 'bad_type'])).toEqual({
      types: ['pretrade_unconfirmed'],
      invalid: ['bad_type'],
    });
  });

  it('lists events and heat history for a selected opportunity', async () => {
    const {
      getOpportunityHeatHistoryForApi,
      listOpportunityEventsForOpportunityApi,
    } = await import('../server/services/opportunity-query-service');
    const events = [{ id: 'event-1', type: 'mission_completed' }];
    const history = [{ snapshotId: 'snap-1', relayScore: 88 }];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      getOpportunityHeatHistory: vi.fn(async () => history) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
    };

    await expect(listOpportunityEventsForOpportunityApi('opp-1', 12, deps, [
      'pretrade_confirmed',
      'pretrade_unconfirmed',
      'catalyst_reminder_updated',
    ])).resolves.toEqual(events);
    await expect(getOpportunityHeatHistoryForApi('opp-1', 5, deps)).resolves.toEqual(history);
    expect(deps.listOpportunityEvents).toHaveBeenCalledWith('opp-1', 12, [
      'pretrade_confirmed',
      'pretrade_unconfirmed',
      'catalyst_reminder_updated',
    ]);
    expect(deps.getOpportunityHeatHistory).toHaveBeenCalledWith('opp-1', 5);
  });

  it('parses field evidence filters and lists cross-opportunity evidence rows', async () => {
    const {
      listOpportunityFieldEvidenceForApi,
      parseOpportunityFieldEvidenceFilters,
    } = await import('../server/services/opportunity-query-service');
    const rows = [{ id: 'evidence-1', opportunityId: 'opp-1', field: 'scores.relayScore' }];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityFieldEvidenceIndex: vi.fn(async () => rows) as OpportunityQueryDependencies['listOpportunityFieldEvidenceIndex'],
    };
    const parsed = parseOpportunityFieldEvidenceFilters({
      q: 'relay',
      field: 'scores.relayScore',
      source: 'manual_review',
      status: 'active',
      confidence: 'confirmed',
      kind: 'score',
    });

    expect(parsed).toEqual({
      invalid: [],
      filters: {
        q: 'relay',
        field: 'scores.relayScore',
        source: 'manual_review',
        status: 'active',
        confidence: 'confirmed',
        kind: 'score',
      },
    });
    await expect(listOpportunityFieldEvidenceForApi({ limit: 25, offset: 50 }, parsed.filters, deps)).resolves.toEqual(rows);
    expect(deps.listOpportunityFieldEvidenceIndex).toHaveBeenCalledWith({
      limit: 26,
      offset: 50,
      filters: parsed.filters,
    });
  });

  it('rejects invalid field evidence enum filters', async () => {
    const { parseOpportunityFieldEvidenceFilters } = await import('../server/services/opportunity-query-service');

    expect(parseOpportunityFieldEvidenceFilters({
      status: 'deleted',
      confidence: 'certain',
      kind: 'metric',
      q: 'relay',
    })).toEqual({
      filters: { q: 'relay' },
      invalid: ['status:deleted', 'kind:metric', 'confidence:certain'],
    });
  });

  it('lists catalyst reminder audits and marks only the latest subscription as active', async () => {
    const {
      listOpportunityCatalystReminderAuditForApi,
      parseOpportunityCatalystReminderFilters,
    } = await import('../server/services/opportunity-query-service');
    const events = [
      {
        id: 'evt-unsubscribe',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder unsubscribed',
        timestamp: '2026-05-10T12:00:00.000Z',
        meta: {
          reminderId: 'reminder-a',
          catalystLabel: 'Earnings',
          preference: 'unsubscribe',
        },
      },
      {
        id: 'evt-subscribe',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder subscribed',
        timestamp: '2026-05-10T10:00:00.000Z',
        meta: {
          reminderId: 'reminder-a',
          catalystLabel: 'Earnings',
          catalystDueAt: '2026-05-12T13:00:00.000Z',
          urgency: 'soon',
          actionKind: 'prepare',
          preference: 'subscribe',
          subscriptionLeadDays: 3,
        },
      },
      {
        id: 'evt-active-subscribe',
        opportunityId: 'opp-2',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder subscribed',
        timestamp: '2026-05-10T09:00:00.000Z',
        meta: {
          reminderId: 'reminder-b',
          catalystLabel: 'FDA decision',
          catalystDueAt: '2026-05-20T13:00:00.000Z',
          preference: 'subscribe',
          subscriptionLeadDays: 5,
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
    };
    const parsed = parseOpportunityCatalystReminderFilters({
      activeOnly: '1',
      preference: 'subscribe',
      q: 'FDA',
    });

    const result = await listOpportunityCatalystReminderAuditForApi(20, parsed.filters, deps);

    expect(parsed.invalid).toEqual([]);
    expect(deps.listOpportunityEvents).toHaveBeenCalledWith(undefined, 80, ['catalyst_reminder_updated']);
    expect(result.metrics).toMatchObject({
      total: 1,
      subscribed: 1,
      activeSubscriptions: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      eventId: 'evt-active-subscribe',
      reminderId: 'reminder-b',
      catalystLabel: 'FDA decision',
      preference: 'subscribe',
      activeSubscription: true,
      subscriptionLeadDays: 5,
    });
  });

  it('builds an ICS feed for active catalyst reminder subscriptions only', async () => {
    const { buildOpportunityCatalystReminderCalendarForApi } = await import('../server/services/opportunity-query-service');
    const events = [
      {
        id: 'evt-subscribe-active',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder subscribed',
        timestamp: '2026-05-10T10:00:00.000Z',
        meta: {
          reminderId: 'reminder-active',
          catalystLabel: 'Earnings, call',
          catalystDueAt: '2026-05-12T13:00:00.000Z',
          urgency: 'soon',
          actionKind: 'prepare',
          preference: 'subscribe',
          subscriptionLeadDays: 3,
          note: 'Watch guidance',
        },
      },
      {
        id: 'evt-ack',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder acknowledged',
        timestamp: '2026-05-10T09:00:00.000Z',
        meta: {
          reminderId: 'reminder-ack',
          catalystLabel: 'Old catalyst',
          catalystDueAt: '2026-05-11T13:00:00.000Z',
          preference: 'acknowledge',
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
    };

    const calendar = await buildOpportunityCatalystReminderCalendarForApi(20, {}, deps);

    expect(calendar.itemCount).toBe(1);
    expect(calendar.content).toContain('BEGIN:VCALENDAR');
    expect(calendar.content).toContain('BEGIN:VEVENT');
    expect(calendar.content).toContain('SUMMARY:Earnings\\, call (opp-1)');
    expect(calendar.content).toContain('TRIGGER:-P3D');
    expect(calendar.content).not.toContain('Old catalyst');
  });

  it('rejects invalid catalyst reminder preference filters', async () => {
    const { parseOpportunityCatalystReminderFilters } = await import('../server/services/opportunity-query-service');

    expect(parseOpportunityCatalystReminderFilters({
      preference: 'later',
      activeOnly: 'true',
      opportunityId: 'opp-1',
    })).toEqual({
      filters: {
        activeOnly: true,
        opportunityId: 'opp-1',
      },
      invalid: ['preference:later'],
    });
  });

  it('parses pre-trade audit filters and rejects invalid values', async () => {
    const { parseOpportunityPreTradeAuditFilters } = await import('../server/services/opportunity-query-service');

    expect(parseOpportunityPreTradeAuditFilters({
      opportunityId: 'opp-1',
      category: 'catalyst_blocker',
      status: 'block',
      q: 'coverage',
    })).toEqual({
      filters: {
        opportunityId: 'opp-1',
        category: 'catalyst_blocker',
        status: 'block',
        q: 'coverage',
      },
      invalid: [],
    });
    expect(parseOpportunityPreTradeAuditFilters({
      category: 'calendar',
      status: 'fatal',
      q: 'relay',
    })).toEqual({
      filters: { q: 'relay' },
      invalid: ['category:calendar', 'status:fatal'],
    });
  });

  it('builds a cross-opportunity pre-trade audit from confirmations, blockers, and field evidence', async () => {
    const { listOpportunityPreTradeAuditForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-pretrade-block',
        opportunityId: 'opp-1',
        type: 'pretrade_confirmed',
        message: 'Pre-trade check confirmed',
        timestamp: '2026-05-10T12:00:00.000Z',
        meta: {
          label: 'Catalyst window',
          status: 'block',
          readiness: 'blocked',
          actionKind: 'fill_date',
          catalystUrgency: 'missing_date',
          evidence: 'Company calendar pending.',
        },
      },
      {
        id: 'evt-catalyst-blocker',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder subscribed',
        timestamp: '2026-05-10T11:00:00.000Z',
        meta: {
          catalystLabel: 'Coverage date pending',
          urgency: 'missing_date',
          actionKind: 'fill_date',
          preference: 'subscribe',
          note: 'Need the exact coverage date.',
        },
      },
      {
        id: 'evt-catalyst-soon',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder snoozed',
        timestamp: '2026-05-10T10:00:00.000Z',
        meta: {
          catalystLabel: 'Supplier earnings',
          urgency: 'soon',
          actionKind: 'prepare',
          preference: 'snooze',
        },
      },
      {
        id: 'evt-evidence',
        opportunityId: 'opp-2',
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-05-10T09:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'manual_review',
          confidence: 'confirmed',
          note: 'Reviewed evidence packet.',
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
    };

    const all = await listOpportunityPreTradeAuditForApi(50, {}, deps);
    const filtered = await listOpportunityPreTradeAuditForApi(50, {
      category: 'catalyst_blocker',
      status: 'block',
      q: 'coverage',
    }, deps);

    expect(deps.listOpportunityEvents).toHaveBeenNthCalledWith(1, undefined, 250, [
      'pretrade_confirmed',
      'pretrade_unconfirmed',
      'catalyst_reminder_updated',
      'field_evidence_recorded',
      'field_evidence_invalidated',
      'field_evidence_restored',
    ]);
    expect(all.metrics).toMatchObject({
      total: 3,
      confirmations: 1,
      blockers: 1,
      evidence: 1,
      blocked: 2,
    });
    expect(all.items.map((item) => item.eventId)).toEqual([
      'evt-pretrade-block',
      'evt-catalyst-blocker',
      'evt-evidence',
    ]);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      eventId: 'evt-catalyst-blocker',
      category: 'catalyst_blocker',
      status: 'block',
      readiness: 'blocked',
      label: 'Coverage date pending',
    });
  });

  it('parses review playback filters and rejects invalid values', async () => {
    const { parseOpportunityReviewPlaybackFilters } = await import('../server/services/opportunity-query-service');

    expect(parseOpportunityReviewPlaybackFilters({
      opportunityId: 'opp-1',
      category: 'mission',
      tone: 'negative',
      q: 'failed',
      backtestTicker: 'aaoi',
      backtestStrategy: 'relay_chain',
      backtestFrom: '2026-05-01',
      backtestTo: '2026-05-31',
    })).toEqual({
      filters: {
        opportunityId: 'opp-1',
        category: 'mission',
        tone: 'negative',
        q: 'failed',
        backtestTicker: 'AAOI',
        backtestStrategy: 'relay_chain',
        backtestFrom: '2026-05-01',
        backtestTo: '2026-05-31',
      },
      invalid: [],
    });
    expect(parseOpportunityReviewPlaybackFilters({
      category: 'calendar',
      tone: 'fatal',
      q: 'relay',
      backtestFrom: 'not-a-date',
      backtestTo: '2026-05-01',
      backtestStrategy: 'momentum_chase',
    })).toEqual({
      filters: { q: 'relay', backtestTo: '2026-05-01' },
      invalid: ['backtestStrategy:momentum_chase', 'backtestFrom:not-a-date', 'category:calendar', 'tone:fatal'],
    });
    expect(parseOpportunityReviewPlaybackFilters({
      backtestFrom: '2026-06-01',
      backtestTo: '2026-05-01',
    })).toEqual({
      filters: { backtestFrom: '2026-06-01', backtestTo: '2026-05-01' },
      invalid: ['backtestRange'],
    });
  });

  it('builds review playback rows across mission, pre-trade, catalyst, evidence, and thesis events', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-mission-failed',
        opportunityId: 'opp-1',
        type: 'mission_failed',
        message: 'TradingAgents timeout',
        timestamp: '2026-05-10T12:00:00.000Z',
        meta: { missionId: 'mission-1', runId: 'run-1' },
      },
      {
        id: 'evt-pretrade-block',
        opportunityId: 'opp-1',
        type: 'pretrade_confirmed',
        message: 'Pre-trade check confirmed',
        timestamp: '2026-05-10T11:00:00.000Z',
        meta: {
          label: 'Catalyst window',
          status: 'block',
          readiness: 'blocked',
          actionKind: 'fill_date',
          catalystUrgency: 'missing_date',
          evidence: 'Company calendar pending.',
        },
      },
      {
        id: 'evt-catalyst-blocker',
        opportunityId: 'opp-1',
        type: 'catalyst_reminder_updated',
        message: 'Catalyst reminder subscribed',
        timestamp: '2026-05-10T10:00:00.000Z',
        meta: {
          catalystLabel: 'Coverage date pending',
          urgency: 'missing_date',
          actionKind: 'fill_date',
          preference: 'subscribe',
          note: 'Need coverage date before sizing.',
        },
      },
      {
        id: 'evt-evidence',
        opportunityId: 'opp-1',
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-05-10T09:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'manual_review',
          confidence: 'confirmed',
          note: 'Reviewed evidence packet.',
        },
      },
      {
        id: 'evt-thesis',
        opportunityId: 'opp-2',
        type: 'thesis_degraded',
        message: 'Leader broke the relay chain',
        timestamp: '2026-05-10T08:00:00.000Z',
        meta: { reason: 'Leader weakness' },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          latestMissionId: 'mission-latest',
        },
        {
          id: 'opp-2',
          title: 'Proxy narrative',
          type: 'proxy_narrative',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
    };

    const all = await listOpportunityReviewPlaybackForApi(50, {}, deps);
    const filtered = await listOpportunityReviewPlaybackForApi(50, {
      category: 'mission',
      tone: 'negative',
      q: 'timeout',
    }, deps);

    expect(deps.listOpportunityEvents).toHaveBeenNthCalledWith(1, undefined, 300, [
      'created',
      'updated',
      'mission_linked',
      'mission_queued',
      'mission_completed',
      'mission_failed',
      'mission_canceled',
      'signal_changed',
      'thesis_upgraded',
      'thesis_degraded',
      'leader_broken',
      'relay_triggered',
      'proxy_ignited',
      'catalyst_due',
      'catalyst_reminder_updated',
      'pretrade_confirmed',
      'pretrade_unconfirmed',
      'field_evidence_recorded',
      'field_evidence_invalidated',
      'field_evidence_restored',
    ]);
    expect(all.metrics).toMatchObject({
      total: 5,
      missions: 1,
      pretrade: 1,
      evidence: 1,
      catalysts: 1,
      risks: 4,
      positives: 1,
    });
    expect(all.outcome).toMatchObject({
      status: 'blocked',
      headline: '2 个执行前阻塞',
      blockers: 2,
      failedMissions: 1,
      evidenceRecorded: 1,
      score: 68,
    });
    expect(all.performance).toMatchObject({
      status: 'multi_opportunity',
      opportunityCount: 2,
      dataQuality: 'event_only',
    });
    expect(all.items[0]).toMatchObject({
      eventId: 'evt-mission-failed',
      category: 'mission',
      tone: 'negative',
      opportunityTitle: 'AI relay chain',
      missionId: 'mission-1',
      runId: 'run-1',
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      eventId: 'evt-mission-failed',
      label: 'Mission failed',
      detail: 'TradingAgents timeout',
    });
    expect(filtered.outcome).toMatchObject({
      status: 'review',
      failedMissions: 1,
      blockers: 0,
    });
    expect(filtered.performance).toMatchObject({
      status: 'risk_hit',
      riskEvents: 1,
      dataQuality: 'event_only',
    });
  });

  it('aggregates review playback risk backtest across opportunity slices', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-relay-entry',
        opportunityId: 'opp-relay',
        type: 'relay_triggered',
        message: 'Relay entry confirmed',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          entryPrice: 100,
          quantity: 100,
          positionPct: 10,
          stopLossPrice: 90,
          targetPrice: 130,
          riskBudgetPct: 2,
        },
      },
      {
        id: 'evt-relay-exit',
        opportunityId: 'opp-relay',
        type: 'leader_broken',
        message: 'Relay target exit',
        timestamp: '2026-05-03T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          exitPrice: 112,
          quantity: 100,
          exitReason: 'target_hit',
        },
      },
      {
        id: 'evt-proxy-entry',
        opportunityId: 'opp-proxy',
        type: 'proxy_ignited',
        message: 'Proxy entry confirmed',
        timestamp: '2026-05-02T10:00:00.000Z',
        meta: {
          symbol: 'CRWV',
          entryPrice: 50,
          quantity: 200,
          positionPct: 20,
          stopLossPrice: 45,
          targetPrice: 70,
          riskBudgetPct: 1,
        },
      },
      {
        id: 'evt-proxy-exit',
        opportunityId: 'opp-proxy',
        type: 'leader_broken',
        message: 'Proxy stop exit',
        timestamp: '2026-05-04T10:00:00.000Z',
        meta: {
          symbol: 'CRWV',
          exitPrice: 44,
          quantity: 200,
          exitReason: 'stop_loss',
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-relay',
          title: 'AI relay chain',
          type: 'relay_chain',
          stage: 'active',
          status: 'active',
          primaryTicker: 'AAOI',
        },
        {
          id: 'opp-proxy',
          title: 'AI proxy narrative',
          type: 'proxy_narrative',
          stage: 'tracking',
          status: 'degraded',
          primaryTicker: 'CRWV',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-05T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, {}, deps);

    expect(result.performance).toEqual(expect.objectContaining({
      status: 'multi_opportunity',
      opportunityCount: 2,
      dataQuality: 'price_confirmed',
    }));
    expect(result.performance.trades).toHaveLength(2);
    expect(result.performance.position).toEqual(expect.objectContaining({
      closedLegs: 2,
      partialLegs: 0,
      openLegs: 0,
      sizedLegs: 2,
    }));
    expect(result.performance.riskBacktest).toEqual(expect.objectContaining({
      verdict: 'unfavorable',
      label: 'Unfavorable',
      sampleSize: 2,
      closedLegs: 2,
      pricedLegs: 2,
      opportunityCount: 2,
      opportunitiesWithTrades: 2,
      opportunitiesWithPricedTrades: 2,
      winRatePct: 50,
      avgReturnPct: 0,
      avgMaxDrawdownPct: -6,
      avgRiskAtStopPct: 1.5,
      avgRiskBudgetUsedPct: 125,
      oversizedLegs: 1,
      planRepairLegs: 0,
    }));
    expect(result.performance.riskBacktest.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'opportunity_type',
        key: 'relay_chain',
        label: 'Relay chain',
        verdict: 'favorable',
        verdictLabel: 'Favorable',
        opportunityCount: 1,
        pricedLegs: 1,
        avgReturnPct: 12,
      }),
      expect.objectContaining({
        kind: 'opportunity_type',
        key: 'proxy_narrative',
        label: 'Proxy narrative',
        verdict: 'unfavorable',
        verdictLabel: 'Unfavorable',
        opportunityCount: 1,
        pricedLegs: 1,
        avgReturnPct: -12,
        oversizedLegs: 1,
      }),
      expect.objectContaining({
        kind: 'stage',
        key: 'active',
        label: 'Active',
        verdict: 'favorable',
      }),
      expect.objectContaining({
        kind: 'status',
        key: 'degraded',
        label: 'Degraded',
        verdict: 'unfavorable',
      }),
    ]));
    expect(result.performance.strategyBacktest).toEqual(expect.objectContaining({
      status: 'ready',
      headline: '2 个策略族已有回测样本',
      totalStrategies: 2,
      coveredStrategies: 2,
      opportunityCount: 2,
      pricedLegs: 2,
      closedLegs: 2,
      bestGroup: expect.objectContaining({
        key: 'relay_chain',
        label: 'Relay chain',
        verdict: 'favorable',
        avgReturnPct: 12,
        coveragePct: 100,
      }),
      weakestGroup: expect.objectContaining({
        key: 'proxy_narrative',
        label: 'Proxy narrative',
        verdict: 'unfavorable',
        avgReturnPct: -12,
        oversizedLegs: 1,
      }),
    }));
    expect(result.performance.strategyBacktest.groups).toEqual([
      expect.objectContaining({ key: 'relay_chain', label: 'Relay chain' }),
      expect.objectContaining({ key: 'proxy_narrative', label: 'Proxy narrative' }),
    ]);

    const tickerFiltered = await listOpportunityReviewPlaybackForApi(50, {
      backtestTicker: 'AAOI',
      backtestFrom: '2026-05-01',
      backtestTo: '2026-05-03',
    }, deps);

    expect(tickerFiltered.items).toHaveLength(4);
    expect(tickerFiltered.performance.trades).toHaveLength(1);
    expect(tickerFiltered.performance.riskBacktest).toEqual(expect.objectContaining({
      verdict: 'favorable',
      sampleSize: 1,
      closedLegs: 1,
      pricedLegs: 1,
      winRatePct: 100,
      avgReturnPct: 12,
    }));
    expect(tickerFiltered.performance.strategyBacktest).toEqual(expect.objectContaining({
      status: 'ready',
      filterLabel: 'Ticker AAOI · From 2026-05-01 · To 2026-05-03',
      totalStrategies: 1,
      coveredStrategies: 1,
      ticker: 'AAOI',
      windowStart: '2026-05-01',
      windowEnd: '2026-05-03',
      bestGroup: expect.objectContaining({
        key: 'relay_chain',
        label: 'Relay chain',
        avgReturnPct: 12,
      }),
    }));

    const strategyFiltered = await listOpportunityReviewPlaybackForApi(50, {
      backtestStrategy: 'proxy_narrative',
    }, deps);

    expect(strategyFiltered.items).toHaveLength(4);
    expect(strategyFiltered.performance.trades).toHaveLength(1);
    expect(strategyFiltered.performance.riskBacktest).toEqual(expect.objectContaining({
      verdict: 'unfavorable',
      sampleSize: 1,
      closedLegs: 1,
      pricedLegs: 1,
      winRatePct: 0,
      avgReturnPct: -12,
    }));
    expect(strategyFiltered.performance.strategyBacktest).toEqual(expect.objectContaining({
      status: 'ready',
      filterLabel: 'Strategy Proxy narrative',
      totalStrategies: 1,
      coveredStrategies: 1,
      strategy: 'proxy_narrative',
      strategyLabel: 'Proxy narrative',
      bestGroup: expect.objectContaining({
        key: 'proxy_narrative',
        label: 'Proxy narrative',
        avgReturnPct: -12,
      }),
    }));
  });

  it('builds review playback performance from selected opportunity events and heat history', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-exit',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Leader failed to confirm the move',
        timestamp: '2026-05-05T10:00:00.000Z',
        meta: { reason: 'Leader broke below support' },
      },
      {
        id: 'evt-catalyst',
        opportunityId: 'opp-1',
        type: 'catalyst_due',
        message: 'Supplier earnings window',
        timestamp: '2026-05-03T10:00:00.000Z',
        meta: { catalystLabel: 'Supplier earnings' },
      },
      {
        id: 'evt-entry',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'Relay confirmed by bottleneck supplier',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: { reason: 'Bottleneck breadth confirmed' },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          scores: {
            purityScore: 82,
            scarcityScore: 76,
            tradeabilityScore: 71,
            relayScore: 70,
            catalystScore: 65,
            policyScore: 60,
          },
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => [
        {
          snapshotId: 'heat-1',
          createdAt: '2026-05-01T10:00:00.000Z',
          relayScore: 80,
          bottleneckCount: 2,
          laggardCount: 3,
        },
        {
          snapshotId: 'heat-2',
          createdAt: '2026-05-03T10:00:00.000Z',
          relayScore: 92,
          bottleneckCount: 3,
          laggardCount: 4,
        },
        {
          snapshotId: 'heat-3',
          createdAt: '2026-05-05T10:00:00.000Z',
          relayScore: 70,
          bottleneckCount: 1,
          laggardCount: 2,
        },
      ]) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);

    expect(deps.listOpportunityEvents).toHaveBeenCalledWith('opp-1', 300, [
      'created',
      'updated',
      'mission_linked',
      'mission_queued',
      'mission_completed',
      'mission_failed',
      'mission_canceled',
      'signal_changed',
      'thesis_upgraded',
      'thesis_degraded',
      'leader_broken',
      'relay_triggered',
      'proxy_ignited',
      'catalyst_due',
      'catalyst_reminder_updated',
      'pretrade_confirmed',
      'pretrade_unconfirmed',
      'field_evidence_recorded',
      'field_evidence_invalidated',
      'field_evidence_restored',
    ]);
    expect(deps.getOpportunityHeatHistory).toHaveBeenCalledWith('opp-1', 60);
    expect(result.performance).toMatchObject({
      status: 'risk_hit',
      opportunityCount: 1,
      triggeredCatalysts: 1,
      pretradeBlockHit: false,
      riskEvents: 2,
      dataQuality: 'heat_proxy',
      holdingDays: 4,
      heatStart: 80,
      heatEnd: 70,
      heatDelta: -10,
      heatHigh: 92,
      heatLow: 70,
      heatMaxDrawdownPct: -23.9,
      entrySignal: {
        eventId: 'evt-entry',
        label: 'Relay triggered',
      },
      exitSignal: {
        eventId: 'evt-exit',
        label: 'Leader broken',
      },
    });
  });

  it('upgrades review playback performance when entry and exit prices are present', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-exit',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Leader failed to confirm the move',
        timestamp: '2026-05-05T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          price: 70,
          reason: 'Leader broke below support',
        },
      },
      {
        id: 'evt-entry',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'Relay confirmed by bottleneck supplier',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          entryPrice: 80,
          reason: 'Bottleneck breadth confirmed',
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          primaryTicker: 'AAOI',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-06T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);

    expect(result.items.map((item) => ({
      eventId: item.eventId,
      symbol: item.symbol,
      price: item.price,
    }))).toEqual([
      { eventId: 'evt-exit', symbol: 'AAOI', price: 70 },
      { eventId: 'evt-entry', symbol: 'AAOI', price: 80 },
    ]);
    expect(result.performance).toMatchObject({
      status: 'risk_hit',
      symbol: 'AAOI',
      dataQuality: 'price_confirmed',
      priceSource: 'event_meta',
      priceAsOf: '2026-05-05T10:00:00.000Z',
      priceCache: {
        status: 'missing',
        symbol: 'AAOI',
        refreshPath: '/command-center',
      },
      returnPct: -12.5,
      maxDrawdownPct: -12.5,
      holdingDays: 4,
      entrySignal: {
        eventId: 'evt-entry',
        price: 80,
      },
      exitSignal: {
        eventId: 'evt-exit',
        price: 70,
      },
      trades: [{
        status: 'closed',
        symbol: 'AAOI',
        returnPct: -12.5,
        maxDrawdownPct: -12.5,
        priceSource: 'event_meta',
        dataQuality: 'price_confirmed',
        entry: {
          eventId: 'evt-entry',
          price: 80,
        },
        exit: {
          eventId: 'evt-exit',
          price: 70,
        },
      }],
    });
  });

  it('uses cached price history to calculate review playback return and drawdown windows', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-exit',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Leader failed to confirm the move',
        timestamp: '2026-05-05T10:00:00.000Z',
        meta: { symbol: 'AAOI', reason: 'Leader broke below support' },
      },
      {
        id: 'evt-entry',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'Relay confirmed by bottleneck supplier',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: { symbol: 'AAOI', reason: 'Bottleneck breadth confirmed' },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          primaryTicker: 'AAOI',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => [{
        symbol: 'AAOI',
        source: 'openbb:yfinance',
        updatedAt: '2026-05-06T00:00:00.000Z',
        points: [
          { at: '2026-05-01T10:00:00.000Z', close: 100 },
          { at: '2026-05-02T10:00:00.000Z', close: 115 },
          { at: '2026-05-03T10:00:00.000Z', close: 90 },
          { at: '2026-05-05T10:00:00.000Z', close: 110 },
        ],
      }]) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-06T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);

    expect(result.performance).toMatchObject({
      status: 'risk_hit',
      symbol: 'AAOI',
      dataQuality: 'price_confirmed',
      priceSource: 'price_history_cache',
      priceAsOf: '2026-05-05T10:00:00.000Z',
      pricePointCount: 4,
      priceWindowStart: '2026-05-01T10:00:00.000Z',
      priceWindowEnd: '2026-05-05T10:00:00.000Z',
      priceCache: {
        status: 'fresh',
        symbol: 'AAOI',
        source: 'openbb:yfinance',
        updatedAt: '2026-05-06T00:00:00.000Z',
        ageHours: 10,
        pointCount: 4,
        oldestPointAt: '2026-05-01T10:00:00.000Z',
        newestPointAt: '2026-05-05T10:00:00.000Z',
        refreshPath: '/command-center',
      },
      returnPct: 10,
      maxDrawdownPct: -21.7,
      peakReturnPct: 15,
      holdingDays: 4,
      entrySignal: {
        eventId: 'evt-entry',
        price: 100,
        confidence: 'inferred',
      },
      exitSignal: {
        eventId: 'evt-exit',
        price: 110,
        confidence: 'inferred',
      },
      trades: [{
        status: 'closed',
        symbol: 'AAOI',
        returnPct: 10,
        maxDrawdownPct: -21.7,
        peakReturnPct: 15,
        priceSource: 'price_history_cache',
        dataQuality: 'price_confirmed',
        entry: {
          eventId: 'evt-entry',
          price: 100,
          confidence: 'inferred',
        },
        exit: {
          eventId: 'evt-exit',
          price: 110,
          confidence: 'inferred',
        },
      }],
    });
  });

  it('pairs multiple review playback trade legs in event order', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-exit-2',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Second risk event',
        timestamp: '2026-05-08T10:00:00.000Z',
        meta: { symbol: 'AAOI', exitPrice: 130 },
      },
      {
        id: 'evt-entry-2',
        opportunityId: 'opp-1',
        type: 'proxy_ignited',
        message: 'Second entry',
        timestamp: '2026-05-07T10:00:00.000Z',
        meta: { symbol: 'AAOI', entryPrice: 125 },
      },
      {
        id: 'evt-exit-1',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'First risk event',
        timestamp: '2026-05-03T10:00:00.000Z',
        meta: { symbol: 'AAOI', exitPrice: 90 },
      },
      {
        id: 'evt-entry-1',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'First entry',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: { symbol: 'AAOI', entryPrice: 100 },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          primaryTicker: 'AAOI',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-09T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);

    expect(result.performance.trades).toHaveLength(2);
    expect(result.performance.trades).toEqual([
      expect.objectContaining({
        id: 'evt-entry-1:evt-exit-1',
        status: 'closed',
        symbol: 'AAOI',
        returnPct: -10,
        priceSource: 'event_meta',
        entry: expect.objectContaining({ eventId: 'evt-entry-1', price: 100 }),
        exit: expect.objectContaining({ eventId: 'evt-exit-1', price: 90 }),
      }),
      expect.objectContaining({
        id: 'evt-entry-2:evt-exit-2',
        status: 'closed',
        symbol: 'AAOI',
        returnPct: 4,
        priceSource: 'event_meta',
        entry: expect.objectContaining({ eventId: 'evt-entry-2', price: 125 }),
        exit: expect.objectContaining({ eventId: 'evt-exit-2', price: 130 }),
      }),
    ]);
  });

  it('keeps partial exits and open exposure in review playback position summary', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-exit-partial',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Trim after leader failed to confirm',
        timestamp: '2026-05-03T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          exitPrice: 110,
          quantity: 40,
          exitPct: 40,
          exitReason: 'risk_reduction',
        },
      },
      {
        id: 'evt-entry-sized',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'Sized relay entry',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          entryPrice: 100,
          quantity: 100,
          positionPct: 5,
          notionalUsd: 10000,
          stopLossPrice: 92,
          targetPrice: 125,
          riskBudgetPct: 1.5,
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          primaryTicker: 'AAOI',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-04T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);

    expect(result.performance.trades).toEqual([
      expect.objectContaining({
        id: 'evt-entry-sized:evt-exit-partial',
        status: 'partial',
        symbol: 'AAOI',
        entryQuantity: 100,
        exitQuantity: 40,
        remainingQuantity: 60,
        closedPct: 40,
        remainingPct: 60,
        positionPct: 2,
        notionalUsd: 4000,
        returnPct: 10,
        riskReward: expect.objectContaining({
          outcome: 'gain',
          exposurePct: 2,
          returnContributionPct: 0.2,
        }),
        exitAttribution: expect.objectContaining({
          kind: 'risk_reduction',
          label: 'Risk reduction',
          stopLossPrice: 92,
          targetPrice: 125,
          riskBudgetPct: 1.5,
          stopDistancePct: -8,
          targetUpsidePct: 25,
          exitVsStopPct: 19.6,
          exitVsTargetPct: -12,
          riskRewardRatio: 3.1,
        }),
        executionQuality: expect.objectContaining({
          status: 'early_exit',
          label: 'Early exit',
          planCompleteness: 'complete',
          targetCapturePct: 40,
          repairSuggestions: [],
        }),
        sizingRule: expect.objectContaining({
          status: 'scaled_down',
          label: 'Scaled down',
          severity: 'ok',
          exposurePct: 2,
          remainingExposurePct: 3,
          riskBudgetPct: 1.5,
          stopDistancePct: -8,
          riskAtStopPct: 0.2,
          riskBudgetUsedPct: 13.3,
        }),
      }),
      expect.objectContaining({
        id: 'evt-entry-sized:open',
        status: 'open',
        symbol: 'AAOI',
        entryQuantity: 100,
        remainingQuantity: 60,
        remainingPct: 60,
        positionPct: 3,
        notionalUsd: 6000,
        riskReward: expect.objectContaining({
          outcome: 'unknown',
          exposurePct: 3,
        }),
        executionQuality: expect.objectContaining({
          status: 'open_position',
          label: 'Open position',
          planCompleteness: 'complete',
          repairSuggestions: [],
        }),
        sizingRule: expect.objectContaining({
          status: 'open_exposure',
          label: 'Open exposure',
          severity: 'ok',
          exposurePct: 3,
          remainingExposurePct: 3,
          riskBudgetPct: 1.5,
          stopDistancePct: -8,
          riskAtStopPct: 0.2,
          riskBudgetUsedPct: 13.3,
        }),
      }),
    ]);
    expect(result.performance.position).toMatchObject({
      closedLegs: 0,
      partialLegs: 1,
      openLegs: 1,
      sizedLegs: 2,
      realizedReturnContributionPct: 0.2,
      drawdownContributionPct: 0,
      openExposurePct: 3,
      exitAttributions: [{
        kind: 'risk_reduction',
        label: 'Risk reduction',
        count: 1,
      }],
      executionQuality: [
        { status: 'early_exit', label: 'Early exit', count: 1 },
        { status: 'open_position', label: 'Open position', count: 1 },
      ],
      planRepairSuggestions: [],
      sizingRules: [
        { status: 'open_exposure', label: 'Open exposure', severity: 'ok', count: 1 },
        { status: 'scaled_down', label: 'Scaled down', severity: 'ok', count: 1 },
      ],
    });
    expect(result.performance.riskBacktest).toEqual(expect.objectContaining({
      verdict: 'favorable',
      label: 'Favorable',
      sampleSize: 2,
      closedLegs: 1,
      pricedLegs: 1,
      winRatePct: 100,
      avgReturnPct: 10,
      avgMaxDrawdownPct: 0,
      avgRiskAtStopPct: 0.2,
      avgRiskBudgetUsedPct: 13.3,
      oversizedLegs: 0,
      planRepairLegs: 0,
      executionIssueLegs: 0,
      realizedReturnContributionPct: 0.2,
      openExposurePct: 3,
    }));
  });

  it('surfaces plan repair suggestions for missing review playback trade plans', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-entry-missing-plan',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'Entry without a formal plan',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          entryPrice: 100,
        },
      },
      {
        id: 'evt-exit-missing-plan',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Closed after manual review',
        timestamp: '2026-05-03T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          exitPrice: 102,
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          primaryTicker: 'AAOI',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-04T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);
    const trade = result.performance.trades[0];

    expect(trade).toEqual(expect.objectContaining({
      status: 'closed',
      executionQuality: expect.objectContaining({
        status: 'missing_plan',
        label: 'Missing plan',
        planCompleteness: 'missing',
        repairSuggestions: [
          expect.objectContaining({ kind: 'add_stop_loss', label: 'Add stop loss', severity: 'blocker' }),
          expect.objectContaining({ kind: 'add_target_price', label: 'Add target price', severity: 'blocker' }),
          expect.objectContaining({ kind: 'add_risk_budget', label: 'Add risk budget', severity: 'warning' }),
          expect.objectContaining({ kind: 'add_exit_reason', label: 'Add exit reason', severity: 'warning' }),
        ],
      }),
      sizingRule: expect.objectContaining({
        status: 'missing_sizing',
        label: 'Missing sizing',
        severity: 'warning',
        hasSizing: false,
      }),
    }));
    expect(result.performance.position?.planRepairSuggestions).toEqual([
      { kind: 'add_stop_loss', label: 'Add stop loss', severity: 'blocker', count: 1 },
      { kind: 'add_target_price', label: 'Add target price', severity: 'blocker', count: 1 },
      { kind: 'add_exit_reason', label: 'Add exit reason', severity: 'warning', count: 1 },
      { kind: 'add_risk_budget', label: 'Add risk budget', severity: 'warning', count: 1 },
    ]);
    expect(result.performance.position?.sizingRules).toEqual([
      { status: 'missing_sizing', label: 'Missing sizing', severity: 'warning', count: 1 },
    ]);
    expect(result.performance.riskBacktest).toEqual(expect.objectContaining({
      verdict: 'unfavorable',
      label: 'Unfavorable',
      sampleSize: 1,
      closedLegs: 1,
      pricedLegs: 1,
      winRatePct: 100,
      avgReturnPct: 2,
      oversizedLegs: 0,
      planRepairLegs: 1,
      executionIssueLegs: 1,
    }));
  });

  it('flags oversized review playback positions against risk budget', async () => {
    const { listOpportunityReviewPlaybackForApi } = await import('../server/services/opportunity-query-service');
    const events: OpportunityEventRecord[] = [
      {
        id: 'evt-entry-oversized',
        opportunityId: 'opp-1',
        type: 'relay_triggered',
        message: 'Oversized entry',
        timestamp: '2026-05-01T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          entryPrice: 100,
          quantity: 100,
          positionPct: 40,
          stopLossPrice: 90,
          targetPrice: 130,
          riskBudgetPct: 2,
        },
      },
      {
        id: 'evt-exit-oversized',
        opportunityId: 'opp-1',
        type: 'leader_broken',
        message: 'Stop triggered',
        timestamp: '2026-05-03T10:00:00.000Z',
        meta: {
          symbol: 'AAOI',
          exitPrice: 88,
          quantity: 100,
          exitReason: 'stop_loss',
        },
      },
    ];
    const deps: Partial<OpportunityQueryDependencies> = {
      listOpportunityEvents: vi.fn(async () => events) as OpportunityQueryDependencies['listOpportunityEvents'],
      listOpportunitySummaries: vi.fn(async () => [
        {
          id: 'opp-1',
          title: 'AI relay chain',
          type: 'relay_chain',
          primaryTicker: 'AAOI',
        },
      ]) as unknown as OpportunityQueryDependencies['listOpportunitySummaries'],
      getOpportunityHeatHistory: vi.fn(async () => []) as OpportunityQueryDependencies['getOpportunityHeatHistory'],
      listTickerPerformance: vi.fn(() => []) as OpportunityQueryDependencies['listTickerPerformance'],
      listPriceHistory: vi.fn(() => []) as OpportunityQueryDependencies['listPriceHistory'],
      now: vi.fn(() => '2026-05-04T10:00:00.000Z') as OpportunityQueryDependencies['now'],
    };

    const result = await listOpportunityReviewPlaybackForApi(50, { opportunityId: 'opp-1' }, deps);

    expect(result.performance.trades[0]?.sizingRule).toEqual(expect.objectContaining({
      status: 'oversized',
      label: 'Oversized',
      severity: 'blocker',
      exposurePct: 40,
      riskBudgetPct: 2,
      stopDistancePct: -10,
      riskAtStopPct: 4,
      riskBudgetUsedPct: 200,
    }));
    expect(result.performance.position?.sizingRules).toEqual([
      { status: 'oversized', label: 'Oversized', severity: 'blocker', count: 1 },
    ]);
    expect(result.performance.riskBacktest).toEqual(expect.objectContaining({
      verdict: 'unfavorable',
      label: 'Unfavorable',
      oversizedLegs: 1,
      avgRiskAtStopPct: 4,
      avgRiskBudgetUsedPct: 200,
    }));
  });
});
