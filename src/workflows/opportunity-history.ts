import { listOpportunitySnapshots } from './opportunities';
import type {
  OpportunityHeatInflection,
  OpportunityHeatHistoryPoint,
  OpportunitySnapshotRecord,
} from './types';

export function buildOpportunityHeatHistoryFromSnapshots(
  snapshots: OpportunitySnapshotRecord[],
  limit = 5,
): OpportunityHeatHistoryPoint[] {
  return [...snapshots]
    .filter((snapshot) => snapshot.payload.type === 'relay_chain' && snapshot.payload.heatProfile)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit)
    .map((snapshot) => ({
      snapshotId: snapshot.id,
      createdAt: snapshot.createdAt,
      relayScore: snapshot.payload.scores.relayScore,
      ...(typeof snapshot.payload.heatProfile?.breadthScore === 'number'
        ? { breadthScore: snapshot.payload.heatProfile.breadthScore }
        : {}),
      ...(snapshot.payload.heatProfile?.temperature
        ? { temperature: snapshot.payload.heatProfile.temperature }
        : {}),
      ...(snapshot.payload.heatProfile?.validationStatus
        ? { validationStatus: snapshot.payload.heatProfile.validationStatus }
        : {}),
      ...(snapshot.payload.heatProfile?.validationSummary
        ? { validationSummary: snapshot.payload.heatProfile.validationSummary }
        : {}),
      ...(snapshot.payload.leaderTicker
        ? { leaderTicker: snapshot.payload.leaderTicker }
        : snapshot.payload.primaryTicker
          ? { leaderTicker: snapshot.payload.primaryTicker }
          : {}),
      bottleneckCount: snapshot.payload.heatProfile?.bottleneckTickers.length || 0,
      laggardCount: snapshot.payload.heatProfile?.laggardTickers.length || 0,
    }));
}

export async function getOpportunityHeatHistory(
  opportunityId: string,
  limit = 5,
): Promise<OpportunityHeatHistoryPoint[]> {
  const snapshots = await listOpportunitySnapshots(opportunityId, Math.max(limit, 2) + 2);
  return buildOpportunityHeatHistoryFromSnapshots(snapshots, limit);
}

export function detectOpportunityHeatInflection(
  history: OpportunityHeatHistoryPoint[],
): OpportunityHeatInflection | null {
  if (history.length < 2) return null;

  const previous = history[history.length - 2]!;
  const current = history[history.length - 1]!;
  const scoreDelta = current.relayScore - previous.relayScore;
  const breadthDelta = (current.breadthScore || 0) - (previous.breadthScore || 0);

  if (current.validationStatus !== previous.validationStatus) {
    if (current.validationStatus === 'confirmed') {
      return {
        kind: 'confirmation',
        summary: `传导链从 ${previous.validationStatus || 'n/a'} 升级到 confirmed。`,
        happenedAt: current.createdAt,
        scoreDelta,
        breadthDelta,
        fromStatus: previous.validationStatus,
        toStatus: current.validationStatus,
      };
    }
    if (current.validationStatus === 'broken') {
      return {
        kind: 'breakdown',
        summary: `传导链从 ${previous.validationStatus || 'n/a'} 进入 broken。`,
        happenedAt: current.createdAt,
        scoreDelta,
        breadthDelta,
        fromStatus: previous.validationStatus,
        toStatus: current.validationStatus,
      };
    }
    if (
      current.validationStatus === 'forming'
      && (previous.validationStatus === 'fragile' || previous.validationStatus === 'broken')
    ) {
      return {
        kind: 'rebuild',
        summary: `传导链从 ${previous.validationStatus} 重新修复到 forming。`,
        happenedAt: current.createdAt,
        scoreDelta,
        breadthDelta,
        fromStatus: previous.validationStatus,
        toStatus: current.validationStatus,
      };
    }
    if (current.validationStatus === 'forming') {
      return {
        kind: 'formation',
        summary: `传导链开始成形，当前处于 forming 阶段。`,
        happenedAt: current.createdAt,
        scoreDelta,
        breadthDelta,
        fromStatus: previous.validationStatus,
        toStatus: current.validationStatus,
      };
    }
    if (current.validationStatus === 'fragile') {
      return {
        kind: 'weakening',
        summary: `传导链从 ${previous.validationStatus || 'n/a'} 变得 fragile。`,
        happenedAt: current.createdAt,
        scoreDelta,
        breadthDelta,
        fromStatus: previous.validationStatus,
        toStatus: current.validationStatus,
      };
    }
  }

  if (scoreDelta >= 10 || breadthDelta >= 12) {
    return {
      kind: 'acceleration',
      summary: `传导链加速，Relay ${previous.relayScore} -> ${current.relayScore}${current.breadthScore !== undefined ? `，Breadth ${(previous.breadthScore ?? 0)} -> ${current.breadthScore}` : ''}。`,
      happenedAt: current.createdAt,
      scoreDelta,
      breadthDelta,
      fromStatus: previous.validationStatus,
      toStatus: current.validationStatus,
    };
  }

  if (scoreDelta <= -10 || breadthDelta <= -12) {
    return {
      kind: 'weakening',
      summary: `传导链减弱，Relay ${previous.relayScore} -> ${current.relayScore}${current.breadthScore !== undefined ? `，Breadth ${(previous.breadthScore ?? 0)} -> ${current.breadthScore}` : ''}。`,
      happenedAt: current.createdAt,
      scoreDelta,
      breadthDelta,
      fromStatus: previous.validationStatus,
      toStatus: current.validationStatus,
    };
  }

  return null;
}
