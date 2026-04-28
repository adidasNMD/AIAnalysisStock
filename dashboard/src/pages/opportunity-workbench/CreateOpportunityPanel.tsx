import type { Dispatch, SetStateAction } from 'react';
import type { DraftState } from './model';
import { typeMeta } from './model';

type CreateOpportunityPanelProps = {
  draft: DraftState;
  setDraft: Dispatch<SetStateAction<DraftState>>;
  actionError: string | null;
  submitting: 'save' | 'analyze' | null;
  onApplyTemplate: (type: DraftState['type']) => void;
  onPersist: (mode: 'save' | 'analyze') => void;
};

export function CreateOpportunityPanel({
  draft,
  setDraft,
  actionError,
  submitting,
  onApplyTemplate,
  onPersist,
}: CreateOpportunityPanelProps) {
  return (
    <div className="opportunity-create glass-panel">
      <div className="op-create-header">
        <div>
          <h3>创建机会卡</h3>
          <p>保留原有 Mission 执行流，在上层先定义交易机会对象。</p>
        </div>
        <div className="op-template-row">
          {(['ipo_spinout', 'relay_chain', 'proxy_narrative'] as const).map((type) => {
            const meta = typeMeta(type);
            const Icon = meta.icon;
            return (
              <button key={type} type="button" className={`template-chip ${draft.type === type ? 'active' : ''}`} onClick={() => onApplyTemplate(type)}>
                <Icon size={14} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="op-create-form">
        <input
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="机会标题，例如 CoreWeave 传导链 / Sandisk 再定义 / 港股 AI 代理变量"
        />
        <input
          value={draft.query}
          onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
          placeholder="用于触发分析的 query，可写主题、ticker 或问题"
        />
        <textarea
          value={draft.thesis}
          onChange={(event) => setDraft((current) => ({ ...current, thesis: event.target.value }))}
          placeholder="一句话 thesis：为什么这个机会值得跟踪"
          rows={3}
        />
        <div className="op-form-row">
          <input value={draft.primaryTicker || ''} onChange={(event) => setDraft((current) => ({ ...current, primaryTicker: event.target.value }))} placeholder="Primary" />
          <input value={draft.leaderTicker || ''} onChange={(event) => setDraft((current) => ({ ...current, leaderTicker: event.target.value }))} placeholder="Leader" />
          <input value={draft.proxyTicker || ''} onChange={(event) => setDraft((current) => ({ ...current, proxyTicker: event.target.value }))} placeholder="Proxy" />
        </div>
        <div className="op-form-row">
          <input value={draft.relatedTickersText} onChange={(event) => setDraft((current) => ({ ...current, relatedTickersText: event.target.value }))} placeholder="Related tickers, comma separated" />
          <input value={draft.relayTickersText} onChange={(event) => setDraft((current) => ({ ...current, relayTickersText: event.target.value }))} placeholder="Relay / laggard tickers, comma separated" />
        </div>
        <div className="op-form-row">
          <input value={draft.nextCatalystAt || ''} onChange={(event) => setDraft((current) => ({ ...current, nextCatalystAt: event.target.value }))} placeholder="Next catalyst date / note" />
          <input value={draft.supplyOverhang || ''} onChange={(event) => setDraft((current) => ({ ...current, supplyOverhang: event.target.value }))} placeholder="Supply overhang / retained stake / lockup" />
          <input value={draft.policyStatus || ''} onChange={(event) => setDraft((current) => ({ ...current, policyStatus: event.target.value }))} placeholder="Policy / rule status" />
        </div>
        {draft.type === 'ipo_spinout' && (
          <>
            <div className="op-form-row">
              <input value={draft.officialTradingDate} onChange={(event) => setDraft((current) => ({ ...current, officialTradingDate: event.target.value }))} placeholder="Official trading date" />
              <input value={draft.spinoutDate} onChange={(event) => setDraft((current) => ({ ...current, spinoutDate: event.target.value }))} placeholder="Spinout / separation date" />
              <input value={draft.retainedStakePercentText} onChange={(event) => setDraft((current) => ({ ...current, retainedStakePercentText: event.target.value }))} placeholder="Retained stake %" />
            </div>
            <div className="op-form-row">
              <input value={draft.lockupDate} onChange={(event) => setDraft((current) => ({ ...current, lockupDate: event.target.value }))} placeholder="Lockup / unlock date" />
              <input value={draft.firstIndependentEarningsAt} onChange={(event) => setDraft((current) => ({ ...current, firstIndependentEarningsAt: event.target.value }))} placeholder="First independent earnings" />
              <input value={draft.firstCoverageAt} onChange={(event) => setDraft((current) => ({ ...current, firstCoverageAt: event.target.value }))} placeholder="First sell-side coverage" />
            </div>
            <input value={draft.greenshoeStatus} onChange={(event) => setDraft((current) => ({ ...current, greenshoeStatus: event.target.value }))} placeholder="Greenshoe / stabilization note" />
          </>
        )}
        {actionError && <div className="mode-hint" style={{ color: 'var(--accent-crimson)' }}>{actionError}</div>}
        <div className="op-form-actions">
          <button type="button" className="secondary-btn" onClick={() => onPersist('save')} disabled={submitting !== null}>
            {submitting === 'save' ? '创建中...' : '仅创建机会卡'}
          </button>
          <button type="button" onClick={() => onPersist('analyze')} disabled={submitting !== null}>
            {submitting === 'analyze' ? '创建并分析中...' : '创建并发起分析'}
          </button>
        </div>
      </div>
    </div>
  );
}
