import { Search } from 'lucide-react';
import type { WorkbenchSearchMatch } from './view-state';

type OpportunitySearchMatchBlockProps = {
  match?: WorkbenchSearchMatch | null;
};

export function OpportunitySearchMatchBlock({ match }: OpportunitySearchMatchBlockProps) {
  if (!match) return null;

  const visibleReasons = match.reasons.slice(0, 3);
  const extraCount = Math.max(0, match.reasons.length - visibleReasons.length);

  return (
    <div className="op-search-match" aria-label={`搜索命中 ${match.query}`}>
      <div className="op-search-match-head">
        <Search size={12} />
        <span>搜索命中</span>
        <small>{match.tokens.length} token{match.tokens.length > 1 ? 's' : ''}</small>
      </div>
      <div className="op-search-match-reasons">
        {visibleReasons.map((reason) => (
          <span
            key={`${reason.field}_${reason.value}_${reason.tokens.join('_')}`}
            className="timeline-chip muted search-match-chip"
            title={`${reason.label}: ${reason.value}`}
          >
            {reason.label}: {reason.value}
          </span>
        ))}
        {extraCount > 0 && (
          <span className="timeline-chip muted search-match-chip">+{extraCount}</span>
        )}
      </div>
    </div>
  );
}
