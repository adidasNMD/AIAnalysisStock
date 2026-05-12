import { Download, FileDiff, FileSearch, RefreshCw, RotateCcw, Save, SlidersHorizontal, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ImportOpportunityFieldRegistryItem,
  OpportunityFieldEvidenceKind,
  OpportunityFieldRegistryAuditEntry,
  OpportunityFieldRegistryDiffReport,
  OpportunityFieldRegistryEntry,
  OpportunityFieldRegistryGroup,
  OpportunityFieldRegistryImportResult,
  OpportunitySourceProvenanceConfidence,
} from '../api';
import {
  deleteOpportunityFieldRegistry,
  exportOpportunityFieldRegistry,
  importOpportunityFieldRegistry,
  upsertOpportunityFieldRegistry,
} from '../api';
import {
  useOpportunityFieldRegistryAuditQuery,
  useOpportunityFieldRegistryQuery,
  useOpportunityFieldRegistryReportQuery,
} from '../queries/field-registry-queries';
import './field-registry.css';

type RegistryScope = 'all' | 'overridden' | 'base' | 'custom';
type RegistrySelectValue<T extends string> = T | 'all';
type RegistryFieldValue = 'label' | 'kind' | 'source' | 'confidence';

const registryGroups: Array<RegistrySelectValue<OpportunityFieldRegistryGroup>> = [
  'all',
  'record',
  'score',
  'heat',
  'proxy',
  'ipo',
  'catalyst',
  'mission',
  'event',
  'custom',
];

const registryKinds: Array<RegistrySelectValue<OpportunityFieldEvidenceKind>> = [
  'all',
  'record',
  'profile',
  'score',
  'source',
  'mission',
  'event',
];

const registryConfidences: Array<OpportunitySourceProvenanceConfidence> = [
  'confirmed',
  'inferred',
  'placeholder',
  'unknown',
];

function formatRegistryDate(value?: string) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function registryAuditSummary(entry: OpportunityFieldRegistryAuditEntry) {
  if (entry.action === 'delete') {
    return `Reset ${entry.before?.label || entry.field}`;
  }
  const changed = entry.changedFields.length > 0 ? entry.changedFields.join(', ') : 'metadata';
  return `${entry.after?.label || entry.before?.label || entry.field} · ${changed}`;
}

function registryDiffs(entry: OpportunityFieldRegistryEntry) {
  const values: RegistryFieldValue[] = ['label', 'kind', 'source', 'confidence'];
  return values
    .map((field) => ({
      field,
      base: entry.base?.[field],
      current: entry[field],
      changed: entry.overriddenFields.includes(field),
    }))
    .filter((diff) => diff.changed || !entry.base);
}

function matchesRegistryQuery(entry: OpportunityFieldRegistryEntry, query: string) {
  if (!query) return true;
  const haystack = [
    entry.field,
    entry.label,
    entry.source,
    entry.kind,
    entry.confidence,
    entry.group,
    entry.note,
    entry.base?.label,
    entry.base?.source,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseRegistryImportItems(text: string): ImportOpportunityFieldRegistryItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('导入内容不是有效 JSON。');
  }

  const rawItems = Array.isArray(parsed)
    ? parsed
    : isObjectRecord(parsed) && Array.isArray(parsed.items)
      ? parsed.items
      : isObjectRecord(parsed) && Array.isArray(parsed.overrides)
        ? parsed.overrides
        : null;

  if (!rawItems || rawItems.length === 0) {
    throw new Error('导入 JSON 需要包含非空 items 数组。');
  }

  return rawItems.map((raw, index) => {
    if (!isObjectRecord(raw) || !optionalText(raw.field)) {
      throw new Error(`第 ${index + 1} 条缺少 field。`);
    }
    const item: ImportOpportunityFieldRegistryItem = {
      field: optionalText(raw.field) as string,
    };
    const label = optionalText(raw.label);
    const source = optionalText(raw.source);
    const note = optionalText(raw.note);
    const updatedAt = optionalText(raw.updatedAt);
    const updatedBy = optionalText(raw.updatedBy);
    if (label) item.label = label;
    if (source) item.source = source;
    if (note) item.note = note;
    if (updatedAt) item.updatedAt = updatedAt;
    if (updatedBy) item.updatedBy = updatedBy;
    if (registryKinds.includes(raw.kind as OpportunityFieldEvidenceKind) && raw.kind !== 'all') {
      item.kind = raw.kind as OpportunityFieldEvidenceKind;
    }
    if (registryConfidences.includes(raw.confidence as OpportunitySourceProvenanceConfidence)) {
      item.confidence = raw.confidence as OpportunitySourceProvenanceConfidence;
    }
    if (!item.label && !item.kind && !item.source && !item.confidence && !item.note) {
      throw new Error(`第 ${index + 1} 条至少需要 label、kind、source、confidence 或 note。`);
    }
    return item;
  });
}

function formatRegistryReportBucket(values: OpportunityFieldRegistryDiffReport['changedFieldCounts']) {
  return values.length > 0
    ? values.slice(0, 4).map((item) => `${item.key} ${item.count}`).join(' · ')
    : 'no drift';
}

export function FieldRegistry() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<RegistrySelectValue<OpportunityFieldRegistryGroup>>('all');
  const [kind, setKind] = useState<RegistrySelectValue<OpportunityFieldEvidenceKind>>('all');
  const [scope, setScope] = useState<RegistryScope>('all');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [source, setSource] = useState('');
  const [selectedKind, setSelectedKind] = useState<OpportunityFieldEvidenceKind>('source');
  const [confidence, setConfidence] = useState<OpportunitySourceProvenanceConfidence>('unknown');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [importDryRun, setImportDryRun] = useState(true);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkResult, setBulkResult] = useState<OpportunityFieldRegistryImportResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const { data: registry, loading, error, refresh } = useOpportunityFieldRegistryQuery();
  const registryItems = useMemo(() => registry || [], [registry]);
  const selectedEntry = useMemo(() => (
    registryItems.find((entry) => entry.field === selectedField) || registryItems[0]
  ), [registryItems, selectedField]);
  const { data: auditHistory, loading: auditLoading, refresh: refreshAudit } = useOpportunityFieldRegistryAuditQuery(
    selectedEntry?.field,
    8,
  );
  const {
    data: registryReport,
    loading: reportLoading,
    refresh: refreshReport,
  } = useOpportunityFieldRegistryReportQuery();
  const auditItems = useMemo(() => auditHistory || [], [auditHistory]);

  useEffect(() => {
    const importDraft = searchParams.get('importDraft');
    if (!importDraft) return;
    try {
      const parsed = JSON.parse(importDraft) as unknown;
      setImportText(JSON.stringify(parsed, null, 2));
      setImportDryRun(true);
      setBulkResult(null);
      setBulkError(null);
      setFeedback('Registry import draft loaded.');
    } catch {
      setBulkError('Registry import draft URL 参数不是有效 JSON。');
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('importDraft');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedField && registryItems.length > 0) {
      setSelectedField(registryItems[0].field);
    }
  }, [registryItems, selectedField]);

  useEffect(() => {
    if (!selectedEntry) return;
    setLabel(selectedEntry.label);
    setSource(selectedEntry.source);
    setSelectedKind(selectedEntry.kind);
    setConfidence(selectedEntry.confidence);
    setNote(selectedEntry.note || '');
    setFeedback(null);
    setLocalError(null);
  }, [selectedEntry]);

  const filteredRegistry = useMemo(() => (
    registryItems.filter((entry) => {
      if (!matchesRegistryQuery(entry, query.trim())) return false;
      if (group !== 'all' && entry.group !== group) return false;
      if (kind !== 'all' && entry.kind !== kind) return false;
      if (scope === 'overridden' && entry.overriddenFields.length === 0 && !entry.note) return false;
      if (scope === 'base' && (entry.overriddenFields.length > 0 || entry.note || !entry.base)) return false;
      if (scope === 'custom' && entry.group !== 'custom') return false;
      return true;
    })
  ), [group, kind, query, registryItems, scope]);

  const metrics = useMemo(() => {
    const overridden = registryItems.filter((entry) => entry.overriddenFields.length > 0 || entry.note).length;
    const custom = registryItems.filter((entry) => entry.group === 'custom').length;
    const groups = new Set(registryItems.map((entry) => entry.group));
    return {
      total: registryItems.length,
      overridden,
      custom,
      base: registryItems.length - overridden,
      groups: groups.size,
    };
  }, [registryItems]);

  const saveOverride = async () => {
    if (!selectedEntry || saving) return;
    if (!label.trim() || !source.trim()) {
      setLocalError('Label 和 source 都不能为空。');
      return;
    }
    setSaving(true);
    setFeedback(null);
    setLocalError(null);
    try {
      await upsertOpportunityFieldRegistry(selectedEntry.field, {
        label: label.trim(),
        source: source.trim(),
        kind: selectedKind,
        confidence,
        ...(note.trim() ? { note: note.trim() } : {}),
        updatedBy: 'dashboard',
      });
      await refresh();
      await refreshAudit();
      await refreshReport();
      setFeedback('Registry override saved.');
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : '保存 registry override 失败。');
    } finally {
      setSaving(false);
    }
  };

  const resetOverride = async () => {
    if (!selectedEntry || saving || (selectedEntry.overriddenFields.length === 0 && !selectedEntry.note)) return;
    setSaving(true);
    setFeedback(null);
    setLocalError(null);
    try {
      await deleteOpportunityFieldRegistry(selectedEntry.field);
      await refresh();
      await refreshAudit();
      await refreshReport();
      setFeedback('Registry override reset.');
    } catch (resetError) {
      setLocalError(resetError instanceof Error ? resetError.message : '重置 registry override 失败。');
    } finally {
      setSaving(false);
    }
  };

  const generateExport = async () => {
    if (bulkWorking) return;
    setBulkWorking(true);
    setBulkError(null);
    try {
      const payload = await exportOpportunityFieldRegistry();
      setExportText(JSON.stringify(payload, null, 2));
      setFeedback('Registry export generated.');
    } catch (exportError) {
      setBulkError(exportError instanceof Error ? exportError.message : '导出 registry 失败。');
    } finally {
      setBulkWorking(false);
    }
  };

  const fillImportFromSelected = () => {
    if (!selectedEntry) return;
    const item: ImportOpportunityFieldRegistryItem = {
      field: selectedEntry.field,
      label: selectedEntry.label,
      kind: selectedEntry.kind,
      source: selectedEntry.source,
      confidence: selectedEntry.confidence,
      ...(selectedEntry.note ? { note: selectedEntry.note } : {}),
    };
    setImportText(JSON.stringify({ items: [item] }, null, 2));
    setBulkError(null);
    setBulkResult(null);
  };

  const runImport = async () => {
    if (bulkWorking) return;
    setBulkWorking(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const items = parseRegistryImportItems(importText);
      const result = await importOpportunityFieldRegistry({
        dryRun: importDryRun,
        updatedBy: 'dashboard-import',
        items,
      });
      setBulkResult(result);
      if (!result.dryRun) {
        await refresh();
        await refreshAudit();
        await refreshReport();
      }
      setFeedback(result.dryRun ? 'Registry import dry-run completed.' : 'Registry import applied.');
    } catch (importError) {
      setBulkError(importError instanceof Error ? importError.message : '导入 registry 失败。');
    } finally {
      setBulkWorking(false);
    }
  };

  return (
    <div className="page field-registry">
      <div className="page-header field-registry-header">
        <h1><SlidersHorizontal size={24} /> Field Registry</h1>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => void Promise.all([refresh(), refreshReport()])}
          disabled={loading}
          data-field-registry-refresh
        >
          <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          刷新
        </button>
      </div>

      <section className="registry-filter-band" data-field-registry-filters>
        <label>
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="field / label / source"
            data-field-registry-search
          />
        </label>
        <label>
          <span>Group</span>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value as RegistrySelectValue<OpportunityFieldRegistryGroup>)}
            data-field-registry-group-filter
          >
            {registryGroups.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Kind</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as RegistrySelectValue<OpportunityFieldEvidenceKind>)}
            data-field-registry-kind-filter
          >
            {registryKinds.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Scope</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as RegistryScope)}
            data-field-registry-scope-filter
          >
            <option value="all">all</option>
            <option value="overridden">overridden</option>
            <option value="base">base</option>
            <option value="custom">custom</option>
          </select>
        </label>
      </section>

      <section className="registry-metrics" data-field-registry-metrics>
        <div><span>Total</span><strong>{metrics.total}</strong></div>
        <div><span>Overrides</span><strong>{metrics.overridden}</strong></div>
        <div><span>Base</span><strong>{metrics.base}</strong></div>
        <div><span>Custom</span><strong>{metrics.custom}</strong></div>
        <div><span>Groups</span><strong>{metrics.groups}</strong></div>
      </section>

      {error && <div className="registry-error">{error}</div>}
      {bulkError && <div className="registry-error" data-field-registry-bulk-error>{bulkError}</div>}

      <section className="registry-governance" data-field-registry-governance>
        <div className="registry-governance-panel registry-report-panel" data-field-registry-report>
          <div className="registry-panel-head">
            <span><FileDiff size={13} /> Diff Report</span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void refreshReport()}
              disabled={reportLoading}
              data-field-registry-report-refresh
            >
              <RefreshCw size={13} className={reportLoading ? 'spin' : undefined} />
              更新
            </button>
          </div>
          {registryReport ? (
            <>
              <div className="registry-report-grid">
                <div><span>Override coverage</span><strong>{registryReport.overrideCoveragePercent}%</strong></div>
                <div><span>Base fields</span><strong>{registryReport.baseFields}</strong></div>
                <div><span>Custom fields</span><strong>{registryReport.customFields}</strong></div>
                <div><span>Recent audit</span><strong>{registryReport.recentAudit.length}</strong></div>
              </div>
              <p className="registry-report-line">
                Drift: {formatRegistryReportBucket(registryReport.changedFieldCounts)}
              </p>
              <p className="registry-report-line">
                Groups: {formatRegistryReportBucket(registryReport.byGroup)}
              </p>
            </>
          ) : (
            <p className="registry-report-line">
              {reportLoading ? 'Loading registry report.' : 'Registry report is unavailable.'}
            </p>
          )}
        </div>

        <div className="registry-governance-panel" data-field-registry-export-panel>
          <div className="registry-panel-head">
            <span><Download size={13} /> Export</span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void generateExport()}
              disabled={bulkWorking}
              data-field-registry-export
            >
              <Download size={13} />
              生成 JSON
            </button>
          </div>
          <textarea
            className="registry-json-box"
            rows={6}
            readOnly
            value={exportText}
            placeholder="点击生成 JSON 后，这里会出现可备份的 registry overrides、effective registry 和 diff report。"
            data-field-registry-export-text
          />
        </div>

        <div className="registry-governance-panel" data-field-registry-import-panel>
          <div className="registry-panel-head">
            <span><Upload size={13} /> Import</span>
            <button
              type="button"
              className="secondary-btn"
              onClick={fillImportFromSelected}
              disabled={!selectedEntry}
              data-field-registry-import-sample
            >
              使用当前字段
            </button>
          </div>
          <textarea
            className="registry-json-box"
            rows={6}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder='粘贴 {"items":[...]} 或导出的 JSON；应用前建议先 dry-run。'
            data-field-registry-import-text
          />
          <div className="registry-import-actions">
            <label>
              <input
                type="checkbox"
                checked={importDryRun}
                onChange={(event) => setImportDryRun(event.target.checked)}
                data-field-registry-import-dry-run
              />
              Dry-run
            </label>
            <button
              type="button"
              className="primary-btn"
              onClick={() => void runImport()}
              disabled={bulkWorking || !importText.trim()}
              data-field-registry-import-run
            >
              <Upload size={13} />
              {bulkWorking ? '处理中...' : importDryRun ? '预演导入' : '应用导入'}
            </button>
          </div>
          {bulkResult && (
            <div className="registry-import-result" data-field-registry-import-result>
              <strong>
                {bulkResult.dryRun ? 'Dry-run' : 'Applied'} · {bulkResult.created} created · {bulkResult.updated} updated · {bulkResult.unchanged} unchanged · {bulkResult.failed} failed
              </strong>
              {bulkResult.items.slice(0, 4).map((item) => (
                <small key={`${item.index}:${item.field}`} className={item.status}>
                  {item.field}: {item.status}
                  {item.changedFields.length > 0 ? ` (${item.changedFields.join(', ')})` : ''}
                  {item.error ? ` · ${item.error}` : ''}
                </small>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="registry-workspace">
        <div className="registry-list" data-field-registry-list>
          {filteredRegistry.map((entry) => {
            const selected = entry.field === selectedEntry?.field;
            const diffs = registryDiffs(entry);
            return (
              <button
                key={entry.field}
                type="button"
                className={`registry-row ${selected ? 'selected' : ''} ${entry.overriddenFields.length || entry.note ? 'overridden' : 'base'}`}
                onClick={() => setSelectedField(entry.field)}
                data-field-registry-row={entry.field}
                aria-pressed={selected}
              >
                <span className="registry-row-main">
                  <strong>{entry.label}</strong>
                  <em>{entry.field}</em>
                </span>
                <span className="registry-row-tags">
                  <span>{entry.group}</span>
                  <span>{entry.kind}</span>
                  <span>{entry.confidence}</span>
                </span>
                <span className="registry-row-diff">
                  {diffs.length > 0
                    ? diffs.slice(0, 3).map((diff) => (
                      <small key={diff.field}>
                        {diff.field}: {diff.base || 'none'} {'->'} {diff.current}
                      </small>
                    ))
                    : <small>base defaults</small>}
                </span>
              </button>
            );
          })}
          {filteredRegistry.length === 0 && (
            <div className="registry-empty">No registry entries match current filters.</div>
          )}
        </div>

        <aside className="registry-editor" data-field-registry-editor-page={selectedEntry?.field || ''}>
          {selectedEntry ? (
            <>
              <div className="registry-editor-head">
                <div>
                  <span>{selectedEntry.group}</span>
                  <h2>{selectedEntry.field}</h2>
                </div>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void resetOverride()}
                  disabled={saving || (selectedEntry.overriddenFields.length === 0 && !selectedEntry.note)}
                  data-field-registry-reset-page
                >
                  <RotateCcw size={13} />
                  重置
                </button>
              </div>

              <div className="registry-diff-grid" data-field-registry-diff>
                {(['label', 'kind', 'source', 'confidence'] as RegistryFieldValue[]).map((fieldName) => (
                  <div
                    key={fieldName}
                    className={selectedEntry.overriddenFields.includes(fieldName) ? 'changed' : ''}
                  >
                    <span>{fieldName}</span>
                    <strong>{selectedEntry[fieldName]}</strong>
                    <small>base: {selectedEntry.base?.[fieldName] || 'none'}</small>
                  </div>
                ))}
              </div>

              <div className="registry-editor-form">
                <label>
                  <span>Label</span>
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    data-field-registry-label-page
                  />
                </label>
                <label>
                  <span>Source</span>
                  <input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    data-field-registry-source-page
                  />
                </label>
                <label>
                  <span>Kind</span>
                  <select
                    value={selectedKind}
                    onChange={(event) => setSelectedKind(event.target.value as OpportunityFieldEvidenceKind)}
                    data-field-registry-kind-page
                  >
                    {registryKinds.filter((value) => value !== 'all').map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Confidence</span>
                  <select
                    value={confidence}
                    onChange={(event) => setConfidence(event.target.value as OpportunitySourceProvenanceConfidence)}
                    data-field-registry-confidence-page
                  >
                    {registryConfidences.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="registry-note-field">
                  <span>Note</span>
                  <textarea
                    value={note}
                    rows={3}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="说明为什么覆盖这个字段默认值"
                    data-field-registry-note-page
                  />
                </label>
              </div>

              <div className="registry-editor-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void saveOverride()}
                  disabled={saving}
                  data-field-registry-save-page
                >
                  <Save size={13} />
                  {saving ? '保存中...' : '保存 Override'}
                </button>
                {feedback && <small data-field-registry-feedback>{feedback}</small>}
                {localError && <small className="error" data-field-registry-error>{localError}</small>}
              </div>

              <div className="registry-history" data-field-registry-history-page>
                <div className="registry-history-head">
                  <span><FileSearch size={12} /> Audit trail</span>
                  <em>{auditLoading ? 'loading' : `${auditItems.length} recent`}</em>
                </div>
                {auditItems.length > 0 ? (
                  auditItems.map((entry) => (
                    <div
                      key={entry.id}
                      className={`registry-history-row ${entry.action}`}
                      data-field-registry-history-row={entry.id}
                    >
                      <strong>{entry.action === 'delete' ? 'Reset' : 'Update'}</strong>
                      <p>{registryAuditSummary(entry)}</p>
                      <small>{entry.updatedBy || 'system'} · {formatRegistryDate(entry.updatedAt)}</small>
                    </div>
                  ))
                ) : (
                  <p className="registry-history-empty">
                    {auditLoading ? 'Loading audit trail.' : 'No registry changes recorded for this field.'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="registry-empty">Select a field to inspect registry defaults.</div>
          )}
        </aside>
      </section>
    </div>
  );
}

export default FieldRegistry;
