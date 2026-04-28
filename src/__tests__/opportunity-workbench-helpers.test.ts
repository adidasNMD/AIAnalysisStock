import { describe, expect, it } from 'vitest';

import type {
  OpportunityBoardHealthSummary,
  OpportunityInboxItem,
  OpportunitySuggestedMission,
  OpportunitySummary,
} from '../../dashboard/src/api';
import type { OpportunityStreamEvent } from '../../dashboard/src/hooks/useAgentStream';
import {
  buildExtraTemplates,
  buildLaneLiveSignal,
  buildLanePriorityView,
  laneForInboxItem,
  laneForStreamEvent,
  mergeInboxItem,
} from '../../dashboard/src/pages/opportunity-workbench/live';
import { createDraftState } from '../../dashboard/src/pages/opportunity-workbench/model';
import {
  buildOpportunityUpdateInput,
  createOpportunityEditDraft,
  validateOpportunityEditDraft,
} from '../../dashboard/src/pages/opportunity-workbench/edit-state';
import {
  buildBoardPrimaryAction,
  buildIpoProfile,
  buildLaneActionPreview,
  buildMissionInput,
  filterBoardItems,
  sortBoardItems,
} from '../../dashboard/src/pages/opportunity-workbench/selectors';
import {
  buildSavedViewLabel,
  countBoardFilters,
  filterOpportunitiesBySearch,
  parseStoredWorkbenchViews,
} from '../../dashboard/src/pages/opportunity-workbench/view-state';
import {
  buildMissionRecoveryActions,
  isRecoverableMissionStatus,
  recoverySummary,
  recoveryTickers,
} from '../../dashboard/src/pages/opportunity-workbench/recovery';
import { buildPreTradeChecklist } from '../../dashboard/src/pages/opportunity-workbench/pretrade';
import {
  buildCatalystReminders,
  buildOpportunityCatalystReminders,
  summarizeCatalystReminders,
} from '../../dashboard/src/pages/opportunity-workbench/catalyst-reminders';
import { buildScoreExplanation } from '../../dashboard/src/pages/opportunity-workbench/score-explanation';
import { buildStrategyReviewDigest } from '../../dashboard/src/pages/opportunity-workbench/review-digest';

const NOW = Date.parse('2026-04-27T10:00:00.000Z');

function iso(secondsAgo: number): string {
  return new Date(NOW - secondsAgo * 1000).toISOString();
}

function dayIso(daysFromNow: number): string {
  return new Date(NOW + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

function makeTemplate(overrides: Partial<OpportunitySuggestedMission> = {}): OpportunitySuggestedMission {
  return {
    id: 'template-1',
    label: 'Analyze setup',
    mode: 'analyze',
    query: 'NVDA',
    tickers: ['NVDA'],
    depth: 'standard',
    source: 'opportunity-test',
    rationale: 'test template',
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<OpportunitySummary> = {}): OpportunitySummary {
  return {
    id: 'op-1',
    type: 'relay_chain',
    stage: 'watch',
    status: 'active',
    title: 'AI relay chain',
    query: 'NVDA AI suppliers',
    relatedTickers: ['NVDA'],
    relayTickers: [],
    scores: {
      purityScore: 10,
      scarcityScore: 10,
      tradeabilityScore: 10,
      relayScore: 10,
      catalystScore: 10,
      policyScore: 10,
    },
    catalystCalendar: [],
    createdAt: iso(3600),
    updatedAt: iso(600),
    ...overrides,
  };
}

function makeInboxItem(overrides: Partial<OpportunityInboxItem> = {}): OpportunityInboxItem {
  return {
    ...makeOpportunity(overrides),
    inboxScore: 50,
    inboxSummary: 'Fresh setup',
    recommendedAction: 'monitor',
    inboxReasons: [],
    ...overrides,
  };
}

function makeEvent(
  type: OpportunityStreamEvent['type'],
  opportunityId = 'op-1',
  secondsAgo = 30,
): OpportunityStreamEvent {
  return {
    id: `${type}-${opportunityId}`,
    type,
    opportunityId,
    message: `${type} message`,
    timestamp: iso(secondsAgo),
  };
}

describe('opportunity workbench live helpers', () => {
  it('routes stream events and inbox items into action lanes', () => {
    expect(laneForStreamEvent(makeEvent('relay_triggered'))).toBe('act');
    expect(laneForStreamEvent(makeEvent('leader_broken'))).toBe('review');
    expect(laneForStreamEvent(makeEvent('updated'))).toBe('monitor');

    expect(laneForInboxItem(makeInboxItem({ recommendedAction: 'review' }))).toBe('review');
    expect(laneForInboxItem(makeInboxItem({ actionDecision: 'upgrade' }))).toBe('act');
    expect(laneForInboxItem(makeInboxItem({ recommendedAction: 'monitor' }))).toBe('monitor');
  });

  it('dedupes additional mission templates and skips the primary template', () => {
    const primary = makeTemplate({ id: 'primary' });
    const duplicate = makeTemplate({ id: 'duplicate', label: 'Duplicate A' });
    const templates = [
      primary,
      duplicate,
      makeTemplate({ id: 'duplicate', label: 'Duplicate B' }),
      makeTemplate({ id: 'review' }),
      makeTemplate({ id: 'extra' }),
    ];

    expect(
      buildExtraTemplates(
        { suggestedMission: primary, suggestedMissions: templates },
        primary.id,
        2,
      ).map((template) => template.id),
    ).toEqual(['duplicate', 'review']);
  });

  it('promotes opportunities with fresh lane events above static inbox score', () => {
    const highScore = makeInboxItem({
      id: 'high-score',
      inboxScore: 92,
      updatedAt: iso(1200),
      recommendedAction: 'analyze',
    });
    const live = makeInboxItem({
      id: 'live',
      inboxScore: 10,
      updatedAt: iso(2400),
      recommendedAction: 'analyze',
    });

    const view = buildLanePriorityView('act', [highScore, live], [makeEvent('relay_triggered', 'live', 20)], NOW);

    expect(view.items.map((item) => item.id)).toEqual(['live', 'high-score']);
    expect(view.recentEvents.get('live')?.type).toBe('relay_triggered');
  });

  it('summarizes fresh lane activity and caps merged inbox results', () => {
    const signal = buildLaneLiveSignal('act', [makeEvent('relay_triggered', 'op-1', 15)], NOW);

    expect(signal.label).toBe('Relay triggered');
    expect(signal.state).toBe('fresh');
    expect(signal.ageLabel).toBe('刚刚');

    const existing = [
      makeInboxItem({ id: 'op-1', inboxScore: 1 }),
      makeInboxItem({ id: 'op-2', inboxScore: 2 }),
    ];
    const merged = mergeInboxItem(existing, makeInboxItem({ id: 'op-2', inboxScore: 90 }), 2);

    expect(merged.map((item) => [item.id, item.inboxScore])).toEqual([
      ['op-2', 90],
      ['op-1', 1],
    ]);
  });
});

describe('opportunity workbench selectors', () => {
  it('filters board items by a selected health metric', () => {
    const health: OpportunityBoardHealthSummary = {
      type: 'relay_chain',
      headline: 'Relay board',
      summary: 'Confirmed setups',
      metrics: [
        {
          key: 'confirmed',
          label: 'Confirmed',
          value: 1,
          tone: 'positive',
          opportunityIds: ['op-2'],
        },
      ],
    };

    const result = filterBoardItems(
      [
        makeOpportunity({ id: 'op-1', title: 'Ignored' }),
        makeOpportunity({ id: 'op-2', title: 'Selected' }),
      ],
      health,
      'confirmed',
    );

    expect(result.activeMetric?.key).toBe('confirmed');
    expect(result.items.map((item) => item.id)).toEqual(['op-2']);
  });

  it('sorts open windows by upcoming catalysts before stale updates', () => {
    const stale = makeOpportunity({
      id: 'stale',
      stage: 'watch',
      updatedAt: iso(60),
    });
    const upcoming = makeOpportunity({
      id: 'upcoming',
      stage: 'ready',
      updatedAt: iso(3600),
      catalystCalendar: [{ label: 'Listing', dueAt: '2026-04-29', status: 'upcoming' }],
    });

    expect(sortBoardItems([stale, upcoming], 'window_open').map((item) => item.id)).toEqual([
      'upcoming',
      'stale',
    ]);
  });

  it('selects board primary actions from metric context and available templates', () => {
    const template = makeTemplate({
      id: 'relay_chain_deep',
      label: 'Deep relay confirmation',
      mode: 'analyze',
    });
    const action = buildBoardPrimaryAction(
      makeOpportunity({ suggestedMissions: [template] }),
      'confirmed',
    );

    expect(action.label).toBe('先验 relay 确认');
    expect(action.template).toEqual(template);
  });

  it('builds mission input from templates, tickers, and manual drafts', () => {
    const suggestedMission = makeTemplate({ id: 'custom', mode: 'review', query: 'Review NVDA' });
    expect(buildMissionInput(makeOpportunity({ suggestedMission }))).toEqual(suggestedMission);

    expect(buildMissionInput(makeOpportunity({ primaryTicker: 'NVDA' }))).toMatchObject({
      mode: 'analyze',
      query: 'NVDA',
      tickers: ['NVDA'],
    });

    const draft = createDraftState('relay_chain', {
      title: 'AI supply chain',
      query: 'NVDA supplier relay',
    });
    expect(buildMissionInput(draft)).toMatchObject({
      mode: 'explore',
      query: 'NVDA supplier relay',
      depth: 'deep',
      source: 'manual',
    });
  });

  it('normalizes IPO profile draft fields and builds lane action previews', () => {
    const draft = createDraftState('ipo_spinout', {
      officialTradingDate: '2026-05-02',
      lockupDate: '2026-11-02',
      retainedStakePercentText: '82.5',
    });

    expect(buildIpoProfile(draft)).toEqual({
      officialTradingDate: '2026-05-02',
      retainedStakePercent: 82.5,
      lockupDate: '2026-11-02',
    });

    const opportunity = makeOpportunity({
      id: 'relay-live',
      type: 'relay_chain',
      suggestedMissions: [makeTemplate({ id: 'relay_chain_deep' })],
    });
    const preview = buildLaneActionPreview(
      'act',
      [makeEvent('relay_triggered', 'relay-live', 10)],
      new Map([[opportunity.id, opportunity]]),
      NOW,
    );

    expect(preview?.fresh).toBe(true);
    expect(preview?.action.label).toBe('先验 relay 确认');
  });
});

describe('opportunity workbench view state', () => {
  it('filters opportunities by ticker, title, and thesis tokens', () => {
    const items = [
      makeOpportunity({
        id: 'match',
        title: 'AI memory relay',
        thesis: 'HBM supplier squeeze',
        relatedTickers: ['MU', 'NVDA'],
      }),
      makeOpportunity({
        id: 'miss',
        title: 'Consumer staples',
        thesis: 'Defensive basket',
        relatedTickers: ['PG'],
      }),
    ];

    expect(filterOpportunitiesBySearch(items, 'AI MU').map((item) => item.id)).toEqual(['match']);
  });

  it('normalizes saved workbench views from local storage payloads', () => {
    const raw = JSON.stringify([
      {
        id: 'view-1',
        label: ' Relay ',
        searchQuery: '  NVDA   suppliers ',
        boardFilters: {
          relay_chain: 'confirmed',
          proxy_narrative: '',
          unknown: 'ignored',
        },
        focusLane: 'act',
        createdAt: '2026-04-27T01:00:00.000Z',
        updatedAt: '2026-04-27T01:00:00.000Z',
      },
      { label: 'missing id' },
    ]);

    expect(parseStoredWorkbenchViews(raw)).toEqual([
      {
        id: 'view-1',
        label: 'Relay',
        searchQuery: 'NVDA suppliers',
        boardFilters: { relay_chain: 'confirmed' },
        focusLane: 'act',
        createdAt: '2026-04-27T01:00:00.000Z',
        updatedAt: '2026-04-27T01:00:00.000Z',
      },
    ]);
  });

  it('builds compact saved-view labels and counts active board filters', () => {
    const boardFilters = { ipo_spinout: 'window_open', relay_chain: 'confirmed' };

    expect(countBoardFilters(boardFilters)).toBe(2);
    expect(buildSavedViewLabel({
      searchQuery: 'NVDA supplier relay expansion',
      boardFilters,
      focusLane: 'review',
    })).toBe('NVDA supplier rela... / 2 filters / REVIEW');
  });
});

describe('opportunity workbench edit state', () => {
  it('creates editable drafts and update payloads that can clear nullable fields', () => {
    const opportunity = makeOpportunity({
      type: 'ipo_spinout',
      title: 'Spinout setup',
      query: 'SNDK spinout',
      thesis: 'Pure-play memory code',
      primaryTicker: 'SNDK',
      relatedTickers: ['SNDK', 'WDC'],
      nextCatalystAt: '2026-05-01',
      supplyOverhang: 'Parent stake',
      policyStatus: 'watch',
      ipoProfile: {
        officialTradingDate: '2026-05-01',
        retainedStakePercent: 80,
      },
    });
    const draft = createOpportunityEditDraft(opportunity);

    const input = buildOpportunityUpdateInput(opportunity, {
      ...draft,
      title: '  Updated spinout  ',
      relatedTickersText: 'SNDK, WDC, MU',
      nextCatalystAt: '',
      supplyOverhang: '',
      retainedStakePercentText: '',
    });

    expect(input).toMatchObject({
      title: 'Updated spinout',
      relatedTickers: ['SNDK', 'WDC', 'MU'],
      nextCatalystAt: null,
      supplyOverhang: null,
      ipoProfile: {
        officialTradingDate: '2026-05-01',
      },
    });
  });

  it('validates required edit fields and numeric retained stake', () => {
    const draft = createOpportunityEditDraft(makeOpportunity({ type: 'ipo_spinout' }));

    expect(validateOpportunityEditDraft({ ...draft, title: '' })).toBe('机会标题不能为空');
    expect(validateOpportunityEditDraft({ ...draft, retainedStakePercentText: 'not-a-number' })).toBe('Retained stake 需要是数字');
    expect(validateOpportunityEditDraft(draft)).toBeNull();
  });
});

describe('opportunity workbench mission recovery', () => {
  it('builds recovery actions only for failed or canceled latest missions', () => {
    expect(isRecoverableMissionStatus('failed')).toBe(true);
    expect(isRecoverableMissionStatus('canceled')).toBe(true);
    expect(isRecoverableMissionStatus('fully_enriched')).toBe(false);

    const failed = makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'failed',
        updatedAt: iso(60),
      },
    });
    const actions = buildMissionRecoveryActions(failed);

    expect(recoverySummary(failed)?.label).toBe('任务失败待恢复');
    expect(actions.map((action) => action.id)).toEqual([
      'retry_same',
      'retry_quick',
      'retry_deep',
      'review_recovery',
    ]);
    expect(actions[3]).toMatchObject({ kind: 'review', depth: 'standard' });
    expect(buildMissionRecoveryActions(makeOpportunity())).toEqual([]);
  });

  it('dedupes recovery tickers across primary, leader, proxy, and related lists', () => {
    const tickers = recoveryTickers(makeOpportunity({
      primaryTicker: 'nvda',
      leaderTicker: 'NVDA',
      proxyTicker: 'MU',
      relatedTickers: ['mu', 'AVGO'],
      relayTickers: ['AVGO', 'SNDK'],
    }));

    expect(tickers).toEqual(['NVDA', 'MU', 'AVGO', 'SNDK']);
  });
});

describe('opportunity workbench pre-trade checklist', () => {
  it('blocks execution when mission evidence failed or is missing', () => {
    const checklist = buildPreTradeChecklist(makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'failed',
        updatedAt: iso(60),
      },
      status: 'active',
      scores: {
        purityScore: 80,
        scarcityScore: 80,
        tradeabilityScore: 80,
        relayScore: 90,
        catalystScore: 80,
        policyScore: 50,
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 85,
        validationStatus: 'confirmed',
        validationSummary: 'confirmed',
      },
      catalystCalendar: [{ label: 'Earnings', dueAt: iso(-5 * 24 * 60 * 60), status: 'upcoming' }],
    }));

    expect(checklist.readiness).toBe('blocked');
    expect(checklist.items.find((item) => item.id === 'mission_evidence')?.status).toBe('block');
  });

  it('marks a fully evidenced confirmed relay as ready when no warnings remain', () => {
    const checklist = buildPreTradeChecklist(makeOpportunity({
      thesis: 'Relay confirmed into bottleneck suppliers',
      status: 'ready',
      playbook: {
        title: 'Heat Transfer Playbook',
        stance: 'act',
        objective: 'Confirm relay',
        whyNow: 'confirmed',
        checklist: [
          { label: 'Leader 温度计', status: 'ready' },
          { label: '瓶颈层', status: 'ready' },
        ],
        nextStep: 'Execute focused confirmation.',
      },
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'fully_enriched',
        updatedAt: iso(60),
      },
      scores: {
        purityScore: 80,
        scarcityScore: 80,
        tradeabilityScore: 82,
        relayScore: 90,
        catalystScore: 80,
        policyScore: 50,
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 85,
        validationStatus: 'confirmed',
        validationSummary: 'confirmed',
      },
      catalystCalendar: [{ label: 'Earnings', dueAt: iso(-7 * 24 * 60 * 60), status: 'upcoming' }],
    }));

    expect(checklist.readiness).toBe('ready');
    expect(checklist.blockers).toBe(0);
    expect(checklist.warnings).toBe(0);
  });
});

describe('opportunity workbench catalyst reminders', () => {
  it('orders overdue, today, soon, and watch reminders by urgency', () => {
    const reminders = buildCatalystReminders([
      makeOpportunity({
        id: 'watch',
        title: 'Watch item',
        catalystCalendar: [{ label: 'Investor day', dueAt: dayIso(20), status: 'upcoming' }],
      }),
      makeOpportunity({
        id: 'today',
        title: 'Today item',
        catalystCalendar: [{ label: 'Listing', dueAt: dayIso(0), status: 'upcoming' }],
      }),
      makeOpportunity({
        id: 'overdue',
        title: 'Overdue item',
        catalystCalendar: [{ label: 'Filing', dueAt: dayIso(-2), status: 'upcoming' }],
      }),
      makeOpportunity({
        id: 'soon',
        title: 'Soon item',
        catalystCalendar: [{ label: 'Earnings', dueAt: dayIso(5), status: 'upcoming' }],
      }),
    ], NOW);

    expect(reminders.map((reminder) => reminder.opportunity.id)).toEqual([
      'overdue',
      'today',
      'soon',
      'watch',
    ]);
    expect(reminders.map((reminder) => reminder.urgency)).toEqual([
      'overdue',
      'today',
      'soon',
      'watch',
    ]);
    expect(summarizeCatalystReminders(reminders)).toMatchObject({
      overdue: 1,
      today: 1,
      soon: 1,
      watch: 1,
      headline: '1 overdue',
    });
  });

  it('falls back to nextCatalystAt when explicit calendar items are absent', () => {
    const [reminder] = buildOpportunityCatalystReminders(makeOpportunity({
      nextCatalystAt: dayIso(3),
      catalystCalendar: [],
    }), NOW);

    expect(reminder).toMatchObject({
      urgency: 'soon',
      dueLabel: 'in 3d',
      catalyst: {
        label: 'Next catalyst',
        status: 'upcoming',
        confidence: 'placeholder',
      },
    });
  });
});

describe('opportunity workbench score explanation', () => {
  it('explains a confirmed relay with strong relay, validation, and mission factors', () => {
    const explanation = buildScoreExplanation(makeOpportunity({
      type: 'relay_chain',
      status: 'ready',
      thesis: 'Relay confirmed into bottleneck suppliers',
      leaderTicker: 'NVDA',
      relatedTickers: ['MU'],
      relayTickers: ['SNDK'],
      scores: {
        purityScore: 78,
        scarcityScore: 76,
        tradeabilityScore: 82,
        relayScore: 90,
        catalystScore: 80,
        policyScore: 50,
      },
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'fully_enriched',
        updatedAt: iso(60),
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 85,
        validationStatus: 'confirmed',
        validationSummary: 'confirmed relay',
      },
      catalystCalendar: [{ label: 'Earnings', dueAt: '2099-01-01T00:00:00.000Z', status: 'upcoming' }],
    }));

    expect(explanation.primaryLabel).toBe('Relay');
    expect(explanation.primaryTone).toBe('strong');
    expect(explanation.factors.find((factor) => factor.id === 'mission')).toMatchObject({
      tone: 'strong',
      value: 'fully_enriched',
    });
    expect(explanation.factors.find((factor) => factor.id === 'validation')).toMatchObject({
      tone: 'strong',
      value: 'confirmed',
    });
  });

  it('surfaces degraded status and failed mission as risk factors', () => {
    const explanation = buildScoreExplanation(makeOpportunity({
      status: 'degraded',
      latestEventMessage: 'Mission failed for opportunity',
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'failed',
        updatedAt: iso(60),
      },
    }));

    expect(explanation.summary).toContain('风险因子');
    expect(explanation.factors.find((factor) => factor.id === 'mission')?.tone).toBe('risk');
    expect(explanation.factors.find((factor) => factor.id === 'status_degraded')?.tone).toBe('risk');
  });
});

describe('opportunity workbench strategy review digest', () => {
  it('prioritizes failed execution, thesis changes, and live action signals', () => {
    const failed = makeOpportunity({
      id: 'failed',
      title: 'Failed relay',
      latestEventMessage: 'Mission failed after OpenBB step',
      latestMission: {
        id: 'mission-failed',
        query: 'Failed relay',
        status: 'failed',
        updatedAt: iso(120),
      },
    });
    const changed = makeOpportunity({
      id: 'changed',
      title: 'Changed proxy',
      updatedAt: iso(240),
      latestOpportunityDiff: {
        currentSnapshotId: 'snap-2',
        baselineSnapshotId: 'snap-1',
        changed: true,
        changeCount: 2,
        changedCategories: ['proxy'],
        highlights: ['proxy mapping changed'],
        summary: 'Proxy mapping moved from one ticker to another',
      },
    });
    const acted = makeOpportunity({
      id: 'acted',
      title: 'Triggered relay',
    });

    const digest = buildStrategyReviewDigest(
      [acted, changed, failed],
      [makeEvent('relay_triggered', 'acted', 30)],
      NOW,
      5,
    );

    expect(digest.entries.map((entry) => entry.opportunity.id)).toEqual([
      'failed',
      'changed',
      'acted',
    ]);
    expect(digest.summary).toMatchObject({
      actions: 1,
      reviews: 1,
      risks: 1,
      thesisChanges: 1,
      headline: '1 个风险复盘',
    });
  });

  it('surfaces stale ready opportunities as review work', () => {
    const digest = buildStrategyReviewDigest([
      makeOpportunity({
        id: 'stale',
        title: 'Stale ready setup',
        status: 'ready',
        updatedAt: iso(5 * 24 * 60 * 60),
      }),
    ], [], NOW);

    expect(digest.entries).toHaveLength(1);
    expect(digest.entries[0]).toMatchObject({
      kind: 'status',
      tone: 'warning',
      label: '高优先级机会超过 3 天未更新',
    });
    expect(digest.summary.reviews).toBe(1);
  });
});
