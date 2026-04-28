import type { OpportunitySummary } from '../../api';

type OpportunityTickerBlockProps = {
  opportunity: OpportunitySummary;
};

export function OpportunityTickerBlock({ opportunity }: OpportunityTickerBlockProps) {
  if (opportunity.relatedTickers.length === 0 && opportunity.relayTickers.length === 0) return null;

  return (
    <div className="op-ticker-block">
      {opportunity.relatedTickers.length > 0 && (
        <div className="tc-tickers">
          {opportunity.relatedTickers.slice(0, 4).map((ticker) => (
            <span key={ticker} className="ticker-pill">${ticker}</span>
          ))}
        </div>
      )}
      {opportunity.relayTickers.length > 0 && (
        <div className="tc-tickers">
          {opportunity.relayTickers.slice(0, 4).map((ticker) => (
            <span key={ticker} className="ticker-pill">${ticker}</span>
          ))}
        </div>
      )}
    </div>
  );
}
