import { ArrowRight } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import { playbookStanceLabel } from './model';

type OpportunityPlaybookBlockProps = {
  opportunity: OpportunitySummary;
};

export function OpportunityPlaybookBlock({ opportunity }: OpportunityPlaybookBlockProps) {
  if (!opportunity.playbook) return null;

  return (
    <>
      <div className="today-diff">
        <span className={`diff-chip ${opportunity.playbook.stance === 'review' ? 'changed' : 'stable'}`}>
          {playbookStanceLabel(opportunity.playbook.stance)}
        </span>
        <span className="today-diff-summary">{opportunity.playbook.objective}</span>
      </div>
      <div className="op-card-detail">
        {opportunity.playbook.checklist.slice(0, 3).map((item) => (
          <div key={`${opportunity.id}_${item.label}`}>
            <ArrowRight size={12} /> [{item.status}] {item.label}{item.note ? ` · ${item.note}` : ''}
          </div>
        ))}
      </div>
    </>
  );
}
