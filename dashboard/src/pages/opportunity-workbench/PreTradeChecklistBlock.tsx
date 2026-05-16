import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { recordPreTradeConfirmation, type OpportunitySummary, type PreTradeConfirmationAudit } from '../../api';
import { buildPreTradeChecklist, type PreTradeChecklistItem } from './pretrade';
import {
  getPreTradeItemProgress,
  readPreTradeProgress,
  summarizePreTradeProgress,
  updatePreTradeProgress,
  writePreTradeProgress,
} from './pretrade-progress';

type PreTradeChecklistBlockProps = {
  opportunity: OpportunitySummary;
  compact?: boolean;
  itemLimit?: number;
  summaryOnly?: boolean;
  onAuditRecorded?: (audit: PreTradeConfirmationAudit) => void;
};

type PreTradeAuditStatus = 'idle' | 'syncing' | 'synced' | 'failed';

type PreTradeAuditState = {
  status: PreTradeAuditStatus;
  message?: string;
};

function itemIcon(item: PreTradeChecklistItem) {
  if (item.status === 'pass') return <CheckCircle2 size={13} />;
  if (item.status === 'block') return <AlertTriangle size={13} />;
  return <CircleDashed size={13} />;
}

function auditLabel(state?: PreTradeAuditState): string {
  if (!state || state.status === 'idle') return '';
  if (state.status === 'syncing') return '同步审计中';
  if (state.status === 'synced') return '已写入事件流';
  return state.message || '审计同步失败，本地确认已保留';
}

export function PreTradeChecklistBlock({
  opportunity,
  compact = false,
  itemLimit,
  summaryOnly = false,
  onAuditRecorded,
}: PreTradeChecklistBlockProps) {
  const [progress, setProgress] = useState(() => readPreTradeProgress());
  const [auditByItem, setAuditByItem] = useState<Record<string, PreTradeAuditState>>({});
  const checklist = buildPreTradeChecklist(opportunity);
  const progressSummary = useMemo(() => (
    summarizePreTradeProgress(checklist.items, progress, opportunity.id)
  ), [checklist.items, opportunity.id, progress]);
  const compactItemLimit = Math.max(1, itemLimit ?? 3);
  const visibleItems = compact
    ? checklist.items.filter((item) => item.status !== 'pass').slice(0, compactItemLimit)
    : checklist.items;

  const updateItemProgress = (item: PreTradeChecklistItem, patch: Parameters<typeof updatePreTradeProgress>[3]) => {
    setProgress((current) => {
      const next = updatePreTradeProgress(current, opportunity.id, item.id, patch);
      writePreTradeProgress(next);
      return next;
    });
  };

  const auditItemProgress = async (
    item: PreTradeChecklistItem,
    completed: boolean,
    evidence?: string,
  ) => {
    const cleanedEvidence = evidence?.trim();
    setAuditByItem((current) => ({
      ...current,
      [item.id]: { status: 'syncing' },
    }));

    try {
      const audit = await recordPreTradeConfirmation(opportunity.id, {
        itemId: item.id,
        label: item.label,
        status: item.status,
        completed,
        ...(cleanedEvidence ? { evidence: cleanedEvidence } : {}),
        ...(item.actionKind ? { actionKind: item.actionKind } : {}),
        ...(item.catalystUrgency ? { catalystUrgency: item.catalystUrgency } : {}),
        readiness: checklist.readiness,
        score: checklist.score,
      });
      setAuditByItem((current) => ({
        ...current,
        [item.id]: { status: 'synced' },
      }));
      onAuditRecorded?.(audit);
    } catch (error: unknown) {
      setAuditByItem((current) => ({
        ...current,
        [item.id]: {
          status: 'failed',
          message: error instanceof Error ? error.message : '审计同步失败，本地确认已保留',
        },
      }));
    }
  };

  return (
    <section className={`pretrade-block ${checklist.readiness} ${compact ? 'compact' : ''}`}>
      <div className="pretrade-header">
        <div>
          <span className="pretrade-kicker"><ShieldCheck size={13} /> Pre-trade</span>
          <strong>{checklist.label} {checklist.score}</strong>
        </div>
        <div className="pretrade-counts">
          <span>{checklist.blockers} block</span>
          <span>{checklist.warnings} warn</span>
        </div>
      </div>
      {!compact && (
        <>
          <div className="pretrade-next">{checklist.nextAction}</div>
          <div
            className="pretrade-progress-summary"
            data-pretrade-progress-summary={opportunity.id}
            data-pretrade-actionable={progressSummary.actionable}
            data-pretrade-completed={progressSummary.completed}
            data-pretrade-remaining={progressSummary.remaining}
          >
            <strong>{progressSummary.label}</strong>
            <span>{progressSummary.detail}</span>
          </div>
        </>
      )}
      {!summaryOnly && (
      <div className="pretrade-items">
        {visibleItems.length === 0 ? (
          <div className="pretrade-item pass">
            <CheckCircle2 size={13} />
            <div>
              <span>All checks</span>
              <small>当前没有阻塞项。</small>
            </div>
          </div>
        ) : visibleItems.map((item) => {
          const itemProgress = getPreTradeItemProgress(progress, opportunity.id, item.id);
          const isCompleted = itemProgress?.completed === true;
          const auditState = auditByItem[item.id];
          return (
            <div
              key={`${opportunity.id}_${item.id}`}
              className={`pretrade-item ${item.status} ${isCompleted ? 'confirmed' : ''}`}
              data-pretrade-item={item.id}
              data-pretrade-status={item.status}
              data-pretrade-action={item.actionKind || ''}
              data-catalyst-urgency={item.catalystUrgency || ''}
              data-pretrade-confirmed={isCompleted ? 'true' : 'false'}
            >
              {itemIcon(item)}
              <div>
                <span>{item.label}</span>
                <small>{item.detail}</small>
                {!compact && item.action && <small className="pretrade-action">{item.action}</small>}
                {!compact && item.status !== 'pass' && (
                  <div className="pretrade-progress-controls" data-pretrade-progress={item.id}>
                    <button
                      type="button"
                      className={`secondary-btn tiny ${isCompleted ? 'active' : ''}`}
                      data-pretrade-toggle={item.id}
                      disabled={auditState?.status === 'syncing'}
                      onClick={() => {
                        const nextCompleted = !isCompleted;
                        updateItemProgress(item, { completed: nextCompleted });
                        void auditItemProgress(item, nextCompleted, itemProgress?.evidence);
                      }}
                    >
                      {isCompleted ? '已确认' : '标记已处理'}
                    </button>
                    <input
                      type="text"
                      value={itemProgress?.evidence || ''}
                      placeholder="Evidence/source note"
                      data-pretrade-evidence={item.id}
                      onChange={(event) => updateItemProgress(item, { evidence: event.target.value })}
                      onBlur={(event) => {
                        if (isCompleted) {
                          void auditItemProgress(item, true, event.currentTarget.value);
                        }
                      }}
                    />
                    {auditState && auditState.status !== 'idle' && (
                      <small
                        className={`pretrade-audit-status ${auditState.status}`}
                        data-pretrade-audit={item.id}
                        data-pretrade-audit-status={auditState.status}
                      >
                        {auditLabel(auditState)}
                      </small>
                    )}
                    {itemProgress?.completedAt && (
                      <small className="pretrade-progress-time">
                        {new Date(itemProgress.completedAt).toLocaleString()}
                      </small>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
