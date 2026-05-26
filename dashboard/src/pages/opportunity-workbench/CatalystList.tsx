import type { OpportunityCatalystItem } from '../../api';
import { catalystConfidenceLabel } from './model';

type CatalystListProps = {
  items: OpportunityCatalystItem[];
  limit?: number;
};

export function CatalystList({ items, limit = 2 }: CatalystListProps) {
  if (items.length === 0) return null;
  const safeLimit = Math.max(1, limit);

  return (
    <div className="op-catalyst-list">
      {items.slice(0, safeLimit).map((item) => (
        <div key={`${item.label}_${item.dueAt || item.status}`} className="op-catalyst-item">
          <span className={`diff-chip ${item.status === 'upcoming' ? 'changed' : 'stable'}`}>{item.status}</span>
          <span className="today-diff-summary">
            {item.label}{item.dueAt ? ` · ${item.dueAt}` : ''}{item.source ? ` · ${item.source}` : ''}
          </span>
          {catalystConfidenceLabel(item.confidence) && (
            <span className="today-run">{catalystConfidenceLabel(item.confidence)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
