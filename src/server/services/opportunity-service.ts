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
  getLatestMissionArtifactRef,
  getMission,
  getMissionFromIndex,
  getOpportunity,
  getOpportunityHeatHistory,
  listOpportunityFieldEvidence,
  listOpportunityFieldRegistryAudit,
  listOpportunityFieldRegistryOverrides,
  listMissionEvents,
  listMissionRuns,
  listOpportunities,
  listOpportunityEvents,
  recordOpportunityFieldEvidence,
  deleteOpportunityFieldRegistryOverride,
  updateOpportunity,
  updateOpportunityFieldEvidenceStatus,
  upsertOpportunityFieldRegistryOverride,
  type CreateOpportunityInput,
  type MissionArtifactRef,
  type OpportunityHeatProfile,
  type OpportunityBoardHealthMap,
  type OpportunityFieldEvidenceArtifactRef,
  type OpportunityCatalystItem,
  type OpportunityFieldEvidenceKind,
  type OpportunityFieldEvidenceRef,
  type OpportunityFieldEvidenceRecord,
  type OpportunityFieldEvidenceSummary,
  type OpportunityEventRecord,
  type OpportunityFieldRegistryAuditEntry,
  type OpportunityInboxItem,
  type OpportunityIpoProfile,
  type OpportunityProxyProfile,
  type OpportunityRecord,
  type OpportunityScores,
  type OpportunitySourceProvenanceConfidence,
  type OpportunitySourceProvenanceItem,
  type OpportunitySourceProvenanceSummary,
  type OpportunityStage,
  type OpportunityStatus,
  type OpportunityType,
  type OpportunitySummaryRecord,
  type UpdateOpportunityInput,
} from '../../workflows';
import {
  OPPORTUNITY_IPO_FIELD_REGISTRY,
  OPPORTUNITY_SCORE_FIELD_REGISTRY,
  listEffectiveOpportunityFieldRegistry,
  normalizeOpportunityFieldEvidenceDescriptor,
  type OpportunityFieldRegistryEffectiveEntry,
  type OpportunityFieldRegistryOverride,
} from '../../workflows/opportunity-field-registry';
import type {
  CreateOpportunityPayload,
  FieldEvidenceBatchPayload,
  FieldEvidenceBulkStatusPayload,
  FieldEvidenceInvalidationPayload,
  FieldEvidencePayload,
  FieldEvidenceRestorationPayload,
  FieldRegistryImportPayload,
  FieldRegistryOverridePayload,
  CatalystReminderPreferencePayload,
  PreTradeConfirmationPayload,
  UpdateOpportunityPayload,
} from '../validation';
import {
  buildOffsetPage,
  offsetPageFetchLimit,
  type PageEnvelope,
  type PaginationRequest,
} from '../route-helpers';

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

type OpportunityFieldArtifactLinks = {
  mission?: OpportunityFieldEvidenceArtifactRef | undefined;
  evidence?: OpportunityFieldEvidenceArtifactRef | undefined;
  eventLog?: OpportunityFieldEvidenceArtifactRef | undefined;
};

type ManualFieldEvidenceState = 'active' | 'invalidated';

function compactText(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function buildManualFieldEvidenceStates(
  events: OpportunityEventRecord[],
): Map<string, ManualFieldEvidenceState> {
  const states = new Map<string, ManualFieldEvidenceState>();
  const sortedEvents = [...events].sort((a, b) => {
    const timestampDelta = a.timestamp.localeCompare(b.timestamp);
    return timestampDelta !== 0 ? timestampDelta : a.id.localeCompare(b.id);
  });

  for (const event of sortedEvents) {
    if (event.type === 'field_evidence_recorded') {
      states.set(event.id, 'active');
      continue;
    }

    const evidenceId = compactText(event.meta?.evidenceId);
    if (!evidenceId || !states.has(evidenceId)) continue;
    if (event.type === 'field_evidence_invalidated') {
      states.set(evidenceId, 'invalidated');
    }
    if (event.type === 'field_evidence_restored') {
      states.set(evidenceId, 'active');
    }
  }

  return states;
}

function provenanceRank(confidence: OpportunitySourceProvenanceConfidence): number {
  switch (confidence) {
    case 'confirmed':
      return 0;
    case 'inferred':
      return 1;
    case 'placeholder':
      return 2;
    default:
      return 3;
  }
}

function missionViewerHref(missionId: string, runId?: string): string {
  const base = `/missions/${encodeURIComponent(missionId)}`;
  return runId ? `${base}?run=${encodeURIComponent(runId)}` : base;
}

function artifactLinkLabel(kind: OpportunityFieldEvidenceArtifactRef['kind']): string {
  switch (kind) {
    case 'evidence':
      return 'Open evidence';
    case 'event_log':
      return 'Open event log';
    case 'trace':
      return 'Open trace';
    case 'report':
      return 'Open report';
    default:
      return 'Open mission';
  }
}

function buildArtifactLink(
  missionId: string,
  kind: OpportunityFieldEvidenceArtifactRef['kind'],
  ref?: MissionArtifactRef | null,
  runId?: string,
): OpportunityFieldEvidenceArtifactRef {
  const linkedRunId = ref?.runId || runId;
  return {
    missionId,
    kind,
    href: missionViewerHref(missionId, linkedRunId),
    label: artifactLinkLabel(kind),
    ...(linkedRunId ? { runId: linkedRunId } : {}),
    ...(ref?.id ? { artifactId: ref.id } : {}),
    ...(ref?.artifactPath ? { artifactPath: ref.artifactPath } : {}),
  };
}

function buildSourceProvenance(
  opportunity: OpportunityRecord,
  latestMission: Awaited<ReturnType<typeof getMissionFromIndex>> | null,
  registryOverrides: OpportunityFieldRegistryOverride[] = [],
): OpportunitySourceProvenanceSummary | undefined {
  const items: OpportunitySourceProvenanceItem[] = [];
  const addItem = (item: OpportunitySourceProvenanceItem) => {
    items.push(item);
  };

  for (const entry of OPPORTUNITY_IPO_FIELD_REGISTRY) {
    const evidence = opportunity.ipoProfile?.evidence?.[entry.ipoKey];
    if (!evidence?.source) continue;

    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field: entry.field,
      label: entry.label,
      kind: 'source',
      source: evidence.source,
      confidence: evidence.confidence,
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `ipo:${entry.ipoKey}`,
      kind: 'ipo_field',
      field: descriptor.field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      ...(compactText(opportunity.ipoProfile?.[entry.ipoKey]) ? { value: compactText(opportunity.ipoProfile?.[entry.ipoKey]) } : {}),
      ...(compactText(evidence.note) ? { note: compactText(evidence.note) } : {}),
      ...(compactText(evidence.observedAt) ? { observedAt: compactText(evidence.observedAt) } : {}),
    });
  }

  opportunity.catalystCalendar.forEach((catalyst, index) => {
    if (!catalyst.source && !catalyst.confidence) return;

    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field: `catalystCalendar.${index}`,
      label: catalyst.label,
      kind: 'source',
      source: catalyst.source || 'catalyst_calendar',
      confidence: catalyst.confidence || 'unknown',
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `catalyst:${index}:${catalyst.label}`,
      kind: 'catalyst',
      field: descriptor.field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      value: [catalyst.status, catalyst.dueAt].filter(Boolean).join(' · '),
      ...(compactText(catalyst.note) ? { note: compactText(catalyst.note) } : {}),
      ...(compactText(catalyst.dueAt) ? { observedAt: compactText(catalyst.dueAt) } : {}),
    });
  });

  if (latestMission) {
    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field: 'latestMission',
      label: 'Latest mission',
      kind: 'mission',
      source: latestMission.input.source || 'mission',
      confidence: 'unknown',
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `mission:${latestMission.id}`,
      kind: 'mission',
      field: descriptor.field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      value: latestMission.status,
      observedAt: latestMission.updatedAt,
      note: latestMission.input.query,
    });
  }

  if (opportunity.latestEventType && opportunity.latestEventMessage) {
    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field: 'latestEvent',
      label: opportunity.latestEventType,
      kind: 'event',
      source: 'opportunity_event',
      confidence: 'unknown',
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `event:${opportunity.latestEventType}:${opportunity.latestEventAt || opportunity.updatedAt}`,
      kind: 'event',
      field: descriptor.field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      value: opportunity.latestEventType,
      observedAt: opportunity.latestEventAt || opportunity.updatedAt,
      note: opportunity.latestEventMessage,
    });
  }

  if (items.length === 0) return undefined;

  const sortedItems = items
    .sort((a, b) => {
      const rankDelta = provenanceRank(a.confidence) - provenanceRank(b.confidence);
      if (rankDelta !== 0) return rankDelta;
      return (b.observedAt || '').localeCompare(a.observedAt || '');
    })
    .slice(0, 12);
  const latestObservedAt = items
    .map((item) => item.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];

  return {
    total: items.length,
    confirmed: items.filter((item) => item.confidence === 'confirmed').length,
    inferred: items.filter((item) => item.confidence === 'inferred').length,
    placeholder: items.filter((item) => item.confidence === 'placeholder').length,
    unknown: items.filter((item) => item.confidence === 'unknown').length,
    sources: [...new Set(items.map((item) => item.source))].sort((a, b) => a.localeCompare(b)).slice(0, 8),
    ...(latestObservedAt ? { latestObservedAt } : {}),
    items: sortedItems,
  };
}

function buildFieldEvidenceSummary(
  opportunity: OpportunityRecord,
  latestMission: Awaited<ReturnType<typeof getMissionFromIndex>> | null,
  artifactLinks: OpportunityFieldArtifactLinks,
  sourceProvenance?: OpportunitySourceProvenanceSummary,
  manualFieldEvidenceEvents: OpportunityEventRecord[] = [],
  canonicalFieldEvidence: OpportunityFieldEvidenceRecord[] = [],
  registryOverrides: OpportunityFieldRegistryOverride[] = [],
): OpportunityFieldEvidenceSummary | undefined {
  const items: OpportunityFieldEvidenceRef[] = [];
  const manualFieldEvidenceStates = buildManualFieldEvidenceStates(manualFieldEvidenceEvents);
  const canonicalEvidenceIds = new Set(canonicalFieldEvidence.map((evidence) => evidence.id));
  const invalidatedEvidenceIds = new Set([
    ...canonicalFieldEvidence
      .filter((evidence) => evidence.status === 'invalidated')
      .map((evidence) => evidence.id),
    ...[...manualFieldEvidenceStates.entries()]
      .filter(([evidenceId, state]) => state === 'invalidated' && !canonicalEvidenceIds.has(evidenceId))
      .map(([evidenceId]) => evidenceId),
  ]);
  const invalidatedEvidenceCount = invalidatedEvidenceIds.size;
  const activeCanonicalFieldEvidence = canonicalFieldEvidence
    .filter((evidence) => evidence.status === 'active')
    .sort((a, b) => {
      const observedDelta = (b.observedAt || b.recordedAt).localeCompare(a.observedAt || a.recordedAt);
      return observedDelta !== 0 ? observedDelta : b.id.localeCompare(a.id);
    });
  const seen = new Set<string>();
  const addItem = (item: OpportunityFieldEvidenceRef) => {
    const key = `${item.field}:${item.source}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };
  const addField = (
    field: string,
    label: string,
    value: unknown,
    options: {
      kind?: OpportunityFieldEvidenceKind;
      source?: string;
      confidence?: OpportunitySourceProvenanceConfidence;
      note?: unknown;
      observedAt?: unknown;
      artifact?: OpportunityFieldEvidenceArtifactRef;
    } = {},
  ) => {
    const compactValue = compactText(value);
    const compactNote = compactText(options.note);
    if (!compactValue && !compactNote) return;
    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field,
      label,
      kind: options.kind,
      source: options.source,
      confidence: options.confidence,
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `${descriptor.source}:${field}`,
      kind: descriptor.kind,
      field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      ...(compactValue ? { value: compactValue } : {}),
      ...(compactNote ? { note: compactNote } : {}),
      ...(compactText(options.observedAt) ? { observedAt: compactText(options.observedAt) } : {}),
      ...(options.artifact ? { artifact: options.artifact } : {}),
    });
  };

  addField('title', 'Title', opportunity.title);
  addField('query', 'Query', opportunity.query);
  addField('thesis', 'Thesis', opportunity.thesis);
  addField('summary', 'Summary', opportunity.summary);
  addField('primaryTicker', 'Primary ticker', opportunity.primaryTicker);
  addField('leaderTicker', 'Leader ticker', opportunity.leaderTicker);
  addField('proxyTicker', 'Proxy ticker', opportunity.proxyTicker);
  addField('relatedTickers', 'Related tickers', opportunity.relatedTickers.join(', '));
  addField('relayTickers', 'Relay tickers', opportunity.relayTickers.join(', '));
  addField('nextCatalystAt', 'Next catalyst', opportunity.nextCatalystAt);
  addField('supplyOverhang', 'Supply overhang', opportunity.supplyOverhang);
  addField('policyStatus', 'Policy status', opportunity.policyStatus);

  for (const entry of OPPORTUNITY_SCORE_FIELD_REGISTRY) {
    addField(entry.field, entry.label, opportunity.scores[entry.scoreKey], {
      note: 'Current Opportunity score snapshot',
      ...(artifactLinks.evidence ? { artifact: artifactLinks.evidence } : {}),
    });
  }

  const heat = opportunity.heatProfile;
  if (heat) {
    const profileArtifact = artifactLinks.evidence ? { artifact: artifactLinks.evidence } : {};
    addField('heatProfile.temperature', 'Heat temperature', heat.temperature, { kind: 'profile', source: 'heat_profile', ...profileArtifact });
    addField('heatProfile.validationStatus', 'Heat validation', heat.validationStatus, { kind: 'profile', source: 'heat_profile', note: heat.validationSummary, ...profileArtifact });
    addField('heatProfile.breadthScore', 'Heat breadth', heat.breadthScore, { kind: 'profile', source: 'heat_profile', note: heat.validationSummary, ...profileArtifact });
    addField('heatProfile.edgeCount', 'Heat edges', heat.edgeCount, { kind: 'profile', source: 'heat_profile', ...profileArtifact });
    addField('heatProfile.bottleneckTickers', 'Bottlenecks', heat.bottleneckTickers.join(', '), { kind: 'profile', source: 'heat_profile', ...profileArtifact });
    addField('heatProfile.laggardTickers', 'Laggards', heat.laggardTickers.join(', '), { kind: 'profile', source: 'heat_profile', ...profileArtifact });
    addField('heatProfile.leaderHealth', 'Leader health', heat.leaderHealth, { kind: 'profile', source: 'heat_profile', ...profileArtifact });
    addField('heatProfile.transmissionNote', 'Transmission note', heat.transmissionNote, { kind: 'profile', source: 'heat_profile', ...profileArtifact });
  }

  const proxy = opportunity.proxyProfile;
  if (proxy) {
    const profileArtifact = artifactLinks.evidence ? { artifact: artifactLinks.evidence } : {};
    addField('proxyProfile.mappingTarget', 'Proxy target', proxy.mappingTarget, { kind: 'profile', source: 'proxy_profile', ...profileArtifact });
    addField('proxyProfile.legitimacyScore', 'Legitimacy score', proxy.legitimacyScore, { kind: 'profile', source: 'proxy_profile', note: proxy.ruleStatus, ...profileArtifact });
    addField('proxyProfile.legibilityScore', 'Legibility score', proxy.legibilityScore, { kind: 'profile', source: 'proxy_profile', note: proxy.identityNote, ...profileArtifact });
    addField('proxyProfile.tradeabilityScore', 'Proxy tradeability', proxy.tradeabilityScore, { kind: 'profile', source: 'proxy_profile', ...profileArtifact });
    addField('proxyProfile.ruleStatus', 'Rule status', proxy.ruleStatus, { kind: 'profile', source: 'proxy_profile', ...profileArtifact });
    addField('proxyProfile.scarcityNote', 'Scarcity note', proxy.scarcityNote, { kind: 'profile', source: 'proxy_profile', ...profileArtifact });
  }

  if (latestMission) {
    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field: 'latestMission',
      label: 'Latest mission',
      kind: 'mission',
      source: latestMission.input.source || 'mission',
      confidence: 'unknown',
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `mission:${latestMission.id}`,
      kind: descriptor.kind,
      field: descriptor.field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      value: latestMission.status,
      observedAt: latestMission.updatedAt,
      note: latestMission.input.query,
      ...(artifactLinks.mission ? { artifact: artifactLinks.mission } : {}),
    });
  }

  if (opportunity.latestEventType && opportunity.latestEventMessage) {
    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field: 'latestEvent',
      label: opportunity.latestEventType,
      kind: 'event',
      source: 'opportunity_event',
      confidence: 'unknown',
      overrides: registryOverrides,
      preferRegistryLabel: true,
    });
    addItem({
      id: `event:${opportunity.latestEventType}:${opportunity.latestEventAt || opportunity.updatedAt}`,
      kind: descriptor.kind,
      field: descriptor.field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      value: opportunity.latestEventType,
      observedAt: opportunity.latestEventAt || opportunity.updatedAt,
      note: opportunity.latestEventMessage,
      ...(artifactLinks.eventLog ? { artifact: artifactLinks.eventLog } : {}),
    });
  }

  for (const evidence of activeCanonicalFieldEvidence) {
    addItem({
      id: evidence.id,
      kind: evidence.kind,
      field: evidence.field,
      label: evidence.label,
      source: evidence.source,
      confidence: evidence.confidence,
      ...(evidence.value ? { value: evidence.value } : {}),
      ...(evidence.note ? { note: evidence.note } : {}),
      observedAt: evidence.observedAt || evidence.recordedAt,
      auditEventId: evidence.createdEventId || evidence.id,
    });
  }

  for (const event of manualFieldEvidenceEvents) {
    if (event.type !== 'field_evidence_recorded') continue;
    if (canonicalEvidenceIds.has(event.id)) continue;
    if (manualFieldEvidenceStates.get(event.id) === 'invalidated') continue;
    const field = compactText(event.meta?.field);
    if (!field) continue;
    const value = compactText(event.meta?.value);
    const note = compactText(event.meta?.note);
    if (!value && !note) continue;
    const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
      field,
      label: event.meta?.label,
      kind: event.meta?.kind,
      source: compactText(event.meta?.source) || 'manual_field_evidence',
      confidence: event.meta?.confidence,
      overrides: registryOverrides,
    });
    addItem({
      id: event.id,
      kind: descriptor.kind,
      field,
      label: descriptor.label,
      source: descriptor.source,
      confidence: descriptor.confidence,
      ...(value ? { value } : {}),
      ...(note ? { note } : {}),
      observedAt: compactText(event.meta?.observedAt) || event.timestamp,
      auditEventId: event.id,
    });
  }

  for (const item of sourceProvenance?.items || []) {
    const sourceArtifact = item.kind === 'mission'
      ? artifactLinks.mission
      : item.kind === 'event'
        ? artifactLinks.eventLog
        : undefined;
    addItem({
      id: item.id,
      kind: 'source',
      field: item.field,
      label: item.label,
      source: item.source,
      confidence: item.confidence,
      ...(item.value ? { value: item.value } : {}),
      ...(item.note ? { note: item.note } : {}),
      ...(item.observedAt ? { observedAt: item.observedAt } : {}),
      ...(sourceArtifact ? { artifact: sourceArtifact } : {}),
    });
  }

  if (items.length === 0) return undefined;

  const latestObservedAt = items
    .map((item) => item.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
  const sortedItems = items
    .sort((a, b) => {
      const rankDelta = provenanceRank(a.confidence) - provenanceRank(b.confidence);
      if (rankDelta !== 0) return rankDelta;
      return a.field.localeCompare(b.field);
    })
    .slice(0, 64);

  return {
    total: items.length,
    fields: new Set(items.map((item) => item.field)).size,
    sources: [...new Set(items.map((item) => item.source))].sort((a, b) => a.localeCompare(b)).slice(0, 12),
    ...(invalidatedEvidenceCount > 0 ? { invalidated: invalidatedEvidenceCount } : {}),
    ...(latestObservedAt ? { latestObservedAt } : {}),
    items: sortedItems,
  };
}

export async function buildOpportunitySummary(
  opportunity: OpportunityRecord,
): Promise<OpportunitySummaryRecord> {
  const latestMission = opportunity.latestMissionId
    ? await getMissionFromIndex(opportunity.latestMissionId) || getMission(opportunity.latestMissionId)
    : null;
  const runs = latestMission ? await listMissionRuns(latestMission.id) : [];
  const latestRun = runs[0] || null;
  const [missionArtifactRef, evidenceArtifactRef, eventLogArtifactRef] = latestMission
    ? await Promise.all([
        getLatestMissionArtifactRef(latestMission.id, 'mission'),
        latestRun ? getLatestMissionArtifactRef(latestMission.id, 'evidence', latestRun.id) : Promise.resolve(null),
        getLatestMissionArtifactRef(latestMission.id, 'event_log'),
      ])
    : [null, null, null];
  const artifactLinks: OpportunityFieldArtifactLinks = latestMission
    ? {
        mission: buildArtifactLink(latestMission.id, 'mission', missionArtifactRef),
        ...(latestRun ? { evidence: buildArtifactLink(latestMission.id, 'evidence', evidenceArtifactRef, latestRun.id) } : {}),
        eventLog: buildArtifactLink(latestMission.id, 'event_log', eventLogArtifactRef),
      }
    : {};
  const latestDiff = latestMission ? buildLatestMissionDiff(latestMission, runs) : null;
  const latestOpportunityDiff = await getLatestOpportunityDiff(opportunity.id);
  const recentHeatHistory = opportunity.type === 'relay_chain'
    ? await getOpportunityHeatHistory(opportunity.id, 5)
    : [];
  const [recentOpportunityEvents, manualFieldEvidenceEvents, canonicalFieldEvidence] = await Promise.all([
    listOpportunityEvents(opportunity.id, 4),
    listOpportunityEvents(opportunity.id, 100, [
      'field_evidence_recorded',
      'field_evidence_invalidated',
      'field_evidence_restored',
    ]),
    listOpportunityFieldEvidence(opportunity.id, 100),
  ]);
  const registryOverrides = await listOpportunityFieldRegistryOverrides();
  const recentMissionEvents = latestMission ? listMissionEvents(latestMission.id).slice(-3) : [];
  const heatInflection = opportunity.type === 'relay_chain'
    ? recentHeatHistory.length > 1
      ? detectOpportunityHeatInflection(recentHeatHistory)
      : null
    : null;
  const sourceProvenance = buildSourceProvenance(opportunity, latestMission, registryOverrides);
  const fieldEvidence = buildFieldEvidenceSummary(
    opportunity,
    latestMission,
    artifactLinks,
    sourceProvenance,
    manualFieldEvidenceEvents,
    canonicalFieldEvidence,
    registryOverrides,
  );
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
    ...(sourceProvenance ? { sourceProvenance } : {}),
    ...(fieldEvidence ? { fieldEvidence } : {}),
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

export async function listOpportunitySummariesPage(
  pagination: Pick<PaginationRequest, 'limit' | 'offset'>,
): Promise<PageEnvelope<OpportunitySummaryRecord>> {
  const rows = await listOpportunitySummaries(offsetPageFetchLimit(pagination));
  return buildOffsetPage(rows, pagination);
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

export async function listOpportunityFieldRegistryForApi() {
  const overrides = await listOpportunityFieldRegistryOverrides();
  return listEffectiveOpportunityFieldRegistry(overrides);
}

type RegistryDiffBucket = {
  key: string;
  count: number;
};

type RegistryDiffField = {
  field: string;
  label: string;
  group: OpportunityFieldRegistryEffectiveEntry['group'];
  kind: OpportunityFieldRegistryEffectiveEntry['kind'];
  source: string;
  confidence: OpportunityFieldRegistryEffectiveEntry['confidence'];
  changedFields: OpportunityFieldRegistryEffectiveEntry['overriddenFields'];
  note?: string | undefined;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
  base?: Pick<OpportunityFieldRegistryEffectiveEntry, 'label' | 'kind' | 'source' | 'confidence'> | undefined;
};

export type OpportunityFieldRegistryDiffReport = {
  generatedAt: string;
  totalFields: number;
  baseFields: number;
  customFields: number;
  overriddenFields: number;
  overrideCoveragePercent: number;
  byGroup: RegistryDiffBucket[];
  byKind: RegistryDiffBucket[];
  byConfidence: RegistryDiffBucket[];
  changedFieldCounts: RegistryDiffBucket[];
  fields: RegistryDiffField[];
  recentAudit: OpportunityFieldRegistryAuditEntry[];
};

export type OpportunityFieldRegistryExport = {
  version: 1;
  exportedAt: string;
  items: OpportunityFieldRegistryOverride[];
  registry: OpportunityFieldRegistryEffectiveEntry[];
  report: OpportunityFieldRegistryDiffReport;
};

type RegistryImportItemStatus = 'created' | 'updated' | 'unchanged' | 'failed';

export type OpportunityFieldRegistryImportResultItem = {
  index: number;
  field: string;
  status: RegistryImportItemStatus;
  changedFields: Array<'label' | 'kind' | 'source' | 'confidence' | 'note'>;
  before?: OpportunityFieldRegistryOverride | undefined;
  after?: OpportunityFieldRegistryOverride | undefined;
  effective?: OpportunityFieldRegistryEffectiveEntry | undefined;
  audit?: OpportunityFieldRegistryAuditEntry | undefined;
  error?: string | undefined;
};

export type OpportunityFieldRegistryImportResult = {
  checkedAt: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  items: OpportunityFieldRegistryImportResultItem[];
  registry: OpportunityFieldRegistryEffectiveEntry[];
  report: OpportunityFieldRegistryDiffReport;
};

const registryOverrideFields = ['label', 'kind', 'source', 'confidence', 'note'] as const;

function incrementRegistryCounter(map: Map<string, number>, key: string | undefined) {
  const normalized = compactText(key) || 'unknown';
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function registryBuckets(map: Map<string, number>): RegistryDiffBucket[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function buildOpportunityFieldRegistryDiffReport(
  registry: OpportunityFieldRegistryEffectiveEntry[],
  recentAudit: OpportunityFieldRegistryAuditEntry[],
): OpportunityFieldRegistryDiffReport {
  const byGroup = new Map<string, number>();
  const byKind = new Map<string, number>();
  const byConfidence = new Map<string, number>();
  const changedFieldCounts = new Map<string, number>();
  const fields: RegistryDiffField[] = [];

  for (const entry of registry) {
    incrementRegistryCounter(byGroup, entry.group);
    incrementRegistryCounter(byKind, entry.kind);
    incrementRegistryCounter(byConfidence, entry.confidence);
    for (const field of entry.overriddenFields) {
      incrementRegistryCounter(changedFieldCounts, field);
    }
    if (entry.note) {
      incrementRegistryCounter(changedFieldCounts, 'note');
    }
    if (entry.overriddenFields.length > 0 || entry.note || !entry.base) {
      fields.push({
        field: entry.field,
        label: entry.label,
        group: entry.group,
        kind: entry.kind,
        source: entry.source,
        confidence: entry.confidence,
        changedFields: entry.overriddenFields,
        ...(entry.note ? { note: entry.note } : {}),
        ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
        ...(entry.updatedBy ? { updatedBy: entry.updatedBy } : {}),
        ...(entry.base ? {
          base: {
            label: entry.base.label,
            kind: entry.base.kind,
            source: entry.base.source,
            confidence: entry.base.confidence,
          },
        } : {}),
      });
    }
  }

  const overriddenFields = fields.filter((entry) => entry.changedFields.length > 0 || entry.note).length;
  return {
    generatedAt: new Date().toISOString(),
    totalFields: registry.length,
    baseFields: registry.filter((entry) => entry.base && entry.overriddenFields.length === 0 && !entry.note).length,
    customFields: registry.filter((entry) => entry.group === 'custom').length,
    overriddenFields,
    overrideCoveragePercent: registry.length > 0
      ? Math.round((overriddenFields / registry.length) * 1000) / 10
      : 0,
    byGroup: registryBuckets(byGroup),
    byKind: registryBuckets(byKind),
    byConfidence: registryBuckets(byConfidence),
    changedFieldCounts: registryBuckets(changedFieldCounts),
    fields: fields.sort((a, b) => a.field.localeCompare(b.field)),
    recentAudit,
  };
}

function registryImportChangedFields(
  before: OpportunityFieldRegistryOverride | undefined,
  after: OpportunityFieldRegistryOverride,
): OpportunityFieldRegistryImportResultItem['changedFields'] {
  return registryOverrideFields.filter((field) => (before?.[field] || '') !== (after[field] || ''));
}

function normalizeRegistryImportItem(
  item: FieldRegistryImportPayload['items'][number],
  updatedBy: string,
): OpportunityFieldRegistryOverride {
  const field = compactText(item.field) || item.field;
  return {
    field,
    ...(compactText(item.label) ? { label: compactText(item.label) } : {}),
    ...(item.kind ? { kind: item.kind } : {}),
    ...(compactText(item.source) ? { source: compactText(item.source) } : {}),
    ...(item.confidence ? { confidence: item.confidence } : {}),
    ...(compactText(item.note) ? { note: compactText(item.note) } : {}),
    updatedBy: compactText(item.updatedBy) || updatedBy,
  };
}

function replaceRegistryOverride(
  overrides: OpportunityFieldRegistryOverride[],
  next: OpportunityFieldRegistryOverride,
): OpportunityFieldRegistryOverride[] {
  return [
    ...overrides.filter((override) => override.field !== next.field),
    next,
  ];
}

function findEffectiveRegistryEntry(
  overrides: OpportunityFieldRegistryOverride[],
  field: string,
): OpportunityFieldRegistryEffectiveEntry | undefined {
  return listEffectiveOpportunityFieldRegistry(overrides).find((entry) => entry.field === field);
}

export async function getOpportunityFieldRegistryDiffReportForApi() {
  const [overrides, recentAudit] = await Promise.all([
    listOpportunityFieldRegistryOverrides(),
    listOpportunityFieldRegistryAudit({ limit: 25 }),
  ]);
  return buildOpportunityFieldRegistryDiffReport(
    listEffectiveOpportunityFieldRegistry(overrides),
    recentAudit,
  );
}

export async function exportOpportunityFieldRegistryForApi(): Promise<OpportunityFieldRegistryExport> {
  const [overrides, recentAudit] = await Promise.all([
    listOpportunityFieldRegistryOverrides(),
    listOpportunityFieldRegistryAudit({ limit: 25 }),
  ]);
  const registry = listEffectiveOpportunityFieldRegistry(overrides);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: overrides,
    registry,
    report: buildOpportunityFieldRegistryDiffReport(registry, recentAudit),
  };
}

export async function importOpportunityFieldRegistryForApi(
  body: FieldRegistryImportPayload,
): Promise<OpportunityFieldRegistryImportResult> {
  const checkedAt = new Date().toISOString();
  const dryRun = body.dryRun !== false;
  const updatedBy = compactText(body.updatedBy) || 'dashboard-import';
  const existingOverrides = await listOpportunityFieldRegistryOverrides();
  const beforeByField = new Map(existingOverrides.map((override) => [override.field, override]));
  const seenFields = new Set<string>();
  let workingOverrides = existingOverrides;
  const items: OpportunityFieldRegistryImportResultItem[] = [];

  for (const [index, item] of body.items.entries()) {
    const normalized = normalizeRegistryImportItem(item, updatedBy);
    if (seenFields.has(normalized.field)) {
      items.push({
        index,
        field: normalized.field,
        status: 'failed',
        changedFields: [],
        error: 'Duplicate field in import payload',
      });
      continue;
    }
    seenFields.add(normalized.field);

    const before = beforeByField.get(normalized.field);
    const changedFields = registryImportChangedFields(before, normalized);
    const status: RegistryImportItemStatus = changedFields.length === 0
      ? 'unchanged'
      : before ? 'updated' : 'created';
    const hypotheticalOverrides = replaceRegistryOverride(workingOverrides, normalized);

    if (dryRun || status === 'unchanged') {
      const previewOverrides = dryRun ? hypotheticalOverrides : workingOverrides;
      items.push({
        index,
        field: normalized.field,
        status,
        changedFields,
        ...(before ? { before } : {}),
        after: normalized,
        effective: findEffectiveRegistryEntry(previewOverrides, normalized.field),
      });
      continue;
    }

    try {
      const { override, audit } = await upsertOpportunityFieldRegistryOverride({
        field: normalized.field,
        label: normalized.label,
        kind: normalized.kind,
        source: normalized.source,
        confidence: normalized.confidence,
        note: normalized.note,
        updatedBy: normalized.updatedBy || updatedBy,
      });
      workingOverrides = replaceRegistryOverride(workingOverrides, override);
      beforeByField.set(normalized.field, override);
      items.push({
        index,
        field: normalized.field,
        status,
        changedFields,
        ...(before ? { before } : {}),
        after: override,
        effective: findEffectiveRegistryEntry(workingOverrides, normalized.field),
        audit,
      });
    } catch (error) {
      items.push({
        index,
        field: normalized.field,
        status: 'failed',
        changedFields,
        ...(before ? { before } : {}),
        after: normalized,
        error: error instanceof Error ? error.message : 'Failed to import registry item',
      });
    }
  }

  const recentAudit = await listOpportunityFieldRegistryAudit({ limit: 25 });
  const registry = listEffectiveOpportunityFieldRegistry(workingOverrides);
  const count = (status: RegistryImportItemStatus) => items.filter((item) => item.status === status).length;
  return {
    checkedAt,
    dryRun,
    total: body.items.length,
    created: count('created'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    failed: count('failed'),
    items,
    registry,
    report: buildOpportunityFieldRegistryDiffReport(registry, recentAudit),
  };
}

export async function listOpportunityFieldRegistryAuditForApi(input: {
  field?: string | undefined;
  limit?: number | undefined;
} = {}) {
  return listOpportunityFieldRegistryAudit({
    field: input.field,
    limit: input.limit,
  });
}

export async function upsertOpportunityFieldRegistryForApi(
  body: FieldRegistryOverridePayload,
) {
  const { override, audit } = await upsertOpportunityFieldRegistryOverride({
    field: body.field,
    label: body.label,
    kind: body.kind,
    source: body.source,
    confidence: body.confidence,
    note: body.note,
    updatedBy: body.updatedBy || 'dashboard',
  });
  const effective = listEffectiveOpportunityFieldRegistry([override])
    .find((entry) => entry.field === override.field);

  return {
    override,
    effective,
    audit,
  };
}

export async function deleteOpportunityFieldRegistryForApi(field: string) {
  const result = await deleteOpportunityFieldRegistryOverride(field);
  return {
    deleted: result.deleted,
    ...(result.audit ? { audit: result.audit } : {}),
    registry: await listOpportunityFieldRegistryForApi(),
  };
}

function buildPreTradeConfirmationMessage(
  opportunity: OpportunityRecord,
  body: PreTradeConfirmationPayload,
): string {
  const action = body.completed ? 'confirmed' : 'reopened';
  return `Pre-trade check ${action}: ${body.label} for ${opportunity.title}`;
}

function buildCatalystReminderPreferenceMessage(
  opportunity: OpportunityRecord,
  body: CatalystReminderPreferencePayload,
): string {
  const action = body.preference === 'acknowledge'
    ? 'acknowledged'
    : body.preference === 'snooze'
      ? 'snoozed'
      : body.preference === 'subscribe'
        ? 'subscribed'
        : body.preference === 'unsubscribe'
          ? 'unsubscribed'
          : 'reopened';
  return `Catalyst reminder ${action}: ${body.catalystLabel} for ${opportunity.title}`;
}

function buildFieldEvidenceMessage(
  opportunity: OpportunityRecord,
  label: string,
): string {
  return `Field evidence recorded: ${label} for ${opportunity.title}`;
}

type FieldEvidenceBatchItem = FieldEvidenceBatchPayload['items'][number];

function fieldEvidenceBatchItemKey(batchId?: string, clientId?: string): string | undefined {
  const compactBatchId = compactText(batchId);
  const compactClientId = compactText(clientId);
  return compactBatchId && compactClientId ? `${compactBatchId}:${compactClientId}` : undefined;
}

function findExistingFieldEvidenceBatchEvent(
  events: OpportunityEventRecord[],
  batchId?: string,
  clientId?: string,
): OpportunityEventRecord | undefined {
  const targetKey = fieldEvidenceBatchItemKey(batchId, clientId);
  if (!targetKey) return undefined;
  return events.find((event) => (
    event.type === 'field_evidence_recorded'
    && fieldEvidenceBatchItemKey(
      compactText(event.meta?.batchId),
      compactText(event.meta?.clientId),
    ) === targetKey
  ));
}

async function recordFieldEvidenceForOpportunity(
  opportunity: OpportunityRecord,
  body: FieldEvidencePayload | FieldEvidenceBatchItem,
  registryOverrides: OpportunityFieldRegistryOverride[],
  batch?: { batchId?: string | undefined; clientId?: string | undefined } | undefined,
) {
  const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
    field: body.field,
    label: body.label,
    kind: body.kind,
    source: body.source || 'manual_field_evidence',
    confidence: body.confidence || 'confirmed',
    overrides: registryOverrides,
  });
  const event = await appendOpportunityEvent(opportunity.id, {
    type: 'field_evidence_recorded',
    message: buildFieldEvidenceMessage(opportunity, descriptor.label),
    meta: {
      source: descriptor.source,
      field: descriptor.field,
      label: descriptor.label,
      kind: descriptor.kind,
      confidence: descriptor.confidence,
      ...(body.value ? { value: body.value } : {}),
      ...(body.note ? { note: body.note } : {}),
      ...(body.observedAt ? { observedAt: body.observedAt } : {}),
      ...(batch?.batchId ? { batchId: batch.batchId } : {}),
      ...(batch?.clientId ? { clientId: batch.clientId } : {}),
    },
  });
  await recordOpportunityFieldEvidence({
    id: event.id,
    opportunityId: opportunity.id,
    field: descriptor.field,
    label: descriptor.label,
    kind: descriptor.kind,
    source: descriptor.source,
    confidence: descriptor.confidence,
    ...(body.value ? { value: body.value } : {}),
    ...(body.note ? { note: body.note } : {}),
    observedAt: body.observedAt || event.timestamp,
    recordedAt: event.timestamp,
    createdEventId: event.id,
  });

  return { event, descriptor };
}

function buildFieldEvidenceInvalidationMessage(
  opportunity: OpportunityRecord,
  body: FieldEvidenceInvalidationPayload,
): string {
  return `Field evidence invalidated: ${body.field || 'manual evidence'} for ${opportunity.title}`;
}

function buildFieldEvidenceRestorationMessage(
  opportunity: OpportunityRecord,
  body: FieldEvidenceRestorationPayload,
): string {
  return `Field evidence restored: ${body.field || 'manual evidence'} for ${opportunity.title}`;
}

export async function recordFieldEvidenceForApi(
  id: string,
  body: FieldEvidencePayload,
) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { status: 'not_found' as const };
  const registryOverrides = await listOpportunityFieldRegistryOverrides();

  const { event } = await recordFieldEvidenceForOpportunity(opportunity, body, registryOverrides);

  return {
    status: 'recorded' as const,
    event,
    summary: await getOpportunitySummary(opportunity.id),
  };
}

export async function recordFieldEvidenceBatchForApi(
  id: string,
  body: FieldEvidenceBatchPayload,
) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { status: 'not_found' as const };
  const registryOverrides = await listOpportunityFieldRegistryOverrides();
  const existingBatchEvents = body.batchId
    ? await listOpportunityEvents(opportunity.id, 500, ['field_evidence_recorded'])
    : [];
  const items: Array<{
    index: number;
    clientId?: string | undefined;
    field: string;
    status: 'recorded' | 'duplicate' | 'failed';
    event?: OpportunityEventRecord | undefined;
    error?: string | undefined;
  }> = [];
  let recorded = 0;
  let duplicates = 0;
  let failed = 0;

  for (const [index, item] of body.items.entries()) {
    const existing = findExistingFieldEvidenceBatchEvent(existingBatchEvents, body.batchId, item.clientId);
    if (existing) {
      duplicates += 1;
      items.push({
        index,
        ...(item.clientId ? { clientId: item.clientId } : {}),
        field: item.field,
        status: 'duplicate',
        event: existing,
      });
      continue;
    }

    try {
      const { event } = await recordFieldEvidenceForOpportunity(opportunity, item, registryOverrides, {
        batchId: body.batchId,
        clientId: item.clientId,
      });
      if (body.batchId && item.clientId) {
        existingBatchEvents.push(event);
      }
      recorded += 1;
      items.push({
        index,
        ...(item.clientId ? { clientId: item.clientId } : {}),
        field: item.field,
        status: 'recorded',
        event,
      });
    } catch (error) {
      failed += 1;
      items.push({
        index,
        ...(item.clientId ? { clientId: item.clientId } : {}),
        field: item.field,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: 'recorded' as const,
    batchId: body.batchId,
    total: body.items.length,
    recorded,
    duplicates,
    failed,
    items,
    summary: await getOpportunitySummary(opportunity.id),
  };
}

export async function invalidateFieldEvidenceForApi(
  id: string,
  evidenceId: string,
  body: FieldEvidenceInvalidationPayload,
) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { status: 'not_found' as const };

  const manualEvidenceEvents = await listOpportunityEvents(opportunity.id, 100, [
    'field_evidence_recorded',
    'field_evidence_invalidated',
    'field_evidence_restored',
  ]);
  const evidenceEvent = manualEvidenceEvents.find((event) => (
    event.type === 'field_evidence_recorded' && event.id === evidenceId
  ));
  if (!evidenceEvent) return { status: 'evidence_not_found' as const };

  const currentState = buildManualFieldEvidenceStates(manualEvidenceEvents).get(evidenceId);
  if (currentState === 'invalidated') return { status: 'evidence_not_found' as const };

  const field = body.field || compactText(evidenceEvent.meta?.field);
  const source = body.source || compactText(evidenceEvent.meta?.source);
  const registryOverrides = await listOpportunityFieldRegistryOverrides();
  const descriptor = field
    ? normalizeOpportunityFieldEvidenceDescriptor({
        field,
        label: evidenceEvent.meta?.label,
        kind: evidenceEvent.meta?.kind,
        source: source || 'manual_field_evidence',
        confidence: evidenceEvent.meta?.confidence,
        overrides: registryOverrides,
      })
    : null;
  const event = await appendOpportunityEvent(opportunity.id, {
    type: 'field_evidence_invalidated',
    message: buildFieldEvidenceInvalidationMessage(opportunity, body),
    meta: {
      evidenceId,
      reason: body.reason,
      ...(descriptor ? { field: descriptor.field } : {}),
      ...(descriptor ? { source: descriptor.source } : {}),
      ...(descriptor ? { label: descriptor.label } : {}),
      ...(descriptor ? { kind: descriptor.kind } : {}),
      ...(descriptor ? { confidence: descriptor.confidence } : {}),
    },
  });
  await updateOpportunityFieldEvidenceStatus(
    opportunity.id,
    evidenceId,
    'invalidated',
    event.id,
    event.timestamp,
  );

  return {
    status: 'invalidated' as const,
    event,
    summary: await getOpportunitySummary(opportunity.id),
  };
}

export async function restoreFieldEvidenceForApi(
  id: string,
  evidenceId: string,
  body: FieldEvidenceRestorationPayload,
) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { status: 'not_found' as const };

  const manualEvidenceEvents = await listOpportunityEvents(opportunity.id, 100, [
    'field_evidence_recorded',
    'field_evidence_invalidated',
    'field_evidence_restored',
  ]);
  const evidenceEvent = manualEvidenceEvents.find((event) => (
    event.type === 'field_evidence_recorded' && event.id === evidenceId
  ));
  if (!evidenceEvent) return { status: 'evidence_not_found' as const };

  const currentState = buildManualFieldEvidenceStates(manualEvidenceEvents).get(evidenceId);
  if (currentState !== 'invalidated') return { status: 'evidence_not_found' as const };

  const field = body.field || compactText(evidenceEvent.meta?.field);
  const source = body.source || compactText(evidenceEvent.meta?.source);
  const registryOverrides = await listOpportunityFieldRegistryOverrides();
  const descriptor = field
    ? normalizeOpportunityFieldEvidenceDescriptor({
        field,
        label: evidenceEvent.meta?.label,
        kind: evidenceEvent.meta?.kind,
        source: source || 'manual_field_evidence',
        confidence: evidenceEvent.meta?.confidence,
        overrides: registryOverrides,
      })
    : null;
  const event = await appendOpportunityEvent(opportunity.id, {
    type: 'field_evidence_restored',
    message: buildFieldEvidenceRestorationMessage(opportunity, body),
    meta: {
      evidenceId,
      reason: body.reason,
      ...(descriptor ? { field: descriptor.field } : {}),
      ...(descriptor ? { source: descriptor.source } : {}),
      ...(descriptor ? { label: descriptor.label } : {}),
      ...(descriptor ? { kind: descriptor.kind } : {}),
      ...(descriptor ? { confidence: descriptor.confidence } : {}),
    },
  });
  await updateOpportunityFieldEvidenceStatus(
    opportunity.id,
    evidenceId,
    'active',
    event.id,
    event.timestamp,
  );

  return {
    status: 'restored' as const,
    event,
    summary: await getOpportunitySummary(opportunity.id),
  };
}

export async function updateFieldEvidenceBulkStatusForApi(
  body: FieldEvidenceBulkStatusPayload,
) {
  const items: Array<{
    index: number;
    opportunityId: string;
    evidenceId: string;
    action: FieldEvidenceBulkStatusPayload['action'];
    status: 'invalidated' | 'restored' | 'not_found' | 'failed';
    event?: OpportunityEventRecord | undefined;
    error?: string | undefined;
  }> = [];
  let invalidated = 0;
  let restored = 0;
  let notFound = 0;
  let failed = 0;

  for (const [index, item] of body.items.entries()) {
    try {
      const result = body.action === 'invalidate'
        ? await invalidateFieldEvidenceForApi(item.opportunityId, item.evidenceId, {
            reason: body.reason,
            field: item.field,
            source: item.source,
          })
        : await restoreFieldEvidenceForApi(item.opportunityId, item.evidenceId, {
            reason: body.reason,
            field: item.field,
            source: item.source,
          });

      if (result.status === 'not_found' || result.status === 'evidence_not_found') {
        notFound += 1;
        items.push({
          index,
          opportunityId: item.opportunityId,
          evidenceId: item.evidenceId,
          action: body.action,
          status: 'not_found',
        });
        continue;
      }

      if (result.status === 'invalidated') invalidated += 1;
      if (result.status === 'restored') restored += 1;
      items.push({
        index,
        opportunityId: item.opportunityId,
        evidenceId: item.evidenceId,
        action: body.action,
        status: result.status,
        event: result.event,
      });
    } catch (error) {
      failed += 1;
      items.push({
        index,
        opportunityId: item.opportunityId,
        evidenceId: item.evidenceId,
        action: body.action,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: 'completed' as const,
    action: body.action,
    total: body.items.length,
    invalidated,
    restored,
    notFound,
    failed,
    items,
  };
}

export async function recordPreTradeConfirmationForApi(
  id: string,
  body: PreTradeConfirmationPayload,
) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { status: 'not_found' as const };

  const event = await appendOpportunityEvent(opportunity.id, {
    type: body.completed ? 'pretrade_confirmed' : 'pretrade_unconfirmed',
    message: buildPreTradeConfirmationMessage(opportunity, body),
    meta: {
      source: 'pretrade_checklist',
      itemId: body.itemId,
      label: body.label,
      status: body.status,
      completed: body.completed,
      ...(body.evidence ? { evidence: body.evidence } : {}),
      ...(body.actionKind ? { actionKind: body.actionKind } : {}),
      ...(body.catalystUrgency ? { catalystUrgency: body.catalystUrgency } : {}),
      ...(body.readiness ? { readiness: body.readiness } : {}),
      ...(body.score !== undefined ? { score: body.score } : {}),
    },
  });

  return {
    status: 'recorded' as const,
    event,
    summary: await getOpportunitySummary(opportunity.id),
  };
}

export async function recordCatalystReminderPreferenceForApi(
  id: string,
  body: CatalystReminderPreferencePayload,
) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { status: 'not_found' as const };

  const event = await appendOpportunityEvent(opportunity.id, {
    type: 'catalyst_reminder_updated',
    message: buildCatalystReminderPreferenceMessage(opportunity, body),
    meta: {
      source: 'catalyst_reminder',
      reminderId: body.reminderId,
      catalystLabel: body.catalystLabel,
      urgency: body.urgency,
      actionKind: body.actionKind,
      preference: body.preference,
      ...(body.catalystDueAt ? { catalystDueAt: body.catalystDueAt } : {}),
      ...(body.catalystStatus ? { catalystStatus: body.catalystStatus } : {}),
      ...(body.snoozedUntil ? { snoozedUntil: body.snoozedUntil } : {}),
      ...(body.subscriptionLeadDays !== undefined ? { subscriptionLeadDays: body.subscriptionLeadDays } : {}),
      ...(body.note ? { note: body.note } : {}),
    },
  });

  return {
    status: 'recorded' as const,
    event,
    summary: await getOpportunitySummary(opportunity.id),
  };
}
