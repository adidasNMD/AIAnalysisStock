import { CalendarClock, Download, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  opportunityCatalystReminderCalendarUrl,
  type OpportunityCatalystReminderAuditItem,
  type OpportunityCatalystReminderPreference,
} from '../api';
import { useOpportunityCatalystReminderAuditQuery } from '../queries/catalyst-reminder-queries';
import './catalyst-reminders.css';

type ReminderPreferenceFilter = OpportunityCatalystReminderPreference | 'all';

const preferenceOptions: Array<{ value: ReminderPreferenceFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'subscribe', label: '订阅' },
  { value: 'unsubscribe', label: '取消订阅' },
  { value: 'acknowledge', label: '已处理' },
  { value: 'snooze', label: '稍后' },
  { value: 'reopen', label: '恢复' },
];

function formatDateTime(value?: string) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function preferenceLabel(value: OpportunityCatalystReminderPreference) {
  return preferenceOptions.find((item) => item.value === value)?.label || value;
}

function preferenceTone(item: OpportunityCatalystReminderAuditItem) {
  if (item.activeSubscription) return 'active';
  if (item.preference === 'subscribe') return 'subscribed';
  if (item.preference === 'snooze') return 'snoozed';
  if (item.preference === 'acknowledge') return 'handled';
  if (item.preference === 'unsubscribe' || item.preference === 'reopen') return 'neutral';
  return 'neutral';
}

export function CatalystReminders() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [opportunityId, setOpportunityId] = useState(searchParams.get('opportunityId') || '');
  const [preference, setPreference] = useState<ReminderPreferenceFilter>(
    (searchParams.get('preference') as ReminderPreferenceFilter | null) || 'all',
  );
  const [activeOnly, setActiveOnly] = useState(searchParams.get('activeOnly') === '1');

  const request = useMemo(() => ({
    limit: 120,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(opportunityId.trim() ? { opportunityId: opportunityId.trim() } : {}),
    preference,
    activeOnly,
  }), [activeOnly, opportunityId, preference, q]);
  const { data, error, loading, refresh } = useOpportunityCatalystReminderAuditQuery(request);
  const items = data?.items || [];
  const metrics = data?.metrics;
  const calendarHref = opportunityCatalystReminderCalendarUrl({
    ...request,
    preference: 'subscribe',
    activeOnly: true,
    limit: 200,
  });

  return (
    <div className="page catalyst-reminders-page" data-catalyst-reminders-page>
      <div className="page-header catalyst-reminders-header">
        <div>
          <span className="eyebrow">Catalyst Reminder Center</span>
          <h1><CalendarClock size={24} /> 催化提醒</h1>
          <p>查看人工处理、稍后、订阅和取消订阅记录，并导出当前仍有效的提醒日历。</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} /> 刷新
          </button>
          <a
            className="primary-btn"
            href={calendarHref}
            download="opportunity-catalyst-reminders.ics"
            data-catalyst-calendar-export
          >
            <Download size={15} /> 导出 ICS
          </a>
        </div>
      </div>

      <section className="catalyst-reminder-metrics" data-catalyst-reminder-metrics>
        <div>
          <span>Active subscriptions</span>
          <strong>{metrics?.activeSubscriptions ?? 0}</strong>
        </div>
        <div>
          <span>Subscribed</span>
          <strong>{metrics?.subscribed ?? 0}</strong>
        </div>
        <div>
          <span>Snoozed</span>
          <strong>{metrics?.snoozed ?? 0}</strong>
        </div>
        <div>
          <span>Handled</span>
          <strong>{metrics?.acknowledged ?? 0}</strong>
        </div>
      </section>

      <section className="catalyst-reminder-filters">
        <label>
          <span>搜索</span>
          <div className="filter-input">
            <Search size={14} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="催化、机会、note"
              data-catalyst-reminder-search
            />
          </div>
        </label>
        <label>
          <span>Opportunity</span>
          <input
            value={opportunityId}
            onChange={(event) => setOpportunityId(event.target.value)}
            placeholder="opp-relay-ai-power"
            data-catalyst-reminder-opportunity
          />
        </label>
        <label>
          <span>偏好</span>
          <select
            value={preference}
            onChange={(event) => setPreference(event.target.value as ReminderPreferenceFilter)}
            data-catalyst-reminder-preference
          >
            {preferenceOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => setActiveOnly(event.target.checked)}
            data-catalyst-reminder-active-only
          />
          <span>仅有效订阅</span>
        </label>
      </section>

      {error && <div className="inline-error">{error}</div>}

      <section className="catalyst-reminder-center-list" aria-busy={loading}>
        {items.length === 0 && (
          <div className="empty-state" data-catalyst-reminder-empty>
            暂无匹配的催化提醒审计记录。
          </div>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className={`catalyst-reminder-row ${preferenceTone(item)}`}
            data-catalyst-reminder-row={item.preference}
            data-catalyst-reminder-active={item.activeSubscription ? 'true' : 'false'}
          >
            <div className="catalyst-reminder-row-main">
              <div className="catalyst-reminder-row-title">
                <span className={`status-pill ${preferenceTone(item)}`}>
                  {item.activeSubscription ? '有效订阅' : preferenceLabel(item.preference)}
                </span>
                <strong>{item.catalystLabel}</strong>
              </div>
              <p>{item.message}</p>
              <div className="catalyst-reminder-row-meta">
                <span>{item.opportunityId}</span>
                <span>{formatDateTime(item.timestamp)}</span>
                {item.catalystDueAt && <span>Due {formatDateTime(item.catalystDueAt)}</span>}
                {item.subscriptionLeadDays !== undefined && <span>{item.subscriptionLeadDays}d lead</span>}
                {item.urgency && <span>{item.urgency}</span>}
              </div>
            </div>
            <div className="catalyst-reminder-row-actions">
              {item.note && <span className="catalyst-reminder-row-note">{item.note}</span>}
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

export default CatalystReminders;
