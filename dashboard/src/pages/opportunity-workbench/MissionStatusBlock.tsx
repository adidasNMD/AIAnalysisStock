import type { MissionDiffSummary } from '../../api';

type MissionStatusBlockProps = {
  mission?: {
    id: string;
    query: string;
    status: string;
    updatedAt: string;
    source?: string;
  };
  diff?: MissionDiffSummary;
};

export function MissionStatusBlock({ mission, diff }: MissionStatusBlockProps) {
  if (!mission) return null;

  return (
    <div className="op-card-mission">
      <div className="stream-time">
        Latest mission: {mission.status} · {new Date(mission.updatedAt).toLocaleString()}
      </div>
      {diff && (
        <div className="today-diff">
          <span className={`diff-chip ${diff.changed ? 'changed' : 'stable'}`}>
            {diff.changed ? `CHANGED ${diff.changeCount}` : 'STABLE'}
          </span>
          <span className="today-diff-summary">{diff.summary}</span>
        </div>
      )}
    </div>
  );
}
