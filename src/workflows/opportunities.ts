import { getDb } from '../db';
import { eventBus } from '../utils/event-bus';
import {
  normalizeOpportunityFieldEvidenceDescriptor,
  type OpportunityFieldRegistryOverride,
} from './opportunity-field-registry';
import { appendStreamEvent, getRuntimeEventSourceService } from './stream-events';
import type {
  OpportunityCatalystItem,
  OpportunityEventEnvelope,
  OpportunityEventRecord,
  OpportunityEventType,
  HeatTransferEdge,
  HeatTransferValidationStatus,
  OpportunityFieldEvidence,
  OpportunityFieldEvidenceIndexItem,
  OpportunityFieldEvidenceKind,
  OpportunityFieldEvidenceRecord,
  OpportunityFieldEvidenceStatus,
  OpportunityHeatProfile,
  OpportunityIpoEvidence,
  OpportunityIpoProfile,
  OpportunityProxyProfile,
  OpportunityRecord,
  OpportunityScores,
  OpportunitySnapshotRecord,
  OpportunityStage,
  OpportunityStatus,
  OpportunitySourceProvenanceConfidence,
  OpportunityType,
} from './types';

interface OpportunityRow {
  id: string;
  type: OpportunityType;
  stage: OpportunityStage;
  status: OpportunityStatus;
  title: string;
  query: string;
  thesis: string | null;
  summary: string | null;
  primaryTicker: string | null;
  leaderTicker: string | null;
  proxyTicker: string | null;
  relatedTickers: string;
  relayTickers: string;
  nextCatalystAt: string | null;
  supplyOverhang: string | null;
  policyStatus: string | null;
  scores: string;
  heatProfile: string | null;
  proxyProfile: string | null;
  ipoProfile: string | null;
  catalystCalendar: string | null;
  latestMissionId: string | null;
  latestEventType: OpportunityEventType | null;
  latestEventMessage: string | null;
  latestEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityEventRow {
  id: string;
  opportunityId: string;
  timestamp: string;
  type: OpportunityEventType;
  message: string;
  meta: string | null;
}

interface OpportunitySnapshotRow {
  id: string;
  opportunityId: string;
  createdAt: string;
  payload: string;
}

interface OpportunityFieldEvidenceRow {
  id: string;
  opportunityId: string;
  field: string;
  label: string;
  kind: string;
  source: string;
  confidence: string;
  status: string;
  value: string | null;
  note: string | null;
  observedAt: string | null;
  recordedAt: string;
  updatedAt: string;
  createdEventId: string | null;
  invalidatedEventId: string | null;
  restoredEventId: string | null;
}

interface OpportunityFieldEvidenceIndexRow extends OpportunityFieldEvidenceRow {
  opportunityTitle: string;
  opportunityType: OpportunityType;
  opportunityStage: OpportunityStage;
  opportunityStatus: OpportunityStatus;
  opportunityPrimaryTicker: string | null;
  opportunityLatestMissionId: string | null;
  opportunityLatestEventAt: string | null;
}

interface OpportunityFieldRegistryOverrideRow {
  field: string;
  label: string | null;
  kind: string | null;
  source: string | null;
  confidence: string | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

interface OpportunityFieldRegistryAuditRow {
  id: string;
  field: string;
  action: string;
  changedFields: string;
  beforePayload: string | null;
  afterPayload: string | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface CreateOpportunityInput {
  type: OpportunityType;
  title: string;
  query?: string | undefined;
  thesis?: string | undefined;
  summary?: string | undefined;
  stage?: OpportunityStage | undefined;
  status?: OpportunityStatus | undefined;
  primaryTicker?: string | undefined;
  leaderTicker?: string | undefined;
  proxyTicker?: string | undefined;
  relatedTickers?: string[] | undefined;
  relayTickers?: string[] | undefined;
  nextCatalystAt?: string | undefined;
  supplyOverhang?: string | undefined;
  policyStatus?: string | undefined;
  scores?: Partial<OpportunityScores> | undefined;
  heatProfile?: Partial<OpportunityHeatProfile> | undefined;
  proxyProfile?: Partial<OpportunityProxyProfile> | undefined;
  ipoProfile?: OpportunityIpoProfile | undefined;
  catalystCalendar?: OpportunityCatalystItem[] | undefined;
}

export interface UpdateOpportunityInput {
  title?: string | undefined;
  query?: string | undefined;
  thesis?: string | undefined;
  summary?: string | undefined;
  stage?: OpportunityStage | undefined;
  status?: OpportunityStatus | undefined;
  primaryTicker?: string | undefined;
  leaderTicker?: string | undefined;
  proxyTicker?: string | undefined;
  relatedTickers?: string[] | undefined;
  relayTickers?: string[] | undefined;
  nextCatalystAt?: string | null | undefined;
  supplyOverhang?: string | null | undefined;
  policyStatus?: string | null | undefined;
  scores?: Partial<OpportunityScores> | undefined;
  heatProfile?: Partial<OpportunityHeatProfile> | undefined;
  proxyProfile?: Partial<OpportunityProxyProfile> | undefined;
  ipoProfile?: OpportunityIpoProfile | undefined;
  catalystCalendar?: OpportunityCatalystItem[] | undefined;
  latestMissionId?: string | null | undefined;
}

export interface RecordOpportunityFieldEvidenceInput {
  id: string;
  opportunityId: string;
  field: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  value?: string | undefined;
  note?: string | undefined;
  observedAt?: string | undefined;
  recordedAt?: string | undefined;
  createdEventId?: string | undefined;
}

export interface UpsertOpportunityFieldRegistryOverrideInput {
  field: string;
  label?: string | undefined;
  kind?: OpportunityFieldEvidenceKind | undefined;
  source?: string | undefined;
  confidence?: OpportunitySourceProvenanceConfidence | undefined;
  note?: string | undefined;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
}

export type OpportunityFieldRegistryAuditAction = 'upsert' | 'delete';
export type OpportunityFieldRegistryAuditField = 'label' | 'kind' | 'source' | 'confidence' | 'note';

export interface OpportunityFieldRegistryAuditEntry {
  id: string;
  field: string;
  action: OpportunityFieldRegistryAuditAction;
  changedFields: OpportunityFieldRegistryAuditField[];
  before?: OpportunityFieldRegistryOverride | undefined;
  after?: OpportunityFieldRegistryOverride | undefined;
  note?: string | undefined;
  updatedAt: string;
  updatedBy?: string | undefined;
}

export type OpportunityFieldEvidenceCoverageStatus = 'ok' | 'warning' | 'degraded';
export type OpportunityFieldEvidenceCoverageIssueCode =
  | 'missing_canonical'
  | 'orphan_canonical'
  | 'status_mismatch'
  | 'missing_field';

export interface OpportunityFieldEvidenceCoverageIssue {
  code: OpportunityFieldEvidenceCoverageIssueCode;
  evidenceId?: string;
  opportunityId?: string;
  field?: string;
  eventStatus?: OpportunityFieldEvidenceStatus;
  canonicalStatus?: OpportunityFieldEvidenceStatus;
  message: string;
}

export interface OpportunityFieldEvidenceCoverageDiagnostics {
  status: OpportunityFieldEvidenceCoverageStatus;
  checkedAt: string;
  recordedEvents: number;
  canonicalRows: number;
  covered: number;
  missingCanonical: number;
  orphanCanonical: number;
  statusMismatch: number;
  missingField: number;
  invalidatedEvents: number;
  restoredEvents: number;
  issues: OpportunityFieldEvidenceCoverageIssue[];
}

export interface OpportunityFieldEvidenceBackfillResult {
  checkedAt: string;
  eventsScanned: number;
  recordedEvents: number;
  invalidatedEvents: number;
  restoredEvents: number;
  inserted: number;
  refreshed: number;
  invalidated: number;
  restored: number;
  skippedMissingField: number;
}

export type OpportunityFieldEvidenceRepairPlanStatus = 'ok' | 'actionable' | 'blocked';
export type OpportunityFieldEvidenceRepairActionKind =
  | 'backfill_canonical'
  | 'sync_status'
  | 'review_orphan'
  | 'repair_event_metadata';
export type OpportunityFieldEvidenceRepairActionSafety = 'automatic' | 'manual_review' | 'blocked';

export interface OpportunityFieldEvidenceRepairAction {
  evidenceId: string;
  issueCode: OpportunityFieldEvidenceCoverageIssueCode;
  action: OpportunityFieldEvidenceRepairActionKind;
  safety: OpportunityFieldEvidenceRepairActionSafety;
  reason: string;
  opportunityId?: string | undefined;
  field?: string | undefined;
  eventStatus?: OpportunityFieldEvidenceStatus | undefined;
  canonicalStatus?: OpportunityFieldEvidenceStatus | undefined;
  api?: {
    method: 'POST';
    path: string;
    body?: Record<string, unknown> | undefined;
  } | undefined;
}

export interface OpportunityFieldEvidenceRepairPlan {
  status: OpportunityFieldEvidenceRepairPlanStatus;
  checkedAt: string;
  recordedEvents: number;
  canonicalRows: number;
  totalActions: number;
  automaticActions: number;
  manualReviewActions: number;
  blockedActions: number;
  sampledActions: OpportunityFieldEvidenceRepairAction[];
}

export interface OpportunityFieldEvidenceRepairOptions {
  evidenceIds?: string[] | undefined;
}

export interface OpportunityFieldEvidenceRepairResult {
  checkedAt: string;
  requestedEvidenceIds: string[];
  notFoundEvidenceIds: string[];
  totalEvidence: number;
  totalActions: number;
  eligibleActions: number;
  applied: number;
  skippedHealthy: number;
  skippedManualReview: number;
  blocked: number;
  updatedEvidenceIds: string[];
  skippedActions: OpportunityFieldEvidenceRepairAction[];
}

export interface OpportunityFieldEvidenceListFilters {
  opportunityId?: string | undefined;
  field?: string | undefined;
  source?: string | undefined;
  kind?: OpportunityFieldEvidenceKind | undefined;
  confidence?: OpportunitySourceProvenanceConfidence | undefined;
  status?: OpportunityFieldEvidenceStatus | undefined;
  q?: string | undefined;
}

function generateOpportunityId(): string {
  return `opp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateEventId(): string {
  return `oevt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateSnapshotId(): string {
  return `osnap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateFieldRegistryAuditId(): string {
  return `ofreg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function textMetaValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeTicker(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^\$/, '');
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function normalizeTickers(values?: string[]): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => normalizeTicker(value)).filter((value): value is string => Boolean(value)))];
}

function safeTrim(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function defaultStageForType(type: OpportunityType): OpportunityStage {
  switch (type) {
    case 'ipo_spinout':
      return 'radar';
    case 'relay_chain':
      return 'tracking';
    case 'proxy_narrative':
      return 'framing';
    default:
      return 'tracking';
  }
}

function defaultScores(type: OpportunityType): OpportunityScores {
  switch (type) {
    case 'ipo_spinout':
      return {
        purityScore: 78,
        scarcityScore: 70,
        tradeabilityScore: 62,
        relayScore: 48,
        catalystScore: 80,
        policyScore: 40,
      };
    case 'relay_chain':
      return {
        purityScore: 58,
        scarcityScore: 52,
        tradeabilityScore: 74,
        relayScore: 82,
        catalystScore: 64,
        policyScore: 38,
      };
    case 'proxy_narrative':
      return {
        purityScore: 82,
        scarcityScore: 84,
        tradeabilityScore: 70,
        relayScore: 44,
        catalystScore: 62,
        policyScore: 78,
      };
    default:
      return {
        purityScore: 50,
        scarcityScore: 50,
        tradeabilityScore: 50,
        relayScore: 50,
        catalystScore: 50,
        policyScore: 50,
      };
  }
}

function mergeScores(type: OpportunityType, scores?: Partial<OpportunityScores>): OpportunityScores {
  return {
    ...defaultScores(type),
    ...(scores || {}),
  };
}

function defaultHeatProfile(
  type: OpportunityType,
  payload: {
    leaderTicker?: string | undefined;
    relatedTickers?: string[] | undefined;
    relayTickers?: string[] | undefined;
    scores?: OpportunityScores | undefined;
  },
): OpportunityHeatProfile | undefined {
  if (type !== 'relay_chain') return undefined;

  const leaderTicker = normalizeTicker(payload.leaderTicker);
  const related = normalizeTickers(payload.relatedTickers);
  const relay = normalizeTickers(payload.relayTickers);
  const bottlenecks = related.filter((ticker) => ticker !== leaderTicker);
  const relayScore = payload.scores?.relayScore || defaultScores(type).relayScore;
  const breadthScore = Math.min(100, 28 + bottlenecks.length * 14 + relay.length * 12);
  const validationStatus: HeatTransferValidationStatus = relayScore >= 85 && bottlenecks.length > 0 && relay.length > 0
    ? 'confirmed'
    : relayScore >= 70 && bottlenecks.length > 0
      ? 'forming'
      : leaderTicker
        ? 'fragile'
        : 'broken';
  const validationSummary = leaderTicker
    ? `${leaderTicker} 是当前 relay anchor，先验证瓶颈层${bottlenecks.length > 0 ? ` ${bottlenecks.join(', ')}` : ''}${relay.length > 0 ? `，再看洼地 ${relay.join(', ')}` : ''}。`
    : '等待补全 leader -> bottleneck -> laggard 链路。';

  return {
    temperature: relayScore >= 85 ? 'hot' : relayScore >= 70 ? 'warming' : 'cold',
    bottleneckTickers: bottlenecks,
    laggardTickers: relay,
    junkTickers: [],
    breadthScore,
    validationStatus,
    validationSummary,
    edgeCount: 0,
    edges: [],
    ...(leaderTicker ? { leaderHealth: `${leaderTicker} is the current relay anchor` } : {}),
    transmissionNote: bottlenecks.length > 0 || relay.length > 0
      ? '从龙头确认开始，先看瓶颈，再看二三层扩散。'
      : '等待补充 leader / bottleneck / laggard 链路。',
  };
}

function normalizeHeatEdges(edges?: HeatTransferEdge[]): HeatTransferEdge[] {
  if (!edges) return [];

  const seen = new Set<string>();
  return edges
    .filter((edge): edge is HeatTransferEdge => Boolean(edge?.from && edge?.to && edge?.kind))
    .map((edge) => ({
      id: edge.id || `${edge.kind}:${edge.from}:${edge.to}`,
      from: edge.from.trim().toUpperCase(),
      to: edge.to.trim().toUpperCase(),
      weight: Math.max(0, Math.min(100, Math.round(edge.weight))),
      kind: edge.kind,
      ...(safeTrim(edge.reason) ? { reason: safeTrim(edge.reason)! } : { reason: 'Not found in repo.' }),
    }))
    .filter((edge) => {
      if (seen.has(edge.id)) return false;
      seen.add(edge.id);
      return true;
    });
}

function defaultProxyProfile(
  type: OpportunityType,
  payload: {
    query?: string | undefined;
    policyStatus?: string | undefined;
    scores?: OpportunityScores | undefined;
  },
): OpportunityProxyProfile | undefined {
  if (type !== 'proxy_narrative') return undefined;

  const scores = payload.scores || defaultScores(type);
  return {
    legitimacyScore: Math.max(45, scores.policyScore),
    legibilityScore: Math.max(55, Math.round((scores.purityScore + scores.scarcityScore) / 2)),
    tradeabilityScore: scores.tradeabilityScore,
    ...(safeTrim(payload.policyStatus) ? { ruleStatus: safeTrim(payload.policyStatus) } : {}),
    ...(safeTrim(payload.query) ? { mappingTarget: safeTrim(payload.query) } : {}),
    identityNote: '市场是否会把它当成公共符号来表达主题预期。',
    scarcityNote: '优先寻找公开市场可买、同类符号少、讲法清晰的代理变量。',
  };
}

function defaultCatalystCalendar(payload: {
  nextCatalystAt?: string | undefined;
  type: OpportunityType;
  ipoProfile?: OpportunityIpoProfile | undefined;
}): OpportunityCatalystItem[] {
  const items: OpportunityCatalystItem[] = [];
  if (safeTrim(payload.nextCatalystAt)) {
    items.push({
      label: payload.type === 'ipo_spinout' ? '核心日历催化' : '下一催化',
      dueAt: safeTrim(payload.nextCatalystAt),
      status: 'upcoming',
      source: 'Opportunity input',
      confidence: 'confirmed',
    });
  }
  if (payload.type === 'ipo_spinout' && payload.ipoProfile) {
    const ipo = payload.ipoProfile;
    if (safeTrim(ipo.officialTradingDate)) {
      items.push({
        label: '正式交易日',
        dueAt: safeTrim(ipo.officialTradingDate),
        status: 'upcoming',
        source: 'Opportunity profile',
        confidence: 'confirmed',
      });
    }
    if (safeTrim(ipo.spinoutDate)) {
      items.push({
        label: '分拆完成日',
        dueAt: safeTrim(ipo.spinoutDate),
        status: 'upcoming',
        source: 'Opportunity profile',
        confidence: 'confirmed',
      });
    }
    if (safeTrim(ipo.lockupDate)) {
      items.push({
        label: 'Lockup / 解禁窗口',
        dueAt: safeTrim(ipo.lockupDate),
        status: 'upcoming',
        source: 'Opportunity profile',
        confidence: 'confirmed',
      });
    }
    if (safeTrim(ipo.firstIndependentEarningsAt)) {
      items.push({
        label: '首份独立财报',
        dueAt: safeTrim(ipo.firstIndependentEarningsAt),
        status: 'upcoming',
        source: 'Opportunity profile',
        confidence: 'confirmed',
      });
    }
    if (safeTrim(ipo.firstCoverageAt)) {
      items.push({
        label: '首次覆盖 / initiation',
        dueAt: safeTrim(ipo.firstCoverageAt),
        status: 'upcoming',
        source: 'Opportunity profile',
        confidence: 'confirmed',
      });
    }
  }
  return items;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function parseScores(type: OpportunityType, value: string): OpportunityScores {
  try {
    const parsed = JSON.parse(value) as Partial<OpportunityScores>;
    return mergeScores(type, parsed);
  } catch {
    return defaultScores(type);
  }
}

function buildSnapshotComparable(record: OpportunityRecord): Record<string, unknown> {
  return {
    type: record.type,
    stage: record.stage,
    status: record.status,
    title: record.title,
    query: record.query,
    thesis: record.thesis || null,
    summary: record.summary || null,
    primaryTicker: record.primaryTicker || null,
    leaderTicker: record.leaderTicker || null,
    proxyTicker: record.proxyTicker || null,
    relatedTickers: record.relatedTickers,
    relayTickers: record.relayTickers,
    nextCatalystAt: record.nextCatalystAt || null,
    supplyOverhang: record.supplyOverhang || null,
    policyStatus: record.policyStatus || null,
    scores: record.scores,
    heatProfile: record.heatProfile || null,
    proxyProfile: record.proxyProfile || null,
    ipoProfile: record.ipoProfile || null,
    catalystCalendar: record.catalystCalendar,
  };
}

function shouldSaveSnapshot(previous: OpportunityRecord | null, next: OpportunityRecord): boolean {
  if (!previous) return true;
  return JSON.stringify(buildSnapshotComparable(previous)) !== JSON.stringify(buildSnapshotComparable(next));
}

function normalizeHeatProfile(
  type: OpportunityType,
  payload?: Partial<OpportunityHeatProfile>,
  fallbacks?: {
    leaderTicker?: string | undefined;
    relatedTickers?: string[] | undefined;
    relayTickers?: string[] | undefined;
    scores?: OpportunityScores | undefined;
  },
): OpportunityHeatProfile | undefined {
  const base = defaultHeatProfile(type, {
    leaderTicker: fallbacks?.leaderTicker,
    relatedTickers: fallbacks?.relatedTickers,
    relayTickers: fallbacks?.relayTickers,
    scores: fallbacks?.scores,
  });
  if (!payload && !base) return undefined;

  return {
    temperature: payload?.temperature || base?.temperature || 'cold',
    bottleneckTickers: normalizeTickers(payload?.bottleneckTickers || base?.bottleneckTickers),
    laggardTickers: normalizeTickers(payload?.laggardTickers || base?.laggardTickers),
    junkTickers: normalizeTickers(payload?.junkTickers || base?.junkTickers),
    ...((payload?.breadthScore ?? base?.breadthScore) !== undefined
      ? { breadthScore: Math.max(0, Math.min(100, Math.round(payload?.breadthScore ?? base?.breadthScore ?? 0))) }
      : {}),
    ...(payload?.validationStatus || base?.validationStatus
      ? { validationStatus: payload?.validationStatus || base?.validationStatus }
      : {}),
    ...(safeTrim(payload?.validationSummary) || safeTrim(base?.validationSummary)
      ? { validationSummary: safeTrim(payload?.validationSummary) || safeTrim(base?.validationSummary) }
      : {}),
    ...(() => {
      const edges = normalizeHeatEdges(payload?.edges || base?.edges);
      if (edges.length === 0 && payload?.edgeCount === undefined && base?.edgeCount === undefined) {
        return {};
      }
      return {
        edgeCount: typeof payload?.edgeCount === 'number'
          ? payload.edgeCount
          : typeof base?.edgeCount === 'number'
            ? base.edgeCount
            : edges.length,
        edges,
      };
    })(),
    ...(safeTrim(payload?.leaderHealth) || safeTrim(base?.leaderHealth)
      ? { leaderHealth: safeTrim(payload?.leaderHealth) || safeTrim(base?.leaderHealth) }
      : {}),
    ...(safeTrim(payload?.transmissionNote) || safeTrim(base?.transmissionNote)
      ? { transmissionNote: safeTrim(payload?.transmissionNote) || safeTrim(base?.transmissionNote) }
      : {}),
  };
}

function normalizeProxyProfile(
  type: OpportunityType,
  payload?: Partial<OpportunityProxyProfile>,
  fallbacks?: {
    query?: string | undefined;
    policyStatus?: string | undefined;
    scores?: OpportunityScores | undefined;
  },
): OpportunityProxyProfile | undefined {
  const base = defaultProxyProfile(type, {
    query: fallbacks?.query,
    policyStatus: fallbacks?.policyStatus,
    scores: fallbacks?.scores,
  });
  if (!payload && !base) return undefined;

  return {
    mappingTarget: safeTrim(payload?.mappingTarget) || safeTrim(base?.mappingTarget),
    legitimacyScore: payload?.legitimacyScore ?? base?.legitimacyScore ?? 50,
    legibilityScore: payload?.legibilityScore ?? base?.legibilityScore ?? 50,
    tradeabilityScore: payload?.tradeabilityScore ?? base?.tradeabilityScore ?? 50,
    ...(safeTrim(payload?.ruleStatus) || safeTrim(base?.ruleStatus)
      ? { ruleStatus: safeTrim(payload?.ruleStatus) || safeTrim(base?.ruleStatus) }
      : {}),
    ...(safeTrim(payload?.identityNote) || safeTrim(base?.identityNote)
      ? { identityNote: safeTrim(payload?.identityNote) || safeTrim(base?.identityNote) }
      : {}),
    ...(safeTrim(payload?.scarcityNote) || safeTrim(base?.scarcityNote)
      ? { scarcityNote: safeTrim(payload?.scarcityNote) || safeTrim(base?.scarcityNote) }
      : {}),
  };
}

function normalizeCatalystCalendar(
  payload?: OpportunityCatalystItem[],
  fallback?: OpportunityCatalystItem[],
): OpportunityCatalystItem[] {
  const source = payload && payload.length > 0 ? payload : fallback || [];
  return source
    .filter((item): item is OpportunityCatalystItem => Boolean(item?.label))
    .map((item) => ({
      label: item.label.trim(),
      status: item.status,
      ...(safeTrim(item.dueAt) ? { dueAt: safeTrim(item.dueAt) } : {}),
      ...(safeTrim(item.note) ? { note: safeTrim(item.note) } : {}),
      ...(safeTrim(item.source) ? { source: safeTrim(item.source) } : {}),
      ...(item.confidence ? { confidence: item.confidence } : {}),
    }));
}

function normalizeIpoProfile(
  type: OpportunityType,
  payload?: OpportunityIpoProfile,
): OpportunityIpoProfile | undefined {
  if (type !== 'ipo_spinout') return undefined;
  if (!payload) return undefined;

  const normalizeFieldEvidence = (value?: OpportunityFieldEvidence): OpportunityFieldEvidence | undefined => {
    if (!value?.source) return undefined;
    const source = safeTrim(value.source);
    if (!source) return undefined;
    return {
      source,
      confidence: value.confidence,
      ...(safeTrim(value.note) ? { note: safeTrim(value.note) } : {}),
      ...(safeTrim(value.observedAt) ? { observedAt: safeTrim(value.observedAt) } : {}),
    };
  };

  const evidenceSource = payload.evidence || {};
  const evidence: OpportunityIpoEvidence = {
    ...(normalizeFieldEvidence(evidenceSource.officialTradingDate) ? { officialTradingDate: normalizeFieldEvidence(evidenceSource.officialTradingDate) } : {}),
    ...(normalizeFieldEvidence(evidenceSource.spinoutDate) ? { spinoutDate: normalizeFieldEvidence(evidenceSource.spinoutDate) } : {}),
    ...(normalizeFieldEvidence(evidenceSource.retainedStakePercent) ? { retainedStakePercent: normalizeFieldEvidence(evidenceSource.retainedStakePercent) } : {}),
    ...(normalizeFieldEvidence(evidenceSource.lockupDate) ? { lockupDate: normalizeFieldEvidence(evidenceSource.lockupDate) } : {}),
    ...(normalizeFieldEvidence(evidenceSource.greenshoeStatus) ? { greenshoeStatus: normalizeFieldEvidence(evidenceSource.greenshoeStatus) } : {}),
    ...(normalizeFieldEvidence(evidenceSource.firstIndependentEarningsAt) ? { firstIndependentEarningsAt: normalizeFieldEvidence(evidenceSource.firstIndependentEarningsAt) } : {}),
    ...(normalizeFieldEvidence(evidenceSource.firstCoverageAt) ? { firstCoverageAt: normalizeFieldEvidence(evidenceSource.firstCoverageAt) } : {}),
  };

  const normalized: OpportunityIpoProfile = {
    ...(safeTrim(payload.officialTradingDate) ? { officialTradingDate: safeTrim(payload.officialTradingDate) } : {}),
    ...(safeTrim(payload.spinoutDate) ? { spinoutDate: safeTrim(payload.spinoutDate) } : {}),
    ...(typeof payload.retainedStakePercent === 'number' ? { retainedStakePercent: payload.retainedStakePercent } : {}),
    ...(safeTrim(payload.lockupDate) ? { lockupDate: safeTrim(payload.lockupDate) } : {}),
    ...(safeTrim(payload.greenshoeStatus) ? { greenshoeStatus: safeTrim(payload.greenshoeStatus) } : {}),
    ...(safeTrim(payload.firstIndependentEarningsAt) ? { firstIndependentEarningsAt: safeTrim(payload.firstIndependentEarningsAt) } : {}),
    ...(safeTrim(payload.firstCoverageAt) ? { firstCoverageAt: safeTrim(payload.firstCoverageAt) } : {}),
    ...(Object.keys(evidence).length > 0 ? { evidence } : {}),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function toOpportunityRecord(row: OpportunityRow): OpportunityRecord {
  const relatedTickers = parseJsonArray(row.relatedTickers);
  const relayTickers = parseJsonArray(row.relayTickers);
  const scores = parseScores(row.type, row.scores);
  const parsedHeatProfile = parseJsonObject<OpportunityHeatProfile>(row.heatProfile);
  const parsedProxyProfile = parseJsonObject<OpportunityProxyProfile>(row.proxyProfile);
  const parsedIpoProfile = normalizeIpoProfile(row.type, parseJsonObject<OpportunityIpoProfile>(row.ipoProfile));
  const heatProfile = normalizeHeatProfile(row.type, parsedHeatProfile, {
    leaderTicker: row.leaderTicker || undefined,
    relatedTickers,
    relayTickers,
    scores,
  });

  return {
    id: row.id,
    type: row.type,
    stage: row.stage,
    status: row.status,
    title: row.title,
    query: row.query,
    ...(row.thesis ? { thesis: row.thesis } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.primaryTicker ? { primaryTicker: row.primaryTicker } : {}),
    ...(row.leaderTicker ? { leaderTicker: row.leaderTicker } : {}),
    ...(row.proxyTicker ? { proxyTicker: row.proxyTicker } : {}),
    relatedTickers,
    relayTickers,
    ...(row.nextCatalystAt ? { nextCatalystAt: row.nextCatalystAt } : {}),
    ...(row.supplyOverhang ? { supplyOverhang: row.supplyOverhang } : {}),
    ...(row.policyStatus ? { policyStatus: row.policyStatus } : {}),
    scores,
    ...(heatProfile ? { heatProfile } : {}),
    ...(parsedProxyProfile ? { proxyProfile: parsedProxyProfile } : {}),
    ...(parsedIpoProfile ? { ipoProfile: parsedIpoProfile } : {}),
    catalystCalendar: normalizeCatalystCalendar(
      parseJsonObject<OpportunityCatalystItem[]>(row.catalystCalendar),
      defaultCatalystCalendar({
        type: row.type,
        nextCatalystAt: row.nextCatalystAt || undefined,
        ipoProfile: parsedIpoProfile,
      }),
    ),
    ...(row.latestMissionId ? { latestMissionId: row.latestMissionId } : {}),
    ...(row.latestEventType ? { latestEventType: row.latestEventType } : {}),
    ...(row.latestEventMessage ? { latestEventMessage: row.latestEventMessage } : {}),
    ...(row.latestEventAt ? { latestEventAt: row.latestEventAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOpportunityEventRecord(row: OpportunityEventRow): OpportunityEventRecord {
  let meta: Record<string, unknown> | undefined;
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta) as Record<string, unknown>;
    } catch {
      meta = undefined;
    }
  }

  return {
    id: row.id,
    opportunityId: row.opportunityId,
    type: row.type,
    message: row.message,
    timestamp: row.timestamp,
    ...(meta ? { meta } : {}),
  };
}

export function toOpportunityEventEnvelope(
  event: OpportunityEventRecord,
  source: OpportunityEventEnvelope['source'] = { service: 'api' },
): OpportunityEventEnvelope {
  const metaRunId = typeof event.meta?.runId === 'string' ? event.meta.runId : undefined;
  return {
    id: event.id,
    stream: 'opportunity',
    type: event.type,
    version: 1,
    occurredAt: event.timestamp,
    entityId: event.opportunityId,
    payload: event,
    source: {
      service: source.service,
      ...(source.runId || metaRunId ? { runId: source.runId || metaRunId } : {}),
    },
  };
}

function toOpportunitySnapshotRecord(row: OpportunitySnapshotRow): OpportunitySnapshotRecord | null {
  try {
    return {
      id: row.id,
      opportunityId: row.opportunityId,
      createdAt: row.createdAt,
      payload: JSON.parse(row.payload) as OpportunityRecord,
    };
  } catch {
    return null;
  }
}

function normalizeFieldEvidenceKind(value: string): OpportunityFieldEvidenceKind {
  return (
    value === 'record'
    || value === 'profile'
    || value === 'score'
    || value === 'source'
    || value === 'mission'
    || value === 'event'
  ) ? value : 'source';
}

function normalizeFieldEvidenceConfidence(value: string): OpportunitySourceProvenanceConfidence {
  return (
    value === 'confirmed'
    || value === 'inferred'
    || value === 'placeholder'
    || value === 'unknown'
  ) ? value : 'unknown';
}

function normalizeFieldEvidenceStatus(value: string): OpportunityFieldEvidenceStatus {
  return value === 'invalidated' ? 'invalidated' : 'active';
}

function toOpportunityFieldEvidenceRecord(row: OpportunityFieldEvidenceRow): OpportunityFieldEvidenceRecord {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    field: row.field,
    label: row.label,
    kind: normalizeFieldEvidenceKind(row.kind),
    source: row.source,
    confidence: normalizeFieldEvidenceConfidence(row.confidence),
    status: normalizeFieldEvidenceStatus(row.status),
    ...(row.value ? { value: row.value } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.observedAt ? { observedAt: row.observedAt } : {}),
    recordedAt: row.recordedAt,
    updatedAt: row.updatedAt,
    ...(row.createdEventId ? { createdEventId: row.createdEventId } : {}),
    ...(row.invalidatedEventId ? { invalidatedEventId: row.invalidatedEventId } : {}),
    ...(row.restoredEventId ? { restoredEventId: row.restoredEventId } : {}),
  };
}

function toOpportunityFieldEvidenceIndexItem(
  row: OpportunityFieldEvidenceIndexRow,
): OpportunityFieldEvidenceIndexItem {
  return {
    ...toOpportunityFieldEvidenceRecord(row),
    opportunityTitle: row.opportunityTitle,
    opportunityType: row.opportunityType,
    opportunityStage: row.opportunityStage,
    opportunityStatus: row.opportunityStatus,
    ...(row.opportunityPrimaryTicker ? { opportunityPrimaryTicker: row.opportunityPrimaryTicker } : {}),
    ...(row.opportunityLatestMissionId ? { opportunityLatestMissionId: row.opportunityLatestMissionId } : {}),
    ...(row.opportunityLatestEventAt ? { opportunityLatestEventAt: row.opportunityLatestEventAt } : {}),
  };
}

function escapeSqlLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildOpportunityFieldEvidenceWhere(
  filters: OpportunityFieldEvidenceListFilters = {},
): { whereSql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const opportunityId = safeTrim(filters.opportunityId);
  const field = safeTrim(filters.field);
  const source = safeTrim(filters.source);
  const q = safeTrim(filters.q);

  if (opportunityId) {
    clauses.push('e.opportunityId = ?');
    params.push(opportunityId);
  }
  if (field) {
    clauses.push('e.field = ?');
    params.push(field);
  }
  if (source) {
    clauses.push('e.source = ?');
    params.push(source);
  }
  if (filters.kind) {
    clauses.push('e.kind = ?');
    params.push(filters.kind);
  }
  if (filters.confidence) {
    clauses.push('e.confidence = ?');
    params.push(filters.confidence);
  }
  if (filters.status) {
    clauses.push('e.status = ?');
    params.push(filters.status);
  }
  if (q) {
    const needle = `%${escapeSqlLike(q)}%`;
    clauses.push(`(
      e.id LIKE ? ESCAPE '\\'
      OR e.field LIKE ? ESCAPE '\\'
      OR e.label LIKE ? ESCAPE '\\'
      OR e.source LIKE ? ESCAPE '\\'
      OR e.value LIKE ? ESCAPE '\\'
      OR e.note LIKE ? ESCAPE '\\'
      OR o.title LIKE ? ESCAPE '\\'
      OR o.primaryTicker LIKE ? ESCAPE '\\'
    )`);
    params.push(needle, needle, needle, needle, needle, needle, needle, needle);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

type FieldEvidenceEventState = {
  recordedEvent: OpportunityEventRecord;
  status: OpportunityFieldEvidenceStatus;
  invalidatedEventId?: string | undefined;
  invalidatedAt?: string | undefined;
  restoredEventId?: string | undefined;
  restoredAt?: string | undefined;
};

function toFieldEvidenceEventRecord(row: OpportunityEventRow): OpportunityEventRecord {
  return toOpportunityEventRecord(row);
}

function buildFieldEvidenceEventStates(events: OpportunityEventRecord[]): Map<string, FieldEvidenceEventState> {
  const states = new Map<string, FieldEvidenceEventState>();
  const sortedEvents = [...events].sort((a, b) => {
    const timestampDelta = a.timestamp.localeCompare(b.timestamp);
    return timestampDelta !== 0 ? timestampDelta : a.id.localeCompare(b.id);
  });

  for (const event of sortedEvents) {
    if (event.type === 'field_evidence_recorded') {
      states.set(event.id, {
        recordedEvent: event,
        status: 'active',
      });
      continue;
    }

    const evidenceId = textMetaValue(event.meta?.evidenceId);
    const state = evidenceId ? states.get(evidenceId) : undefined;
    if (!state) continue;
    if (event.type === 'field_evidence_invalidated') {
      states.set(evidenceId!, {
        ...state,
        status: 'invalidated',
        invalidatedEventId: event.id,
        invalidatedAt: event.timestamp,
      });
    }
    if (event.type === 'field_evidence_restored') {
      states.set(evidenceId!, {
        ...state,
        status: 'active',
        restoredEventId: event.id,
        restoredAt: event.timestamp,
      });
    }
  }

  return states;
}

async function listAllFieldEvidenceEvents(): Promise<OpportunityEventRecord[]> {
  const db = await getDb();
  const rows = await db.all<OpportunityEventRow[]>(
    `SELECT id, opportunityId, timestamp, type, message, meta
     FROM opportunity_events
     WHERE type IN ('field_evidence_recorded', 'field_evidence_invalidated', 'field_evidence_restored')
     ORDER BY timestamp ASC, id ASC`,
  );
  return rows.map(toFieldEvidenceEventRecord);
}

function canonicalInputFromFieldEvidenceState(state: FieldEvidenceEventState): RecordOpportunityFieldEvidenceInput | null {
  const meta = state.recordedEvent.meta || {};
  const field = textMetaValue(meta.field);
  if (!field) return null;
  const descriptor = normalizeOpportunityFieldEvidenceDescriptor({
    field,
    label: meta.label,
    kind: meta.kind,
    source: textMetaValue(meta.source) || 'manual_field_evidence',
    confidence: meta.confidence,
  });

  return {
    id: state.recordedEvent.id,
    opportunityId: state.recordedEvent.opportunityId,
    field: descriptor.field,
    label: descriptor.label,
    kind: descriptor.kind,
    source: descriptor.source,
    confidence: descriptor.confidence,
    ...(textMetaValue(meta.value) ? { value: textMetaValue(meta.value) } : {}),
    ...(textMetaValue(meta.note) ? { note: textMetaValue(meta.note) } : {}),
    observedAt: textMetaValue(meta.observedAt) || state.recordedEvent.timestamp,
    recordedAt: state.recordedEvent.timestamp,
    createdEventId: state.recordedEvent.id,
  };
}

function createFieldEvidenceRepairApi(evidenceId: string) {
  return {
    method: 'POST' as const,
    path: '/api/diagnostics/opportunity-field-evidence/repair',
    body: { evidenceIds: [evidenceId] },
  };
}

function createFieldEvidenceRepairAction(
  issueCode: OpportunityFieldEvidenceCoverageIssueCode,
  evidenceId: string,
  input: Omit<OpportunityFieldEvidenceRepairAction, 'issueCode' | 'evidenceId'>,
): OpportunityFieldEvidenceRepairAction {
  return {
    evidenceId,
    issueCode,
    ...input,
  };
}

async function syncOpportunityFieldEvidenceCanonicalStatus(
  state: FieldEvidenceEventState,
  checkedAt = new Date().toISOString(),
): Promise<OpportunityFieldEvidenceRecord | null> {
  const db = await getDb();
  const updatedAt = state.status === 'invalidated'
    ? state.invalidatedAt || checkedAt
    : state.restoredAt || state.recordedEvent.timestamp || checkedAt;
  await db.run(
    `UPDATE opportunity_field_evidence
     SET status = ?, updatedAt = ?, invalidatedEventId = ?, restoredEventId = ?
     WHERE opportunityId = ? AND id = ?`,
    state.status,
    updatedAt,
    state.invalidatedEventId || null,
    state.restoredEventId || null,
    state.recordedEvent.opportunityId,
    state.recordedEvent.id,
  );
  return getOpportunityFieldEvidence(state.recordedEvent.opportunityId, state.recordedEvent.id);
}

async function inspectOpportunityFieldEvidenceRepairs() {
  const checkedAt = new Date().toISOString();
  const events = await listAllFieldEvidenceEvents();
  const states = buildFieldEvidenceEventStates(events);
  const canonicalRows = await (await getDb()).all<OpportunityFieldEvidenceRow[]>(
    `SELECT id, opportunityId, field, label, kind, source, confidence, status, value, note,
            observedAt, recordedAt, updatedAt, createdEventId, invalidatedEventId, restoredEventId
     FROM opportunity_field_evidence
     ORDER BY updatedAt DESC, id DESC`,
  );
  const canonical = canonicalRows.map(toOpportunityFieldEvidenceRecord);
  const canonicalById = new Map(canonical.map((row) => [row.id, row]));
  const evidenceIds = new Set<string>([
    ...states.keys(),
    ...canonical.map((row) => row.id),
  ]);
  const actions: OpportunityFieldEvidenceRepairAction[] = [];

  for (const [evidenceId, state] of states.entries()) {
    const field = textMetaValue(state.recordedEvent.meta?.field);
    if (!field) {
      actions.push(createFieldEvidenceRepairAction('missing_field', evidenceId, {
        action: 'repair_event_metadata',
        safety: 'blocked',
        opportunityId: state.recordedEvent.opportunityId,
        eventStatus: state.status,
        reason: 'Recorded field evidence event is missing field metadata; automatic canonical repair would guess the field.',
      }));
      continue;
    }

    const row = canonicalById.get(evidenceId);
    if (!row) {
      actions.push(createFieldEvidenceRepairAction('missing_canonical', evidenceId, {
        action: 'backfill_canonical',
        safety: 'automatic',
        opportunityId: state.recordedEvent.opportunityId,
        field,
        eventStatus: state.status,
        reason: 'Recorded field evidence event has no canonical row; replay event metadata into the canonical table.',
        api: createFieldEvidenceRepairApi(evidenceId),
      }));
      continue;
    }

    if (row.status !== state.status) {
      actions.push(createFieldEvidenceRepairAction('status_mismatch', evidenceId, {
        action: 'sync_status',
        safety: 'automatic',
        opportunityId: state.recordedEvent.opportunityId,
        field,
        eventStatus: state.status,
        canonicalStatus: row.status,
        reason: 'Canonical field evidence status differs from the audited event stream; sync canonical status from events.',
        api: createFieldEvidenceRepairApi(evidenceId),
      }));
    }
  }

  for (const row of canonical) {
    if (states.has(row.id)) continue;
    actions.push(createFieldEvidenceRepairAction('orphan_canonical', row.id, {
      action: 'review_orphan',
      safety: 'manual_review',
      opportunityId: row.opportunityId,
      field: row.field,
      canonicalStatus: row.status,
      reason: 'Canonical field evidence row has no recorded audit event; review before deleting or recreating audit history.',
      api: createFieldEvidenceRepairApi(row.id),
    }));
  }

  return {
    checkedAt,
    recordedEvents: states.size,
    canonicalRows: canonical.length,
    states,
    evidenceIds,
    actions,
  };
}

function toOpportunityFieldRegistryOverride(row: OpportunityFieldRegistryOverrideRow): OpportunityFieldRegistryOverride {
  return {
    field: row.field,
    ...(safeTrim(row.label) ? { label: safeTrim(row.label) } : {}),
    ...(row.kind ? { kind: normalizeFieldEvidenceKind(row.kind) } : {}),
    ...(safeTrim(row.source) ? { source: safeTrim(row.source) } : {}),
    ...(row.confidence ? { confidence: normalizeFieldEvidenceConfidence(row.confidence) } : {}),
    ...(safeTrim(row.note) ? { note: safeTrim(row.note) } : {}),
    updatedAt: row.updatedAt,
    ...(safeTrim(row.updatedBy) ? { updatedBy: safeTrim(row.updatedBy) } : {}),
  };
}

function parseRegistryOverridePayload(value: string | null): OpportunityFieldRegistryOverride | undefined {
  const parsed = parseJsonObject<OpportunityFieldRegistryOverride>(value);
  if (!parsed?.field) return undefined;
  return {
    field: parsed.field,
    ...(safeTrim(parsed.label) ? { label: safeTrim(parsed.label) } : {}),
    ...(isFieldRegistryKind(parsed.kind) ? { kind: parsed.kind } : {}),
    ...(safeTrim(parsed.source) ? { source: safeTrim(parsed.source) } : {}),
    ...(isFieldRegistryConfidence(parsed.confidence) ? { confidence: parsed.confidence } : {}),
    ...(safeTrim(parsed.note) ? { note: safeTrim(parsed.note) } : {}),
    ...(safeTrim(parsed.updatedAt) ? { updatedAt: safeTrim(parsed.updatedAt) } : {}),
    ...(safeTrim(parsed.updatedBy) ? { updatedBy: safeTrim(parsed.updatedBy) } : {}),
  };
}

function isFieldRegistryKind(value: unknown): value is OpportunityFieldEvidenceKind {
  return value === 'record'
    || value === 'profile'
    || value === 'score'
    || value === 'source'
    || value === 'mission'
    || value === 'event';
}

function isFieldRegistryConfidence(value: unknown): value is OpportunitySourceProvenanceConfidence {
  return value === 'confirmed'
    || value === 'inferred'
    || value === 'placeholder'
    || value === 'unknown';
}

function parseRegistryAuditFields(value: string): OpportunityFieldRegistryAuditField[] {
  const parsed = parseJsonObject<unknown[]>(value);
  if (!Array.isArray(parsed)) return [];
  const allowed = new Set<OpportunityFieldRegistryAuditField>(['label', 'kind', 'source', 'confidence', 'note']);
  return parsed.filter((field): field is OpportunityFieldRegistryAuditField => (
    typeof field === 'string' && allowed.has(field as OpportunityFieldRegistryAuditField)
  ));
}

function registryOverrideChangedFields(
  before?: OpportunityFieldRegistryOverride | null,
  after?: OpportunityFieldRegistryOverride | null,
): OpportunityFieldRegistryAuditField[] {
  const fields: OpportunityFieldRegistryAuditField[] = ['label', 'kind', 'source', 'confidence', 'note'];
  return fields.filter((field) => (before?.[field] || '') !== (after?.[field] || ''));
}

function toOpportunityFieldRegistryAuditEntry(
  row: OpportunityFieldRegistryAuditRow,
): OpportunityFieldRegistryAuditEntry {
  const action: OpportunityFieldRegistryAuditAction = row.action === 'delete' ? 'delete' : 'upsert';
  return {
    id: row.id,
    field: row.field,
    action,
    changedFields: parseRegistryAuditFields(row.changedFields),
    ...(parseRegistryOverridePayload(row.beforePayload) ? { before: parseRegistryOverridePayload(row.beforePayload) } : {}),
    ...(parseRegistryOverridePayload(row.afterPayload) ? { after: parseRegistryOverridePayload(row.afterPayload) } : {}),
    ...(safeTrim(row.note) ? { note: safeTrim(row.note) } : {}),
    updatedAt: row.updatedAt,
    ...(safeTrim(row.updatedBy) ? { updatedBy: safeTrim(row.updatedBy) } : {}),
  };
}

async function recordOpportunityFieldRegistryAudit(input: {
  field: string;
  action: OpportunityFieldRegistryAuditAction;
  before?: OpportunityFieldRegistryOverride | null | undefined;
  after?: OpportunityFieldRegistryOverride | null | undefined;
  note?: string | undefined;
  updatedAt: string;
  updatedBy?: string | undefined;
}): Promise<OpportunityFieldRegistryAuditEntry> {
  const db = await getDb();
  const id = generateFieldRegistryAuditId();
  const changedFields = registryOverrideChangedFields(input.before, input.after);
  await db.run(
    `INSERT INTO opportunity_field_registry_audit (
      id,
      field,
      action,
      changedFields,
      beforePayload,
      afterPayload,
      note,
      updatedAt,
      updatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.field,
    input.action,
    JSON.stringify(changedFields),
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null,
    safeTrim(input.note) || null,
    input.updatedAt,
    safeTrim(input.updatedBy) || null,
  );

  return {
    id,
    field: input.field,
    action: input.action,
    changedFields,
    ...(input.before ? { before: input.before } : {}),
    ...(input.after ? { after: input.after } : {}),
    ...(safeTrim(input.note) ? { note: safeTrim(input.note) } : {}),
    updatedAt: input.updatedAt,
    ...(safeTrim(input.updatedBy) ? { updatedBy: safeTrim(input.updatedBy) } : {}),
  };
}

export async function listOpportunityFieldRegistryOverrides(): Promise<OpportunityFieldRegistryOverride[]> {
  const db = await getDb();
  const rows = await db.all<OpportunityFieldRegistryOverrideRow[]>(
    `SELECT field, label, kind, source, confidence, note, updatedAt, updatedBy
     FROM opportunity_field_registry_overrides
     ORDER BY field ASC`,
  );
  return rows.map(toOpportunityFieldRegistryOverride);
}

export async function getOpportunityFieldRegistryOverride(
  field: string,
): Promise<OpportunityFieldRegistryOverride | null> {
  const db = await getDb();
  const row = await db.get<OpportunityFieldRegistryOverrideRow>(
    `SELECT field, label, kind, source, confidence, note, updatedAt, updatedBy
     FROM opportunity_field_registry_overrides
     WHERE field = ?`,
    field,
  );
  return row ? toOpportunityFieldRegistryOverride(row) : null;
}

export async function listOpportunityFieldRegistryAudit(input: {
  field?: string | undefined;
  limit?: number | undefined;
} = {}): Promise<OpportunityFieldRegistryAuditEntry[]> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit || 20)));
  const field = safeTrim(input.field);
  const rows = field
    ? await db.all<OpportunityFieldRegistryAuditRow[]>(
      `SELECT id, field, action, changedFields, beforePayload, afterPayload, note, updatedAt, updatedBy
       FROM opportunity_field_registry_audit
       WHERE field = ?
       ORDER BY updatedAt DESC, id DESC
       LIMIT ?`,
      field,
      limit,
    )
    : await db.all<OpportunityFieldRegistryAuditRow[]>(
      `SELECT id, field, action, changedFields, beforePayload, afterPayload, note, updatedAt, updatedBy
       FROM opportunity_field_registry_audit
       ORDER BY updatedAt DESC, id DESC
       LIMIT ?`,
      limit,
    );
  return rows.map(toOpportunityFieldRegistryAuditEntry);
}

export async function upsertOpportunityFieldRegistryOverride(
  input: UpsertOpportunityFieldRegistryOverrideInput,
): Promise<{ override: OpportunityFieldRegistryOverride; audit: OpportunityFieldRegistryAuditEntry }> {
  const db = await getDb();
  const updatedAt = input.updatedAt || new Date().toISOString();
  const field = safeTrim(input.field);
  if (!field) throw new Error('field is required');
  const before = await getOpportunityFieldRegistryOverride(field);

  await db.run(
    `INSERT INTO opportunity_field_registry_overrides (
      field,
      label,
      kind,
      source,
      confidence,
      note,
      updatedAt,
      updatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(field) DO UPDATE SET
      label = excluded.label,
      kind = excluded.kind,
      source = excluded.source,
      confidence = excluded.confidence,
      note = excluded.note,
      updatedAt = excluded.updatedAt,
      updatedBy = excluded.updatedBy`,
    field,
    safeTrim(input.label) || null,
    input.kind || null,
    safeTrim(input.source) || null,
    input.confidence || null,
    safeTrim(input.note) || null,
    updatedAt,
    safeTrim(input.updatedBy) || null,
  );

  const override = (await getOpportunityFieldRegistryOverride(field)) || {
    field,
    updatedAt,
  };
  const audit = await recordOpportunityFieldRegistryAudit({
    field,
    action: 'upsert',
    before,
    after: override,
    note: input.note,
    updatedAt,
    updatedBy: input.updatedBy,
  });
  return { override, audit };
}

export async function deleteOpportunityFieldRegistryOverride(field: string): Promise<{
  deleted: boolean;
  audit?: OpportunityFieldRegistryAuditEntry | undefined;
}> {
  const db = await getDb();
  const normalizedField = safeTrim(field);
  if (!normalizedField) return { deleted: false };
  const before = await getOpportunityFieldRegistryOverride(normalizedField);
  const result = await db.run(
    'DELETE FROM opportunity_field_registry_overrides WHERE field = ?',
    normalizedField,
  );
  const deleted = (result.changes || 0) > 0;
  if (!deleted || !before) return { deleted };
  const updatedAt = new Date().toISOString();
  return {
    deleted,
    audit: await recordOpportunityFieldRegistryAudit({
      field: normalizedField,
      action: 'delete',
      before,
      updatedAt,
      updatedBy: 'dashboard',
    }),
  };
}

export async function getOpportunity(id: string): Promise<OpportunityRecord | null> {
  const db = await getDb();
  const row = await db.get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', id);
  return row ? toOpportunityRecord(row) : null;
}

export async function listOpportunities(limit = 50): Promise<OpportunityRecord[]> {
  const db = await getDb();
  const rows = await db.all<OpportunityRow[]>(
    'SELECT * FROM opportunities ORDER BY updatedAt DESC LIMIT ?',
    limit,
  );
  return rows.map(toOpportunityRecord);
}

function normalizeComparableText(value?: string): string | null {
  const trimmed = safeTrim(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

export async function findMatchingOpportunity(input: {
  type: OpportunityType;
  title?: string | undefined;
  query?: string | undefined;
  primaryTicker?: string | undefined;
  leaderTicker?: string | undefined;
  proxyTicker?: string | undefined;
}): Promise<OpportunityRecord | null> {
  const opportunities = await listOpportunities(500);
  const title = normalizeComparableText(input.title);
  const query = normalizeComparableText(input.query);
  const primaryTicker = normalizeTicker(input.primaryTicker);
  const leaderTicker = normalizeTicker(input.leaderTicker);
  const proxyTicker = normalizeTicker(input.proxyTicker);

  return opportunities.find((opportunity) => {
    if (opportunity.type !== input.type) return false;

    const titleMatches = title
      ? normalizeComparableText(opportunity.title) === title
      : false;
    const queryMatches = query
      ? normalizeComparableText(opportunity.query) === query
      : false;
    const primaryMatches = primaryTicker
      ? opportunity.primaryTicker === primaryTicker
      : false;
    const leaderMatches = leaderTicker
      ? opportunity.leaderTicker === leaderTicker
      : false;
    const proxyMatches = proxyTicker
      ? opportunity.proxyTicker === proxyTicker
      : false;

    return titleMatches || queryMatches || primaryMatches || leaderMatches || proxyMatches;
  }) || null;
}

export async function listOpportunitySnapshots(
  opportunityId: string,
  limit = 10,
): Promise<OpportunitySnapshotRecord[]> {
  const db = await getDb();
  const rows = await db.all<OpportunitySnapshotRow[]>(
    'SELECT * FROM opportunity_snapshots WHERE opportunityId = ? ORDER BY createdAt DESC LIMIT ?',
    opportunityId,
    limit,
  );
  return rows
    .map(toOpportunitySnapshotRecord)
    .filter((snapshot): snapshot is OpportunitySnapshotRecord => Boolean(snapshot));
}

export async function listOpportunityFieldEvidence(
  opportunityId: string,
  limit = 100,
): Promise<OpportunityFieldEvidenceRecord[]> {
  const db = await getDb();
  const rows = await db.all<OpportunityFieldEvidenceRow[]>(
    `SELECT id, opportunityId, field, label, kind, source, confidence, status, value, note,
            observedAt, recordedAt, updatedAt, createdEventId, invalidatedEventId, restoredEventId
     FROM opportunity_field_evidence
     WHERE opportunityId = ?
     ORDER BY updatedAt DESC, id DESC
     LIMIT ?`,
    opportunityId,
    limit,
  );
  return rows.map(toOpportunityFieldEvidenceRecord);
}

export async function listOpportunityFieldEvidenceIndex(input: {
  limit?: number | undefined;
  offset?: number | undefined;
  filters?: OpportunityFieldEvidenceListFilters | undefined;
} = {}): Promise<OpportunityFieldEvidenceIndexItem[]> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(input.limit || 100, 500));
  const offset = Math.max(0, input.offset || 0);
  const { whereSql, params } = buildOpportunityFieldEvidenceWhere(input.filters);
  const rows = await db.all<OpportunityFieldEvidenceIndexRow[]>(
    `SELECT
       e.id,
       e.opportunityId,
       e.field,
       e.label,
       e.kind,
       e.source,
       e.confidence,
       e.status,
       e.value,
       e.note,
       e.observedAt,
       e.recordedAt,
       e.updatedAt,
       e.createdEventId,
       e.invalidatedEventId,
       e.restoredEventId,
       o.title AS opportunityTitle,
       o.type AS opportunityType,
       o.stage AS opportunityStage,
       o.status AS opportunityStatus,
       o.primaryTicker AS opportunityPrimaryTicker,
       o.latestMissionId AS opportunityLatestMissionId,
       o.latestEventAt AS opportunityLatestEventAt
     FROM opportunity_field_evidence e
     INNER JOIN opportunities o ON o.id = e.opportunityId
     ${whereSql}
     ORDER BY e.updatedAt DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
  return rows.map(toOpportunityFieldEvidenceIndexItem);
}

export async function getOpportunityFieldEvidence(
  opportunityId: string,
  evidenceId: string,
): Promise<OpportunityFieldEvidenceRecord | null> {
  const db = await getDb();
  const row = await db.get<OpportunityFieldEvidenceRow>(
    `SELECT id, opportunityId, field, label, kind, source, confidence, status, value, note,
            observedAt, recordedAt, updatedAt, createdEventId, invalidatedEventId, restoredEventId
     FROM opportunity_field_evidence
     WHERE opportunityId = ? AND id = ?`,
    opportunityId,
    evidenceId,
  );
  return row ? toOpportunityFieldEvidenceRecord(row) : null;
}

export async function recordOpportunityFieldEvidence(
  input: RecordOpportunityFieldEvidenceInput,
): Promise<OpportunityFieldEvidenceRecord> {
  const db = await getDb();
  const recordedAt = input.recordedAt || new Date().toISOString();
  const observedAt = safeTrim(input.observedAt) || recordedAt;

  await db.run(
    `INSERT INTO opportunity_field_evidence (
      id,
      opportunityId,
      field,
      label,
      kind,
      source,
      confidence,
      status,
      value,
      note,
      observedAt,
      recordedAt,
      updatedAt,
      createdEventId,
      invalidatedEventId,
      restoredEventId,
      meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      opportunityId = excluded.opportunityId,
      field = excluded.field,
      label = excluded.label,
      kind = excluded.kind,
      source = excluded.source,
      confidence = excluded.confidence,
      status = 'active',
      value = excluded.value,
      note = excluded.note,
      observedAt = excluded.observedAt,
      recordedAt = excluded.recordedAt,
      updatedAt = excluded.updatedAt,
      createdEventId = excluded.createdEventId,
      invalidatedEventId = NULL,
      restoredEventId = NULL`,
    input.id,
    input.opportunityId,
    input.field,
    input.label,
    input.kind,
    input.source,
    input.confidence,
    safeTrim(input.value) || null,
    safeTrim(input.note) || null,
    observedAt,
    recordedAt,
    recordedAt,
    input.createdEventId || input.id,
  );

  return (await getOpportunityFieldEvidence(input.opportunityId, input.id)) || {
    id: input.id,
    opportunityId: input.opportunityId,
    field: input.field,
    label: input.label,
    kind: input.kind,
    source: input.source,
    confidence: input.confidence,
    status: 'active',
    ...(safeTrim(input.value) ? { value: safeTrim(input.value) } : {}),
    ...(safeTrim(input.note) ? { note: safeTrim(input.note) } : {}),
    observedAt,
    recordedAt,
    updatedAt: recordedAt,
    createdEventId: input.createdEventId || input.id,
  };
}

export async function updateOpportunityFieldEvidenceStatus(
  opportunityId: string,
  evidenceId: string,
  status: OpportunityFieldEvidenceStatus,
  eventId: string,
  updatedAt = new Date().toISOString(),
): Promise<OpportunityFieldEvidenceRecord | null> {
  const db = await getDb();
  const eventColumn = status === 'invalidated' ? 'invalidatedEventId' : 'restoredEventId';
  await db.run(
    `UPDATE opportunity_field_evidence
     SET status = ?, updatedAt = ?, ${eventColumn} = ?
     WHERE opportunityId = ? AND id = ?`,
    status,
    updatedAt,
    eventId,
    opportunityId,
    evidenceId,
  );
  return getOpportunityFieldEvidence(opportunityId, evidenceId);
}

export async function backfillOpportunityFieldEvidence(): Promise<OpportunityFieldEvidenceBackfillResult> {
  const checkedAt = new Date().toISOString();
  const events = await listAllFieldEvidenceEvents();
  const states = buildFieldEvidenceEventStates(events);
  const existingRows = await (await getDb()).all<Array<{ id: string }>>(
    'SELECT id FROM opportunity_field_evidence',
  );
  const existingIds = new Set(existingRows.map((row) => row.id));
  let inserted = 0;
  let refreshed = 0;
  let invalidated = 0;
  let restored = 0;
  let skippedMissingField = 0;

  for (const [evidenceId, state] of states.entries()) {
    const input = canonicalInputFromFieldEvidenceState(state);
    if (!input) {
      skippedMissingField += 1;
      continue;
    }

    await recordOpportunityFieldEvidence(input);
    if (existingIds.has(evidenceId)) refreshed += 1;
    else inserted += 1;

    if (state.status === 'invalidated' && state.invalidatedEventId) {
      await updateOpportunityFieldEvidenceStatus(
        state.recordedEvent.opportunityId,
        evidenceId,
        'invalidated',
        state.invalidatedEventId,
        state.invalidatedAt || checkedAt,
      );
      invalidated += 1;
    }
    if (state.status === 'active' && state.restoredEventId) {
      await updateOpportunityFieldEvidenceStatus(
        state.recordedEvent.opportunityId,
        evidenceId,
        'active',
        state.restoredEventId,
        state.restoredAt || checkedAt,
      );
      restored += 1;
    }
  }

  return {
    checkedAt,
    eventsScanned: events.length,
    recordedEvents: events.filter((event) => event.type === 'field_evidence_recorded').length,
    invalidatedEvents: events.filter((event) => event.type === 'field_evidence_invalidated').length,
    restoredEvents: events.filter((event) => event.type === 'field_evidence_restored').length,
    inserted,
    refreshed,
    invalidated,
    restored,
    skippedMissingField,
  };
}

export async function getOpportunityFieldEvidenceCoverageDiagnostics(): Promise<OpportunityFieldEvidenceCoverageDiagnostics> {
  const checkedAt = new Date().toISOString();
  const events = await listAllFieldEvidenceEvents();
  const states = buildFieldEvidenceEventStates(events);
  const canonicalRows = await (await getDb()).all<OpportunityFieldEvidenceRow[]>(
    `SELECT id, opportunityId, field, label, kind, source, confidence, status, value, note,
            observedAt, recordedAt, updatedAt, createdEventId, invalidatedEventId, restoredEventId
     FROM opportunity_field_evidence
     ORDER BY updatedAt DESC, id DESC`,
  );
  const canonical = canonicalRows.map(toOpportunityFieldEvidenceRecord);
  const canonicalById = new Map(canonical.map((row) => [row.id, row]));
  const issues: OpportunityFieldEvidenceCoverageIssue[] = [];
  let missingCanonical = 0;
  let orphanCanonical = 0;
  let statusMismatch = 0;
  let missingField = 0;
  let covered = 0;

  for (const [evidenceId, state] of states.entries()) {
    const field = textMetaValue(state.recordedEvent.meta?.field);
    if (!field) {
      missingField += 1;
      if (issues.length < 20) {
        issues.push({
          code: 'missing_field',
          evidenceId,
          opportunityId: state.recordedEvent.opportunityId,
          message: `Field evidence event ${evidenceId} is missing field metadata.`,
        });
      }
      continue;
    }

    const row = canonicalById.get(evidenceId);
    if (!row) {
      missingCanonical += 1;
      if (issues.length < 20) {
        issues.push({
          code: 'missing_canonical',
          evidenceId,
          opportunityId: state.recordedEvent.opportunityId,
          field,
          eventStatus: state.status,
          message: `Field evidence event ${evidenceId} has no canonical row.`,
        });
      }
      continue;
    }

    covered += 1;
    if (row.status !== state.status) {
      statusMismatch += 1;
      if (issues.length < 20) {
        issues.push({
          code: 'status_mismatch',
          evidenceId,
          opportunityId: state.recordedEvent.opportunityId,
          field,
          eventStatus: state.status,
          canonicalStatus: row.status,
          message: `Field evidence ${evidenceId} status differs between events and canonical row.`,
        });
      }
    }
  }

  for (const row of canonical) {
    if (states.has(row.id)) continue;
    orphanCanonical += 1;
    if (issues.length < 20) {
      issues.push({
        code: 'orphan_canonical',
        evidenceId: row.id,
        opportunityId: row.opportunityId,
        field: row.field,
        canonicalStatus: row.status,
        message: `Canonical field evidence ${row.id} has no matching recorded event.`,
      });
    }
  }

  const status: OpportunityFieldEvidenceCoverageStatus = missingCanonical > 0 || missingField > 0
    ? 'degraded'
    : statusMismatch > 0 || orphanCanonical > 0
      ? 'warning'
      : 'ok';

  return {
    status,
    checkedAt,
    recordedEvents: [...states.values()].length,
    canonicalRows: canonical.length,
    covered,
    missingCanonical,
    orphanCanonical,
    statusMismatch,
    missingField,
    invalidatedEvents: events.filter((event) => event.type === 'field_evidence_invalidated').length,
    restoredEvents: events.filter((event) => event.type === 'field_evidence_restored').length,
    issues,
  };
}

export async function getOpportunityFieldEvidenceRepairPlan(
  actionLimit = 40,
): Promise<OpportunityFieldEvidenceRepairPlan> {
  const inspection = await inspectOpportunityFieldEvidenceRepairs();
  const plan: OpportunityFieldEvidenceRepairPlan = {
    status: 'ok',
    checkedAt: inspection.checkedAt,
    recordedEvents: inspection.recordedEvents,
    canonicalRows: inspection.canonicalRows,
    totalActions: inspection.actions.length,
    automaticActions: 0,
    manualReviewActions: 0,
    blockedActions: 0,
    sampledActions: [],
  };

  for (const action of inspection.actions) {
    if (action.safety === 'automatic') {
      plan.automaticActions += 1;
    } else if (action.safety === 'manual_review') {
      plan.manualReviewActions += 1;
    } else {
      plan.blockedActions += 1;
    }
    if (plan.sampledActions.length < actionLimit) {
      plan.sampledActions.push(action);
    }
  }

  if (plan.blockedActions > 0) {
    plan.status = 'blocked';
  } else if (plan.automaticActions > 0 || plan.manualReviewActions > 0) {
    plan.status = 'actionable';
  }

  return plan;
}

export async function repairOpportunityFieldEvidence(
  options: OpportunityFieldEvidenceRepairOptions = {},
): Promise<OpportunityFieldEvidenceRepairResult> {
  const inspection = await inspectOpportunityFieldEvidenceRepairs();
  const requestedEvidenceIds = Array.from(new Set(
    (options.evidenceIds || []).map(id => id.trim()).filter(Boolean),
  ));
  const requestedSet = new Set(requestedEvidenceIds);
  const targetActions = requestedEvidenceIds.length > 0
    ? inspection.actions.filter(action => requestedSet.has(action.evidenceId))
    : inspection.actions;
  const actionEvidenceIds = new Set(targetActions.map(action => action.evidenceId));
  const result: OpportunityFieldEvidenceRepairResult = {
    checkedAt: inspection.checkedAt,
    requestedEvidenceIds,
    notFoundEvidenceIds: requestedEvidenceIds.filter(id => !inspection.evidenceIds.has(id)),
    totalEvidence: inspection.evidenceIds.size,
    totalActions: targetActions.length,
    eligibleActions: 0,
    applied: 0,
    skippedHealthy: requestedEvidenceIds.length > 0
      ? requestedEvidenceIds.filter(id => inspection.evidenceIds.has(id) && !actionEvidenceIds.has(id)).length
      : Math.max(0, inspection.evidenceIds.size - new Set(inspection.actions.map(action => action.evidenceId)).size),
    skippedManualReview: 0,
    blocked: 0,
    updatedEvidenceIds: [],
    skippedActions: [],
  };

  for (const action of targetActions) {
    if (action.safety === 'blocked') {
      result.blocked += 1;
      result.skippedActions.push(action);
      continue;
    }
    if (action.safety === 'manual_review') {
      result.skippedManualReview += 1;
      result.skippedActions.push(action);
      continue;
    }

    const state = inspection.states.get(action.evidenceId);
    if (!state) {
      result.blocked += 1;
      result.skippedActions.push({
        ...action,
        safety: 'blocked',
        reason: `${action.reason} Event state was no longer available during repair.`,
      });
      continue;
    }

    const input = canonicalInputFromFieldEvidenceState(state);
    if (action.action === 'backfill_canonical') {
      if (!input) {
        result.blocked += 1;
        result.skippedActions.push({
          ...action,
          safety: 'blocked',
          reason: `${action.reason} Canonical input could not be derived from event metadata.`,
        });
        continue;
      }
      result.eligibleActions += 1;
      await recordOpportunityFieldEvidence(input);
      if (state.status === 'invalidated' || state.restoredEventId || state.invalidatedEventId) {
        await syncOpportunityFieldEvidenceCanonicalStatus(state, inspection.checkedAt);
      }
      result.applied += 1;
      result.updatedEvidenceIds.push(action.evidenceId);
      continue;
    }

    if (action.action === 'sync_status') {
      result.eligibleActions += 1;
      await syncOpportunityFieldEvidenceCanonicalStatus(state, inspection.checkedAt);
      result.applied += 1;
      result.updatedEvidenceIds.push(action.evidenceId);
      continue;
    }

    result.blocked += 1;
    result.skippedActions.push(action);
  }

  result.updatedEvidenceIds = Array.from(new Set(result.updatedEvidenceIds));
  return result;
}

export async function saveOpportunitySnapshot(record: OpportunityRecord): Promise<OpportunitySnapshotRecord> {
  const db = await getDb();
  const snapshot: OpportunitySnapshotRecord = {
    id: generateSnapshotId(),
    opportunityId: record.id,
    createdAt: new Date().toISOString(),
    payload: record,
  };

  await db.run(
    `INSERT INTO opportunity_snapshots (id, opportunityId, createdAt, payload)
     VALUES (?, ?, ?, ?)`,
    snapshot.id,
    snapshot.opportunityId,
    snapshot.createdAt,
    JSON.stringify(snapshot.payload),
  );

  return snapshot;
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = generateOpportunityId();
  const type = input.type;
  const record: OpportunityRecord = {
    id,
    type,
    stage: input.stage || defaultStageForType(type),
    status: input.status || 'watching',
    title: input.title.trim(),
    query: (input.query || input.title).trim(),
    ...(input.thesis ? { thesis: input.thesis.trim() } : {}),
    ...(input.summary ? { summary: input.summary.trim() } : {}),
    ...(normalizeTicker(input.primaryTicker) ? { primaryTicker: normalizeTicker(input.primaryTicker) } : {}),
    ...(normalizeTicker(input.leaderTicker) ? { leaderTicker: normalizeTicker(input.leaderTicker) } : {}),
    ...(normalizeTicker(input.proxyTicker) ? { proxyTicker: normalizeTicker(input.proxyTicker) } : {}),
    relatedTickers: normalizeTickers(input.relatedTickers),
    relayTickers: normalizeTickers(input.relayTickers),
    ...(input.nextCatalystAt ? { nextCatalystAt: input.nextCatalystAt } : {}),
    ...(input.supplyOverhang ? { supplyOverhang: input.supplyOverhang.trim() } : {}),
    ...(input.policyStatus ? { policyStatus: input.policyStatus.trim() } : {}),
    scores: mergeScores(type, input.scores),
    ...(normalizeHeatProfile(type, input.heatProfile, {
      leaderTicker: input.leaderTicker,
      relatedTickers: input.relatedTickers,
      relayTickers: input.relayTickers,
      scores: mergeScores(type, input.scores),
    }) ? {
      heatProfile: normalizeHeatProfile(type, input.heatProfile, {
        leaderTicker: input.leaderTicker,
        relatedTickers: input.relatedTickers,
        relayTickers: input.relayTickers,
        scores: mergeScores(type, input.scores),
      })
    } : {}),
    ...(normalizeProxyProfile(type, input.proxyProfile, {
      query: input.query,
      policyStatus: input.policyStatus,
      scores: mergeScores(type, input.scores),
    }) ? {
      proxyProfile: normalizeProxyProfile(type, input.proxyProfile, {
        query: input.query,
        policyStatus: input.policyStatus,
        scores: mergeScores(type, input.scores),
      })
    } : {}),
    ...(normalizeIpoProfile(type, input.ipoProfile) ? { ipoProfile: normalizeIpoProfile(type, input.ipoProfile) } : {}),
    catalystCalendar: normalizeCatalystCalendar(
      input.catalystCalendar,
      defaultCatalystCalendar({
        type,
        nextCatalystAt: input.nextCatalystAt,
        ipoProfile: normalizeIpoProfile(type, input.ipoProfile),
      }),
    ),
    createdAt: now,
    updatedAt: now,
  };

  await db.run(
    `INSERT INTO opportunities (
      id, type, stage, status, title, query, thesis, summary,
      primaryTicker, leaderTicker, proxyTicker, relatedTickers, relayTickers,
      nextCatalystAt, supplyOverhang, policyStatus, scores, heatProfile, proxyProfile, ipoProfile, catalystCalendar,
      latestMissionId, latestEventType, latestEventMessage, latestEventAt,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.type,
    record.stage,
    record.status,
    record.title,
    record.query,
    record.thesis || null,
    record.summary || null,
    record.primaryTicker || null,
    record.leaderTicker || null,
    record.proxyTicker || null,
    JSON.stringify(record.relatedTickers),
    JSON.stringify(record.relayTickers),
    record.nextCatalystAt || null,
    record.supplyOverhang || null,
    record.policyStatus || null,
    JSON.stringify(record.scores),
    record.heatProfile ? JSON.stringify(record.heatProfile) : null,
    record.proxyProfile ? JSON.stringify(record.proxyProfile) : null,
    record.ipoProfile ? JSON.stringify(record.ipoProfile) : null,
    JSON.stringify(record.catalystCalendar),
    null,
    null,
    null,
    null,
    record.createdAt,
    record.updatedAt,
  );

  await saveOpportunitySnapshot(record);

  await appendOpportunityEvent(record.id, {
    type: 'created',
    message: `Opportunity created: ${record.title}`,
    meta: {
      type: record.type,
      stage: record.stage,
      primaryTicker: record.primaryTicker,
      leaderTicker: record.leaderTicker,
      proxyTicker: record.proxyTicker,
    },
  });

  await emitOpportunityDerivedEvents(null, record);

  return (await getOpportunity(record.id)) || record;
}

export async function updateOpportunity(id: string, updates: UpdateOpportunityInput): Promise<OpportunityRecord | null> {
  const current = await getOpportunity(id);
  if (!current) return null;

  const mergedScores = updates.scores ? { ...current.scores, ...updates.scores } : current.scores;
  const nextHeatProfile = updates.heatProfile !== undefined || current.heatProfile
    ? normalizeHeatProfile(current.type, updates.heatProfile || current.heatProfile, {
        leaderTicker: updates.leaderTicker !== undefined ? updates.leaderTicker : current.leaderTicker,
        relatedTickers: updates.relatedTickers !== undefined ? updates.relatedTickers : current.relatedTickers,
        relayTickers: updates.relayTickers !== undefined ? updates.relayTickers : current.relayTickers,
        scores: mergedScores,
      })
    : undefined;
  const nextProxyProfile = updates.proxyProfile !== undefined || current.proxyProfile
    ? normalizeProxyProfile(current.type, updates.proxyProfile || current.proxyProfile, {
        query: updates.query !== undefined ? updates.query : current.query,
        policyStatus: updates.policyStatus !== undefined ? updates.policyStatus || undefined : current.policyStatus,
        scores: mergedScores,
      })
    : undefined;
  const nextIpoProfile = updates.ipoProfile !== undefined || current.ipoProfile
    ? normalizeIpoProfile(current.type, updates.ipoProfile || current.ipoProfile)
    : undefined;
  const shouldRegenerateCatalystCalendar = updates.nextCatalystAt !== undefined || updates.ipoProfile !== undefined;
  const nextCatalystCalendar = normalizeCatalystCalendar(
    updates.catalystCalendar,
    current.catalystCalendar.length > 0 && !shouldRegenerateCatalystCalendar
      ? current.catalystCalendar
      : defaultCatalystCalendar({
          type: current.type,
          nextCatalystAt: updates.nextCatalystAt !== undefined ? updates.nextCatalystAt || undefined : current.nextCatalystAt,
          ipoProfile: nextIpoProfile,
        }),
  );

  const next: OpportunityRecord = {
    ...current,
    ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
    ...(updates.query !== undefined ? { query: updates.query.trim() } : {}),
    ...(updates.stage !== undefined ? { stage: updates.stage } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.primaryTicker !== undefined ? { primaryTicker: normalizeTicker(updates.primaryTicker) } : {}),
    ...(updates.leaderTicker !== undefined ? { leaderTicker: normalizeTicker(updates.leaderTicker) } : {}),
    ...(updates.proxyTicker !== undefined ? { proxyTicker: normalizeTicker(updates.proxyTicker) } : {}),
    ...(updates.relatedTickers !== undefined ? { relatedTickers: normalizeTickers(updates.relatedTickers) } : {}),
    ...(updates.relayTickers !== undefined ? { relayTickers: normalizeTickers(updates.relayTickers) } : {}),
    scores: mergedScores,
    catalystCalendar: nextCatalystCalendar,
    ...(updates.latestMissionId !== undefined ? { latestMissionId: updates.latestMissionId || undefined } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (updates.thesis !== undefined) {
    const thesis = safeTrim(updates.thesis);
    if (thesis) next.thesis = thesis;
    else delete next.thesis;
  }
  if (updates.summary !== undefined) {
    const summary = safeTrim(updates.summary);
    if (summary) next.summary = summary;
    else delete next.summary;
  }
  if (updates.primaryTicker !== undefined && !next.primaryTicker) delete next.primaryTicker;
  if (updates.leaderTicker !== undefined && !next.leaderTicker) delete next.leaderTicker;
  if (updates.proxyTicker !== undefined && !next.proxyTicker) delete next.proxyTicker;

  if (updates.nextCatalystAt !== undefined) {
    const nextCatalystAt = safeTrim(updates.nextCatalystAt);
    if (nextCatalystAt) next.nextCatalystAt = nextCatalystAt;
    else delete next.nextCatalystAt;
  }
  if (updates.supplyOverhang !== undefined) {
    const supplyOverhang = safeTrim(updates.supplyOverhang);
    if (supplyOverhang) next.supplyOverhang = supplyOverhang;
    else delete next.supplyOverhang;
  }
  if (updates.policyStatus !== undefined) {
    const policyStatus = safeTrim(updates.policyStatus);
    if (policyStatus) next.policyStatus = policyStatus;
    else delete next.policyStatus;
  }
  if (updates.heatProfile !== undefined || current.heatProfile) {
    if (nextHeatProfile) next.heatProfile = nextHeatProfile;
    else delete next.heatProfile;
  }
  if (updates.proxyProfile !== undefined || current.proxyProfile) {
    if (nextProxyProfile) next.proxyProfile = nextProxyProfile;
    else delete next.proxyProfile;
  }
  if (updates.ipoProfile !== undefined || current.ipoProfile) {
    if (nextIpoProfile) next.ipoProfile = nextIpoProfile;
    else delete next.ipoProfile;
  }

  await getDb().then((db) => db.run(
    `UPDATE opportunities SET
      stage = ?, status = ?, title = ?, query = ?, thesis = ?, summary = ?,
      primaryTicker = ?, leaderTicker = ?, proxyTicker = ?,
      relatedTickers = ?, relayTickers = ?, nextCatalystAt = ?, supplyOverhang = ?,
      policyStatus = ?, scores = ?, heatProfile = ?, proxyProfile = ?, ipoProfile = ?, catalystCalendar = ?, latestMissionId = ?, updatedAt = ?
    WHERE id = ?`,
    next.stage,
    next.status,
    next.title,
    next.query,
    next.thesis || null,
    next.summary || null,
    next.primaryTicker || null,
    next.leaderTicker || null,
    next.proxyTicker || null,
    JSON.stringify(next.relatedTickers),
    JSON.stringify(next.relayTickers),
    next.nextCatalystAt || null,
    next.supplyOverhang || null,
    next.policyStatus || null,
    JSON.stringify(next.scores),
    next.heatProfile ? JSON.stringify(next.heatProfile) : null,
    next.proxyProfile ? JSON.stringify(next.proxyProfile) : null,
    next.ipoProfile ? JSON.stringify(next.ipoProfile) : null,
    JSON.stringify(next.catalystCalendar),
    next.latestMissionId || null,
    next.updatedAt,
    id,
  ));

  if (shouldSaveSnapshot(current, next)) {
    await saveOpportunitySnapshot(next);
  }

  return getOpportunity(id);
}

export async function appendOpportunityEvent(
  opportunityId: string,
  event: Omit<OpportunityEventRecord, 'id' | 'opportunityId' | 'timestamp'> & { timestamp?: string },
): Promise<OpportunityEventRecord> {
  const db = await getDb();
  const record: OpportunityEventRecord = {
    id: generateEventId(),
    opportunityId,
    type: event.type,
    message: event.message,
    timestamp: event.timestamp || new Date().toISOString(),
    ...(event.meta ? { meta: event.meta } : {}),
  };

  await db.run(
    `INSERT INTO opportunity_events (id, opportunityId, timestamp, type, message, meta)
     VALUES (?, ?, ?, ?, ?, ?)`,
    record.id,
    record.opportunityId,
    record.timestamp,
    record.type,
    record.message,
    record.meta ? JSON.stringify(record.meta) : null,
  );

  await db.run(
    `UPDATE opportunities
     SET latestEventType = ?, latestEventMessage = ?, latestEventAt = ?, updatedAt = ?
     WHERE id = ?`,
    record.type,
    record.message,
    record.timestamp,
    record.timestamp,
    opportunityId,
  );

  await appendStreamEvent(toOpportunityEventEnvelope(record, { service: getRuntimeEventSourceService() }));
  eventBus.emitOpportunityEvent(record);
  return record;
}

function isCatalystDueSoon(nextCatalystAt?: string): boolean {
  if (!nextCatalystAt) return false;
  const due = new Date(nextCatalystAt).getTime();
  if (Number.isNaN(due)) return false;
  const delta = due - Date.now();
  return delta >= 0 && delta <= 7 * 24 * 60 * 60 * 1000;
}

export async function emitOpportunityDerivedEvents(
  previous: OpportunityRecord | null,
  next: OpportunityRecord,
): Promise<void> {
  if (next.type === 'relay_chain' && next.heatProfile) {
    const prevTemperature = previous?.heatProfile?.temperature;
    const prevValidationStatus = previous?.heatProfile?.validationStatus;
    const prevBreadthScore = previous?.heatProfile?.breadthScore || 0;
    const nextBreadthScore = next.heatProfile.breadthScore || 0;
    const relayDelta = next.scores.relayScore - (previous?.scores.relayScore || 0);
    const breadthDelta = nextBreadthScore - prevBreadthScore;
    if (next.heatProfile.temperature !== prevTemperature) {
      await appendOpportunityEvent(next.id, {
        type: 'signal_changed',
        message: `Heat temperature changed: ${prevTemperature || 'n/a'} -> ${next.heatProfile.temperature}`,
        meta: {
          previousTemperature: prevTemperature,
          nextTemperature: next.heatProfile.temperature,
        },
      });
    }

    if (next.heatProfile.validationStatus && next.heatProfile.validationStatus !== prevValidationStatus) {
      await appendOpportunityEvent(next.id, {
        type: 'signal_changed',
        message: `Heat validation changed: ${prevValidationStatus || 'n/a'} -> ${next.heatProfile.validationStatus}`,
        meta: {
          previousValidationStatus: prevValidationStatus,
          nextValidationStatus: next.heatProfile.validationStatus,
          breadthScore: next.heatProfile.breadthScore,
          edgeCount: next.heatProfile.edgeCount,
        },
      });
    }

    if (previous && (
      (next.heatProfile.validationStatus === 'confirmed' && prevValidationStatus !== 'confirmed')
      || relayDelta >= 10
      || breadthDelta >= 12
    )) {
      await appendOpportunityEvent(next.id, {
        type: 'thesis_upgraded',
        message: next.heatProfile.validationStatus === 'confirmed'
          ? `Relay thesis upgraded: validation moved to confirmed`
          : `Relay thesis upgraded: relay ${previous?.scores.relayScore || 0} -> ${next.scores.relayScore}`,
        meta: {
          previousValidationStatus: prevValidationStatus,
          nextValidationStatus: next.heatProfile.validationStatus,
          relayDelta,
          breadthDelta,
          validationSummary: next.heatProfile.validationSummary,
        },
      });
    }

    if (previous && (
      (next.heatProfile.validationStatus === 'fragile' && prevValidationStatus !== 'fragile')
      || (next.heatProfile.validationStatus === 'broken' && prevValidationStatus !== 'broken')
      || relayDelta <= -10
      || breadthDelta <= -12
    )) {
      await appendOpportunityEvent(next.id, {
        type: 'thesis_degraded',
        message: next.heatProfile.validationStatus === 'broken'
          ? `Relay thesis degraded: validation moved to broken`
          : next.heatProfile.validationStatus === 'fragile'
            ? `Relay thesis degraded: validation moved to fragile`
            : `Relay thesis degraded: relay ${previous?.scores.relayScore || 0} -> ${next.scores.relayScore}`,
        meta: {
          previousValidationStatus: prevValidationStatus,
          nextValidationStatus: next.heatProfile.validationStatus,
          relayDelta,
          breadthDelta,
          validationSummary: next.heatProfile.validationSummary,
        },
      });
    }

    const relayJustTriggered = next.scores.relayScore >= 70
      && next.heatProfile.laggardTickers.length > 0
      && (
        (previous?.scores.relayScore || 0) < 70
        || (previous?.heatProfile?.laggardTickers.length || 0) === 0
        || (next.heatProfile.validationStatus === 'confirmed' && prevValidationStatus !== 'confirmed')
      );
    if (relayJustTriggered) {
      await appendOpportunityEvent(next.id, {
        type: 'relay_triggered',
        message: `Relay chain triggered from ${next.leaderTicker || next.primaryTicker || 'leader'} into ${next.heatProfile.laggardTickers.join(', ')}`,
        meta: {
          leaderTicker: next.leaderTicker,
          bottleneckTickers: next.heatProfile.bottleneckTickers,
          laggardTickers: next.heatProfile.laggardTickers,
          breadthScore: next.heatProfile.breadthScore,
          validationStatus: next.heatProfile.validationStatus,
        },
      });
    }

    if (
      (next.heatProfile.temperature === 'broken' || next.heatProfile.validationStatus === 'broken')
      && previous?.heatProfile?.validationStatus !== 'broken'
      && previous?.heatProfile?.temperature !== 'broken'
    ) {
      await appendOpportunityEvent(next.id, {
        type: 'leader_broken',
        message: `Leader broke the relay chain: ${next.leaderTicker || next.primaryTicker || 'unknown leader'}`,
        meta: {
          leaderTicker: next.leaderTicker,
          leaderHealth: next.heatProfile.leaderHealth,
          validationSummary: next.heatProfile.validationSummary,
        },
      });
    }
  }

  if (next.type === 'proxy_narrative' && next.proxyProfile) {
    const ignitionNow = next.scores.purityScore >= 75
      && next.scores.scarcityScore >= 70
      && next.proxyProfile.legitimacyScore >= 70;
    const ignitionBefore = Boolean(
      previous?.proxyProfile
      && (previous.scores.purityScore >= 75)
      && (previous.scores.scarcityScore >= 70)
      && (previous.proxyProfile.legitimacyScore >= 70),
    );
    if (ignitionNow && !ignitionBefore) {
      await appendOpportunityEvent(next.id, {
        type: 'proxy_ignited',
        message: `Proxy ignition confirmed for ${next.proxyTicker || next.primaryTicker || next.title}`,
        meta: {
          mappingTarget: next.proxyProfile.mappingTarget,
          ruleStatus: next.proxyProfile.ruleStatus,
          purityScore: next.scores.purityScore,
          scarcityScore: next.scores.scarcityScore,
          legitimacyScore: next.proxyProfile.legitimacyScore,
        },
      });
    }

    if (next.proxyProfile.ruleStatus && next.proxyProfile.ruleStatus !== previous?.proxyProfile?.ruleStatus) {
      await appendOpportunityEvent(next.id, {
        type: 'signal_changed',
        message: `Proxy rule status updated: ${next.proxyProfile.ruleStatus}`,
        meta: {
          previousRuleStatus: previous?.proxyProfile?.ruleStatus,
          nextRuleStatus: next.proxyProfile.ruleStatus,
        },
      });
    }
  }

  if (isCatalystDueSoon(next.nextCatalystAt) && previous?.nextCatalystAt !== next.nextCatalystAt) {
    await appendOpportunityEvent(next.id, {
      type: 'catalyst_due',
      message: `Catalyst due soon: ${next.nextCatalystAt}`,
      meta: {
        nextCatalystAt: next.nextCatalystAt,
        catalystCalendar: next.catalystCalendar,
      },
    });
  }
}

export async function listOpportunityEvents(
  opportunityId?: string,
  limit = 50,
  types: OpportunityEventType[] = [],
): Promise<OpportunityEventRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (opportunityId) {
    conditions.push('opportunityId = ?');
    params.push(opportunityId);
  }
  if (types.length > 0) {
    conditions.push(`type IN (${types.map(() => '?').join(', ')})`);
    params.push(...types);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.all<OpportunityEventRow[]>(
    `SELECT * FROM opportunity_events${whereClause} ORDER BY timestamp DESC LIMIT ?`,
    ...params,
    limit,
  );

  return rows.map(toOpportunityEventRecord);
}

export async function listOpportunityEventsAfter(cursorId: string, limit = 100): Promise<OpportunityEventRecord[]> {
  const db = await getDb();
  const cursor = await db.get<OpportunityEventRow>(
    'SELECT * FROM opportunity_events WHERE id = ?',
    cursorId,
  );
  if (!cursor) {
    return [];
  }

  const rows = await db.all<OpportunityEventRow[]>(
    `SELECT * FROM opportunity_events
     WHERE timestamp > ? OR (timestamp = ? AND id > ?)
     ORDER BY timestamp ASC, id ASC
     LIMIT ?`,
    cursor.timestamp,
    cursor.timestamp,
    cursor.id,
    limit,
  );

  return rows.map(toOpportunityEventRecord);
}

export async function linkMissionToOpportunity(
  opportunityId: string,
  missionId: string,
  runId?: string,
): Promise<void> {
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) return;

  await updateOpportunity(opportunityId, {
    latestMissionId: missionId,
  });
  await appendOpportunityEvent(opportunityId, {
    type: 'mission_linked',
    message: `Mission linked to opportunity: ${missionId}`,
    meta: { missionId, runId },
  });
}

export async function markOpportunityMissionQueued(
  opportunityId: string,
  missionId: string,
  runId?: string,
): Promise<void> {
  await updateOpportunity(opportunityId, {
    latestMissionId: missionId,
  });
  await appendOpportunityEvent(opportunityId, {
    type: 'mission_queued',
    message: `Mission queued for opportunity`,
    meta: { missionId, runId },
  });
}

export async function markOpportunityMissionCompleted(
  opportunityId: string,
  missionId: string,
  runId?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) return;

  await updateOpportunity(opportunityId, {
    latestMissionId: missionId,
    status: opportunity.status === 'active' ? 'active' : 'ready',
  });
  await appendOpportunityEvent(opportunityId, {
    type: 'mission_completed',
    message: `Mission completed for opportunity`,
    meta: { missionId, runId, ...(meta || {}) },
  });
}

export async function markOpportunityMissionFailed(
  opportunityId: string,
  missionId: string,
  runId?: string,
  failureMessage?: string,
): Promise<void> {
  await updateOpportunity(opportunityId, {
    latestMissionId: missionId,
    status: 'degraded',
  });
  await appendOpportunityEvent(opportunityId, {
    type: 'mission_failed',
    message: failureMessage || 'Mission failed for opportunity',
    meta: { missionId, runId },
  });
}

export async function markOpportunityMissionCanceled(
  opportunityId: string,
  missionId: string,
  runId?: string,
  reason?: string,
): Promise<void> {
  await updateOpportunity(opportunityId, {
    latestMissionId: missionId,
  });
  await appendOpportunityEvent(opportunityId, {
    type: 'mission_canceled',
    message: reason || 'Mission canceled for opportunity',
    meta: { missionId, runId },
  });
}
