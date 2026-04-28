import { ArrowRight, Sparkles } from 'lucide-react';
import type { OpportunitySummary } from '../../api';

type SuggestedMissionsBlockProps = {
  opportunity: OpportunitySummary;
};

export function SuggestedMissionsBlock({ opportunity }: SuggestedMissionsBlockProps) {
  if (!opportunity.suggestedMission && (opportunity.suggestedMissions || []).length === 0) return null;

  return (
    <>
      {opportunity.suggestedMission && (
        <div className="op-card-detail">
          <div><ArrowRight size={12} /> Suggested mission: {opportunity.suggestedMission.mode} / {opportunity.suggestedMission.depth} / {opportunity.suggestedMission.query}</div>
          <div><Sparkles size={12} /> {opportunity.suggestedMission.rationale}</div>
        </div>
      )}
      {(opportunity.suggestedMissions || []).length > 0 && (
        <div className="op-card-detail">
          {(opportunity.suggestedMissions || []).slice(0, 3).map((template) => (
            <div key={`${opportunity.id}_${template.id}`}>
              <ArrowRight size={12} /> {template.label}: {template.mode} / {template.depth} / {template.query}
              {template.whenToUse ? ` · ${template.whenToUse}` : ''}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
