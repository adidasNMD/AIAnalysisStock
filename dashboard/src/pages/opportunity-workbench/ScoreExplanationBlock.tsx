import { Gauge, Info } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import { buildScoreExplanation, type ScoreExplanationFactor } from './score-explanation';

type ScoreExplanationBlockProps = {
  opportunity: OpportunitySummary;
  compact?: boolean;
  factorLimit?: number;
  summaryOnly?: boolean;
};

function factorToneLabel(factor: ScoreExplanationFactor) {
  if (factor.tone === 'strong') return 'PASS';
  if (factor.tone === 'risk') return 'RISK';
  return 'WATCH';
}

function contributionValue(factor: ScoreExplanationFactor) {
  if (!factor.contribution) return '';
  if (factor.contribution.direction === 'positive') return `+${factor.contribution.weight}`;
  if (factor.contribution.direction === 'negative') return `-${factor.contribution.weight}`;
  return `watch ${factor.contribution.weight}`;
}

function contributionLabel(factor: ScoreExplanationFactor) {
  if (factor.contribution?.direction === 'positive') return 'Positive driver';
  if (factor.contribution?.direction === 'negative') return 'Risk drag';
  return 'Watch factor';
}

function calibrationLabel(stance: ReturnType<typeof buildScoreExplanation>['calibration']['stance']) {
  if (stance === 'leading') return 'Leading';
  if (stance === 'fragile') return 'Fragile';
  return 'Balanced';
}

export function ScoreExplanationBlock({
  opportunity,
  compact = false,
  factorLimit,
  summaryOnly = false,
}: ScoreExplanationBlockProps) {
  const explanation = buildScoreExplanation(opportunity);
  const compactFactorLimit = Math.max(1, factorLimit ?? 3);
  const visibleFactors = compact
    ? [
        ...explanation.factors.filter((factor) => factor.tone === 'risk'),
        ...explanation.factors.filter((factor) => factor.tone === 'strong'),
        ...explanation.factors.filter((factor) => factor.tone === 'watch'),
      ].slice(0, compactFactorLimit)
    : explanation.factors;

  return (
    <section className={`score-explanation ${compact ? 'compact' : ''}`} data-score-explanation={opportunity.id}>
      <div className="score-explanation-head">
        <div>
          <span><Gauge size={13} /> Score explanation</span>
          <strong>{explanation.headline}</strong>
        </div>
        <span className={`score-explanation-primary ${explanation.primaryTone}`}>
          {explanation.readinessLabel}
        </span>
      </div>
      {!compact && (
      <div className="score-explanation-summary">
        <Info size={13} />
        {explanation.summary}
      </div>
      )}
      {!compact && (
        <div
          className={`score-calibration ${explanation.calibration.stance}`}
          data-score-calibration={explanation.calibration.stance}
        >
          <div>
            <span>Calibration</span>
            <strong>{calibrationLabel(explanation.calibration.stance)}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong>{explanation.calibration.netWeight >= 0 ? '+' : ''}{explanation.calibration.netWeight}</strong>
          </div>
          <div>
            <span>Drivers / risks</span>
            <strong>{explanation.calibration.positiveWeight}/{explanation.calibration.riskWeight}</strong>
          </div>
          <div>
            <span>Evidence</span>
            <strong>
              {explanation.calibration.evidenceBackedFactors}/{explanation.calibration.totalFactors}
              {' · '}
              {explanation.calibration.evidenceCoveragePct}%
            </strong>
          </div>
          <p>{explanation.calibration.detail}</p>
        </div>
      )}
      {!summaryOnly && (
      <div className="score-explanation-factors">
        {visibleFactors.map((factor) => (
          <div
            key={`${opportunity.id}_${factor.id}`}
            className={`score-factor ${factor.tone}`}
            data-score-factor={factor.id}
          >
            <div className="score-factor-top">
              <span>{factor.label}</span>
              <strong>{factor.value ?? factorToneLabel(factor)}</strong>
            </div>
            <small>{factor.detail}</small>
            {factor.contribution && (
              <div
                className={`score-factor-contribution ${factor.contribution.direction}`}
                data-score-factor-contribution={factor.id}
              >
                <span>{contributionLabel(factor)}</span>
                <strong>{contributionValue(factor)}</strong>
              </div>
            )}
            {factor.evidence && factor.evidence.length > 0 && (
              <div className="score-factor-evidence" data-score-factor-evidence={factor.id}>
                {factor.evidence.slice(0, compact ? 1 : 3).map((evidence) => (
                  <span key={evidence.id} title={evidence.note || evidence.source || evidence.label}>
                    {evidence.source || evidence.label}
                    {evidence.confidence ? ` · ${evidence.confidence}` : ''}
                  </span>
                ))}
                {factor.evidence.length > (compact ? 1 : 3) && (
                  <span>+{factor.evidence.length - (compact ? 1 : 3)}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
