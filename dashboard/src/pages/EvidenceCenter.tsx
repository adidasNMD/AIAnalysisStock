import { ArrowLeft, ArrowRight, ExternalLink, FileSearch, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  OpportunityFieldEvidenceIndexItem,
  OpportunityFieldEvidenceKind,
  OpportunityFieldEvidenceStatus,
  OpportunitySourceProvenanceConfidence,
} from '../api';
import { updateOpportunityFieldEvidenceBulkStatus } from '../api';
import { useOpportunityFieldEvidencePageQuery } from '../queries/evidence-queries';
import './evidence-center.css';

type EvidenceSelectValue<T extends string> = T | 'all';

function formatDate(value?: string) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function evidenceTone(item: OpportunityFieldEvidenceIndexItem) {
  if (item.status === 'invalidated') return 'invalidated';
  if (item.confidence === 'confirmed') return 'confirmed';
  if (item.confidence === 'inferred') return 'inferred';
  return 'weak';
}

function compactEvidenceValue(item: OpportunityFieldEvidenceIndexItem) {
  return item.value || item.note || item.source;
}

function evidenceSelectionKey(item: Pick<OpportunityFieldEvidenceIndexItem, 'opportunityId' | 'id'>) {
  return `${item.opportunityId}:${item.id}`;
}

function evidenceSelectParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
): EvidenceSelectValue<T> {
  return value && allowed.includes(value as T) ? value as T : 'all';
}

export function EvidenceCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const [field, setField] = useState(() => searchParams.get('field') || '');
  const [source, setSource] = useState(() => searchParams.get('source') || '');
  const [status, setStatus] = useState<EvidenceSelectValue<OpportunityFieldEvidenceStatus>>(() => (
    evidenceSelectParam(searchParams.get('status'), ['active', 'invalidated'])
  ));
  const [confidence, setConfidence] = useState<EvidenceSelectValue<OpportunitySourceProvenanceConfidence>>(() => (
    evidenceSelectParam(searchParams.get('confidence'), ['confirmed', 'inferred', 'placeholder', 'unknown'])
  ));
  const [kind, setKind] = useState<EvidenceSelectValue<OpportunityFieldEvidenceKind>>(() => (
    evidenceSelectParam(searchParams.get('kind'), ['record', 'profile', 'score', 'source', 'mission', 'event'])
  ));
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkReason, setBulkReason] = useState('Evidence center bulk review.');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const request = useMemo(() => ({
    limit: 50,
    ...(cursor ? { cursor } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(field.trim() ? { field: field.trim() } : {}),
    ...(source.trim() ? { source: source.trim() } : {}),
    status,
    confidence,
    kind,
  }), [confidence, cursor, field, kind, q, source, status]);
  const { data, error, loading, refresh } = useOpportunityFieldEvidencePageQuery(request);
  const items = useMemo(() => data?.items || [], [data]);
  const pageInfo = data?.pageInfo;
  const metrics = useMemo(() => {
    const fields = new Set(items.map((item) => item.field));
    const opportunities = new Set(items.map((item) => item.opportunityId));
    const active = items.filter((item) => item.status === 'active').length;
    const confirmed = items.filter((item) => item.confidence === 'confirmed').length;
    return { fields: fields.size, opportunities: opportunities.size, active, confirmed };
  }, [items]);
  const selectedItems = useMemo(() => (
    items.filter((item) => selectedIds.has(evidenceSelectionKey(item)))
  ), [items, selectedIds]);
  const selectedActiveCount = selectedItems.filter((item) => item.status === 'active').length;
  const selectedInvalidatedCount = selectedItems.filter((item) => item.status === 'invalidated').length;
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.has(evidenceSelectionKey(item)));

  const resetPaging = () => {
    setCursor(null);
    setCursorHistory([]);
    setSelectedIds(new Set());
  };

  const updateQ = (value: string) => {
    setQ(value);
    resetPaging();
  };

  const updateField = (value: string) => {
    setField(value);
    resetPaging();
  };

  const updateSource = (value: string) => {
    setSource(value);
    resetPaging();
  };

  const updateStatus = (value: EvidenceSelectValue<OpportunityFieldEvidenceStatus>) => {
    setStatus(value);
    resetPaging();
  };

  const updateConfidence = (value: EvidenceSelectValue<OpportunitySourceProvenanceConfidence>) => {
    setConfidence(value);
    resetPaging();
  };

  const updateKind = (value: EvidenceSelectValue<OpportunityFieldEvidenceKind>) => {
    setKind(value);
    resetPaging();
  };

  const goNext = () => {
    if (!pageInfo?.nextCursor) return;
    setCursorHistory((history) => [...history, cursor || '']);
    setCursor(pageInfo.nextCursor);
    setSelectedIds(new Set());
  };

  const goPrevious = () => {
    const previousCursor = cursorHistory[cursorHistory.length - 1] || null;
    setCursorHistory((history) => history.slice(0, -1));
    setCursor(previousCursor);
    setSelectedIds(new Set());
  };

  const toggleEvidenceSelection = (item: OpportunityFieldEvidenceIndexItem, checked: boolean) => {
    const key = evidenceSelectionKey(item);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      items.forEach((item) => {
        const key = evidenceSelectionKey(item);
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const runBulkStatusAction = async (action: 'invalidate' | 'restore') => {
    const reason = bulkReason.trim();
    if (!reason) {
      setBulkError('请填写批量操作原因。');
      return;
    }
    const eligibleItems = selectedItems.filter((item) => (
      action === 'invalidate' ? item.status === 'active' : item.status === 'invalidated'
    ));
    if (eligibleItems.length === 0) {
      setBulkError(action === 'invalidate' ? '请选择 active evidence。' : '请选择 invalidated evidence。');
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    setBulkFeedback(null);
    try {
      const result = await updateOpportunityFieldEvidenceBulkStatus({
        action,
        reason,
        items: eligibleItems.map((item) => ({
          opportunityId: item.opportunityId,
          evidenceId: item.id,
          field: item.field,
          source: item.source,
        })),
      });
      const accepted = new Set(result.items
        .filter((item) => item.status === 'invalidated' || item.status === 'restored' || item.status === 'not_found')
        .map((item) => `${item.opportunityId}:${item.evidenceId}`));
      setSelectedIds((current) => {
        const next = new Set(current);
        accepted.forEach((key) => next.delete(key));
        return next;
      });
      await refresh();
      setBulkFeedback(
        action === 'invalidate'
          ? `Invalidated ${result.invalidated}/${result.total}; not found ${result.notFound}; failed ${result.failed}.`
          : `Restored ${result.restored}/${result.total}; not found ${result.notFound}; failed ${result.failed}.`,
      );
      if (result.failed > 0 || result.notFound > 0) {
        setBulkError('部分 evidence 未更新，已保留未成功项。');
      }
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : '批量更新失败。');
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="page evidence-center">
      <div className="page-header evidence-header">
        <h1><FileSearch size={24} /> Evidence Center</h1>
        <button
          type="button"
          className="secondary-btn evidence-refresh"
          onClick={() => void refresh()}
          disabled={loading}
          data-evidence-refresh
        >
          <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          刷新
        </button>
      </div>

      <section className="evidence-filter-band" data-evidence-filters>
        <label>
          <span>Search</span>
          <input
            value={q}
            onChange={(event) => updateQ(event.target.value)}
            placeholder="ticker / title / field / source"
            data-evidence-search
          />
        </label>
        <label>
          <span>Field</span>
          <input
            value={field}
            onChange={(event) => updateField(event.target.value)}
            placeholder="scores.relayScore"
            data-evidence-field-filter
          />
        </label>
        <label>
          <span>Source</span>
          <input
            value={source}
            onChange={(event) => updateSource(event.target.value)}
            placeholder="manual_review"
            data-evidence-source-filter
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => updateStatus(event.target.value as EvidenceSelectValue<OpportunityFieldEvidenceStatus>)}
            data-evidence-status-filter
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="invalidated">Invalidated</option>
          </select>
        </label>
        <label>
          <span>Confidence</span>
          <select
            value={confidence}
            onChange={(event) => updateConfidence(event.target.value as EvidenceSelectValue<OpportunitySourceProvenanceConfidence>)}
            data-evidence-confidence-filter
          >
            <option value="all">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="inferred">Inferred</option>
            <option value="placeholder">Placeholder</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span>Kind</span>
          <select
            value={kind}
            onChange={(event) => updateKind(event.target.value as EvidenceSelectValue<OpportunityFieldEvidenceKind>)}
            data-evidence-kind-filter
          >
            <option value="all">All</option>
            <option value="record">Record</option>
            <option value="profile">Profile</option>
            <option value="score">Score</option>
            <option value="source">Source</option>
            <option value="mission">Mission</option>
            <option value="event">Event</option>
          </select>
        </label>
      </section>

      <section className="evidence-metrics" data-evidence-metrics>
        <div>
          <span>Rows</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>Opportunities</span>
          <strong>{metrics.opportunities}</strong>
        </div>
        <div>
          <span>Fields</span>
          <strong>{metrics.fields}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{metrics.active}</strong>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>{metrics.confirmed}</strong>
        </div>
      </section>

      {error && <div className="evidence-error" data-evidence-error>{error}</div>}

      <section className="evidence-bulk-bar" data-evidence-bulk-bar>
        <label className="evidence-bulk-select-all">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(event) => toggleVisibleSelection(event.target.checked)}
            data-evidence-select-all
          />
          <span>{selectedItems.length}/{items.length} selected</span>
        </label>
        <input
          value={bulkReason}
          onChange={(event) => setBulkReason(event.target.value)}
          placeholder="批量操作原因"
          data-evidence-bulk-reason
        />
        <button
          type="button"
          className="secondary-btn danger"
          onClick={() => void runBulkStatusAction('invalidate')}
          disabled={bulkSaving || selectedActiveCount === 0}
          data-evidence-bulk-invalidate
        >
          作废 {selectedActiveCount}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => void runBulkStatusAction('restore')}
          disabled={bulkSaving || selectedInvalidatedCount === 0}
          data-evidence-bulk-restore
        >
          恢复 {selectedInvalidatedCount}
        </button>
        {bulkFeedback && <small data-evidence-bulk-feedback>{bulkFeedback}</small>}
        {bulkError && <small className="error" data-evidence-bulk-error>{bulkError}</small>}
      </section>

      <section className="evidence-list" data-evidence-list>
        {items.map((item) => (
          <article
            key={`${item.opportunityId}:${item.id}`}
            className={`evidence-row ${evidenceTone(item)}`}
            data-evidence-row={item.id}
            data-evidence-status={item.status}
          >
            <label className="evidence-row-select">
              <input
                type="checkbox"
                checked={selectedIds.has(evidenceSelectionKey(item))}
                onChange={(event) => toggleEvidenceSelection(item, event.target.checked)}
                data-evidence-select={item.id}
              />
              <span>Select</span>
            </label>
            <div className="evidence-row-main">
              <div className="evidence-row-title">
                <strong>{item.label}</strong>
                <span>{item.field}</span>
              </div>
              <p>{compactEvidenceValue(item)}</p>
              <div className="evidence-row-tags">
                <span>{item.kind}</span>
                <span>{item.source}</span>
                <span>{item.confidence}</span>
                <span>{item.status}</span>
              </div>
            </div>
            <div className="evidence-row-opportunity">
              <strong>{item.opportunityTitle}</strong>
              <span>
                {item.opportunityPrimaryTicker || item.opportunityType}
                {' · '}
                {item.opportunityStage}
                {' · '}
                {formatDate(item.updatedAt)}
              </span>
              <div className="evidence-row-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => navigate(`/?q=${encodeURIComponent(item.opportunityPrimaryTicker || item.opportunityTitle)}`)}
                  data-evidence-open-opportunity={item.opportunityId}
                >
                  <ExternalLink size={12} />
                  机会
                </button>
                {item.opportunityLatestMissionId && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => navigate(`/missions/${item.opportunityLatestMissionId}`)}
                    data-evidence-open-mission={item.opportunityLatestMissionId}
                  >
                    <ExternalLink size={12} />
                    Mission
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
        {!loading && items.length === 0 && (
          <div className="evidence-empty" data-evidence-empty>No evidence rows</div>
        )}
      </section>

      <div className="evidence-pagination" data-evidence-pagination>
        <button
          type="button"
          className="secondary-btn"
          onClick={goPrevious}
          disabled={cursorHistory.length === 0}
          data-evidence-prev
        >
          <ArrowLeft size={13} />
          Previous
        </button>
        <span>{loading ? 'Loading' : `${items.length}/${pageInfo?.limit || 50}`}</span>
        <button
          type="button"
          className="secondary-btn"
          onClick={goNext}
          disabled={!pageInfo?.hasMore}
          data-evidence-next
        >
          Next
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
