import { getTraceByMissionId, getTraceByRunId, type MissionTrace } from '../utils/agent-logger';
import { getMissionEvidence } from './mission-evidence';
import { listMissionRuns } from './mission-runs';
import type {
  MissionDiffCategory,
  MissionDiffSummary,
  MissionEvidenceCompleteness,
  MissionEvidenceRecord,
  MissionRunRecord,
  UnifiedMission,
} from './types';

type SnapshotPayload = UnifiedMission | MissionEvidenceRecord;

function deriveCompleteness(payload: SnapshotPayload): MissionEvidenceCompleteness {
  if ('completeness' in payload) return payload.completeness;
  if (payload.status === 'fully_enriched') return 'full';
  if (payload.status === 'main_only') return 'partial';
  if (payload.status === 'failed') return 'failed';
  if (payload.status === 'canceled') return 'canceled';
  return 'partial';
}

function joinLimited(items: string[], limit = 2): string {
  const visible = items.slice(0, limit);
  if (items.length <= limit) return visible.join(', ');
  return `${visible.join(', ')} +${items.length - limit}`;
}

function uniqueTracePhases(trace: MissionTrace | null): string[] {
  return trace ? [...new Set(trace.steps.map((step) => step.phase))] : [];
}

function getActionMap(payload: SnapshotPayload): Map<string, string> {
  return new Map(
    payload.taResults.map((result) => [
      result.ticker,
      result.portfolioManagerDecision?.action || result.status,
    ]),
  );
}

function getVerdictMap(payload: SnapshotPayload): Map<string, string> {
  return new Map(payload.openbbData.map((result) => [result.ticker, result.verdict]));
}

export function buildLatestMissionDiff(
  mission: UnifiedMission,
  runs: MissionRunRecord[],
): MissionDiffSummary | null {
  const currentRun = runs[0];
  const baselineRun = runs[1];
  if (!currentRun || !baselineRun) return null;

  const currentPayload = getMissionEvidence(currentRun.id) || mission;
  const baselinePayload = getMissionEvidence(baselineRun.id);
  if (!baselinePayload) return null;

  const currentTrace = getTraceByRunId(mission.id, currentRun.id) || getTraceByMissionId(mission.id);
  const baselineTrace = getTraceByRunId(mission.id, baselineRun.id);

  const changedCategories: MissionDiffCategory[] = [];
  const highlights: string[] = [];

  const currentCompleteness = deriveCompleteness(currentPayload);
  const baselineCompleteness = deriveCompleteness(baselinePayload);
  if (currentPayload.status !== baselinePayload.status || currentCompleteness !== baselineCompleteness) {
    changedCategories.push('execution');
    highlights.push(
      `Execution ${baselinePayload.status}/${baselineCompleteness} -> ${currentPayload.status}/${currentCompleteness}`,
    );
  }

  const addedTickers = currentPayload.openclawTickers.filter(
    (ticker) => !baselinePayload.openclawTickers.includes(ticker),
  );
  const removedTickers = baselinePayload.openclawTickers.filter(
    (ticker) => !currentPayload.openclawTickers.includes(ticker),
  );
  if (addedTickers.length > 0 || removedTickers.length > 0) {
    changedCategories.push('coverage');
    const coverageParts: string[] = [];
    if (addedTickers.length > 0) {
      coverageParts.push(`added ${joinLimited(addedTickers)}`);
    }
    if (removedTickers.length > 0) {
      coverageParts.push(`removed ${joinLimited(removedTickers)}`);
    }
    highlights.push(`Coverage ${coverageParts.join(' / ')}`);
  }

  const baselineConsensus = new Map(baselinePayload.consensus.map((item) => [item.ticker, item]));
  const currentConsensus = new Map(currentPayload.consensus.map((item) => [item.ticker, item]));
  let consensusChangeCount = 0;
  for (const ticker of new Set([...baselineConsensus.keys(), ...currentConsensus.keys()])) {
    const previous = baselineConsensus.get(ticker);
    const next = currentConsensus.get(ticker);
    if (!previous || !next) {
      consensusChangeCount += 1;
      continue;
    }
    if (
      previous.agreement !== next.agreement ||
      previous.openclawVerdict !== next.openclawVerdict ||
      previous.taVerdict !== next.taVerdict ||
      previous.openbbVerdict !== next.openbbVerdict
    ) {
      consensusChangeCount += 1;
    }
  }
  if (consensusChangeCount > 0) {
    changedCategories.push('consensus');
    highlights.push(`Consensus shifted on ${consensusChangeCount} ticker${consensusChangeCount === 1 ? '' : 's'}`);
  }

  const baselineActions = getActionMap(baselinePayload);
  const currentActions = getActionMap(currentPayload);
  let taChangeCount = 0;
  for (const ticker of new Set([...baselineActions.keys(), ...currentActions.keys()])) {
    if (baselineActions.get(ticker) !== currentActions.get(ticker)) {
      taChangeCount += 1;
    }
  }
  if (taChangeCount > 0) {
    changedCategories.push('tradingAgents');
    highlights.push(`TradingAgents action changed on ${taChangeCount} ticker${taChangeCount === 1 ? '' : 's'}`);
  }

  const baselineVerdicts = getVerdictMap(baselinePayload);
  const currentVerdicts = getVerdictMap(currentPayload);
  let openbbChangeCount = 0;
  for (const ticker of new Set([...baselineVerdicts.keys(), ...currentVerdicts.keys()])) {
    if (baselineVerdicts.get(ticker) !== currentVerdicts.get(ticker)) {
      openbbChangeCount += 1;
    }
  }
  if (openbbChangeCount > 0) {
    changedCategories.push('openbb');
    highlights.push(`OpenBB verdict changed on ${openbbChangeCount} ticker${openbbChangeCount === 1 ? '' : 's'}`);
  }

  const currentPhases = uniqueTracePhases(currentTrace);
  const baselinePhases = uniqueTracePhases(baselineTrace);
  const addedPhases = currentPhases.filter((phase) => !baselinePhases.includes(phase));
  const removedPhases = baselinePhases.filter((phase) => !currentPhases.includes(phase));
  const stepDelta = Math.abs((currentTrace?.steps.length || 0) - (baselineTrace?.steps.length || 0));
  if (addedPhases.length > 0 || removedPhases.length > 0 || stepDelta >= 5) {
    changedCategories.push('trace');
    const traceParts: string[] = [];
    if (addedPhases.length > 0) traceParts.push(`added phase ${joinLimited(addedPhases)}`);
    if (removedPhases.length > 0) traceParts.push(`removed phase ${joinLimited(removedPhases)}`);
    if (traceParts.length === 0) traceParts.push(`${stepDelta} step delta`);
    highlights.push(`Trace ${traceParts.join(' / ')}`);
  }

  const changed = changedCategories.length > 0;
  return {
    currentRunId: currentRun.id,
    baselineRunId: baselineRun.id,
    currentAttempt: currentRun.attempt,
    baselineAttempt: baselineRun.attempt,
    changed,
    changeCount: changedCategories.length,
    changedCategories,
    highlights: changed ? highlights.slice(0, 4) : [`No material change vs run #${baselineRun.attempt}`],
    summary: changed
      ? highlights.slice(0, 2).join(' · ')
      : `No material change vs run #${baselineRun.attempt}`,
  };
}

export async function getLatestMissionDiff(mission: UnifiedMission): Promise<MissionDiffSummary | null> {
  const runs = await listMissionRuns(mission.id);
  return buildLatestMissionDiff(mission, runs);
}
