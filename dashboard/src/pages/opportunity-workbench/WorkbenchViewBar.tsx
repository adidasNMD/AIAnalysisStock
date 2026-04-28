import { Bookmark, BookmarkPlus, Filter, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { InboxLane } from './model';
import type { WorkbenchSavedView } from './view-state';

type WorkbenchViewBarProps = {
  searchQuery: string;
  activeLane: InboxLane | null;
  savedViews: WorkbenchSavedView[];
  activeSavedViewId: string | null;
  resultCount: number;
  inboxCount: number;
  filterCount: number;
  onSearchChange: (query: string) => void;
  onLaneFocus: (lane: InboxLane | null) => void;
  onSaveView: () => void;
  onApplyView: (view: WorkbenchSavedView) => void;
  onDeleteView: (viewId: string) => void;
  onResetView: () => void;
};

const LANE_LABELS: Record<InboxLane, string> = {
  act: 'Act',
  review: 'Review',
  monitor: 'Monitor',
};

export function WorkbenchViewBar({
  searchQuery,
  activeLane,
  savedViews,
  activeSavedViewId,
  resultCount,
  inboxCount,
  filterCount,
  onSearchChange,
  onLaneFocus,
  onSaveView,
  onApplyView,
  onDeleteView,
  onResetView,
}: WorkbenchViewBarProps) {
  return (
    <section className="workbench-view-bar glass-panel">
      <div className="workbench-view-main">
        <label className="workbench-search">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title / ticker / thesis"
            aria-label="搜索机会"
          />
          {searchQuery && (
            <button
              type="button"
              className="workbench-icon-btn"
              onClick={() => onSearchChange('')}
              aria-label="清空搜索"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <div className="workbench-lane-picker" aria-label="关注泳道">
          {(['act', 'review', 'monitor'] as const).map((lane) => (
            <button
              key={lane}
              type="button"
              className={`workbench-lane-chip ${activeLane === lane ? 'active' : ''}`}
              onClick={() => onLaneFocus(activeLane === lane ? null : lane)}
            >
              {LANE_LABELS[lane]}
            </button>
          ))}
        </div>

        <div className="workbench-view-actions">
          <span className="timeline-chip muted">{resultCount} cards</span>
          <span className="timeline-chip muted">{inboxCount} actions</span>
          <span className="timeline-chip muted">
            <Filter size={12} /> {filterCount}
          </span>
          <button type="button" className="secondary-btn tiny" onClick={onSaveView}>
            <BookmarkPlus size={13} />
            保存视图
          </button>
          <button type="button" className="secondary-btn tiny" onClick={onResetView}>
            <RotateCcw size={13} />
            重置
          </button>
        </div>
      </div>

      {savedViews.length > 0 && (
        <div className="workbench-saved-views">
          {savedViews.map((view) => (
            <div
              key={view.id}
              className={`saved-view-pill ${activeSavedViewId === view.id ? 'active' : ''}`}
            >
              <button
                type="button"
                className="saved-view-apply"
                onClick={() => onApplyView(view)}
                title={view.label}
              >
                <Bookmark size={12} />
                <span>{view.label}</span>
              </button>
              <button
                type="button"
                className="saved-view-delete"
                onClick={() => onDeleteView(view.id)}
                aria-label={`删除视图 ${view.label}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
