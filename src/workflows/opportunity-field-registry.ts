import type {
  OpportunityFieldEvidenceKind,
  OpportunityIpoProfile,
  OpportunityScores,
  OpportunitySourceProvenanceConfidence,
} from './types';

export type OpportunityFieldRegistryGroup =
  | 'record'
  | 'score'
  | 'heat'
  | 'proxy'
  | 'ipo'
  | 'catalyst'
  | 'mission'
  | 'event'
  | 'custom';

export interface OpportunityFieldRegistryEntry {
  field: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  group: OpportunityFieldRegistryGroup;
}

export interface OpportunityScoreFieldRegistryEntry extends OpportunityFieldRegistryEntry {
  group: 'score';
  scoreKey: keyof OpportunityScores;
}

type OpportunityIpoProfileValueField = Exclude<keyof OpportunityIpoProfile, 'evidence'>;
type OpportunityIpoEvidenceField = keyof NonNullable<OpportunityIpoProfile['evidence']>;
type OpportunityIpoRegistryKey = OpportunityIpoProfileValueField & OpportunityIpoEvidenceField;

export interface OpportunityIpoFieldRegistryEntry extends OpportunityFieldRegistryEntry {
  group: 'ipo';
  ipoKey: OpportunityIpoRegistryKey;
}

export type OpportunityFieldEvidenceDescriptor = {
  field: string;
  label: string;
  kind: OpportunityFieldEvidenceKind;
  source: string;
  confidence: OpportunitySourceProvenanceConfidence;
  registryGroup?: OpportunityFieldRegistryGroup | undefined;
};

export type OpportunityFieldRegistryOverride = {
  field: string;
  label?: string | undefined;
  kind?: OpportunityFieldEvidenceKind | undefined;
  source?: string | undefined;
  confidence?: OpportunitySourceProvenanceConfidence | undefined;
  note?: string | undefined;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
};

export type OpportunityFieldRegistryEffectiveEntry = OpportunityFieldRegistryEntry & {
  base?: OpportunityFieldRegistryEntry | undefined;
  overriddenFields: Array<'label' | 'kind' | 'source' | 'confidence'>;
  note?: string | undefined;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
};

function recordField(field: string, label: string): OpportunityFieldRegistryEntry {
  return {
    field,
    label,
    kind: 'record',
    source: 'opportunity_record',
    confidence: 'unknown',
    group: 'record',
  };
}

function scoreField(
  field: string,
  label: string,
  scoreKey: keyof OpportunityScores,
): OpportunityScoreFieldRegistryEntry {
  return {
    field,
    label,
    scoreKey,
    kind: 'score',
    source: 'opportunity_scores',
    confidence: 'unknown',
    group: 'score',
  };
}

function profileField(
  group: 'heat' | 'proxy',
  source: string,
  field: string,
  label: string,
): OpportunityFieldRegistryEntry {
  return {
    field,
    label,
    kind: 'profile',
    source,
    confidence: 'unknown',
    group,
  };
}

function ipoField(
  field: string,
  label: string,
  ipoKey: OpportunityIpoRegistryKey,
): OpportunityIpoFieldRegistryEntry {
  return {
    field,
    label,
    ipoKey,
    kind: 'source',
    source: 'ipo_profile',
    confidence: 'unknown',
    group: 'ipo',
  };
}

const OPPORTUNITY_RECORD_FIELD_REGISTRY = [
  recordField('title', 'Title'),
  recordField('query', 'Query'),
  recordField('thesis', 'Thesis'),
  recordField('summary', 'Summary'),
  recordField('primaryTicker', 'Primary ticker'),
  recordField('leaderTicker', 'Leader ticker'),
  recordField('proxyTicker', 'Proxy ticker'),
  recordField('relatedTickers', 'Related tickers'),
  recordField('relayTickers', 'Relay tickers'),
  recordField('nextCatalystAt', 'Next catalyst'),
  recordField('supplyOverhang', 'Supply overhang'),
  recordField('policyStatus', 'Policy status'),
] satisfies OpportunityFieldRegistryEntry[];

export const OPPORTUNITY_SCORE_FIELD_REGISTRY = [
  scoreField('scores.purityScore', 'Purity score', 'purityScore'),
  scoreField('scores.scarcityScore', 'Scarcity score', 'scarcityScore'),
  scoreField('scores.tradeabilityScore', 'Tradeability score', 'tradeabilityScore'),
  scoreField('scores.relayScore', 'Relay score', 'relayScore'),
  scoreField('scores.catalystScore', 'Catalyst score', 'catalystScore'),
  scoreField('scores.policyScore', 'Policy score', 'policyScore'),
] satisfies OpportunityScoreFieldRegistryEntry[];

const OPPORTUNITY_HEAT_FIELD_REGISTRY = [
  profileField('heat', 'heat_profile', 'heatProfile.temperature', 'Heat temperature'),
  profileField('heat', 'heat_profile', 'heatProfile.validationStatus', 'Heat validation'),
  profileField('heat', 'heat_profile', 'heatProfile.breadthScore', 'Heat breadth'),
  profileField('heat', 'heat_profile', 'heatProfile.edgeCount', 'Heat edges'),
  profileField('heat', 'heat_profile', 'heatProfile.bottleneckTickers', 'Bottlenecks'),
  profileField('heat', 'heat_profile', 'heatProfile.laggardTickers', 'Laggards'),
  profileField('heat', 'heat_profile', 'heatProfile.leaderHealth', 'Leader health'),
  profileField('heat', 'heat_profile', 'heatProfile.transmissionNote', 'Transmission note'),
] satisfies OpportunityFieldRegistryEntry[];

const OPPORTUNITY_PROXY_FIELD_REGISTRY = [
  profileField('proxy', 'proxy_profile', 'proxyProfile.mappingTarget', 'Proxy target'),
  profileField('proxy', 'proxy_profile', 'proxyProfile.legitimacyScore', 'Legitimacy score'),
  profileField('proxy', 'proxy_profile', 'proxyProfile.legibilityScore', 'Legibility score'),
  profileField('proxy', 'proxy_profile', 'proxyProfile.tradeabilityScore', 'Proxy tradeability'),
  profileField('proxy', 'proxy_profile', 'proxyProfile.ruleStatus', 'Rule status'),
  profileField('proxy', 'proxy_profile', 'proxyProfile.scarcityNote', 'Scarcity note'),
] satisfies OpportunityFieldRegistryEntry[];

export const OPPORTUNITY_IPO_FIELD_REGISTRY = [
  ipoField('ipoProfile.officialTradingDate', 'Trading date', 'officialTradingDate'),
  ipoField('ipoProfile.spinoutDate', 'Spinout date', 'spinoutDate'),
  ipoField('ipoProfile.retainedStakePercent', 'Retained stake', 'retainedStakePercent'),
  ipoField('ipoProfile.lockupDate', 'Lockup date', 'lockupDate'),
  ipoField('ipoProfile.greenshoeStatus', 'Greenshoe', 'greenshoeStatus'),
  ipoField('ipoProfile.firstIndependentEarningsAt', 'First earnings', 'firstIndependentEarningsAt'),
  ipoField('ipoProfile.firstCoverageAt', 'First coverage', 'firstCoverageAt'),
] satisfies OpportunityIpoFieldRegistryEntry[];

const OPPORTUNITY_DYNAMIC_FIELD_REGISTRY = [
  {
    field: 'catalystCalendar.*',
    label: 'Catalyst',
    kind: 'source',
    source: 'catalyst_calendar',
    confidence: 'unknown',
    group: 'catalyst',
  },
  {
    field: 'latestMission',
    label: 'Latest mission',
    kind: 'mission',
    source: 'mission',
    confidence: 'unknown',
    group: 'mission',
  },
  {
    field: 'latestEvent',
    label: 'Latest event',
    kind: 'event',
    source: 'opportunity_event',
    confidence: 'unknown',
    group: 'event',
  },
] satisfies OpportunityFieldRegistryEntry[];

export const OPPORTUNITY_FIELD_REGISTRY = [
  ...OPPORTUNITY_RECORD_FIELD_REGISTRY,
  ...OPPORTUNITY_SCORE_FIELD_REGISTRY,
  ...OPPORTUNITY_HEAT_FIELD_REGISTRY,
  ...OPPORTUNITY_PROXY_FIELD_REGISTRY,
  ...OPPORTUNITY_IPO_FIELD_REGISTRY,
  ...OPPORTUNITY_DYNAMIC_FIELD_REGISTRY,
] satisfies OpportunityFieldRegistryEntry[];

const OPPORTUNITY_FIELD_REGISTRY_BY_FIELD = new Map<string, OpportunityFieldRegistryEntry>(
  OPPORTUNITY_FIELD_REGISTRY.map((entry) => [entry.field, entry]),
);

export function isOpportunityFieldEvidenceKind(value: unknown): value is OpportunityFieldEvidenceKind {
  return value === 'record'
    || value === 'profile'
    || value === 'score'
    || value === 'source'
    || value === 'mission'
    || value === 'event';
}

export function isOpportunitySourceProvenanceConfidence(
  value: unknown,
): value is OpportunitySourceProvenanceConfidence {
  return value === 'confirmed'
    || value === 'inferred'
    || value === 'placeholder'
    || value === 'unknown';
}

export function lookupOpportunityFieldRegistry(
  field: string | undefined,
  overrides: OpportunityFieldRegistryOverride[] = [],
): OpportunityFieldRegistryEntry | undefined {
  if (!field) return undefined;
  const exact = OPPORTUNITY_FIELD_REGISTRY_BY_FIELD.get(field);
  const wildcard = /^catalystCalendar\.\d+(?:\.|$)/.test(field)
    ? OPPORTUNITY_FIELD_REGISTRY_BY_FIELD.get('catalystCalendar.*')
    : undefined;
  const base = exact || wildcard;
  const override = lookupOpportunityFieldRegistryOverride(field, overrides);
  if (!override && base) return base;
  if (!override && !base) return undefined;
  return applyOpportunityFieldRegistryOverride(field, base, override);
}

function compactText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeOpportunityFieldEvidenceDescriptor(input: {
  field: string;
  label?: unknown;
  kind?: unknown;
  source?: unknown;
  confidence?: unknown;
  overrides?: OpportunityFieldRegistryOverride[] | undefined;
  preferRegistryLabel?: boolean | undefined;
}): OpportunityFieldEvidenceDescriptor {
  const registry = lookupOpportunityFieldRegistry(input.field, input.overrides);
  const label = input.preferRegistryLabel
    ? registry?.label || compactText(input.label) || input.field
    : compactText(input.label) || registry?.label || input.field;
  const source = compactText(input.source) || registry?.source || 'manual_field_evidence';
  const kind = isOpportunityFieldEvidenceKind(input.kind)
    ? input.kind
    : registry?.kind || 'source';
  const confidence = isOpportunitySourceProvenanceConfidence(input.confidence)
    ? input.confidence
    : registry?.confidence || 'unknown';

  return {
    field: input.field,
    label,
    kind,
    source,
    confidence,
    ...(registry ? { registryGroup: registry.group } : {}),
  };
}

export function lookupOpportunityFieldRegistryOverride(
  field: string | undefined,
  overrides: OpportunityFieldRegistryOverride[] = [],
): OpportunityFieldRegistryOverride | undefined {
  if (!field) return undefined;
  const exact = overrides.find((override) => override.field === field);
  if (exact) return exact;
  if (/^catalystCalendar\.\d+(?:\.|$)/.test(field)) {
    return overrides.find((override) => override.field === 'catalystCalendar.*');
  }
  return undefined;
}

export function applyOpportunityFieldRegistryOverride(
  field: string,
  base?: OpportunityFieldRegistryEntry,
  override?: OpportunityFieldRegistryOverride,
): OpportunityFieldRegistryEffectiveEntry {
  const overriddenFields: OpportunityFieldRegistryEffectiveEntry['overriddenFields'] = [];
  if (override?.label) overriddenFields.push('label');
  if (override?.kind) overriddenFields.push('kind');
  if (override?.source) overriddenFields.push('source');
  if (override?.confidence) overriddenFields.push('confidence');

  return {
    field,
    ...(base ? { base } : {}),
    label: override?.label || base?.label || field,
    kind: override?.kind || base?.kind || 'source',
    source: override?.source || base?.source || 'manual_field_evidence',
    confidence: override?.confidence || base?.confidence || 'unknown',
    group: base?.group || 'custom',
    overriddenFields,
    ...(override?.note ? { note: override.note } : {}),
    ...(override?.updatedAt ? { updatedAt: override.updatedAt } : {}),
    ...(override?.updatedBy ? { updatedBy: override.updatedBy } : {}),
  };
}

export function listEffectiveOpportunityFieldRegistry(
  overrides: OpportunityFieldRegistryOverride[] = [],
): OpportunityFieldRegistryEffectiveEntry[] {
  const fields = new Set<string>([
    ...OPPORTUNITY_FIELD_REGISTRY.map((entry) => entry.field),
    ...overrides.map((override) => override.field),
  ]);

  return [...fields]
    .map((field) => applyOpportunityFieldRegistryOverride(
      field,
      OPPORTUNITY_FIELD_REGISTRY_BY_FIELD.get(field),
      overrides.find((override) => override.field === field),
    ))
    .sort((a, b) => {
      const groupDelta = a.group.localeCompare(b.group);
      if (groupDelta !== 0) return groupDelta;
      return a.field.localeCompare(b.field);
    });
}
