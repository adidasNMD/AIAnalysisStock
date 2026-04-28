import { CalendarClock, Layers3, Sparkles } from 'lucide-react';
import type { OpportunitySummary } from '../../api';

type OpportunityStatusNotesProps = {
  opportunity: OpportunitySummary;
};

export function OpportunityStatusNotes({ opportunity }: OpportunityStatusNotesProps) {
  if (!opportunity.nextCatalystAt && !opportunity.policyStatus && !opportunity.supplyOverhang) return null;

  return (
    <div className="op-card-detail">
      {opportunity.nextCatalystAt && <div><CalendarClock size={12} /> {opportunity.nextCatalystAt}</div>}
      {(opportunity.proxyProfile?.ruleStatus || opportunity.policyStatus) && <div><Sparkles size={12} /> {opportunity.proxyProfile?.ruleStatus || opportunity.policyStatus}</div>}
      {opportunity.supplyOverhang && <div><Layers3 size={12} /> {opportunity.supplyOverhang}</div>}
    </div>
  );
}
