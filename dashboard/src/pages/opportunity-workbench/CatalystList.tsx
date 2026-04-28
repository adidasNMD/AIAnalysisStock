import type { OpportunityCatalystItem } from '../../api';
import { catalystConfidenceLabel } from './model';

type CatalystListProps = {
  items: OpportunityCatalystItem[];
};

export function CatalystList({ items }: CatalystListProps) {
  if (items.length === 0) return null;

  return (
    <div className="op-catalyst-list">
      {items.slice(0, 2).map((item) => (
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
