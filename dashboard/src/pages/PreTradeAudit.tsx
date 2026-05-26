import { ExternalLink, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  OpportunityPreTradeAuditCategory,
  OpportunityPreTradeAuditItem,
  OpportunityPreTradeAuditStatus,
} from '../api';
import { useOpportunityPreTradeAuditQuery } from '../queries/pretrade-audit-queries';
import './pretrade-audit.css';

type CategoryFilter = OpportunityPreTradeAuditCategory | 'all';
type StatusFilter = OpportunityPreTradeAuditStatus | 'all';

const categoryOptions: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pretrade', label: '确认/恢复' },
  { value: 'catalyst_blocker', label: '催化阻塞' },
  { value: 'evidence', label: '人工证据' },
];

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'block', label: 'Block' },
  { value: 'warn', label: 'Warn' },
  { value: 'pass', label: 'Pass' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'ready', label: 'Ready' },
  { value: 'watch', label: 'Watch' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'invalidated', label: 'Invalidated' },
  { value: 'restored', label: 'Restored' },
];

function formatDateTime(value?: string) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function categoryLabel(value: OpportunityPreTradeAuditCategory) {
  return categoryOptions.find((option) => option.value === value)?.label || value;
}

function auditTone(item: OpportunityPreTradeAuditItem) {
  if (item.status === 'block' || item.readiness === 'blocked' || item.category === 'catalyst_blocker') return 'blocked';
  if (item.eventType === 'pretrade_confirmed' || item.status === 'pass' || item.readiness === 'ready') return 'ready';
  if (item.status === 'warn' || item.readiness === 'watch') return 'watch';
  if (item.status === 'invalidated') return 'invalidated';
  if (item.status === 'restored') return 'restored';
  return item.category;
}

export function PreTradeAudit() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [opportunityId, setOpportunityId] = useState(searchParams.get('opportunityId') || '');
  const [category, setCategory] = useState<CategoryFilter>((searchParams.get('category') as CategoryFilter | null) || 'all');
  const [status, setStatus] = useState<StatusFilter>((searchParams.get('status') as StatusFilter | null) || 'all');

  const request = useMemo(() => ({
    limit: 140,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(opportunityId.trim() ? { opportunityId: opportunityId.trim() } : {}),
    category,
    status,
  }), [category, opportunityId, q, status]);
  const { data, error, loading, refresh } = useOpportunityPreTradeAuditQuery(request);
  const items = data?.items || [];
  const metrics = data?.metrics;

  return (
    <div className="page pretrade-audit-page" data-pretrade-audit-page>
      <div className="page-header pretrade-audit-header">
        <div>
          <span className="eyebrow">Pre-trade Audit Center</span>
          <h1><ShieldCheck size={24} /> 交易前审计</h1>
          <p>把交易前确认、恢复、催化阻塞项和人工 evidence 放到一条可查询的审计线上。</p>
        </div>
        <button type="button" className="secondary-btn" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} /> 刷新
        </button>
      </div>

      <section className="pretrade-audit-metrics" data-pretrade-audit-metrics>
        <div>
          <span>Total</span>
          <strong>{metrics?.total ?? 0}</strong>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>{metrics?.confirmations ?? 0}</strong>
        </div>
        <div>
          <span>Blockers</span>
          <strong>{metrics?.blockers ?? 0}</strong>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{metrics?.evidence ?? 0}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{metrics?.blocked ?? 0}</strong>
        </div>
      </section>

      <section className="pretrade-audit-filters">
        <label>
          <span>搜索</span>
          <div className="filter-input">
            <Search size={14} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="检查项、催化、字段、note"
              data-pretrade-audit-search
            />
          </div>
        </label>
        <label>
          <span>Opportunity</span>
          <input
            value={opportunityId}
            onChange={(event) => setOpportunityId(event.target.value)}
            placeholder="opp-relay-ai-power"
            data-pretrade-audit-opportunity
          />
        </label>
        <label>
          <span>类别</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryFilter)}
            data-pretrade-audit-category
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>状态</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            data-pretrade-audit-status
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      {error && <div className="pretrade-audit-error">{error}</div>}

      <section className="pretrade-audit-list" aria-busy={loading}>
        {items.length === 0 && (
          <div className="empty-state" data-pretrade-audit-empty>
            暂无匹配的交易前审计记录。
          </div>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className={`pretrade-audit-row ${auditTone(item)}`}
            data-pretrade-audit-row={item.category}
            data-pretrade-audit-status={item.status || item.readiness || 'none'}
          >
            <div className="pretrade-audit-row-main">
              <div className="pretrade-audit-row-title">
                <span className={`pretrade-audit-pill ${auditTone(item)}`}>{categoryLabel(item.category)}</span>
                <strong>{item.label}</strong>
              </div>
              <p>{item.detail}</p>
              <div className="pretrade-audit-row-meta">
                <span>{item.opportunityId}</span>
                <span>{formatDateTime(item.timestamp)}</span>
                {item.status && <span>Status {item.status}</span>}
                {item.readiness && <span>Readiness {item.readiness}</span>}
                {item.actionKind && <span>{item.actionKind}</span>}
                {item.catalystUrgency && <span>{item.catalystUrgency}</span>}
                {item.field && <span>{item.field}</span>}
              </div>
            </div>
            <div className="pretrade-audit-row-actions">
              {item.evidence && <span className="pretrade-audit-note">{item.evidence}</span>}
              <Link to={`/?opportunityId=${encodeURIComponent(item.opportunityId)}`} className="secondary-btn tiny">
                <ExternalLink size={13} /> 打开
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default PreTradeAudit;
