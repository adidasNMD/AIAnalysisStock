import { listOpportunitySnapshots } from './opportunities';
import type {
  OpportunityDiffCategory,
  OpportunityDiffSummary,
  OpportunityRecord,
  OpportunitySnapshotRecord,
} from './types';

function joinLimited(items: string[], limit = 2): string {
  const visible = items.slice(0, limit);
  if (items.length <= limit) return visible.join(', ');
  return `${visible.join(', ')} +${items.length - limit}`;
}

function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function arrayDelta(current: string[], baseline: string[]) {
  return {
    added: current.filter((item) => !baseline.includes(item)),
    removed: baseline.filter((item) => !current.includes(item)),
  };
}

function getTickerHighlights(current: OpportunityRecord, baseline: OpportunityRecord): string[] {
  const highlights: string[] = [];
  if (current.primaryTicker !== baseline.primaryTicker) {
    highlights.push(`Primary ${baseline.primaryTicker || 'n/a'} -> ${current.primaryTicker || 'n/a'}`);
  }
  if (current.leaderTicker !== baseline.leaderTicker) {
    highlights.push(`Leader ${baseline.leaderTicker || 'n/a'} -> ${current.leaderTicker || 'n/a'}`);
  }
  if (current.proxyTicker !== baseline.proxyTicker) {
    highlights.push(`Proxy ${baseline.proxyTicker || 'n/a'} -> ${current.proxyTicker || 'n/a'}`);
  }

  const related = arrayDelta(current.relatedTickers, baseline.relatedTickers);
  if (related.added.length > 0 || related.removed.length > 0) {
    const parts: string[] = [];
    if (related.added.length > 0) parts.push(`related +${joinLimited(related.added)}`);
    if (related.removed.length > 0) parts.push(`related -${joinLimited(related.removed)}`);
    highlights.push(parts.join(' / '));
  }

  const relay = arrayDelta(current.relayTickers, baseline.relayTickers);
  if (relay.added.length > 0 || relay.removed.length > 0) {
    const parts: string[] = [];
    if (relay.added.length > 0) parts.push(`relay +${joinLimited(relay.added)}`);
    if (relay.removed.length > 0) parts.push(`relay -${joinLimited(relay.removed)}`);
    highlights.push(parts.join(' / '));
  }

  return highlights;
}

export function buildOpportunityDiff(
  currentSnapshot: OpportunitySnapshotRecord,
  baselineSnapshot: OpportunitySnapshotRecord,
): OpportunityDiffSummary {
  const current = currentSnapshot.payload;
  const baseline = baselineSnapshot.payload;

  const changedCategories: OpportunityDiffCategory[] = [];
  const highlights: string[] = [];

  if (current.stage !== baseline.stage) {
    changedCategories.push('stage');
    highlights.push(`Stage ${baseline.stage} -> ${current.stage}`);
  }

  if (current.status !== baseline.status) {
    changedCategories.push('status');
    highlights.push(`Status ${baseline.status} -> ${current.status}`);
  }

  const tickerHighlights = getTickerHighlights(current, baseline);
  if (tickerHighlights.length > 0) {
    changedCategories.push('tickers');
    highlights.push(`Tickers ${tickerHighlights.slice(0, 2).join(' / ')}`);
  }

  if (
    current.nextCatalystAt !== baseline.nextCatalystAt
    || serialize(current.catalystCalendar) !== serialize(baseline.catalystCalendar)
  ) {
    changedCategories.push('catalyst');
    const currentCatalysts = current.catalystCalendar.map((item) => item.label);
    const baselineCatalysts = baseline.catalystCalendar.map((item) => item.label);
    const catalystDelta = arrayDelta(currentCatalysts, baselineCatalysts);
    const currentCatalystMeta = current.catalystCalendar.map((item) => `${item.label}:${item.confidence || 'n/a'}:${item.source || 'n/a'}`);
    const baselineCatalystMeta = baseline.catalystCalendar.map((item) => `${item.label}:${item.confidence || 'n/a'}:${item.source || 'n/a'}`);
    const catalystMetaDelta = arrayDelta(currentCatalystMeta, baselineCatalystMeta);
    const parts: string[] = [];
    if (current.nextCatalystAt !== baseline.nextCatalystAt) {
      parts.push(`next ${baseline.nextCatalystAt || 'n/a'} -> ${current.nextCatalystAt || 'n/a'}`);
    }
    if (catalystDelta.added.length > 0) parts.push(`calendar +${joinLimited(catalystDelta.added)}`);
    if (catalystDelta.removed.length > 0) parts.push(`calendar -${joinLimited(catalystDelta.removed)}`);
    if (catalystMetaDelta.added.length > 0) parts.push(`evidence +${joinLimited(catalystMetaDelta.added)}`);
    highlights.push(`Catalyst ${(parts.length > 0 ? parts : ['calendar updated']).join(' / ')}`);
  }

  if (
    serialize(current.heatProfile) !== serialize(baseline.heatProfile)
    || current.scores.relayScore !== baseline.scores.relayScore
  ) {
    changedCategories.push('heat');
    const parts: string[] = [];
    if (current.heatProfile?.temperature !== baseline.heatProfile?.temperature) {
      parts.push(`temperature ${baseline.heatProfile?.temperature || 'n/a'} -> ${current.heatProfile?.temperature || 'n/a'}`);
    }
    if (current.scores.relayScore !== baseline.scores.relayScore) {
      parts.push(`relay score ${baseline.scores.relayScore} -> ${current.scores.relayScore}`);
    }
    if (current.heatProfile?.validationStatus !== baseline.heatProfile?.validationStatus) {
      parts.push(`validation ${baseline.heatProfile?.validationStatus || 'n/a'} -> ${current.heatProfile?.validationStatus || 'n/a'}`);
    }
    if (current.heatProfile?.breadthScore !== baseline.heatProfile?.breadthScore) {
      parts.push(`breadth ${baseline.heatProfile?.breadthScore ?? 'n/a'} -> ${current.heatProfile?.breadthScore ?? 'n/a'}`);
    }
    if (current.heatProfile?.edgeCount !== baseline.heatProfile?.edgeCount) {
      parts.push(`edges ${baseline.heatProfile?.edgeCount ?? 0} -> ${current.heatProfile?.edgeCount ?? 0}`);
    }
    const bottlenecks = arrayDelta(
      current.heatProfile?.bottleneckTickers || [],
      baseline.heatProfile?.bottleneckTickers || [],
    );
    const laggards = arrayDelta(
      current.heatProfile?.laggardTickers || [],
      baseline.heatProfile?.laggardTickers || [],
    );
    const edgeDelta = arrayDelta(
      (current.heatProfile?.edges || []).map((edge) => `${edge.from}->${edge.to}`),
      (baseline.heatProfile?.edges || []).map((edge) => `${edge.from}->${edge.to}`),
    );
    if (bottlenecks.added.length > 0) parts.push(`bottleneck +${joinLimited(bottlenecks.added)}`);
    if (laggards.added.length > 0) parts.push(`laggard +${joinLimited(laggards.added)}`);
    if (edgeDelta.added.length > 0) parts.push(`graph +${joinLimited(edgeDelta.added)}`);
    highlights.push(`Heat ${(parts.length > 0 ? parts.slice(0, 3) : ['heat profile updated']).join(' / ')}`);
  }

  if (
    serialize(current.proxyProfile) !== serialize(baseline.proxyProfile)
    || current.scores.purityScore !== baseline.scores.purityScore
    || current.scores.scarcityScore !== baseline.scores.scarcityScore
    || current.scores.policyScore !== baseline.scores.policyScore
  ) {
    changedCategories.push('proxy');
    const parts: string[] = [];
    if (current.proxyProfile?.ruleStatus !== baseline.proxyProfile?.ruleStatus) {
      parts.push(`rule ${baseline.proxyProfile?.ruleStatus || 'n/a'} -> ${current.proxyProfile?.ruleStatus || 'n/a'}`);
    }
    if (current.proxyProfile?.mappingTarget !== baseline.proxyProfile?.mappingTarget) {
      parts.push(`target ${baseline.proxyProfile?.mappingTarget || 'n/a'} -> ${current.proxyProfile?.mappingTarget || 'n/a'}`);
    }
    if (current.scores.purityScore !== baseline.scores.purityScore) {
      parts.push(`purity ${baseline.scores.purityScore} -> ${current.scores.purityScore}`);
    }
    if (current.scores.scarcityScore !== baseline.scores.scarcityScore) {
      parts.push(`scarcity ${baseline.scores.scarcityScore} -> ${current.scores.scarcityScore}`);
    }
    if (current.scores.policyScore !== baseline.scores.policyScore) {
      parts.push(`policy ${baseline.scores.policyScore} -> ${current.scores.policyScore}`);
    }
    highlights.push(`Proxy ${(parts.length > 0 ? parts.slice(0, 3) : ['proxy profile updated']).join(' / ')}`);
  }

  if (
    serialize(current.ipoProfile) !== serialize(baseline.ipoProfile)
    || current.supplyOverhang !== baseline.supplyOverhang
  ) {
    changedCategories.push('ipo');
    const parts: string[] = [];
    if (current.ipoProfile?.officialTradingDate !== baseline.ipoProfile?.officialTradingDate) {
      parts.push(`trading ${baseline.ipoProfile?.officialTradingDate || 'n/a'} -> ${current.ipoProfile?.officialTradingDate || 'n/a'}`);
    }
    if (current.ipoProfile?.retainedStakePercent !== baseline.ipoProfile?.retainedStakePercent) {
      parts.push(`retained ${baseline.ipoProfile?.retainedStakePercent ?? 'n/a'} -> ${current.ipoProfile?.retainedStakePercent ?? 'n/a'}`);
    }
    if (current.ipoProfile?.lockupDate !== baseline.ipoProfile?.lockupDate) {
      parts.push(`lockup ${baseline.ipoProfile?.lockupDate || 'n/a'} -> ${current.ipoProfile?.lockupDate || 'n/a'}`);
    }
    const currentEvidenceKeys = Object.entries(current.ipoProfile?.evidence || {})
      .map(([field, evidence]) => `${field}:${evidence?.confidence || 'n/a'}:${evidence?.source || 'n/a'}`);
    const baselineEvidenceKeys = Object.entries(baseline.ipoProfile?.evidence || {})
      .map(([field, evidence]) => `${field}:${evidence?.confidence || 'n/a'}:${evidence?.source || 'n/a'}`);
    const evidenceDelta = arrayDelta(currentEvidenceKeys, baselineEvidenceKeys);
    if (evidenceDelta.added.length > 0) {
      parts.push(`evidence +${joinLimited(evidenceDelta.added)}`);
    }
    if (current.supplyOverhang !== baseline.supplyOverhang) {
      parts.push(`overhang ${baseline.supplyOverhang || 'n/a'} -> ${current.supplyOverhang || 'n/a'}`);
    }
    highlights.push(`IPO ${(parts.length > 0 ? parts.slice(0, 3) : ['IPO profile updated']).join(' / ')}`);
  }

  const changed = changedCategories.length > 0;
  return {
    currentSnapshotId: currentSnapshot.id,
    baselineSnapshotId: baselineSnapshot.id,
    changed,
    changeCount: changedCategories.length,
    changedCategories,
    highlights: changed ? highlights.slice(0, 4) : ['No thesis-level change vs previous snapshot'],
    summary: changed
      ? highlights.slice(0, 2).join(' · ')
      : 'No thesis-level change vs previous snapshot',
  };
}

export async function getLatestOpportunityDiff(opportunityId: string): Promise<OpportunityDiffSummary | null> {
  const snapshots = await listOpportunitySnapshots(opportunityId, 2);
  if (snapshots.length < 2) return null;
  const currentSnapshot = snapshots[0];
  const baselineSnapshot = snapshots[1];
  if (!currentSnapshot || !baselineSnapshot) return null;
  return buildOpportunityDiff(currentSnapshot, baselineSnapshot);
}
