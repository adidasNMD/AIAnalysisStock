import { CalendarClock, Compass, Layers3, Sparkles } from 'lucide-react';
import type { OpportunityIpoProfile } from '../../api';

type IpoEvidenceBlockProps = {
  profile?: OpportunityIpoProfile;
};

export function IpoEvidenceBlock({ profile }: IpoEvidenceBlockProps) {
  if (!profile) return null;

  return (
    <div className="op-card-detail">
      {profile.officialTradingDate && (
        <div>
          <CalendarClock size={12} /> Trading {profile.officialTradingDate}
          {profile.evidence?.officialTradingDate ? ` · ${profile.evidence.officialTradingDate.source} · ${profile.evidence.officialTradingDate.confidence}` : ''}
        </div>
      )}
      {profile.spinoutDate && (
        <div>
          <Layers3 size={12} /> Spinout {profile.spinoutDate}
          {profile.evidence?.spinoutDate ? ` · ${profile.evidence.spinoutDate.source} · ${profile.evidence.spinoutDate.confidence}` : ''}
        </div>
      )}
      {typeof profile.retainedStakePercent === 'number' && (
        <div>
          <Sparkles size={12} /> Retained stake {profile.retainedStakePercent}%
          {profile.evidence?.retainedStakePercent ? ` · ${profile.evidence.retainedStakePercent.source} · ${profile.evidence.retainedStakePercent.confidence}` : ''}
        </div>
      )}
      {profile.lockupDate && (
        <div>
          <Compass size={12} /> Lockup {profile.lockupDate}
          {profile.evidence?.lockupDate ? ` · ${profile.evidence.lockupDate.source} · ${profile.evidence.lockupDate.confidence}` : ''}
        </div>
      )}
      {!profile.officialTradingDate && profile.evidence?.officialTradingDate && (
        <div><CalendarClock size={12} /> Trading date pending · {profile.evidence.officialTradingDate.source} · {profile.evidence.officialTradingDate.confidence}</div>
      )}
    </div>
  );
}
