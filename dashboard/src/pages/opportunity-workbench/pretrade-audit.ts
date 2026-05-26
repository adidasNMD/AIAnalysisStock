import type { OpportunityActionTimelineEntry, OpportunityEvent, OpportunitySummary } from '../../api';

export type PreTradeAuditTrailSource = 'event' | 'timeline';

export type PreTradeAuditTrailItem = {
  id: string;
  timestamp: string;
  type: 'pretrade_confirmed' | 'pretrade_unconfirmed';
  label: string;
  detail: string;
  status?: string;
  evidence?: string;
  source: PreTradeAuditTrailSource;
};

export type PreTradeAuditTrailSummary = {
  total: number;
  confirmed: number;
  reopened: number;
  latestAt?: string;
  label: string;
  detail: string;
  entries: PreTradeAuditTrailItem[];
};

function compactText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizedEventId(id: string): string {
  return id.startsWith('opp_') ? id.slice(4) : id;
}

function isPreTradeEventType(type: OpportunityEvent['type']): type is PreTradeAuditTrailItem['type'] {
  return type === 'pretrade_confirmed' || type === 'pretrade_unconfirmed';
}

function isPreTradeTimelineEntry(entry: OpportunityActionTimelineEntry): boolean {
  return entry.label.toLowerCase().startsWith('pre-trade')
    || entry.detail.toLowerCase().includes('pre-trade check');
}

function trailItemFromEvent(event: OpportunityEvent): PreTradeAuditTrailItem | null {
  if (!isPreTradeEventType(event.type)) return null;

  const label = compactText(event.meta?.label) || 'Pre-trade check';
  const status = compactText(event.meta?.status);
  const evidence = compactText(event.meta?.evidence);
  const action = event.type === 'pretrade_confirmed' ? 'confirmed' : 'reopened';
  const detailParts = [
    status ? `Status ${status}` : undefined,
    evidence,
  ].filter(Boolean);

  return {
    id: event.id,
    timestamp: event.timestamp,
    type: event.type,
    label: `${label} ${action}`,
    detail: detailParts.length > 0 ? detailParts.join(' · ') : event.message,
    ...(status ? { status } : {}),
    ...(evidence ? { evidence } : {}),
    source: 'event',
  };
}

function trailItemFromTimeline(entry: OpportunityActionTimelineEntry): PreTradeAuditTrailItem | null {
  if (!isPreTradeTimelineEntry(entry)) return null;

  const lowerLabel = entry.label.toLowerCase();
  const type: PreTradeAuditTrailItem['type'] = lowerLabel.includes('reopened')
    ? 'pretrade_unconfirmed'
    : 'pretrade_confirmed';

  return {
    id: normalizedEventId(entry.id),
    timestamp: entry.timestamp,
    type,
    label: entry.label,
    detail: entry.reasonSummary || entry.detail,
    source: 'timeline',
  };
}

export function buildPreTradeAuditTrail(
  opportunity: OpportunitySummary,
  localEvents: OpportunityEvent[] = [],
): PreTradeAuditTrailSummary {
  const byId = new Map<string, PreTradeAuditTrailItem>();
  const addItem = (item: PreTradeAuditTrailItem | null) => {
    if (!item) return;
    const id = normalizedEventId(item.id);
    const existing = byId.get(id);
    if (!existing || (existing.source === 'timeline' && item.source === 'event')) {
      byId.set(id, { ...item, id });
    }
  };

  for (const event of localEvents) addItem(trailItemFromEvent(event));
  for (const entry of opportunity.recentActionTimeline || []) addItem(trailItemFromTimeline(entry));

  const entries = [...byId.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const confirmed = entries.filter((entry) => entry.type === 'pretrade_confirmed').length;
  const reopened = entries.filter((entry) => entry.type === 'pretrade_unconfirmed').length;
  const latestAt = entries[0]?.timestamp;

  return {
    total: entries.length,
    confirmed,
    reopened,
    ...(latestAt ? { latestAt } : {}),
    label: entries.length > 0 ? `${confirmed} confirmed / ${reopened} reopened` : 'No audit events',
    detail: entries.length > 0
      ? '人工处理记录已进入 Opportunity 事件流，可用于复盘。'
      : '还没有写入事件流的交易前人工处理记录。',
    entries,
  };
}
