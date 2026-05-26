import { ArrowRight } from 'lucide-react';
import type { OpportunitySummary } from '../../api';
import { playbookStanceLabel } from './model';

type OpportunityPlaybookBlockProps = {
  opportunity: OpportunitySummary;
  checklistLimit?: number;
  summaryOnly?: boolean;
};

export function OpportunityPlaybookBlock({
  opportunity,
  checklistLimit = 3,
  summaryOnly = false,
}: OpportunityPlaybookBlockProps) {
  if (!opportunity.playbook) return null;
  const safeChecklistLimit = Math.max(1, checklistLimit);

  return (
    <>
      <div className="today-diff">
        <span className={`diff-chip ${opportunity.playbook.stance === 'review' ? 'changed' : 'stable'}`}>
          {playbookStanceLabel(opportunity.playbook.stance)}
        </span>
        <span className="today-diff-summary">{opportunity.playbook.objective}</span>
      </div>
      {!summaryOnly && (
        <div className="op-card-detail">
          {opportunity.playbook.checklist.slice(0, safeChecklistLimit).map((item) => (
            <div key={`${opportunity.id}_${item.label}`}>
              <ArrowRight size={12} /> [{item.status}] {item.label}{item.note ? ` · ${item.note}` : ''}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
