import { describe, expect, it } from 'vitest';

import type {
  HeatTransferGraph,
  OpportunityBoardHealthSummary,
  OpportunityBoardHealthMap,
  OpportunityEvent,
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
import { buildCreateOpportunityInput } from '../../dashboard/src/pages/opportunity-workbench/actions';
import { buildRelayOpportunityInputFromHeatGraph } from '../../dashboard/src/pages/opportunity-workbench/automation-actions';
import {
  BOARD_LIST_INITIAL_RENDER_LIMIT,
  BOARD_LIST_RENDER_INCREMENT,
  BOARD_LIST_VIRTUAL_MAX_ITEM_ESTIMATE,
  BOARD_LIST_VIRTUAL_MIN_ITEM_ESTIMATE,
  BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
  BOARD_LIST_VIRTUAL_OVERSCAN,
  activeIndexFromBoardListScroll,
  buildBoardListScrollKey,
  buildBoardListVirtualWindow,
  buildBoardListWindowState,
  clampBoardListActiveIndex,
  clampBoardListScrollTop,
  nextBoardListRenderLimit,
  normalizeBoardListItemEstimate,
  refineBoardListItemEstimate,
  scrollTopForBoardListActiveIndex,
  shouldWindowBoardList,
} from '../../dashboard/src/pages/opportunity-workbench/board-list-window';
import { createDraftFromTemplate } from '../../dashboard/src/pages/opportunity-workbench/draft-state';
import {
  buildOpportunityUpdateInput,
  createOpportunityEditDraft,
  validateOpportunityEditDraft,
} from '../../dashboard/src/pages/opportunity-workbench/edit-state';
import { laneFromWorkbenchShortcutKey } from '../../dashboard/src/pages/opportunity-workbench/interaction-state';
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
  buildWorkbenchViewSearchParams,
  buildOpportunitySearchMatch,
  countBoardFilters,
  filterOpportunitiesBySearch,
  hasWorkbenchViewSearchParams,
  orderWorkbenchSavedViews,
  parseBoardFiltersFromSearchParams,
  parseStoredWorkbenchLastView,
  parseStoredWorkbenchViews,
} from '../../dashboard/src/pages/opportunity-workbench/view-state';
import {
  parseWorkbenchStorageJson,
  readWorkbenchStorageJson,
  writeWorkbenchStorageJson,
} from '../../dashboard/src/pages/opportunity-workbench/workbench-storage';
import {
  buildMissionRecoveryActions,
  buildMissionRecoveryMeta,
  isRecoverableMissionStatus,
  missionRecoveryFeedbackAutoDismissLabel,
  missionRecoveryFeedbackExpiresAt,
  missionRecoveryDiagnosis,
  missionRecoveryFailureAdvice,
  prioritizeMissionRecoveryActions,
  recoveryActionGuidance,
  recoverySummary,
  recoveryTickers,
  shouldDismissMissionRecoveryFeedback,
} from '../../dashboard/src/pages/opportunity-workbench/recovery';
import { buildPreTradeChecklist } from '../../dashboard/src/pages/opportunity-workbench/pretrade';
import {
  normalizePreTradeProgress,
  summarizePreTradeProgress,
  updatePreTradeProgress,
} from '../../dashboard/src/pages/opportunity-workbench/pretrade-progress';
import { buildPreTradeAuditTrail } from '../../dashboard/src/pages/opportunity-workbench/pretrade-audit';
import {
  buildCatalystReminders,
  buildOpportunityCatalystReminders,
  summarizeCatalystReminders,
} from '../../dashboard/src/pages/opportunity-workbench/catalyst-reminders';
import {
  isCatalystReminderSuppressed,
  preferenceForCatalystReminder,
  splitCatalystRemindersByPreference,
  subscriptionForCatalystReminder,
} from '../../dashboard/src/pages/opportunity-workbench/catalyst-reminder-preferences';
import { buildCatalystReminderAuditTrail } from '../../dashboard/src/pages/opportunity-workbench/catalyst-reminder-audit';
import { buildScoreExplanation } from '../../dashboard/src/pages/opportunity-workbench/score-explanation';
import {
  buildFieldEvidenceBatchDrafts,
  buildFieldEvidenceFieldOptions,
  buildFieldEvidenceFieldReview,
  buildFieldEvidenceRecordDraftFromRef,
  buildFieldEvidenceAuditView,
  buildFieldEvidenceView,
} from '../../dashboard/src/pages/opportunity-workbench/field-evidence';
import { buildSourceProvenanceInspection } from '../../dashboard/src/pages/opportunity-workbench/source-provenance';
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

function makeHeatGraph(overrides: Partial<HeatTransferGraph> = {}): HeatTransferGraph {
  return {
    id: 'graph-1',
    theme: 'AI power',
    leaderTicker: 'VRT',
    leaderScore: 88,
    bottleneckTickers: ['ETN', 'PWR'],
    laggardTickers: ['AAOI'],
    junkTickers: [],
    breadthScore: 72,
    relayScore: 81,
    temperature: 'hot',
    validationStatus: 'confirmed',
    validationSummary: 'Power chain confirmed',
    edgeCount: 1,
    edges: [{
      id: 'edge-1',
      from: 'VRT',
      to: 'ETN',
      weight: 0.8,
      kind: 'leader_to_bottleneck',
      reason: 'shared AI power demand',
    }],
    transmissionSummary: 'Demand is moving from leader to bottlenecks.',
    ...overrides,
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
  it('normalizes storage JSON through a shared safe adapter', () => {
    const normalize = (value: unknown) => (
      value && typeof value === 'object' && 'count' in value
        ? Number((value as { count: unknown }).count)
        : 0
    );

    expect(parseWorkbenchStorageJson('{"count":"3"}', -1, normalize)).toBe(3);
    expect(parseWorkbenchStorageJson('{bad-json', -1, normalize)).toBe(-1);
    expect(readWorkbenchStorageJson('missing', 'fallback', () => 'stored')).toBe('fallback');
    expect(writeWorkbenchStorageJson('missing', { count: 1 })).toBe(false);
  });

  it('restores and serializes the last workbench view without clobbering unrelated URL params', () => {
    const restored = parseStoredWorkbenchLastView(JSON.stringify({
      searchQuery: '  NVDA   relay ',
      boardFilters: {
        relay_chain: 'confirmed',
        proxy_narrative: '',
      },
      focusLane: 'review',
      updatedAt: '2026-04-27T01:00:00.000Z',
    }));

    expect(restored).toEqual({
      searchQuery: 'NVDA relay',
      boardFilters: { relay_chain: 'confirmed' },
      focusLane: 'review',
      updatedAt: '2026-04-27T01:00:00.000Z',
    });

    const params = buildWorkbenchViewSearchParams(
      new URLSearchParams({ tab: 'opportunities' }),
      restored?.searchQuery || '',
      restored?.boardFilters || {},
    );

    expect(params.get('tab')).toBe('opportunities');
    expect(params.get('q')).toBe('NVDA relay');
    expect(params.get('relayMetric')).toBe('confirmed');
    expect(hasWorkbenchViewSearchParams(params)).toBe(true);
    expect(hasWorkbenchViewSearchParams(new URLSearchParams({ tab: 'opportunities' }))).toBe(false);
  });

  it('maps keyboard shortcuts to stable action inbox lanes', () => {
    expect(laneFromWorkbenchShortcutKey('1')).toBe('act');
    expect(laneFromWorkbenchShortcutKey('2')).toBe('review');
    expect(laneFromWorkbenchShortcutKey('3')).toBe('monitor');
    expect(laneFromWorkbenchShortcutKey('4')).toBeNull();
    expect(laneFromWorkbenchShortcutKey('a')).toBeNull();
  });

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

  it('explains which fields matched the workbench search query', () => {
    const opportunity = makeOpportunity({
      title: 'AI memory relay',
      thesis: 'HBM supplier squeeze',
      relatedTickers: ['MU', 'NVDA'],
    });

    const match = buildOpportunitySearchMatch(opportunity, '  AI   MU  ');

    expect(match).toEqual({
      query: 'AI MU',
      tokens: ['ai', 'mu'],
      reasons: [
        {
          field: 'title',
          label: '标题',
          value: 'AI memory relay',
          tokens: ['ai'],
        },
        {
          field: 'relatedTickers',
          label: '相关标的',
          value: 'MU',
          tokens: ['mu'],
        },
      ],
    });
  });

  it('returns no search explanation when a token is missing', () => {
    const opportunity = makeOpportunity({
      title: 'AI memory relay',
      relatedTickers: ['MU'],
    });

    expect(buildOpportunitySearchMatch(opportunity, 'AI copper')).toBeNull();
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
        isPinned: true,
        isDefault: true,
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
        isPinned: true,
        isDefault: true,
        createdAt: '2026-04-27T01:00:00.000Z',
        updatedAt: '2026-04-27T01:00:00.000Z',
      },
    ]);
  });

  it('orders saved views by pinned/default metadata and keeps a single default', () => {
    const views = orderWorkbenchSavedViews([
      {
        id: 'old-default',
        label: 'Old default',
        searchQuery: '',
        boardFilters: {},
        focusLane: null,
        isPinned: false,
        isDefault: true,
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
      },
      {
        id: 'pinned',
        label: 'Pinned',
        searchQuery: 'relay',
        boardFilters: { relay_chain: 'confirmed' },
        focusLane: 'act',
        isPinned: true,
        isDefault: false,
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'new-default',
        label: 'New default',
        searchQuery: 'NVDA',
        boardFilters: {},
        focusLane: 'review',
        isPinned: false,
        isDefault: true,
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:00:00.000Z',
      },
    ]);

    expect(views.map((view) => view.id)).toEqual(['pinned', 'new-default', 'old-default']);
    expect(views.filter((view) => view.isDefault)).toHaveLength(1);
    expect(views.find((view) => view.id === 'new-default')?.isDefault).toBe(true);
    expect(views.find((view) => view.id === 'old-default')?.isDefault).toBe(false);
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

  it('normalizes URL board filters against the current board health metrics', () => {
    const boardHealth: OpportunityBoardHealthMap = {
      ipo_spinout: {
        type: 'ipo_spinout',
        headline: 'IPO',
        summary: 'IPO board',
        metrics: [{ key: 'window_open', label: 'Window', value: 1, tone: 'positive', opportunityIds: ['op-1'] }],
      },
      relay_chain: {
        type: 'relay_chain',
        headline: 'Relay',
        summary: 'Relay board',
        metrics: [{ key: 'confirmed', label: 'Confirmed', value: 0, tone: 'neutral', opportunityIds: [] }],
      },
      proxy_narrative: {
        type: 'proxy_narrative',
        headline: 'Proxy',
        summary: 'Proxy board',
        metrics: [{ key: 'crowded', label: 'Crowded', value: 1, tone: 'warning', opportunityIds: ['op-2'] }],
      },
    };
    const params = new URLSearchParams({
      ipoMetric: 'window_open',
      relayMetric: 'confirmed',
      proxyMetric: 'crowded',
      q: 'NVDA',
    });

    const result = parseBoardFiltersFromSearchParams(params, boardHealth);

    expect(result.filters).toEqual({
      ipo_spinout: 'window_open',
      proxy_narrative: 'crowded',
    });
    expect(result.normalized).toBe(true);
    expect(result.normalizedParams.get('relayMetric')).toBeNull();
    expect(result.normalizedParams.get('q')).toBe('NVDA');
  });
});

describe('opportunity workbench board list windowing', () => {
  it('renders small board lists without windowing', () => {
    expect(shouldWindowBoardList(18)).toBe(false);
    expect(buildBoardListWindowState(18, 1)).toEqual({
      isWindowed: false,
      renderedCount: 18,
      remainingCount: 0,
      nextRenderCount: 0,
    });
  });

  it('windows large board lists and advances by a stable increment', () => {
    const initial = buildBoardListWindowState(45, 0);

    expect(initial).toEqual({
      isWindowed: true,
      renderedCount: BOARD_LIST_INITIAL_RENDER_LIMIT,
      remainingCount: 33,
      nextRenderCount: BOARD_LIST_RENDER_INCREMENT,
    });
    expect(nextBoardListRenderLimit(initial.renderedCount, 45)).toBe(24);
    expect(nextBoardListRenderLimit(42, 45)).toBe(45);
  });

  it('builds a bounded virtual range for large board lists', () => {
    expect(buildBoardListVirtualWindow(0, 1000, 640)).toEqual({
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
      offsetTop: 0,
      offsetBottom: 0,
      totalHeight: 0,
    });

    const first = buildBoardListVirtualWindow(120, 0, 640);
    expect(first).toEqual({
      startIndex: 0,
      endIndex: 2,
      renderedCount: 2,
      offsetTop: 0,
      offsetBottom: (120 - 2) * BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
      totalHeight: 120 * BOARD_LIST_VIRTUAL_ITEM_ESTIMATE,
    });

    const scrolled = buildBoardListVirtualWindow(
      120,
      BOARD_LIST_VIRTUAL_ITEM_ESTIMATE * 5,
      640,
    );
    expect(scrolled.startIndex).toBe(5 - BOARD_LIST_VIRTUAL_OVERSCAN);
    expect(scrolled.endIndex).toBe(7);
    expect(scrolled.renderedCount).toBe(2);
    expect(scrolled.offsetTop).toBe((5 - BOARD_LIST_VIRTUAL_OVERSCAN) * BOARD_LIST_VIRTUAL_ITEM_ESTIMATE);
  });

  it('clamps remembered scroll offsets and scopes them by board filter', () => {
    expect(buildBoardListScrollKey('relay_chain')).toBe('relay_chain:all');
    expect(buildBoardListScrollKey('relay_chain', 'relay_ready')).toBe('relay_chain:relay_ready');
    expect(clampBoardListScrollTop(10, 640, -100)).toBe(0);
    expect(clampBoardListScrollTop(10, 640, 99999)).toBe((10 * BOARD_LIST_VIRTUAL_ITEM_ESTIMATE) - 640);
  });

  it('normalizes measured virtual row estimates before recalculating ranges', () => {
    expect(normalizeBoardListItemEstimate(Number.NaN)).toBe(BOARD_LIST_VIRTUAL_ITEM_ESTIMATE);
    expect(normalizeBoardListItemEstimate(10)).toBe(BOARD_LIST_VIRTUAL_MIN_ITEM_ESTIMATE);
    expect(normalizeBoardListItemEstimate(2200)).toBe(BOARD_LIST_VIRTUAL_MAX_ITEM_ESTIMATE);
    expect(refineBoardListItemEstimate(520, 540)).toBe(520);
    expect(refineBoardListItemEstimate(520, 640)).toBe(640);

    const measured = buildBoardListVirtualWindow(120, 640 * 5, 640, 640);
    expect(measured.startIndex).toBe(5);
    expect(measured.endIndex).toBe(6);
    expect(measured.offsetTop).toBe(5 * 640);
    expect(clampBoardListScrollTop(10, 640, 99999, 640)).toBe((10 * 640) - 640);
  });

  it('keeps keyboard active rows inside the virtual viewport', () => {
    expect(clampBoardListActiveIndex(0, 5)).toBeNull();
    expect(clampBoardListActiveIndex(10, -3)).toBe(0);
    expect(clampBoardListActiveIndex(10, 99)).toBe(9);
    expect(activeIndexFromBoardListScroll(20, 640 * 4, 640)).toBe(4);

    expect(scrollTopForBoardListActiveIndex(20, 0, 640 * 4, 640, 640)).toBe(0);
    expect(scrollTopForBoardListActiveIndex(20, 4, 640 * 4, 640, 640)).toBe(640 * 4);
    expect(scrollTopForBoardListActiveIndex(20, 5, 640 * 4, 640, 640)).toBe(640 * 5);
    expect(scrollTopForBoardListActiveIndex(20, 19, 0, 640, 640)).toBe((20 * 640) - 640);
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

describe('opportunity workbench draft state', () => {
  it('builds create payloads from draft text fields and ticker lists', () => {
    const draft = createDraftState('relay_chain', {
      title: '  AI relay  ',
      query: '  NVDA suppliers  ',
      thesis: '  Follow heat transfer  ',
      primaryTicker: ' NVDA ',
      leaderTicker: ' SMCI ',
      relatedTickersText: 'NVDA, SMCI, VRT',
      relayTickersText: 'AAOI, WDC',
      nextCatalystAt: ' 2026-05-01 ',
    });

    expect(buildCreateOpportunityInput(draft)).toMatchObject({
      type: 'relay_chain',
      title: 'AI relay',
      query: 'NVDA suppliers',
      thesis: 'Follow heat transfer',
      primaryTicker: 'NVDA',
      leaderTicker: 'SMCI',
      relatedTickers: ['NVDA', 'SMCI', 'VRT'],
      relayTickers: ['AAOI', 'WDC'],
      nextCatalystAt: '2026-05-01',
    });
  });

  it('preserves title and query when applying a different creation template', () => {
    const current = createDraftState('relay_chain', {
      title: 'AI infrastructure relay',
      query: 'AI data center suppliers',
    });

    const next = createDraftFromTemplate('ipo_spinout', current);

    expect(next.type).toBe('ipo_spinout');
    expect(next.title).toBe('AI infrastructure relay');
    expect(next.query).toBe('AI data center suppliers');
    expect(next.stage).toBe('radar');
  });
});

describe('opportunity workbench automation actions', () => {
  it('builds a relay opportunity creation payload from heat-transfer graph snapshots', () => {
    const input = buildRelayOpportunityInputFromHeatGraph(makeHeatGraph());

    expect(input).toMatchObject({
      type: 'relay_chain',
      title: 'AI power 热量传导链',
      query: 'AI power',
      thesis: 'Demand is moving from leader to bottlenecks.',
      leaderTicker: 'VRT',
      relatedTickers: ['ETN', 'PWR'],
      relayTickers: ['AAOI'],
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['ETN', 'PWR'],
        laggardTickers: ['AAOI'],
        breadthScore: 72,
        validationStatus: 'confirmed',
        validationSummary: 'Power chain confirmed',
        edgeCount: 1,
        transmissionNote: 'Demand is moving from leader to bottlenecks.',
      },
    });
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
    expect(actions[1]?.costHint).toMatchObject({ tier: 'low', estimate: '约 1-3 分钟' });
    expect(actions[2]?.costHint).toMatchObject({ tier: 'high', estimate: '约 8-15 分钟' });
    expect(actions[3]).toMatchObject({ kind: 'review', depth: 'standard' });
    expect(buildMissionRecoveryActions(makeOpportunity())).toEqual([]);
  });

  it('explains recovery failure metadata and recommended action order', () => {
    const failed = makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'failed',
        updatedAt: iso(60),
        source: 'opportunity_action',
      },
      latestRun: {
        id: 'run-1',
        missionId: 'mission-1',
        taskId: 'task-1',
        status: 'failed',
        stage: 'analyst',
        attempt: 2,
        createdAt: iso(120),
        failureCode: 'timeout',
        failureMessage: 'TradingAgents timed out',
        degradedFlags: ['ta_timeout'],
      },
    });

    expect(recoverySummary(failed)?.detail).toContain('执行超时');
    expect(recoveryActionGuidance(failed)).toContain('Quick 重跑确认链路');
    expect(missionRecoveryDiagnosis(failed)).toMatchObject({
      label: '执行超时',
      tone: 'warning',
      primaryActionId: 'retry_quick',
      primaryActionLabel: 'Quick 重跑',
    });
    expect(buildMissionRecoveryMeta(failed)).toEqual([
      { label: 'mission', value: 'failed', tone: 'danger' },
      { label: 'run', value: '#2 failed:analyst', tone: 'danger' },
      expect.objectContaining({ label: 'failure', value: '执行超时', tone: 'warning' }),
      { label: 'message', value: 'TradingAgents timed out', tone: 'warning' },
      { label: 'degraded', value: 'ta_timeout', tone: 'warning' },
      { label: 'source', value: 'opportunity_action', tone: 'info' },
    ]);
  });

  it('guides canceled mission recovery toward restoration before review', () => {
    const canceled = makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'canceled',
        updatedAt: iso(60),
      },
      latestRun: {
        id: 'run-1',
        missionId: 'mission-1',
        taskId: 'task-1',
        status: 'canceled',
        stage: 'canceled',
        attempt: 1,
        createdAt: iso(120),
        cancelRequestedAt: '2026-04-27T09:00:00.000Z',
        failureCode: 'canceled',
      },
    });

    expect(recoveryActionGuidance(canceled)).toBe('建议顺序：恢复任务 → Quick 重跑 → 复核取消原因。');
    expect(missionRecoveryDiagnosis(canceled)).toMatchObject({
      label: '主动取消',
      tone: 'info',
      primaryActionId: 'retry_same',
    });
    expect(buildMissionRecoveryMeta(canceled).map((item) => item.label)).toEqual([
      'mission',
      'run',
      'failure',
      'cancel',
    ]);
  });

  it('classifies recovery action failures into operator next steps', () => {
    const failed = makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'failed',
        updatedAt: iso(60),
      },
    });
    const actions = buildMissionRecoveryActions(failed);

    expect(missionRecoveryFailureAdvice({
      status: 503,
      message: 'OpenBB upstream unavailable',
    }, actions[1])).toMatchObject({
      label: '先检查服务',
      tone: 'danger',
    });
    expect(missionRecoveryFailureAdvice({
      status: 429,
      body: { error: 'rate limit exceeded' },
    }, actions[1]).detail).toContain('Quick 重跑');
    expect(missionRecoveryFailureAdvice({
      status: 422,
      body: { message: 'validation failed: tickers required' },
    }, actions[0])).toMatchObject({
      label: '复核输入',
      tone: 'danger',
    });
    expect(missionRecoveryFailureAdvice(new Error('fetch failed'), actions[3]).label).toBe('网络请求失败');
  });

  it('prioritizes actionable recovery diagnosis by failure code and degraded flags', () => {
    const upstream = makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'NVDA relay',
        status: 'failed',
        updatedAt: iso(60),
      },
      latestRun: {
        id: 'run-1',
        missionId: 'mission-1',
        status: 'failed',
        stage: 'dispatch',
        attempt: 1,
        createdAt: iso(120),
        failureCode: 'upstream_unavailable',
        failureMessage: 'OpenBB gateway unavailable',
      },
    });
    const stale = makeOpportunity({
      latestMission: {
        id: 'mission-2',
        query: 'AMD relay',
        status: 'failed',
        updatedAt: iso(60),
      },
      latestRun: {
        id: 'run-2',
        missionId: 'mission-2',
        status: 'failed',
        stage: 'dispatch',
        attempt: 1,
        createdAt: iso(120),
        failureCode: 'stale_recovered',
      },
    });
    const validation = makeOpportunity({
      latestMission: {
        id: 'mission-3',
        query: 'bad payload',
        status: 'failed',
        updatedAt: iso(60),
      },
      latestRun: {
        id: 'run-3',
        missionId: 'mission-3',
        status: 'failed',
        stage: 'dispatch',
        attempt: 1,
        createdAt: iso(120),
        failureCode: 'validation_failed',
      },
    });

    expect(missionRecoveryDiagnosis(upstream)).toMatchObject({
      label: '依赖服务异常',
      tone: 'danger',
      primaryActionId: 'retry_quick',
    });
    expect(missionRecoveryDiagnosis(stale)).toMatchObject({
      label: '运行中断恢复',
      primaryActionId: 'retry_same',
    });
    expect(buildMissionRecoveryMeta(stale)).toContainEqual(
      expect.objectContaining({ label: 'failure', value: '心跳恢复', tone: 'warning' }),
    );
    expect(missionRecoveryDiagnosis(validation)).toMatchObject({
      label: '输入或结构问题',
      primaryActionId: 'review_recovery',
    });
  });

  it('keeps the recommended recovery action visible when compact panels limit actions', () => {
    const failed = makeOpportunity({
      latestMission: {
        id: 'mission-1',
        query: 'bad payload',
        status: 'failed',
        updatedAt: iso(60),
      },
      latestRun: {
        id: 'run-1',
        missionId: 'mission-1',
        status: 'failed',
        stage: 'dispatch',
        attempt: 1,
        createdAt: iso(120),
        failureCode: 'validation_failed',
      },
    });
    const diagnosis = missionRecoveryDiagnosis(failed);
    const prioritized = prioritizeMissionRecoveryActions(
      buildMissionRecoveryActions(failed),
      diagnosis?.primaryActionId,
    );

    expect(diagnosis?.primaryActionId).toBe('review_recovery');
    expect(prioritized.map((action) => action.id).slice(0, 3)).toEqual([
      'review_recovery',
      'retry_same',
      'retry_quick',
    ]);
  });

  it('nudges failed deep retries back to quick validation first', () => {
    const advice = missionRecoveryFailureAdvice(
      new Error('unknown retry failure'),
      {
        id: 'retry_deep',
        label: 'Deep 重跑',
        detail: 'full recovery',
        kind: 'retry_depth',
        depth: 'deep',
      },
    );

    expect(advice).toMatchObject({
      label: 'Deep 重跑失败',
      tone: 'warning',
    });
    expect(advice.detail).toContain('Quick');
  });

  it('expires terminal recovery feedback while keeping pending feedback visible', () => {
    const nowMs = Date.parse('2026-04-27T10:00:00.000Z');
    const successExpiresAt = missionRecoveryFeedbackExpiresAt('success', nowMs);
    const errorExpiresAt = missionRecoveryFeedbackExpiresAt('error', nowMs);

    expect(missionRecoveryFeedbackExpiresAt('pending', nowMs)).toBeUndefined();
    expect(successExpiresAt).toBe(nowMs + 30_000);
    expect(errorExpiresAt).toBe(nowMs + 90_000);
    expect(missionRecoveryFeedbackAutoDismissLabel(successExpiresAt, nowMs)).toBe('约 30 秒后自动收起');
    expect(missionRecoveryFeedbackAutoDismissLabel(successExpiresAt, successExpiresAt!)).toBe('即将自动收起');
    expect(shouldDismissMissionRecoveryFeedback(successExpiresAt, nowMs + 29_000)).toBe(false);
    expect(shouldDismissMissionRecoveryFeedback(successExpiresAt, nowMs + 30_000)).toBe(true);
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
      thesis: 'Relay confirmed into bottleneck suppliers',
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
    }), { nowMs: NOW });

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
    }), { nowMs: NOW });

    expect(checklist.readiness).toBe('ready');
    expect(checklist.blockers).toBe(0);
    expect(checklist.warnings).toBe(0);
  });

  it('links catalyst reminder actions into pre-trade readiness', () => {
    const baseReady = makeOpportunity({
      thesis: 'Relay confirmed into bottleneck suppliers',
      status: 'ready',
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
    });

    const missingDate = buildPreTradeChecklist({
      ...baseReady,
      catalystCalendar: [{ label: 'Coverage window', status: 'upcoming', confidence: 'placeholder' }],
    }, { nowMs: NOW });
    const mixed = buildPreTradeChecklist({
      ...baseReady,
      catalystCalendar: [
        { label: 'Supplier earnings', status: 'upcoming', dueAt: dayIso(4), confidence: 'inferred' },
        { label: 'Coverage date pending', status: 'upcoming', confidence: 'placeholder' },
      ],
    }, { nowMs: NOW });
    const observed = buildPreTradeChecklist({
      ...baseReady,
      catalystCalendar: [{ label: 'Listing observed', status: 'observed', dueAt: dayIso(-1) }],
    }, { nowMs: NOW });

    expect(missingDate.readiness).toBe('blocked');
    expect(missingDate.items.find((item) => item.id === 'catalyst_window')).toMatchObject({
      status: 'block',
      actionKind: 'fill_date',
      catalystUrgency: 'missing_date',
    });
    expect(mixed.readiness).toBe('blocked');
    expect(mixed.items.find((item) => item.id === 'catalyst_window')).toMatchObject({
      status: 'block',
      actionKind: 'fill_date',
      catalystUrgency: 'missing_date',
    });
    expect(mixed.items.find((item) => item.id === 'catalyst_window')?.detail).toContain('Coverage date pending');
    expect(missingDate.nextAction).toContain('缺少可解析日期');
    expect(observed.readiness).toBe('watch');
    expect(observed.items.find((item) => item.id === 'catalyst_window')).toMatchObject({
      status: 'warn',
      actionKind: 'review_observed',
      catalystUrgency: 'observed',
    });
  });

  it('tracks manual pre-trade confirmations without changing system readiness', () => {
    const checklist = buildPreTradeChecklist(makeOpportunity({
      thesis: 'Relay confirmed into bottleneck suppliers',
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
      catalystCalendar: [{ label: 'Coverage window', status: 'upcoming', confidence: 'placeholder' }],
    }), { nowMs: NOW });
    const progress = updatePreTradeProgress(
      {},
      'op-1',
      'catalyst_window',
      { completed: true, evidence: 'Source desk confirmed date pending' },
      NOW,
    );
    const summary = summarizePreTradeProgress(checklist.items, progress, 'op-1');

    expect(checklist.readiness).toBe('blocked');
    expect(summary).toMatchObject({
      actionable: 1,
      completed: 1,
      remaining: 0,
      label: '1/1 confirmed',
    });
    expect(progress['op-1'].catalyst_window).toMatchObject({
      completed: true,
      completedAt: new Date(NOW).toISOString(),
      evidence: 'Source desk confirmed date pending',
    });
  });

  it('normalizes stored pre-trade progress defensively', () => {
    expect(normalizePreTradeProgress({
      'op-1': {
        catalyst_window: {
          completed: true,
          updatedAt: new Date(NOW).toISOString(),
          evidence: '  source note  ',
        },
        bad: { completed: true },
      },
      empty: {},
      broken: null,
    })).toEqual({
      'op-1': {
        catalyst_window: {
          completed: true,
          completedAt: new Date(NOW).toISOString(),
          updatedAt: new Date(NOW).toISOString(),
          evidence: 'source note',
        },
      },
    });
  });

  it('builds a pre-trade audit trail from local events and timeline entries', () => {
    const localEvent: OpportunityEvent = {
      id: 'audit-local-1',
      opportunityId: 'op-1',
      type: 'pretrade_confirmed',
      message: 'Pre-trade check confirmed: Catalyst window for AI relay chain',
      timestamp: iso(20),
      meta: {
        label: 'Catalyst window',
        status: 'block',
        evidence: 'Company calendar pending',
      },
    };
    const opportunity = makeOpportunity({
      recentActionTimeline: [
        {
          id: 'opp_audit-timeline-1',
          timestamp: iso(50),
          kind: 'opportunity',
          category: 'execution',
          source: 'manual',
          decision: 'review',
          driver: 'manual',
          label: 'Pre-trade reopened',
          detail: 'Pre-trade check reopened: Risk/reward for AI relay chain',
          reasonSummary: 'Status warn',
          tone: 'neutral',
        },
      ],
    });

    const trail = buildPreTradeAuditTrail(opportunity, [localEvent]);

    expect(trail).toMatchObject({
      total: 2,
      confirmed: 1,
      reopened: 1,
      latestAt: localEvent.timestamp,
      label: '1 confirmed / 1 reopened',
    });
    expect(trail.entries[0]).toMatchObject({
      id: 'audit-local-1',
      type: 'pretrade_confirmed',
      label: 'Catalyst window confirmed',
      detail: 'Status block · Company calendar pending',
      source: 'event',
    });
    expect(trail.entries[1]).toMatchObject({
      id: 'audit-timeline-1',
      type: 'pretrade_unconfirmed',
      source: 'timeline',
    });
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
      missed: 0,
      overdue: 1,
      today: 1,
      soon: 1,
      missingDate: 0,
      observed: 0,
      watch: 1,
      headline: '1 overdue',
    });
  });

  it('turns missed, observed, and missing-date catalysts into explicit actions', () => {
    const reminders = buildCatalystReminders([
      makeOpportunity({
        id: 'missing-date',
        title: 'Missing date',
        catalystCalendar: [{ label: 'Coverage window', status: 'upcoming', confidence: 'placeholder' }],
      }),
      makeOpportunity({
        id: 'observed',
        title: 'Observed item',
        catalystCalendar: [{ label: 'Listing observed', status: 'observed', dueAt: dayIso(-1) }],
      }),
      makeOpportunity({
        id: 'missed',
        title: 'Missed item',
        catalystCalendar: [{ label: 'Filing missed', status: 'missed', dueAt: dayIso(-3) }],
      }),
    ], NOW);

    expect(reminders.map((reminder) => [reminder.opportunity.id, reminder.urgency, reminder.action])).toEqual([
      ['missed', 'missed', 'review_missed'],
      ['missing-date', 'missing_date', 'fill_date'],
      ['observed', 'observed', 'review_observed'],
    ]);
    expect(reminders.find((reminder) => reminder.opportunity.id === 'missing-date')?.actionLabel).toBe('补日期');
    expect(reminders.find((reminder) => reminder.opportunity.id === 'observed')?.detail).toContain('已观察');
    expect(summarizeCatalystReminders(reminders)).toMatchObject({
      missed: 1,
      missingDate: 1,
      observed: 1,
      headline: '1 missed',
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

  it('sorts catalyst reminders inside one opportunity before pre-trade consumes them', () => {
    const reminders = buildOpportunityCatalystReminders(makeOpportunity({
      catalystCalendar: [
        { label: 'Supplier earnings window', dueAt: dayIso(12), status: 'upcoming' },
        { label: 'Coverage date pending', status: 'upcoming', confidence: 'placeholder' },
        { label: 'Breadth observed', dueAt: dayIso(-1), status: 'observed' },
      ],
    }), NOW);

    expect(reminders.map((reminder) => [reminder.catalyst.label, reminder.urgency, reminder.action])).toEqual([
      ['Coverage date pending', 'missing_date', 'fill_date'],
      ['Breadth observed', 'observed', 'review_observed'],
      ['Supplier earnings window', 'watch', 'watch'],
    ]);
  });

  it('suppresses acknowledged and active snoozed catalyst reminders', () => {
    const reminders = buildOpportunityCatalystReminders(makeOpportunity({
      catalystCalendar: [
        { label: 'Earnings', dueAt: dayIso(1), status: 'upcoming' },
        { label: 'Coverage date pending', status: 'upcoming', confidence: 'placeholder' },
      ],
    }), NOW);
    const [earnings, coverage] = reminders;
    if (!earnings || !coverage) throw new Error('expected catalyst reminders');
    const acknowledged = preferenceForCatalystReminder(coverage, 'acknowledge', NOW);
    const snoozed = preferenceForCatalystReminder(earnings, 'snooze', NOW, dayIso(1));
    const preferences = {
      [coverage.id]: acknowledged,
      [earnings.id]: snoozed,
    };

    expect(isCatalystReminderSuppressed(coverage, preferences, NOW)).toBe(true);
    expect(isCatalystReminderSuppressed(earnings, preferences, NOW)).toBe(true);
    expect(splitCatalystRemindersByPreference(reminders, preferences, NOW)).toMatchObject({
      visible: [],
      suppressed: reminders,
    });
    expect(splitCatalystRemindersByPreference(reminders, {
      [earnings.id]: preferenceForCatalystReminder(earnings, 'snooze', NOW, dayIso(-1)),
    }, NOW).visible.map((reminder) => reminder.id)).toEqual(reminders.map((reminder) => reminder.id));
  });

  it('builds bounded local subscription records without suppressing reminders', () => {
    const [reminder] = buildOpportunityCatalystReminders(makeOpportunity({
      id: 'subscription-target',
      title: 'Subscription target',
      catalystCalendar: [{ label: 'Earnings', dueAt: dayIso(1), status: 'upcoming' }],
    }), NOW);
    if (!reminder) throw new Error('expected catalyst reminder');

    const subscription = subscriptionForCatalystReminder(reminder, NOW, 45, 'Calendar alert');

    expect(subscription).toMatchObject({
      reminderId: reminder.id,
      opportunityId: 'subscription-target',
      catalystLabel: 'Earnings',
      updatedAt: new Date(NOW).toISOString(),
      leadDays: 30,
      note: 'Calendar alert',
    });
    expect(isCatalystReminderSuppressed(reminder, {}, NOW)).toBe(false);
  });

  it('summarizes catalyst reminder subscription audit trail from events and timeline', () => {
    const localEvent: OpportunityEvent = {
      id: 'event-catalyst-subscribe-1',
      opportunityId: 'opp-audit',
      type: 'catalyst_reminder_updated',
      message: 'Catalyst reminder subscribed: Earnings',
      timestamp: '2026-05-10T09:00:00.000Z',
      meta: {
        preference: 'subscribe',
        catalystLabel: 'Earnings',
        urgency: 'soon',
        actionKind: 'prepare',
        subscriptionLeadDays: 3,
        note: 'Subscribed from drawer',
      },
    };
    const opportunity = makeOpportunity({
      id: 'opp-audit',
      recentActionTimeline: [
        {
          id: 'opp_event-catalyst-subscribe-1',
          timestamp: '2026-05-10T09:00:00.000Z',
          kind: 'opportunity',
          category: 'calendar',
          source: 'manual',
          decision: 'review',
          driver: 'calendar',
          label: 'Catalyst reminder subscribed',
          detail: 'Catalyst reminder subscribed',
          reasonSummary: 'Catalyst Earnings · Lead 3d',
          tone: 'positive',
        },
        {
          id: 'opp_event-catalyst-unsubscribe-1',
          timestamp: '2026-05-10T10:00:00.000Z',
          kind: 'opportunity',
          category: 'calendar',
          source: 'manual',
          decision: 'review',
          driver: 'calendar',
          label: 'Catalyst reminder unsubscribed',
          detail: 'Catalyst reminder unsubscribed',
          reasonSummary: 'Catalyst Earnings',
          tone: 'neutral',
        },
      ],
    });

    const trail = buildCatalystReminderAuditTrail(opportunity, [localEvent]);

    expect(trail).toMatchObject({
      total: 2,
      acknowledged: 0,
      snoozed: 0,
      subscribed: 1,
      reopened: 1,
      label: '0 handled / 0 snoozed / 1 subscribed',
    });
    expect(trail.entries[0]).toMatchObject({
      preference: 'unsubscribe',
      source: 'timeline',
    });
    expect(trail.entries[1]).toMatchObject({
      preference: 'subscribe',
      label: 'Earnings subscribed',
      source: 'event',
    });
    expect(trail.entries[1]?.detail).toContain('Lead 3d');
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
    expect(explanation.factors.find((factor) => factor.id === 'primary')?.contribution).toMatchObject({
      direction: 'positive',
      weight: 30,
    });
    expect(explanation.factors.find((factor) => factor.id === 'mission')).toMatchObject({
      tone: 'strong',
      value: 'fully_enriched',
      contribution: expect.objectContaining({ direction: 'positive', weight: 18 }),
    });
    expect(explanation.factors.find((factor) => factor.id === 'validation')).toMatchObject({
      tone: 'strong',
      value: 'confirmed',
      contribution: expect.objectContaining({ direction: 'positive', weight: 18 }),
    });
    expect(explanation.calibration).toMatchObject({
      stance: 'leading',
      positiveWeight: 110,
      riskWeight: 0,
      watchWeight: 22,
      netWeight: 110,
      totalFactors: 7,
      evidenceCoveragePct: 71,
    });
    expect(explanation.summary).toContain('Net +110');
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
    expect(explanation.factors.find((factor) => factor.id === 'mission')).toMatchObject({
      tone: 'risk',
      contribution: expect.objectContaining({ direction: 'negative', weight: 18 }),
    });
    expect(explanation.factors.find((factor) => factor.id === 'status_degraded')).toMatchObject({
      tone: 'risk',
      contribution: expect.objectContaining({ direction: 'negative', weight: 24 }),
    });
    expect(explanation.calibration).toMatchObject({
      stance: 'fragile',
      riskWeight: expect.any(Number),
    });
    expect(explanation.calibration.riskWeight).toBeGreaterThan(explanation.calibration.positiveWeight);
  });

  it('aligns score explanation with inbox ranking reasons', () => {
    const explanation = buildScoreExplanation(makeInboxItem({
      type: 'relay_chain',
      status: 'ready',
      inboxScore: 112,
      recommendedAction: 'analyze',
      inboxSummary: 'Relay ready',
      inboxReasons: [
        {
          code: 'relay_ready',
          label: '传导链可操作',
          detail: 'Confirmed leader to bottleneck chain',
          priority: 92,
        },
        {
          code: 'catalyst_due',
          label: '催化临近',
          detail: 'Earnings in 5 days',
          priority: 84,
        },
      ],
      scores: {
        purityScore: 72,
        scarcityScore: 68,
        tradeabilityScore: 76,
        relayScore: 88,
        catalystScore: 79,
        policyScore: 48,
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 82,
        validationStatus: 'confirmed',
        validationSummary: 'Relay confirmed by breadth.',
      },
    }));

    expect(explanation.factors.find((factor) => factor.id === 'ranking_signal')).toMatchObject({
      tone: 'strong',
      value: 112,
      detail: 'Inbox recommends analyze · 传导链可操作: Confirmed leader to bottleneck chain',
      contribution: expect.objectContaining({ direction: 'positive', weight: 20 }),
      evidence: [
        expect.objectContaining({
          id: 'inbox:relay_ready',
          source: 'opportunity_inbox',
          confidence: 'confirmed',
          value: 92,
        }),
        expect.objectContaining({
          id: 'inbox:catalyst_due',
          source: 'opportunity_inbox',
          confidence: 'confirmed',
          value: 84,
        }),
      ],
    });
    expect(explanation.calibration.positiveWeight).toBeGreaterThanOrEqual(20);
    expect(explanation.calibration.confirmedEvidenceFactors).toBeGreaterThanOrEqual(1);
  });

  it('treats review inbox ranking signals as risk drag', () => {
    const explanation = buildScoreExplanation(makeInboxItem({
      status: 'degraded',
      inboxScore: 101,
      recommendedAction: 'review',
      inboxSummary: 'Review required',
      inboxReasons: [
        {
          code: 'degraded',
          label: '需要复核',
          detail: 'Leader broke below validation line',
          priority: 96,
        },
      ],
    }));

    expect(explanation.factors.find((factor) => factor.id === 'ranking_signal')).toMatchObject({
      tone: 'risk',
      value: 101,
      contribution: expect.objectContaining({ direction: 'negative', weight: 20 }),
    });
    expect(explanation.calibration.riskWeight).toBeGreaterThanOrEqual(20);
  });

  it('attaches evidence refs to score factors from source provenance and profiles', () => {
    const explanation = buildScoreExplanation(makeOpportunity({
      type: 'ipo_spinout',
      scores: {
        purityScore: 78,
        scarcityScore: 72,
        tradeabilityScore: 68,
        relayScore: 40,
        catalystScore: 88,
        policyScore: 44,
      },
      latestMission: {
        id: 'mission-ipo-1',
        query: 'Review IPO setup',
        status: 'fully_enriched',
        source: 'opportunity_action',
        updatedAt: iso(120),
      },
      ipoProfile: {
        officialTradingDate: '2026-05-01',
        retainedStakePercent: 80,
        lockupDate: '2026-11-01',
        evidence: {
          officialTradingDate: {
            source: '424B4 filing',
            confidence: 'confirmed',
            observedAt: '2026-04-28T00:00:00.000Z',
          },
          retainedStakePercent: {
            source: 'S-1/A filing',
            confidence: 'inferred',
          },
        },
      },
      catalystCalendar: [
        {
          label: 'First earnings window',
          dueAt: '2026-08-10T20:00:00.000Z',
          status: 'upcoming',
          source: 'earnings_calendar',
          confidence: 'placeholder',
        },
      ],
      sourceProvenance: {
        total: 4,
        confirmed: 1,
        inferred: 1,
        placeholder: 1,
        unknown: 1,
        sources: ['424B4 filing', 'S-1/A filing', 'earnings_calendar', 'opportunity_action'],
        items: [
          {
            id: 'ipo:officialTradingDate',
            kind: 'ipo_field',
            field: 'ipoProfile.officialTradingDate',
            label: 'Trading date',
            source: '424B4 filing',
            confidence: 'confirmed',
            value: '2026-05-01',
          },
          {
            id: 'ipo:retainedStakePercent',
            kind: 'ipo_field',
            field: 'ipoProfile.retainedStakePercent',
            label: 'Retained stake',
            source: 'S-1/A filing',
            confidence: 'inferred',
            value: '80',
          },
          {
            id: 'catalyst:0',
            kind: 'catalyst',
            field: 'catalystCalendar.0',
            label: 'First earnings window',
            source: 'earnings_calendar',
            confidence: 'placeholder',
          },
          {
            id: 'mission:mission-ipo-1',
            kind: 'mission',
            field: 'latestMission',
            label: 'Latest mission',
            source: 'opportunity_action',
            confidence: 'unknown',
            value: 'fully_enriched',
          },
        ],
      },
    }));

    expect(explanation.factors.find((factor) => factor.id === 'trading_window')?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '424B4 filing', confidence: 'confirmed' }),
      expect.objectContaining({ source: 'earnings_calendar', confidence: 'placeholder' }),
    ]));
    expect(explanation.factors.find((factor) => factor.id === 'overhang')?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'S-1/A filing', confidence: 'inferred' }),
    ]));
    expect(explanation.factors.find((factor) => factor.id === 'mission')?.evidence).toEqual([
      expect.objectContaining({ source: 'opportunity_action', value: 'fully_enriched' }),
    ]);
  });

  it('prefers unified field evidence when explaining score and mission factors', () => {
    const explanation = buildScoreExplanation(makeOpportunity({
      type: 'relay_chain',
      scores: {
        purityScore: 76,
        scarcityScore: 70,
        tradeabilityScore: 81,
        relayScore: 91,
        catalystScore: 68,
        policyScore: 45,
      },
      latestMission: {
        id: 'mission-relay-1',
        query: 'Review relay chain',
        status: 'fully_enriched',
        source: 'opportunity_action',
        updatedAt: iso(120),
      },
      heatProfile: {
        temperature: 'hot',
        bottleneckTickers: ['MU'],
        laggardTickers: ['SNDK'],
        junkTickers: [],
        breadthScore: 84,
        validationStatus: 'confirmed',
        validationSummary: 'Field evidence confirms breadth and validation',
      },
      fieldEvidence: {
        total: 4,
        fields: 4,
        sources: ['field_service', 'heat_profile', 'opportunity_action'],
        items: [
          {
            id: 'field:relayScore',
            kind: 'score',
            field: 'scores.relayScore',
            label: 'Relay score',
            source: 'field_service',
            confidence: 'confirmed',
            value: '91',
            note: 'Score snapshot is backed by heat profile',
          },
          {
            id: 'field:validation',
            kind: 'profile',
            field: 'heatProfile.validationStatus',
            label: 'Heat validation',
            source: 'heat_profile',
            confidence: 'confirmed',
            value: 'confirmed',
          },
          {
            id: 'field:breadth',
            kind: 'profile',
            field: 'heatProfile.breadthScore',
            label: 'Heat breadth',
            source: 'heat_profile',
            confidence: 'unknown',
            value: '84',
          },
          {
            id: 'mission:mission-relay-1',
            kind: 'mission',
            field: 'latestMission',
            label: 'Latest mission',
            source: 'opportunity_action',
            confidence: 'unknown',
            value: 'fully_enriched',
          },
        ],
      },
    }));

    expect(explanation.factors.find((factor) => factor.id === 'primary')?.evidence?.[0]).toMatchObject({
      source: 'field_service',
      confidence: 'confirmed',
      value: '91',
    });
    expect(explanation.factors.find((factor) => factor.id === 'validation')?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'heat_profile', value: 'confirmed' }),
    ]));
    expect(explanation.factors.find((factor) => factor.id === 'mission')?.evidence).toEqual([
      expect.objectContaining({ source: 'opportunity_action', value: 'fully_enriched' }),
    ]);
    expect(explanation.calibration).toMatchObject({
      stance: 'leading',
      confirmedEvidenceFactors: 3,
    });
    expect(explanation.calibration.evidenceBackedFactors).toBeGreaterThanOrEqual(5);
  });
});

describe('opportunity workbench field evidence', () => {
  it('sorts evidence by confidence and exposes kind facets', () => {
    const view = buildFieldEvidenceView({
      total: 4,
      fields: 4,
      sources: ['scores', 'mission', 'profile'],
      items: [
        {
          id: 'mission:1',
          kind: 'mission',
          field: 'latestMission',
          label: 'Latest mission',
          source: 'mission',
          confidence: 'unknown',
          value: 'fully_enriched',
        },
        {
          id: 'profile:validation',
          kind: 'profile',
          field: 'heatProfile.validationStatus',
          label: 'Heat validation',
          source: 'profile',
          confidence: 'confirmed',
          value: 'confirmed',
        },
        {
          id: 'score:relay',
          kind: 'score',
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'scores',
          confidence: 'inferred',
          value: '88',
          artifact: {
            missionId: 'mission-1',
            runId: 'run-1',
            kind: 'evidence',
            href: '/missions/mission-1?run=run-1',
            label: 'Open evidence',
          },
        },
        {
          id: 'score:tradeability',
          kind: 'score',
          field: 'scores.tradeabilityScore',
          label: 'Tradeability score',
          source: 'scores',
          confidence: 'unknown',
          value: '82',
        },
      ],
    }, 'all', 3);

    expect(view.facets).toEqual(expect.arrayContaining([
      { id: 'all', label: 'All', count: 4 },
      { id: 'score', label: 'Score', count: 2 },
      { id: 'profile', label: 'Profile', count: 1 },
      { id: 'mission', label: 'Mission', count: 1 },
    ]));
    expect(view.items.map((item) => item.id)).toEqual(['profile:validation', 'score:relay', 'score:tradeability']);
    expect(view.items.find((item) => item.id === 'score:relay')?.artifact).toMatchObject({
      missionId: 'mission-1',
      runId: 'run-1',
      kind: 'evidence',
    });
    expect(view.hiddenCount).toBe(1);
  });

  it('filters evidence by kind and falls back when the active kind is unavailable', () => {
    const summary = {
      total: 2,
      fields: 2,
      sources: ['scores'],
      items: [
        {
          id: 'score:relay',
          kind: 'score' as const,
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'scores',
          confidence: 'confirmed' as const,
          value: '88',
        },
        {
          id: 'record:thesis',
          kind: 'record' as const,
          field: 'thesis',
          label: 'Thesis',
          source: 'record',
          confidence: 'unknown' as const,
          value: 'Relay thesis',
        },
      ],
    };

    expect(buildFieldEvidenceView(summary, 'score').items.map((item) => item.id)).toEqual(['score:relay']);
    expect(buildFieldEvidenceView(summary, 'event').items.map((item) => item.id)).toEqual(['score:relay', 'record:thesis']);
  });

  it('builds manual evidence field options from normalized summary refs', () => {
    const options = buildFieldEvidenceFieldOptions({
      total: 3,
      fields: 2,
      sources: ['scores', 'manual'],
      items: [
        {
          id: 'manual:relay',
          kind: 'source',
          field: 'scores.relayScore',
          label: 'Manual relay note',
          source: 'manual',
          confidence: 'unknown',
          note: 'Older manual note',
        },
        {
          id: 'score:relay',
          kind: 'score',
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'scores',
          confidence: 'confirmed',
          value: '88',
        },
        {
          id: 'record:thesis',
          kind: 'record',
          field: 'thesis',
          label: 'Thesis',
          source: 'record',
          confidence: 'unknown',
          value: 'Relay thesis',
        },
      ],
    });

    expect(options).toEqual([
      expect.objectContaining({
        value: 'scores.relayScore',
        label: 'Relay score',
        kind: 'score',
      }),
      expect.objectContaining({
        value: 'thesis',
        label: 'Thesis',
        kind: 'record',
      }),
    ]);
  });

  it('summarizes adopted field evidence values and conflicting alternatives', () => {
    const review = buildFieldEvidenceFieldReview({
      total: 5,
      fields: 3,
      sources: ['scores', 'manual', 'profile'],
      items: [
        {
          id: 'manual:relay-old',
          kind: 'source',
          field: 'scores.relayScore',
          label: 'Manual relay score',
          source: 'manual',
          confidence: 'inferred',
          value: '71',
        },
        {
          id: 'score:relay',
          kind: 'score',
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'scores',
          confidence: 'confirmed',
          value: '88',
        },
        {
          id: 'profile:validation',
          kind: 'profile',
          field: 'heatProfile.validationStatus',
          label: 'Heat validation',
          source: 'profile',
          confidence: 'confirmed',
          value: 'confirmed',
        },
        {
          id: 'manual:validation',
          kind: 'source',
          field: 'heatProfile.validationStatus',
          label: 'Manual validation',
          source: 'manual',
          confidence: 'confirmed',
          value: 'confirmed',
        },
        {
          id: 'record:thesis',
          kind: 'record',
          field: 'thesis',
          label: 'Thesis',
          source: 'record',
          confidence: 'unknown',
          value: 'Relay thesis',
        },
      ],
    });

    expect(review.conflictCount).toBe(1);
    expect(review.lowConfidenceCount).toBe(1);
    expect(review.items.map((item) => item.field)).toEqual([
      'scores.relayScore',
      'thesis',
      'heatProfile.validationStatus',
    ]);
    expect(review.items[0]).toMatchObject({
      field: 'scores.relayScore',
      hasConflict: true,
      sourceCount: 2,
      valueCount: 2,
      adopted: expect.objectContaining({ id: 'score:relay' }),
      adoptedValue: '88',
      adoptedReason: 'Adopted because scores is confirmed evidence.',
      reviewPriority: 'conflict',
      reviewHint: 'Different sources disagree on the field value. Review before relying on this opportunity.',
      conflictValues: [
        expect.objectContaining({ value: '88', adopted: true, sources: ['scores'], count: 1 }),
        expect.objectContaining({ value: '71', adopted: false, sources: ['manual'], count: 1 }),
      ],
      alternatives: [expect.objectContaining({ id: 'manual:relay-old' })],
    });
    expect(review.items[1]).toMatchObject({
      field: 'thesis',
      hasConflict: false,
      sourceCount: 1,
      valueCount: 1,
      reviewPriority: 'low_confidence',
    });
    expect(review.items[2]).toMatchObject({
      field: 'heatProfile.validationStatus',
      hasConflict: false,
      sourceCount: 2,
      valueCount: 1,
      reviewPriority: 'multi_source',
      conflictValues: [
        expect.objectContaining({ value: 'confirmed', adopted: true, sources: ['manual', 'profile'], count: 2 }),
      ],
    });
  });

  it('creates record drafts from field evidence refs without dropping value context', () => {
    expect(buildFieldEvidenceRecordDraftFromRef({
      id: 'manual:relay',
      kind: 'source',
      field: 'scores.relayScore',
      label: 'Relay score',
      source: 'manual_review',
      confidence: 'inferred',
      value: '71',
    })).toEqual({
      field: 'scores.relayScore',
      label: 'Relay score',
      kind: 'source',
      source: 'manual_review',
      confidence: 'inferred',
      value: '71',
      note: 'Reviewed manual_review evidence for scores.relayScore.',
    });

    expect(buildFieldEvidenceRecordDraftFromRef({
      id: 'manual:thesis',
      kind: 'record',
      field: 'thesis',
      label: 'Thesis',
      source: 'manual_review',
      confidence: 'confirmed',
      note: 'IR deck confirms the catalyst.',
    })).toMatchObject({
      field: 'thesis',
      note: 'IR deck confirms the catalyst.',
    });
  });

  it('builds batch manual review drafts from conflicting and low-confidence fields', () => {
    const review = buildFieldEvidenceFieldReview({
      total: 6,
      fields: 3,
      sources: ['scores', 'manual', 'mission'],
      items: [
        {
          id: 'score:relay',
          kind: 'score',
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'scores',
          confidence: 'confirmed',
          value: '88',
        },
        {
          id: 'manual:relay',
          kind: 'source',
          field: 'scores.relayScore',
          label: 'Manual relay',
          source: 'manual',
          confidence: 'inferred',
          value: '71',
        },
        {
          id: 'mission:policy',
          kind: 'mission',
          field: 'policyStatus',
          label: 'Policy status',
          source: 'mission',
          confidence: 'inferred',
          value: 'pending',
        },
        {
          id: 'manual:policy',
          kind: 'source',
          field: 'policyStatus',
          label: 'Policy note',
          source: 'manual',
          confidence: 'unknown',
          value: 'pending',
        },
      ],
    });

    const drafts = buildFieldEvidenceBatchDrafts(review.items);

    expect(drafts).toEqual([
      expect.objectContaining({
        id: 'batch:scores.relayScore',
        selected: true,
        field: 'scores.relayScore',
        source: 'manual_review',
        confidence: 'confirmed',
        value: '88',
        reason: 'conflict',
      }),
      expect.objectContaining({
        id: 'batch:policyStatus',
        selected: true,
        field: 'policyStatus',
        source: 'manual_review',
        confidence: 'confirmed',
        value: 'pending',
        reason: 'low_confidence',
      }),
    ]);
    expect(drafts[0]?.note).toContain('Alternatives: 71 (manual).');
    expect(drafts[1]?.note).toContain('Manual review confirmed low-confidence evidence');
  });

  it('builds field evidence audit entries with status filters and restore state', () => {
    const events: OpportunityEvent[] = [
      {
        id: 'evt-record',
        opportunityId: 'opp-1',
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-04-28T03:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          label: 'Relay score',
          source: 'manual_review',
          confidence: 'confirmed',
          note: 'Verified.',
        },
      },
      {
        id: 'evt-invalidated',
        opportunityId: 'opp-1',
        type: 'field_evidence_invalidated',
        message: 'Field evidence invalidated',
        timestamp: '2026-04-28T03:05:00.000Z',
        meta: {
          evidenceId: 'evt-record',
          reason: 'Superseded.',
        },
      },
    ];

    const view = buildFieldEvidenceAuditView(events, { status: 'invalidated' });

    expect(view.facets).toEqual(expect.arrayContaining([
      { id: 'recorded', label: 'Recorded', count: 1 },
      { id: 'invalidated', label: 'Invalidated', count: 1 },
    ]));
    expect(view.entries).toEqual([
      expect.objectContaining({
        eventId: 'evt-invalidated',
        evidenceId: 'evt-record',
        status: 'invalidated',
        currentStatus: 'invalidated',
        field: 'scores.relayScore',
        source: 'manual_review',
        canRestore: true,
      }),
    ]);
    expect(buildFieldEvidenceAuditView(events, { source: 'manual_review', confidence: 'confirmed' }).entries).toHaveLength(2);
  });

  it('marks restored field evidence audit entries as active', () => {
    const events: OpportunityEvent[] = [
      {
        id: 'evt-record',
        opportunityId: 'opp-1',
        type: 'field_evidence_recorded',
        message: 'Field evidence recorded',
        timestamp: '2026-04-28T03:00:00.000Z',
        meta: {
          field: 'scores.relayScore',
          source: 'manual_review',
          confidence: 'confirmed',
        },
      },
      {
        id: 'evt-invalidated',
        opportunityId: 'opp-1',
        type: 'field_evidence_invalidated',
        message: 'Field evidence invalidated',
        timestamp: '2026-04-28T03:05:00.000Z',
        meta: { evidenceId: 'evt-record', reason: 'Superseded.' },
      },
      {
        id: 'evt-restored',
        opportunityId: 'opp-1',
        type: 'field_evidence_restored',
        message: 'Field evidence restored',
        timestamp: '2026-04-28T03:10:00.000Z',
        meta: { evidenceId: 'evt-record', reason: 'Rechecked.' },
      },
    ];

    const view = buildFieldEvidenceAuditView(events, { status: 'restored' });

    expect(view.entries).toEqual([
      expect.objectContaining({
        eventId: 'evt-restored',
        currentStatus: 'active',
        canRestore: false,
      }),
    ]);
    expect(buildFieldEvidenceAuditView(events, { status: 'invalidated' }).entries[0]?.canRestore).toBe(false);
  });
});

describe('opportunity workbench source provenance inspection', () => {
  it('groups provenance by field and flags weak, missing, and conflicting evidence', () => {
    const inspection = buildSourceProvenanceInspection(makeOpportunity({
      sourceProvenance: {
        total: 4,
        confirmed: 1,
        inferred: 1,
        placeholder: 1,
        unknown: 1,
        sources: ['424B4', 'S-1/A', 'calendar', 'manual'],
        items: [
          {
            id: 'ipo:trading',
            kind: 'ipo_field',
            field: 'ipoProfile.officialTradingDate',
            label: 'Trading date',
            source: '424B4',
            confidence: 'confirmed',
            value: '2026-05-01',
          },
          {
            id: 'ipo:trading-alt',
            kind: 'ipo_field',
            field: 'ipoProfile.officialTradingDate',
            label: 'Trading date',
            source: 'manual',
            confidence: 'inferred',
            value: '2026-05-02',
          },
          {
            id: 'ipo:lockup',
            kind: 'ipo_field',
            field: 'ipoProfile.lockupDate',
            label: 'Lockup',
            source: 'S-1/A',
            confidence: 'inferred',
            value: '2026-11-01',
          },
          {
            id: 'catalyst:earnings',
            kind: 'catalyst',
            field: 'catalystCalendar.0',
            label: 'First earnings',
            source: 'calendar',
            confidence: 'placeholder',
          },
        ],
      },
      fieldEvidence: {
        total: 1,
        fields: 1,
        sources: ['field_service'],
        items: [
          {
            id: 'field:lockup',
            kind: 'source',
            field: 'ipoProfile.lockupDate',
            label: 'Lockup',
            source: 'field_service',
            confidence: 'confirmed',
            value: '2026-11-01',
          },
        ],
      },
    }));

    expect(inspection).toMatchObject({
      totalFields: 3,
      confirmedFields: 1,
      weakFields: 0,
      missingFields: 1,
      conflictFields: 1,
    });
    expect(inspection?.rows.map((row) => [row.field, row.status])).toEqual([
      ['ipoProfile.officialTradingDate', 'conflict'],
      ['catalystCalendar.0', 'missing'],
      ['ipoProfile.lockupDate', 'confirmed'],
    ]);
    expect(inspection?.rows.find((row) => row.field === 'ipoProfile.lockupDate')).toMatchObject({
      sourceCount: 2,
      confidence: 'confirmed',
      valueCount: 1,
      adoptedValue: '2026-11-01',
      reviewHint: 'Confirmed source chain is usable.',
      valueGroups: [
        expect.objectContaining({
          value: '2026-11-01',
          adopted: true,
          sources: ['S-1/A', 'field_service'],
          count: 2,
        }),
      ],
    });
    expect(inspection?.rows.find((row) => row.field === 'ipoProfile.officialTradingDate')).toMatchObject({
      adoptedValue: '2026-05-01',
      reviewHint: 'Resolve competing values before using this field in sizing or timing.',
      valueGroups: [
        expect.objectContaining({ value: '2026-05-01', adopted: true, sources: ['424B4'] }),
        expect.objectContaining({ value: '2026-05-02', adopted: false, sources: ['manual'] }),
      ],
    });
  });

  it('includes field-evidence-only fields in source provenance inspection', () => {
    const inspection = buildSourceProvenanceInspection(makeOpportunity({
      sourceProvenance: {
        total: 1,
        confirmed: 1,
        inferred: 0,
        placeholder: 0,
        unknown: 0,
        sources: ['mission'],
        items: [
          {
            id: 'mission:latest',
            kind: 'mission',
            field: 'latestMission',
            label: 'Latest mission',
            source: 'mission',
            confidence: 'confirmed',
            value: 'fully_enriched',
          },
        ],
      },
      fieldEvidence: {
        total: 2,
        fields: 2,
        sources: ['manual_review', 'mission'],
        items: [
          {
            id: 'manual:policy',
            kind: 'source',
            field: 'policyStatus',
            label: 'Policy status',
            source: 'manual_review',
            confidence: 'confirmed',
            value: 'approved',
          },
          {
            id: 'mission:latest',
            kind: 'mission',
            field: 'latestMission',
            label: 'Latest mission',
            source: 'mission',
            confidence: 'confirmed',
            value: 'fully_enriched',
          },
        ],
      },
    }));

    expect(inspection).toMatchObject({
      totalFields: 2,
      confirmedFields: 2,
      conflictFields: 0,
      missingFields: 0,
      weakFields: 0,
    });
    expect(inspection?.rows.map((row) => [row.field, row.status])).toEqual([
      ['latestMission', 'confirmed'],
      ['policyStatus', 'confirmed'],
    ]);
    expect(inspection?.rows.find((row) => row.field === 'policyStatus')).toMatchObject({
      label: 'Policy status',
      sourceCount: 1,
      confidence: 'confirmed',
      adoptedValue: 'approved',
      valueGroups: [
        expect.objectContaining({
          value: 'approved',
          adopted: true,
          sources: ['manual_review'],
        }),
      ],
    });
  });

  it('can build source provenance inspection from field evidence without provenance rows', () => {
    const inspection = buildSourceProvenanceInspection(makeOpportunity({
      fieldEvidence: {
        total: 1,
        fields: 1,
        sources: ['manual_review'],
        items: [
          {
            id: 'manual:trade',
            kind: 'source',
            field: 'scores.tradeabilityScore',
            label: 'Tradeability score',
            source: 'manual_review',
            confidence: 'inferred',
            value: '72',
          },
        ],
      },
    }));

    expect(inspection).toMatchObject({
      totalFields: 1,
      confirmedFields: 0,
      weakFields: 1,
      missingFields: 0,
      conflictFields: 0,
    });
    expect(inspection?.rows[0]).toMatchObject({
      field: 'scores.tradeabilityScore',
      label: 'Tradeability score',
      status: 'weak',
      reviewHint: 'Confirm this source with filing, mission output, or manual evidence.',
    });
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
