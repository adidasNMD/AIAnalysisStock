import type { OpportunitySummary } from '../../api';

type ProxyScoreBlockProps = {
  opportunity: OpportunitySummary;
};

export function ProxyScoreBlock({ opportunity }: ProxyScoreBlockProps) {
  if (opportunity.type !== 'proxy_narrative' || !opportunity.proxyProfile) return null;

  return (
    <div className="proxy-score-grid">
      <div className="proxy-score"><span>Purity</span><strong>{opportunity.scores.purityScore}</strong></div>
      <div className="proxy-score"><span>Scarcity</span><strong>{opportunity.scores.scarcityScore}</strong></div>
      <div className="proxy-score"><span>Legitimacy</span><strong>{opportunity.proxyProfile.legitimacyScore}</strong></div>
      <div className="proxy-score"><span>Legibility</span><strong>{opportunity.proxyProfile.legibilityScore}</strong></div>
      <div className="proxy-score"><span>Tradeability</span><strong>{opportunity.proxyProfile.tradeabilityScore}</strong></div>
    </div>
  );
}
