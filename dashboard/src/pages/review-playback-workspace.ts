import type { OpportunityReviewPlaybackPerformanceSummary } from '../api';

export type ReviewPlaybackBacktestWorkspaceGrade = 'ready' | 'watch' | 'repair' | 'empty';

export interface ReviewPlaybackBacktestWorkspaceFact {
  label: string;
  value: string;
}

export interface ReviewPlaybackBacktestWorkspace {
  grade: ReviewPlaybackBacktestWorkspaceGrade;
  gradeLabel: string;
  headline: string;
  detail: string;
  readinessScore: number;
  decision: string;
  primaryAction: string;
  secondaryAction: string;
  facts: ReviewPlaybackBacktestWorkspaceFact[];
  alerts: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percent(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value}%`;
}

function signedPercent(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function issueCount(performance: OpportunityReviewPlaybackPerformanceSummary): number {
  const risk = performance.riskBacktest;
  return risk.oversizedLegs + risk.executionIssueLegs + risk.planRepairLegs;
}

function strategyCoverage(performance: OpportunityReviewPlaybackPerformanceSummary): string {
  const strategy = performance.strategyBacktest;
  return `${strategy.coveredStrategies}/${strategy.totalStrategies}`;
}

function sampleCoverage(performance: OpportunityReviewPlaybackPerformanceSummary): string {
  const risk = performance.riskBacktest;
  return `${risk.pricedLegs}/${risk.closedLegs}`;
}

function buildWorkspaceAlerts(performance: OpportunityReviewPlaybackPerformanceSummary): string[] {
  const risk = performance.riskBacktest;
  const strategy = performance.strategyBacktest;
  return [
    performance.pretradeBlockHit ? `${performance.pretradeBlockers} pre-trade blockers still hit this slice.` : undefined,
    risk.planRepairLegs > 0 ? `${risk.planRepairLegs} legs need plan repair metadata.` : undefined,
    risk.executionIssueLegs > 0 ? `${risk.executionIssueLegs} legs have execution quality issues.` : undefined,
    risk.oversizedLegs > 0 ? `${risk.oversizedLegs} legs exceeded the planned risk budget.` : undefined,
    strategy.weakestGroup && strategy.weakestGroup.key !== strategy.bestGroup?.key
      ? `Weakest family: ${strategy.weakestGroup.label} (${signedPercent(strategy.weakestGroup.avgReturnPct)} avg).`
      : undefined,
    performance.dataQuality !== 'price_confirmed' ? `Data quality is ${performance.dataQuality}; confirm prices before relying on returns.` : undefined,
  ].filter((alert): alert is string => Boolean(alert));
}

export function buildReviewPlaybackBacktestWorkspace(
  performance?: OpportunityReviewPlaybackPerformanceSummary,
): ReviewPlaybackBacktestWorkspace {
  if (!performance || performance.riskBacktest.pricedLegs === 0) {
    return {
      grade: 'empty',
      gradeLabel: 'Needs sample',
      headline: 'No priced backtest sample yet',
      detail: 'Record priced entry and exit legs before making a strategy decision.',
      readinessScore: 0,
      decision: 'Collect evidence',
      primaryAction: 'Add priced entry/exit events',
      secondaryAction: 'Refresh price cache if a ticker is already known',
      facts: [
        { label: 'Sample', value: '0 priced' },
        { label: 'Data', value: performance?.dataQuality || 'missing' },
      ],
      alerts: ['Backtest decisions need at least one priced closed or partial leg.'],
    };
  }

  const risk = performance.riskBacktest;
  const strategy = performance.strategyBacktest;
  const issues = issueCount(performance);
  const hasConfirmedPrices = performance.dataQuality === 'price_confirmed';
  const readyToScale = (
    risk.verdict === 'favorable'
    && strategy.status === 'ready'
    && hasConfirmedPrices
    && !performance.pretradeBlockHit
    && issues === 0
  );
  const needsRepair = (
    risk.verdict === 'unfavorable'
    || performance.pretradeBlockHit
    || risk.oversizedLegs > 0
    || risk.executionIssueLegs > 0
    || risk.planRepairLegs > 0
  );
  const grade: ReviewPlaybackBacktestWorkspaceGrade = readyToScale ? 'ready' : needsRepair ? 'repair' : 'watch';
  const score = clampScore(
    45
    + (risk.verdict === 'favorable' ? 20 : 0)
    + (risk.verdict === 'mixed' ? 8 : 0)
    + (hasConfirmedPrices ? 15 : -8)
    + (strategy.status === 'ready' ? 10 : 0)
    + (risk.winRatePct !== undefined && risk.winRatePct >= 60 ? 8 : 0)
    - (risk.verdict === 'unfavorable' ? 22 : 0)
    - (performance.pretradeBlockHit ? 18 : 0)
    - Math.min(25, issues * 5),
  );

  const gradeLabel = grade === 'ready' ? 'Ready to replay' : grade === 'repair' ? 'Repair first' : 'Watch sample';
  const headline = grade === 'ready'
    ? 'This slice is replayable'
    : grade === 'repair'
      ? 'Repair the playbook before replaying'
      : 'Keep collecting comparable exits';
  const decision = grade === 'ready'
    ? 'Promote candidate'
    : grade === 'repair'
      ? 'Do not scale'
      : 'Monitor';

  return {
    grade,
    gradeLabel,
    headline,
    detail: `${strategy.filterLabel} · ${risk.label} · ${risk.pricedLegs} priced legs.`,
    readinessScore: score,
    decision,
    primaryAction: grade === 'ready'
      ? 'Convert this slice into a playbook checklist'
      : grade === 'repair'
        ? 'Fix plan repairs and execution issues'
        : 'Wait for more priced closed legs',
    secondaryAction: grade === 'ready'
      ? 'Compare against weakest strategy family before sizing up'
      : grade === 'repair'
        ? 'Add missing stop/target/risk budget evidence'
        : 'Save this view and revisit after next catalyst',
    facts: [
      { label: 'Readiness', value: `${score}/100` },
      { label: 'Sample', value: sampleCoverage(performance) },
      { label: 'Strategy coverage', value: strategyCoverage(performance) },
      { label: 'Best family', value: strategy.bestGroup?.label || 'n/a' },
      { label: 'Risk verdict', value: risk.label },
      { label: 'Win rate', value: percent(risk.winRatePct) },
      { label: 'Avg return', value: signedPercent(risk.avgReturnPct) },
      { label: 'Issues', value: String(issues) },
    ],
    alerts: buildWorkspaceAlerts(performance),
  };
}
