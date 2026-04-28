import {
  appendOpportunityEvent,
  buildLatestMissionDiff,
  buildOpportunityActionTimeline,
  buildOpportunityBoardHealthMap,
  buildOpportunityInbox,
  buildOpportunityPlaybook,
  buildOpportunitySuggestedMission,
  buildOpportunitySuggestedMissions,
  buildWhyNowSummary,
  createOpportunity,
  detectOpportunityHeatInflection,
  emitOpportunityDerivedEvents,
  getLatestOpportunityDiff,
  getMission,
  getMissionFromIndex,
  getOpportunity,
  getOpportunityHeatHistory,
  listMissionEvents,
  listMissionRuns,
  listOpportunities,
  listOpportunityEvents,
  updateOpportunity,
  type CreateOpportunityInput,
  type OpportunityHeatProfile,
  type OpportunityBoardHealthMap,
  type OpportunityCatalystItem,
  type OpportunityInboxItem,
  type OpportunityIpoProfile,
  type OpportunityProxyProfile,
  type OpportunityRecord,
  type OpportunityScores,
  type OpportunityStage,
  type OpportunityStatus,
  type OpportunityType,
  type OpportunitySummaryRecord,
  type UpdateOpportunityInput,
} from '../../workflows';
import type {
  CreateOpportunityPayload,
  UpdateOpportunityPayload,
} from '../validation';

type OpportunityDomainIssue = {
  path: string;
  message: string;
};

type OpportunityDomainState = {
  type: OpportunityType;
  stage?: OpportunityStage | undefined;
  status?: OpportunityStatus | undefined;
  primaryTicker?: string | undefined;
  leaderTicker?: string | undefined;
  proxyTicker?: string | undefined;
  relatedTickers?: string[] | undefined;
  relayTickers?: string[] | undefined;
  nextCatalystAt?: string | undefined;
  policyStatus?: string | undefined;
  heatProfile?: Partial<OpportunityHeatProfile> | undefined;
  proxyProfile?: Partial<OpportunityProxyProfile> | undefined;
  ipoProfile?: OpportunityIpoProfile | undefined;
  catalystCalendar?: OpportunityCatalystItem[] | undefined;
};

export async function buildOpportunitySummary(
  opportunity: OpportunityRecord,
): Promise<OpportunitySummaryRecord> {
  const latestMission = opportunity.latestMissionId
    ? await getMissionFromIndex(opportunity.latestMissionId) || getMission(opportunity.latestMissionId)
    : null;
  const runs = latestMission ? await listMissionRuns(latestMission.id) : [];
  const latestRun = runs[0] || null;
  const latestDiff = latestMission ? buildLatestMissionDiff(latestMission, runs) : null;
  const latestOpportunityDiff = await getLatestOpportunityDiff(opportunity.id);
  const recentHeatHistory = opportunity.type === 'relay_chain'
    ? await getOpportunityHeatHistory(opportunity.id, 5)
    : [];
  const recentOpportunityEvents = await listOpportunityEvents(opportunity.id, 4);
  const recentMissionEvents = latestMission ? listMissionEvents(latestMission.id).slice(-3) : [];
  const heatInflection = opportunity.type === 'relay_chain'
    ? recentHeatHistory.length > 1
      ? detectOpportunityHeatInflection(recentHeatHistory)
      : null
    : null;
  const summaryBase: OpportunitySummaryRecord = {
    ...opportunity,
    ...(latestMission
      ? {
          latestMission: {
            id: latestMission.id,
            query: latestMission.input.query,
            status: latestMission.status,
            updatedAt: latestMission.updatedAt,
            ...(latestMission.input.source ? { source: latestMission.input.source } : {}),
          },
        }
      : {}),
    ...(latestRun ? { latestRun } : {}),
    ...(latestDiff ? { latestDiff } : {}),
    ...(latestOpportunityDiff ? { latestOpportunityDiff } : {}),
    ...(recentHeatHistory.length > 0 ? { recentHeatHistory } : {}),
    ...(heatInflection ? { heatInflection } : {}),
  };

  return {
    ...summaryBase,
    whyNowSummary: buildWhyNowSummary(summaryBase),
    playbook: buildOpportunityPlaybook(summaryBase),
    suggestedMission: buildOpportunitySuggestedMission(summaryBase),
    suggestedMissions: buildOpportunitySuggestedMissions(summaryBase),
    recentActionTimeline: buildOpportunityActionTimeline(recentOpportunityEvents, recentMissionEvents, 6),
  };
}

export async function listOpportunitySummaries(limit = 50): Promise<OpportunitySummaryRecord[]> {
  const opportunities = await listOpportunities(limit);
  return Promise.all(opportunities.map((opportunity) => buildOpportunitySummary(opportunity)));
}

export async function getOpportunitySummary(id: string): Promise<OpportunitySummaryRecord | null> {
  const opportunity = await getOpportunity(id);
  return opportunity ? buildOpportunitySummary(opportunity) : null;
}

export async function getOpportunitySummaryForRecord(
  opportunity: OpportunityRecord,
): Promise<OpportunitySummaryRecord> {
  const latest = await getOpportunity(opportunity.id);
  return buildOpportunitySummary(latest || opportunity);
}

export async function listOpportunityInboxItems(
  limit = 12,
  sourceLimit = 200,
): Promise<OpportunityInboxItem[]> {
  const summaries = await listOpportunitySummaries(sourceLimit);
  return buildOpportunityInbox(summaries, limit);
}

export async function getOpportunityInboxItem(id: string): Promise<OpportunityInboxItem | null> {
  const summary = await getOpportunitySummary(id);
  if (!summary) return null;

  const [item] = buildOpportunityInbox([summary], 1);
  return item || null;
}

export async function getOpportunityBoardHealth(
  limit = 50,
): Promise<OpportunityBoardHealthMap> {
  const summaries = await listOpportunitySummaries(limit);
  return buildOpportunityBoardHealthMap(summaries);
}

function omitUndefinedFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}

function normalizeScorePayload(
  scores?: CreateOpportunityPayload['scores'] | UpdateOpportunityPayload['scores'],
): Partial<OpportunityScores> | undefined {
  return scores ? omitUndefinedFields(scores) as Partial<OpportunityScores> : undefined;
}

function normalizeHeatProfilePayload(
  heatProfile?: CreateOpportunityPayload['heatProfile'] | UpdateOpportunityPayload['heatProfile'],
): Partial<OpportunityHeatProfile> | undefined {
  return heatProfile ? omitUndefinedFields(heatProfile) as Partial<OpportunityHeatProfile> : undefined;
}

function normalizeProxyProfilePayload(
  proxyProfile?: CreateOpportunityPayload['proxyProfile'] | UpdateOpportunityPayload['proxyProfile'],
): Partial<OpportunityProxyProfile> | undefined {
  return proxyProfile ? omitUndefinedFields(proxyProfile) as Partial<OpportunityProxyProfile> : undefined;
}

function trimmed(value?: string | null): string {
  return (value || '').trim();
}

function cleanList(values?: string[]): string[] {
  return (values || []).map(value => value.trim()).filter(Boolean);
}

function hasAnyText(...values: Array<string | undefined | null>): boolean {
  return values.some(value => trimmed(value).length > 0);
}

function hasAnyItems(...values: Array<string[] | undefined>): boolean {
  return values.some(value => cleanList(value).length > 0);
}

function isMatureStageOrStatus(state: OpportunityDomainState): boolean {
  return state.stage === 'ready'
    || state.stage === 'active'
    || state.status === 'ready'
    || state.status === 'active';
}

function pushIssue(
  issues: OpportunityDomainIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function validateTypeProfileAlignment(
  state: OpportunityDomainState,
  issues: OpportunityDomainIssue[],
  changedProfiles: Partial<Record<'heatProfile' | 'proxyProfile' | 'ipoProfile', boolean>> = {
    heatProfile: true,
    proxyProfile: true,
    ipoProfile: true,
  },
): void {
  if (state.type === 'relay_chain') {
    if (changedProfiles.proxyProfile && state.proxyProfile) {
      pushIssue(issues, 'proxyProfile', 'relay_chain opportunities cannot use proxyProfile');
    }
    if (changedProfiles.ipoProfile && state.ipoProfile) {
      pushIssue(issues, 'ipoProfile', 'relay_chain opportunities cannot use ipoProfile');
    }
  }

  if (state.type === 'proxy_narrative') {
    if (changedProfiles.heatProfile && state.heatProfile) {
      pushIssue(issues, 'heatProfile', 'proxy_narrative opportunities cannot use heatProfile');
    }
    if (changedProfiles.ipoProfile && state.ipoProfile) {
      pushIssue(issues, 'ipoProfile', 'proxy_narrative opportunities cannot use ipoProfile');
    }
  }

  if (state.type === 'ipo_spinout') {
    if (changedProfiles.heatProfile && state.heatProfile) {
      pushIssue(issues, 'heatProfile', 'ipo_spinout opportunities cannot use heatProfile');
    }
    if (changedProfiles.proxyProfile && state.proxyProfile) {
      pushIssue(issues, 'proxyProfile', 'ipo_spinout opportunities cannot use proxyProfile');
    }
  }
}

function validateStageStatusPair(state: OpportunityDomainState, issues: OpportunityDomainIssue[]): void {
  if (state.stage === 'archived' && state.status !== 'archived') {
    pushIssue(issues, 'status', 'archived stage requires archived status');
  }
  if (state.status === 'archived' && state.stage !== 'archived') {
    pushIssue(issues, 'stage', 'archived status requires archived stage');
  }
  if (state.stage === 'active' && state.status !== 'active' && state.status !== 'degraded') {
    pushIssue(issues, 'status', 'active stage requires active or degraded status');
  }
  if (state.status === 'active' && state.stage !== 'active') {
    pushIssue(issues, 'stage', 'active status requires active stage');
  }
}

function validateMatureOpportunityQuality(state: OpportunityDomainState, issues: OpportunityDomainIssue[]): void {
  if (!isMatureStageOrStatus(state)) return;

  if (state.type === 'relay_chain') {
    if (!hasAnyText(state.leaderTicker)) {
      pushIssue(issues, 'leaderTicker', 'ready/active relay_chain opportunities require a leaderTicker');
    }
    if (!hasAnyItems(state.relatedTickers, state.heatProfile?.bottleneckTickers)) {
      pushIssue(issues, 'relatedTickers', 'ready/active relay_chain opportunities require related or bottleneck tickers');
    }
    if (!hasAnyItems(state.relayTickers, state.heatProfile?.laggardTickers)) {
      pushIssue(issues, 'relayTickers', 'ready/active relay_chain opportunities require relay or laggard tickers');
    }
  }

  if (state.type === 'proxy_narrative') {
    if (!hasAnyText(state.proxyTicker, state.primaryTicker)) {
      pushIssue(issues, 'proxyTicker', 'ready/active proxy_narrative opportunities require proxyTicker or primaryTicker');
    }
    if (!state.proxyProfile && !hasAnyText(state.policyStatus)) {
      pushIssue(issues, 'proxyProfile', 'ready/active proxy_narrative opportunities require proxyProfile or policyStatus');
    }
  }

  if (state.type === 'ipo_spinout') {
    if (!hasAnyText(state.primaryTicker)) {
      pushIssue(issues, 'primaryTicker', 'ready/active ipo_spinout opportunities require a primaryTicker');
    }
    if (!hasAnyText(
      state.nextCatalystAt,
      state.ipoProfile?.officialTradingDate,
      state.ipoProfile?.spinoutDate,
      state.ipoProfile?.lockupDate,
      state.ipoProfile?.firstIndependentEarningsAt,
      state.catalystCalendar?.[0]?.dueAt,
    )) {
      pushIssue(issues, 'nextCatalystAt', 'ready/active ipo_spinout opportunities require a catalyst date or IPO profile date');
    }
  }
}

function validateOpportunityDomainState(
  state: OpportunityDomainState,
  changedProfiles?: Partial<Record<'heatProfile' | 'proxyProfile' | 'ipoProfile', boolean>>,
): OpportunityDomainIssue[] {
  const issues: OpportunityDomainIssue[] = [];
  validateTypeProfileAlignment(state, issues, changedProfiles);
  validateStageStatusPair(state, issues);
  validateMatureOpportunityQuality(state, issues);
  return issues;
}

function buildCreateOpportunityInput(body: CreateOpportunityPayload): CreateOpportunityInput | null {
  const title = (body.title || body.query || '').trim();
  if (!title) return null;
  const scores = normalizeScorePayload(body.scores);
  const heatProfile = normalizeHeatProfilePayload(body.heatProfile);
  const proxyProfile = normalizeProxyProfilePayload(body.proxyProfile);

  return {
    type: body.type,
    title,
    ...(body.query ? { query: body.query } : {}),
    ...(body.thesis ? { thesis: body.thesis } : {}),
    ...(body.summary ? { summary: body.summary } : {}),
    ...(body.stage ? { stage: body.stage } : {}),
    ...(body.status ? { status: body.status } : {}),
    ...(body.primaryTicker ? { primaryTicker: body.primaryTicker } : {}),
    ...(body.leaderTicker ? { leaderTicker: body.leaderTicker } : {}),
    ...(body.proxyTicker ? { proxyTicker: body.proxyTicker } : {}),
    ...(body.relatedTickers ? { relatedTickers: body.relatedTickers } : {}),
    ...(body.relayTickers ? { relayTickers: body.relayTickers } : {}),
    ...(body.nextCatalystAt ? { nextCatalystAt: body.nextCatalystAt } : {}),
    ...(body.supplyOverhang ? { supplyOverhang: body.supplyOverhang } : {}),
    ...(body.policyStatus ? { policyStatus: body.policyStatus } : {}),
    ...(scores ? { scores } : {}),
    ...(heatProfile ? { heatProfile } : {}),
    ...(proxyProfile ? { proxyProfile } : {}),
    ...(body.ipoProfile ? { ipoProfile: body.ipoProfile } : {}),
    ...(body.catalystCalendar ? { catalystCalendar: body.catalystCalendar } : {}),
  };
}

function buildUpdateOpportunityInput(body: UpdateOpportunityPayload): UpdateOpportunityInput {
  const updates: UpdateOpportunityInput = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.query !== undefined) updates.query = body.query;
  if (body.thesis !== undefined) updates.thesis = body.thesis;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.status !== undefined) updates.status = body.status;
  if (body.primaryTicker !== undefined) updates.primaryTicker = body.primaryTicker;
  if (body.leaderTicker !== undefined) updates.leaderTicker = body.leaderTicker;
  if (body.proxyTicker !== undefined) updates.proxyTicker = body.proxyTicker;
  if (body.relatedTickers !== undefined) updates.relatedTickers = body.relatedTickers;
  if (body.relayTickers !== undefined) updates.relayTickers = body.relayTickers;
  if (body.nextCatalystAt !== undefined) updates.nextCatalystAt = body.nextCatalystAt;
  if (body.supplyOverhang !== undefined) updates.supplyOverhang = body.supplyOverhang;
  if (body.policyStatus !== undefined) updates.policyStatus = body.policyStatus;
  if (body.scores !== undefined) updates.scores = normalizeScorePayload(body.scores);
  if (body.heatProfile !== undefined) updates.heatProfile = normalizeHeatProfilePayload(body.heatProfile);
  if (body.proxyProfile !== undefined) updates.proxyProfile = normalizeProxyProfilePayload(body.proxyProfile);
  if (body.ipoProfile !== undefined) updates.ipoProfile = body.ipoProfile;
  if (body.catalystCalendar !== undefined) updates.catalystCalendar = body.catalystCalendar;
  return updates;
}

export async function createOpportunityForApi(body: CreateOpportunityPayload) {
  const input = buildCreateOpportunityInput(body);
  if (!input) {
    return {
      status: 'invalid' as const,
      error: 'Invalid opportunity domain state',
      details: [{ path: 'title', message: 'title or query is required' }],
    };
  }

  const domainIssues = validateOpportunityDomainState(input);
  if (domainIssues.length > 0) {
    return {
      status: 'invalid' as const,
      error: 'Invalid opportunity domain state',
      details: domainIssues,
    };
  }

  const opportunity = await createOpportunity(input);
  return { status: 'created' as const, opportunity };
}

function buildProjectedOpportunityState(
  current: OpportunityRecord,
  updates: UpdateOpportunityInput,
): OpportunityDomainState {
  return {
    type: current.type,
    stage: updates.stage !== undefined ? updates.stage : current.stage,
    status: updates.status !== undefined ? updates.status : current.status,
    primaryTicker: updates.primaryTicker !== undefined ? updates.primaryTicker : current.primaryTicker,
    leaderTicker: updates.leaderTicker !== undefined ? updates.leaderTicker : current.leaderTicker,
    proxyTicker: updates.proxyTicker !== undefined ? updates.proxyTicker : current.proxyTicker,
    relatedTickers: updates.relatedTickers !== undefined ? updates.relatedTickers : current.relatedTickers,
    relayTickers: updates.relayTickers !== undefined ? updates.relayTickers : current.relayTickers,
    nextCatalystAt: updates.nextCatalystAt !== undefined ? updates.nextCatalystAt || undefined : current.nextCatalystAt,
    policyStatus: updates.policyStatus !== undefined ? updates.policyStatus || undefined : current.policyStatus,
    heatProfile: updates.heatProfile !== undefined ? updates.heatProfile : current.heatProfile,
    proxyProfile: updates.proxyProfile !== undefined ? updates.proxyProfile : current.proxyProfile,
    ipoProfile: updates.ipoProfile !== undefined ? updates.ipoProfile : current.ipoProfile,
    catalystCalendar: updates.catalystCalendar !== undefined ? updates.catalystCalendar : current.catalystCalendar,
  };
}

export async function updateOpportunityForApi(id: string, body: UpdateOpportunityPayload) {
  const previous = await getOpportunity(id);
  if (!previous) return { status: 'not_found' as const };

  const updates = buildUpdateOpportunityInput(body);
  const domainIssues = validateOpportunityDomainState(
    buildProjectedOpportunityState(previous, updates),
    {
      heatProfile: body.heatProfile !== undefined,
      proxyProfile: body.proxyProfile !== undefined,
      ipoProfile: body.ipoProfile !== undefined,
    },
  );
  if (domainIssues.length > 0) {
    return {
      status: 'invalid' as const,
      error: 'Invalid opportunity domain state',
      details: domainIssues,
    };
  }

  const opportunity = await updateOpportunity(id, updates);
  if (!opportunity) return { status: 'not_found' as const };

  await appendOpportunityEvent(opportunity.id, {
    type: 'updated',
    message: `Opportunity updated: ${opportunity.title}`,
    meta: {
      stage: opportunity.stage,
      status: opportunity.status,
    },
  });
  await emitOpportunityDerivedEvents(previous, opportunity);

  return {
    status: 'updated' as const,
    summary: await getOpportunitySummaryForRecord(opportunity),
  };
}
