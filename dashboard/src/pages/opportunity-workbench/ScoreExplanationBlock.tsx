import { Gauge, Info } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import { buildScoreExplanation, type ScoreExplanationFactor } from './score-explanation';

type ScoreExplanationBlockProps = {
  opportunity: OpportunitySummary;
  compact?: boolean;
};

function factorToneLabel(factor: ScoreExplanationFactor) {
  if (factor.tone === 'strong') return 'PASS';
  if (factor.tone === 'risk') return 'RISK';
  return 'WATCH';
}

export function ScoreExplanationBlock({ opportunity, compact = false }: ScoreExplanationBlockProps) {
  const explanation = buildScoreExplanation(opportunity);
  const visibleFactors = compact
    ? [
        ...explanation.factors.filter((factor) => factor.tone === 'risk'),
        ...explanation.factors.filter((factor) => factor.tone === 'strong'),
        ...explanation.factors.filter((factor) => factor.tone === 'watch'),
      ].slice(0, 3)
    : explanation.factors;

  return (
    <section className={`score-explanation ${compact ? 'compact' : ''}`}>
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
      <div className="score-explanation-factors">
        {visibleFactors.map((factor) => (
          <div key={`${opportunity.id}_${factor.id}`} className={`score-factor ${factor.tone}`}>
            <div className="score-factor-top">
              <span>{factor.label}</span>
              <strong>{factor.value ?? factorToneLabel(factor)}</strong>
            </div>
            <small>{factor.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
