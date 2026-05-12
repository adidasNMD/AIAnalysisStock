import { ExternalLink, History, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  OpportunityType,
  OpportunityReviewPlaybackCategory,
  OpportunityReviewPlaybackItem,
  OpportunityReviewPlaybackPriceCacheStatus,
  OpportunityReviewPlaybackPerformanceSignal,
  OpportunityReviewPlaybackStrategyBacktestGroup,
  OpportunityReviewPlaybackTone,
  OpportunityReviewPlaybackTradeLeg,
} from '../api';
import { useOpportunityReviewPlaybackQuery } from '../queries/review-playback-queries';
import {
  buildReviewPlaybackSavedViewLabel,
  orderReviewPlaybackSavedViews,
  readStoredReviewPlaybackSavedViews,
  writeStoredReviewPlaybackSavedViews,
  type ReviewPlaybackFilterSnapshot,
} from './review-playback-saved-views';
import { buildReviewPlaybackBacktestWorkspace } from './review-playback-workspace';
import './review-playback.css';

type CategoryFilter = OpportunityReviewPlaybackCategory | 'all';
type ToneFilter = OpportunityReviewPlaybackTone | 'all';
type StrategyFilter = OpportunityType | 'all';

const categoryOptions: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'mission', label: 'Mission' },
  { value: 'pretrade', label: '交易前' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'catalyst', label: '催化' },
  { value: 'thesis', label: 'Thesis' },
  { value: 'signal', label: 'Signal' },
  { value: 'status', label: '状态' },
];

const toneOptions: Array<{ value: ToneFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'negative', label: 'Risk' },
  { value: 'warning', label: 'Review' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
];

const strategyOptions: Array<{ value: StrategyFilter; label: string }> = [
  { value: 'all', label: '全部策略族' },
  { value: 'relay_chain', label: 'Relay chain' },
  { value: 'proxy_narrative', label: 'Proxy narrative' },
  { value: 'ipo_spinout', label: 'IPO / spinout' },
  { value: 'ad_hoc', label: 'Ad hoc' },
];

function initialStrategyFilter(value: string | null): StrategyFilter {
  return strategyOptions.some((option) => option.value === value) ? value as StrategyFilter : 'all';
}

function formatDateTime(value?: string) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function categoryLabel(value: OpportunityReviewPlaybackCategory) {
  return categoryOptions.find((option) => option.value === value)?.label || value;
}

function toneLabel(value: OpportunityReviewPlaybackTone) {
  return toneOptions.find((option) => option.value === value)?.label || value;
}

function formatSignedNumber(value?: number, suffix = '') {
  if (value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value}${suffix}`;
}

function formatPercent(value?: number) {
  return formatSignedNumber(value, '%');
}

function formatUnsignedPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value}%`;
}

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '';
  return `$${value.toFixed(value >= 100 ? 2 : 3).replace(/\.?0+$/, '')}`;
}

function formatCurrency(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatQuantity(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatAgeHours(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return 'n/a';
  if (value < 1) return '<1h';
  return `${value}h`;
}

function priceCacheStatusLabel(status: OpportunityReviewPlaybackPriceCacheStatus) {
  switch (status) {
    case 'fresh':
      return 'Fresh';
    case 'stale':
      return 'Stale';
    case 'missing':
      return 'Missing';
    default:
      return 'Unknown';
  }
}

function signalText(signal?: OpportunityReviewPlaybackPerformanceSignal) {
  if (!signal) return 'n/a';
  const price = formatPrice(signal.price);
  return `${signal.label}${price ? ` @ ${price}` : ''} · ${formatDateTime(signal.at)}`;
}

function tradeSizeText(trade: OpportunityReviewPlaybackTradeLeg) {
  const parts = [
    trade.closedPct !== undefined && trade.status !== 'open' ? `${trade.closedPct}% closed` : undefined,
    trade.remainingPct !== undefined && trade.status !== 'closed' ? `${trade.remainingPct}% open` : undefined,
    trade.positionPct !== undefined ? `${trade.positionPct}% exposure` : undefined,
    trade.exitQuantity !== undefined ? `${formatQuantity(trade.exitQuantity)} sh exit` : undefined,
    trade.remainingQuantity !== undefined && trade.status === 'open' ? `${formatQuantity(trade.remainingQuantity)} sh open` : undefined,
    trade.notionalUsd !== undefined ? formatCurrency(trade.notionalUsd) : undefined,
  ].filter(Boolean);
  return parts.join(' · ') || 'unsized';
}

function tradeContributionText(trade: OpportunityReviewPlaybackTradeLeg) {
  const contribution = formatPercent(trade.riskReward?.returnContributionPct);
  const drawdown = formatPercent(trade.riskReward?.drawdownContributionPct);
  if (contribution === 'n/a' && drawdown === 'n/a') return trade.riskReward?.outcome || 'n/a';
  return `${contribution} / ${drawdown}`;
}

function tradeAttributionText(trade: OpportunityReviewPlaybackTradeLeg) {
  const attribution = trade.exitAttribution;
  if (!attribution) return trade.status === 'open' ? 'open plan' : 'unclassified';
  const parts = [
    attribution.label,
    attribution.riskRewardRatio !== undefined ? `R/R ${attribution.riskRewardRatio}` : undefined,
    attribution.stopLossPrice !== undefined ? `stop ${formatPrice(attribution.stopLossPrice)}` : undefined,
    attribution.targetPrice !== undefined ? `target ${formatPrice(attribution.targetPrice)}` : undefined,
    attribution.riskBudgetPct !== undefined ? `risk ${formatPercent(attribution.riskBudgetPct)}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

function attributionSummaryText(position?: { exitAttributions?: Array<{ label: string; count: number }> }) {
  const items = position?.exitAttributions || [];
  if (items.length === 0) return 'n/a';
  return items.slice(0, 3).map((item) => `${item.label} ${item.count}`).join(' · ');
}

function executionSummaryText(position?: { executionQuality?: Array<{ label: string; count: number }> }) {
  const items = position?.executionQuality || [];
  if (items.length === 0) return 'n/a';
  return items.slice(0, 3).map((item) => `${item.label} ${item.count}`).join(' · ');
}

function repairSummaryText(position?: { planRepairSuggestions?: Array<{ label: string; count: number }> }) {
  const items = position?.planRepairSuggestions || [];
  if (items.length === 0) return 'none';
  return items.slice(0, 3).map((item) => `${item.label} ${item.count}`).join(' · ');
}

function sizingRuleSummaryText(position?: { sizingRules?: Array<{ label: string; count: number }> }) {
  const items = position?.sizingRules || [];
  if (items.length === 0) return 'n/a';
  return items.slice(0, 3).map((item) => `${item.label} ${item.count}`).join(' · ');
}

function riskBacktestSegmentKindLabel(kind: string) {
  if (kind === 'opportunity_type') return 'Type';
  if (kind === 'stage') return 'Stage';
  if (kind === 'status') return 'Status';
  return 'Slice';
}

function strategyBacktestIssueText(group?: OpportunityReviewPlaybackStrategyBacktestGroup) {
  if (!group) return 'n/a';
  const issues = group.oversizedLegs + group.executionIssueLegs + group.planRepairLegs;
  return `${issues} issues`;
}

function tradeExecutionQualityText(trade: OpportunityReviewPlaybackTradeLeg) {
  const quality = trade.executionQuality;
  if (!quality) return 'n/a';
  const parts = [
    quality.label,
    quality.planCompleteness !== 'missing' ? `plan ${quality.planCompleteness}` : 'plan missing',
    quality.targetCapturePct !== undefined ? `capture ${formatPercent(quality.targetCapturePct)}` : undefined,
    quality.slippagePct !== undefined ? `slip ${formatPercent(quality.slippagePct)}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

function tradeRepairSuggestionText(trade: OpportunityReviewPlaybackTradeLeg) {
  const suggestions = trade.executionQuality?.repairSuggestions || [];
  if (suggestions.length === 0) return 'none';
  return suggestions.slice(0, 2).map((suggestion) => suggestion.label).join(' · ');
}

function tradeSizingRuleText(trade: OpportunityReviewPlaybackTradeLeg) {
  const rule = trade.sizingRule;
  if (!rule) return 'n/a';
  const parts = [
    rule.label,
    rule.riskAtStopPct !== undefined ? `risk ${formatUnsignedPercent(rule.riskAtStopPct)}` : undefined,
    rule.riskBudgetUsedPct !== undefined ? `used ${formatUnsignedPercent(rule.riskBudgetUsedPct)}` : undefined,
    rule.remainingExposurePct !== undefined ? `open ${formatUnsignedPercent(rule.remainingExposurePct)}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

function itemRoute(item: OpportunityReviewPlaybackItem) {
  if (item.missionId && item.category === 'mission') {
    return `/missions/${encodeURIComponent(item.missionId)}`;
  }
  return `/?opportunityId=${encodeURIComponent(item.opportunityId)}`;
}

function createReviewPlaybackSavedViewId() {
  return `review-playback-view-${Date.now().toString(36)}`;
}

export function ReviewPlayback() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [opportunityId, setOpportunityId] = useState(searchParams.get('opportunityId') || '');
  const [category, setCategory] = useState<CategoryFilter>((searchParams.get('category') as CategoryFilter | null) || 'all');
  const [tone, setTone] = useState<ToneFilter>((searchParams.get('tone') as ToneFilter | null) || 'all');
  const [backtestTicker, setBacktestTicker] = useState(searchParams.get('backtestTicker') || '');
  const [backtestFrom, setBacktestFrom] = useState(searchParams.get('backtestFrom') || '');
  const [backtestTo, setBacktestTo] = useState(searchParams.get('backtestTo') || '');
  const [backtestStrategy, setBacktestStrategy] = useState<StrategyFilter>(
    initialStrategyFilter(searchParams.get('backtestStrategy')),
  );
  const [savedViews, setSavedViews] = useState(() => readStoredReviewPlaybackSavedViews());
  const [selectedSavedViewId, setSelectedSavedViewId] = useState('');
  const [savedViewLabel, setSavedViewLabel] = useState('');
  const [savedViewFeedback, setSavedViewFeedback] = useState('');

  const currentSnapshot = useMemo<ReviewPlaybackFilterSnapshot>(() => ({
    q: q.trim(),
    opportunityId: opportunityId.trim(),
    category,
    tone,
    backtestTicker: backtestTicker.trim().replace(/^\$/, '').toUpperCase(),
    backtestStrategy,
    backtestFrom,
    backtestTo,
  }), [backtestFrom, backtestStrategy, backtestTicker, backtestTo, category, opportunityId, q, tone]);
  const request = useMemo(() => ({
    limit: 160,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(opportunityId.trim() ? { opportunityId: opportunityId.trim() } : {}),
    ...(backtestTicker.trim() ? { backtestTicker: backtestTicker.trim() } : {}),
    ...(backtestFrom ? { backtestFrom } : {}),
    ...(backtestTo ? { backtestTo } : {}),
    ...(backtestStrategy !== 'all' ? { backtestStrategy } : {}),
    category,
    tone,
  }), [backtestFrom, backtestStrategy, backtestTicker, backtestTo, category, opportunityId, q, tone]);
  const { data, error, loading, refresh } = useOpportunityReviewPlaybackQuery(request);
  const items = data?.items || [];
  const metrics = data?.metrics;
  const outcome = data?.outcome;
  const performance = data?.performance;
  const priceCache = performance?.priceCache;
  const riskBacktest = performance?.riskBacktest;
  const strategyBacktest = performance?.strategyBacktest;
  const riskBacktestSegments = riskBacktest?.segments || [];
  const trades = performance?.trades || [];
  const position = performance?.position;
  const positionSizingRules = position?.sizingRules || [];
  const positionPlanRepairs = position?.planRepairSuggestions || [];
  const backtestWorkspace = useMemo(
    () => buildReviewPlaybackBacktestWorkspace(performance),
    [performance],
  );

  function applySnapshot(snapshot: ReviewPlaybackFilterSnapshot) {
    setQ(snapshot.q);
    setOpportunityId(snapshot.opportunityId);
    setCategory(snapshot.category);
    setTone(snapshot.tone);
    setBacktestTicker(snapshot.backtestTicker);
    setBacktestStrategy(snapshot.backtestStrategy);
    setBacktestFrom(snapshot.backtestFrom);
    setBacktestTo(snapshot.backtestTo);
  }

  function handleSaveView() {
    const now = new Date().toISOString();
    const existing = savedViews.find((view) => view.id === selectedSavedViewId);
    const label = (savedViewLabel.trim() || existing?.label || buildReviewPlaybackSavedViewLabel(currentSnapshot)).slice(0, 80);
    const view = {
      id: existing?.id || createReviewPlaybackSavedViewId(),
      label,
      filters: currentSnapshot,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const next = orderReviewPlaybackSavedViews([
      view,
      ...savedViews.filter((item) => item.id !== view.id),
    ]);
    if (writeStoredReviewPlaybackSavedViews(next)) {
      setSavedViews(next);
      setSelectedSavedViewId(view.id);
      setSavedViewLabel(view.label);
      setSavedViewFeedback(`已保存 ${view.label}`);
    } else {
      setSavedViewFeedback('保存失败：浏览器存储不可用');
    }
  }

  function handleApplySavedView() {
    const view = savedViews.find((item) => item.id === selectedSavedViewId);
    if (!view) {
      setSavedViewFeedback('请选择一个已保存视图');
      return;
    }
    applySnapshot(view.filters);
    setSavedViewLabel(view.label);
    setSavedViewFeedback(`已应用 ${view.label}`);
  }

  function handleDeleteSavedView() {
    const view = savedViews.find((item) => item.id === selectedSavedViewId);
    if (!view) {
      setSavedViewFeedback('请选择一个已保存视图');
      return;
    }
    const next = savedViews.filter((item) => item.id !== view.id);
    if (writeStoredReviewPlaybackSavedViews(next)) {
      setSavedViews(next);
      setSelectedSavedViewId('');
      setSavedViewLabel('');
      setSavedViewFeedback(`已删除 ${view.label}`);
    } else {
      setSavedViewFeedback('删除失败：浏览器存储不可用');
    }
  }

  function handleClearFilters() {
    applySnapshot({
      q: '',
      opportunityId: '',
      category: 'all',
      tone: 'all',
      backtestTicker: '',
      backtestStrategy: 'all',
      backtestFrom: '',
      backtestTo: '',
    });
    setSavedViewFeedback('已清空筛选');
  }

  return (
    <div className="page review-playback-page" data-review-playback-page>
      <div className="page-header review-playback-header">
        <div>
          <span className="eyebrow">Strategy Review Playback</span>
          <h1><History size={24} /> 复盘回放</h1>
          <p>把 Mission 结果、机会事件、交易前检查、催化处理和字段级 evidence 串成一条可过滤的复盘时间线。</p>
        </div>
        <button type="button" className="secondary-btn" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} /> 刷新
        </button>
      </div>

      <section className="review-playback-metrics" data-review-playback-metrics>
        <div>
          <span>Total</span>
          <strong>{metrics?.total ?? 0}</strong>
        </div>
        <div>
          <span>Mission</span>
          <strong>{metrics?.missions ?? 0}</strong>
        </div>
        <div>
          <span>Pre-trade</span>
          <strong>{metrics?.pretrade ?? 0}</strong>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{metrics?.evidence ?? 0}</strong>
        </div>
        <div>
          <span>Risk</span>
          <strong>{metrics?.risks ?? 0}</strong>
        </div>
      </section>

      <section
        className={`review-playback-outcome ${outcome?.status || 'quiet'}`}
        data-review-playback-outcome={outcome?.status || 'quiet'}
      >
        <div className="review-playback-outcome-main">
          <span>Outcome Summary</span>
          <h2>{outcome?.headline || '暂无复盘信号'}</h2>
          <p>{outcome?.detail || '当前过滤条件下没有新的复盘结果。'}</p>
          {outcome?.nextStep && <strong>{outcome.nextStep}</strong>}
        </div>
        <div className="review-playback-outcome-score">
          <span>Risk score</span>
          <strong>{outcome?.score ?? 0}</strong>
        </div>
        <div className="review-playback-outcome-facts">
          <span>Blockers {outcome?.blockers ?? 0}</span>
          <span>Failed {outcome?.failedMissions ?? 0}</span>
          <span>Done {outcome?.completedMissions ?? 0}</span>
          <span>Evidence {outcome?.evidenceRecorded ?? 0}</span>
          <span>Invalidated {outcome?.evidenceInvalidated ?? 0}</span>
        </div>
      </section>

      <section
        className={`review-playback-performance ${performance?.status || 'insufficient_data'}`}
        data-review-playback-performance={performance?.status || 'insufficient_data'}
      >
        <div className="review-playback-performance-main">
          <span>Performance / Risk</span>
          <h2>{performance?.symbol ? `${performance.symbol} · ${performance.headline}` : performance?.headline || '暂无可复盘交易结果'}</h2>
          <p>{performance?.detail || '当前过滤条件下还没有可用于收益或回撤复盘的数据。'}</p>
          {performance?.nextStep && <strong>{performance.nextStep}</strong>}
        </div>
        <div className="review-playback-performance-grid" data-review-playback-performance-facts>
          <div>
            <span>Entry</span>
            <strong>{signalText(performance?.entrySignal)}</strong>
          </div>
          <div>
            <span>Exit / Risk</span>
            <strong>{signalText(performance?.exitSignal)}</strong>
          </div>
          <div>
            <span>Holding</span>
            <strong>{performance?.holdingDays !== undefined ? `${performance.holdingDays}d` : 'n/a'}</strong>
          </div>
          <div>
            <span>Return</span>
            <strong>{formatPercent(performance?.returnPct)}</strong>
          </div>
          <div>
            <span>Peak return</span>
            <strong>{formatPercent(performance?.peakReturnPct)}</strong>
          </div>
          <div>
            <span>Heat delta</span>
            <strong>{formatSignedNumber(performance?.heatDelta)}</strong>
          </div>
          <div>
            <span>{performance?.maxDrawdownPct !== undefined ? 'Max DD' : 'Max DD proxy'}</span>
            <strong>{formatPercent(performance?.maxDrawdownPct ?? performance?.heatMaxDrawdownPct)}</strong>
          </div>
          <div>
            <span>Pre-trade block</span>
            <strong>{performance?.pretradeBlockHit ? `${performance.pretradeBlockers} hit` : 'clear'}</strong>
          </div>
          <div>
            <span>Catalysts</span>
            <strong>{performance?.triggeredCatalysts ?? 0}</strong>
          </div>
          <div>
            <span>Data</span>
            <strong>{performance?.priceSource || performance?.dataQuality || 'missing'}</strong>
          </div>
          <div>
            <span>Price points</span>
            <strong>{performance?.pricePointCount ?? 'n/a'}</strong>
          </div>
        </div>
        {strategyBacktest && (
          <div
            className={`review-playback-strategy-backtest ${strategyBacktest.status}`}
            data-review-playback-strategy-backtest={strategyBacktest.status}
          >
            <div className="review-playback-strategy-backtest-main">
              <span>Strategy backtest</span>
              <strong>{strategyBacktest.headline}</strong>
              <p>{strategyBacktest.detail || '暂无策略族级别的回测样本。'}</p>
            </div>
            <div className="review-playback-strategy-backtest-grid">
              <div>
                <span>Filter</span>
                <strong>{strategyBacktest.filterLabel}</strong>
              </div>
              <div>
                <span>Coverage</span>
                <strong>{strategyBacktest.coveredStrategies}/{strategyBacktest.totalStrategies}</strong>
              </div>
              <div>
                <span>Priced legs</span>
                <strong>{strategyBacktest.pricedLegs}/{strategyBacktest.closedLegs}</strong>
              </div>
              <div>
                <span>Best strategy</span>
                <strong>{strategyBacktest.bestGroup?.label || 'n/a'}</strong>
              </div>
              <div>
                <span>Best avg</span>
                <strong>{formatPercent(strategyBacktest.bestGroup?.avgReturnPct)}</strong>
              </div>
              <div>
                <span>Weakest</span>
                <strong>{strategyBacktest.weakestGroup?.label || 'n/a'}</strong>
              </div>
              <div>
                <span>Weakest issues</span>
                <strong>{strategyBacktestIssueText(strategyBacktest.weakestGroup)}</strong>
              </div>
            </div>
            {strategyBacktest.groups.length > 0 && (
              <div className="review-playback-strategy-backtest-groups" data-review-playback-strategy-backtest-groups>
                {strategyBacktest.groups.slice(0, 4).map((group) => (
                  <div key={group.key} className={`review-playback-strategy-backtest-group ${group.verdict}`}>
                    <span>{group.opportunityCount} opps · {group.verdictLabel}</span>
                    <strong>{group.label}</strong>
                    <p>
                      {group.pricedLegs}/{group.closedLegs} priced
                      {' · '}
                      win {formatUnsignedPercent(group.winRatePct)}
                      {' · '}
                      avg {formatPercent(group.avgReturnPct)}
                      {' · '}
                      budget {formatUnsignedPercent(group.avgRiskBudgetUsedPct)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {riskBacktest && (
          <div
            className={`review-playback-risk-backtest ${riskBacktest.verdict}`}
            data-review-playback-risk-backtest={riskBacktest.verdict}
          >
            <div className="review-playback-risk-backtest-main">
              <span>Risk backtest</span>
              <strong>{riskBacktest.label}</strong>
              <p>{riskBacktest.detail || '暂无可回测样本。'}</p>
            </div>
            <div className="review-playback-risk-backtest-grid">
              <div>
                <span>Sample</span>
                <strong>{riskBacktest.pricedLegs}/{riskBacktest.closedLegs}</strong>
              </div>
              <div>
                <span>Coverage</span>
                <strong>
                  {riskBacktest.opportunitiesWithPricedTrades ?? riskBacktest.pricedLegs}
                  /
                  {riskBacktest.opportunityCount ?? performance?.opportunityCount ?? 'n/a'} opps
                </strong>
              </div>
              <div>
                <span>Win rate</span>
                <strong>{formatUnsignedPercent(riskBacktest.winRatePct)}</strong>
              </div>
              <div>
                <span>Avg return</span>
                <strong>{formatPercent(riskBacktest.avgReturnPct)}</strong>
              </div>
              <div>
                <span>Avg DD</span>
                <strong>{formatPercent(riskBacktest.avgMaxDrawdownPct)}</strong>
              </div>
              <div>
                <span>Risk-at-stop</span>
                <strong>{formatUnsignedPercent(riskBacktest.avgRiskAtStopPct)}</strong>
              </div>
              <div>
                <span>Budget used</span>
                <strong>{formatUnsignedPercent(riskBacktest.avgRiskBudgetUsedPct)}</strong>
              </div>
              <div>
                <span>Payoff</span>
                <strong>{riskBacktest.payoffRatio ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Issues</span>
                <strong>
                  {riskBacktest.oversizedLegs} oversized · {riskBacktest.executionIssueLegs} execution · {riskBacktest.planRepairLegs} repair
                </strong>
              </div>
            </div>
            {riskBacktestSegments.length > 0 && (
              <div className="review-playback-risk-backtest-segments" data-review-playback-risk-backtest-segments>
                <div className="review-playback-risk-backtest-segments-header">
                  <span>Backtest slices</span>
                  <strong>{riskBacktestSegments.length} groups</strong>
                </div>
                {riskBacktestSegments.slice(0, 8).map((segment) => (
                  <div
                    key={`${segment.kind}:${segment.key}`}
                    className={`review-playback-risk-backtest-segment ${segment.verdict}`}
                  >
                    <span>
                      {riskBacktestSegmentKindLabel(segment.kind)} · {segment.opportunityCount} opps
                    </span>
                    <strong>{segment.label} · {segment.verdictLabel}</strong>
                    <p>
                      {segment.pricedLegs}/{segment.closedLegs} priced
                      {' · '}
                      win {formatUnsignedPercent(segment.winRatePct)}
                      {' · '}
                      avg {formatPercent(segment.avgReturnPct)}
                      {' · '}
                      DD {formatPercent(segment.avgMaxDrawdownPct)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {priceCache && (
	          <div
	            className={`review-playback-price-cache ${priceCache.status}`}
            data-review-playback-price-cache={priceCache.status}
          >
            <div>
              <span>Price cache</span>
              <strong>
                {priceCacheStatusLabel(priceCache.status)}
                {priceCache.symbol ? ` · ${priceCache.symbol}` : ''}
                {priceCache.pointCount !== undefined ? ` · ${priceCache.pointCount} pts` : ''}
              </strong>
              <p>
                {priceCache.source || 'local cache'}
                {priceCache.updatedAt ? ` · updated ${formatDateTime(priceCache.updatedAt)}` : ''}
                {priceCache.ageHours !== undefined ? ` · age ${formatAgeHours(priceCache.ageHours)}` : ''}
              </p>
            </div>
            {(priceCache.status === 'stale' || priceCache.status === 'missing') && (
              <Link to={priceCache.refreshPath} className="secondary-btn tiny">
                <RefreshCw size={13} /> 刷新来源
              </Link>
	            )}
	          </div>
	        )}
        {position && (
          position.sizedLegs > 0
          || position.partialLegs > 0
          || position.openLegs > 0
          || positionSizingRules.length > 0
          || positionPlanRepairs.length > 0
        ) && (
	          <div className="review-playback-position" data-review-playback-position>
            <div>
              <span>Position sizing</span>
              <strong>
                {position.sizedLegs}/{trades.length} sized
                {position.partialLegs > 0 ? ` · ${position.partialLegs} partial` : ''}
                {position.openLegs > 0 ? ` · ${position.openLegs} open` : ''}
              </strong>
            </div>
            <div>
              <span>Sizing rules</span>
              <strong>{sizingRuleSummaryText(position)}</strong>
            </div>
            <div>
              <span>Realized contribution</span>
              <strong>{formatPercent(position.realizedReturnContributionPct)}</strong>
	            </div>
	            <div>
	              <span>Open exposure</span>
	              <strong>{formatPercent(position.openExposurePct)}</strong>
	            </div>
	            <div>
	              <span>Drawdown contribution</span>
	              <strong>{formatPercent(position.drawdownContributionPct)}</strong>
	            </div>
	            <div>
	              <span>Exit attribution</span>
	              <strong>{attributionSummaryText(position)}</strong>
	            </div>
            <div>
              <span>Execution quality</span>
              <strong>{executionSummaryText(position)}</strong>
            </div>
            <div>
              <span>Plan repairs</span>
              <strong>{repairSummaryText(position)}</strong>
            </div>
          </div>
        )}
	        {trades.length > 0 && (
	          <div className="review-playback-trades" data-review-playback-trades>
	            <div className="review-playback-trades-header">
	              <span>Trade legs</span>
	              <strong>
	                {trades.filter((trade) => trade.status === 'closed').length} closed
	                {trades.some((trade) => trade.status === 'partial') ? ` · ${trades.filter((trade) => trade.status === 'partial').length} partial` : ''}
	                {trades.some((trade) => trade.status === 'open') ? ` · ${trades.filter((trade) => trade.status === 'open').length} open` : ''}
	              </strong>
	            </div>
	            {trades.slice(0, 4).map((trade) => (
	              <div key={trade.id} className={`review-playback-trade ${trade.status}`}>
	                <div>
	                  <span>{trade.symbol || 'Trade'}</span>
	                  <strong>{trade.status === 'closed' ? 'Closed' : trade.status === 'partial' ? 'Partial' : 'Open'}</strong>
	                </div>
                <div>
                  <span>Entry</span>
                  <strong>{signalText(trade.entry)}</strong>
                </div>
                <div>
                  <span>Exit / Risk</span>
                  <strong>{trade.exit ? signalText(trade.exit) : 'open'}</strong>
                </div>
                <div>
                  <span>Return / DD</span>
	                  <strong>
	                    {formatPercent(trade.returnPct)}
	                    {' / '}
	                    {formatPercent(trade.maxDrawdownPct)}
	                  </strong>
	                </div>
                <div>
                  <span>Size</span>
                  <strong>{tradeSizeText(trade)}</strong>
                </div>
                <div>
                  <span>Sizing rule</span>
                  <strong>{tradeSizingRuleText(trade)}</strong>
                </div>
                <div>
                  <span>Contribution / DD</span>
	                  <strong>{tradeContributionText(trade)}</strong>
	                </div>
	                <div>
	                  <span>Exit attribution</span>
	                  <strong>{tradeAttributionText(trade)}</strong>
	                </div>
                <div>
                  <span>Execution quality</span>
                  <strong>{tradeExecutionQualityText(trade)}</strong>
                </div>
                <div>
                  <span>Plan repair</span>
                  <strong>{tradeRepairSuggestionText(trade)}</strong>
                </div>
                <div>
                  <span>Data</span>
                  <strong>{trade.priceSource || trade.dataQuality}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
        {performance?.notes && performance.notes.length > 0 && (
          <div className="review-playback-performance-notes">
            {performance.notes.slice(0, 3).map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
        )}
      </section>

      <section
        className={`review-playback-backtest-workspace ${backtestWorkspace.grade}`}
        data-review-playback-backtest-workspace={backtestWorkspace.grade}
      >
        <div className="review-playback-backtest-workspace-main">
          <span>Backtest Workspace</span>
          <h2>{backtestWorkspace.headline}</h2>
          <p>{backtestWorkspace.detail}</p>
          <strong>{backtestWorkspace.decision} · {backtestWorkspace.gradeLabel}</strong>
        </div>
        <div className="review-playback-backtest-workspace-score">
          <span>Readiness</span>
          <strong>{backtestWorkspace.readinessScore}</strong>
        </div>
        <div className="review-playback-backtest-workspace-actions">
          <span>Next actions</span>
          <strong>{backtestWorkspace.primaryAction}</strong>
          <p>{backtestWorkspace.secondaryAction}</p>
        </div>
        <div className="review-playback-backtest-workspace-facts" data-review-playback-backtest-workspace-facts>
          {backtestWorkspace.facts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
        {backtestWorkspace.alerts.length > 0 && (
          <div className="review-playback-backtest-workspace-alerts" data-review-playback-backtest-workspace-alerts>
            {backtestWorkspace.alerts.slice(0, 4).map((alert) => (
              <span key={alert}>{alert}</span>
            ))}
          </div>
        )}
      </section>

      <section className="review-playback-filters">
        <label>
          <span>搜索</span>
          <div className="filter-input">
            <Search size={14} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="mission、催化、字段、thesis"
              data-review-playback-search
            />
          </div>
        </label>
        <label>
          <span>Opportunity</span>
          <input
            value={opportunityId}
            onChange={(event) => setOpportunityId(event.target.value)}
            placeholder="opp-relay-ai-power"
            data-review-playback-opportunity
          />
        </label>
        <label>
          <span>类别</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryFilter)}
            data-review-playback-category
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>语气</span>
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value as ToneFilter)}
            data-review-playback-tone
          >
            {toneOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Backtest ticker</span>
          <input
            value={backtestTicker}
            onChange={(event) => setBacktestTicker(event.target.value)}
            placeholder="AAOI"
            data-review-playback-backtest-ticker
          />
        </label>
        <label>
          <span>Strategy family</span>
          <select
            value={backtestStrategy}
            onChange={(event) => setBacktestStrategy(event.target.value as StrategyFilter)}
            data-review-playback-backtest-strategy
          >
            {strategyOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Backtest from</span>
          <input
            type="date"
            value={backtestFrom}
            onChange={(event) => setBacktestFrom(event.target.value)}
            data-review-playback-backtest-from
          />
        </label>
        <label>
          <span>Backtest to</span>
          <input
            type="date"
            value={backtestTo}
            onChange={(event) => setBacktestTo(event.target.value)}
            data-review-playback-backtest-to
          />
        </label>
      </section>

      <section className="review-playback-saved-views" data-review-playback-saved-views>
        <label>
          <span>Saved view</span>
          <select
            value={selectedSavedViewId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedSavedViewId(nextId);
              setSavedViewLabel(savedViews.find((view) => view.id === nextId)?.label || '');
              setSavedViewFeedback('');
            }}
            data-review-playback-saved-view-select
          >
            <option value="">选择已保存视图</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>{view.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>View name</span>
          <input
            value={savedViewLabel}
            onChange={(event) => setSavedViewLabel(event.target.value)}
            placeholder={buildReviewPlaybackSavedViewLabel(currentSnapshot)}
            data-review-playback-saved-view-label
          />
        </label>
        <div className="review-playback-saved-view-actions">
          <button type="button" className="secondary-btn" onClick={handleSaveView} data-review-playback-save-view>
            保存视图
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleApplySavedView}
            disabled={!selectedSavedViewId}
            data-review-playback-apply-view
          >
            应用
          </button>
          <button
            type="button"
            className="secondary-btn danger"
            onClick={handleDeleteSavedView}
            disabled={!selectedSavedViewId}
            data-review-playback-delete-view
          >
            删除
          </button>
          <button type="button" className="secondary-btn" onClick={handleClearFilters} data-review-playback-clear-filters>
            清空筛选
          </button>
        </div>
        <span className="review-playback-saved-view-feedback" data-review-playback-saved-view-feedback>
          {savedViewFeedback || `${savedViews.length} saved`}
        </span>
      </section>

      {error && <div className="review-playback-error">{error}</div>}

      <section className="review-playback-list" aria-busy={loading}>
        {items.length === 0 && (
          <div className="empty-state" data-review-playback-empty>
            暂无匹配的复盘记录。
          </div>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className={`review-playback-row ${item.tone}`}
            data-review-playback-row={item.category}
            data-review-playback-tone={item.tone}
          >
            <div className="review-playback-time">
              <span>{formatDateTime(item.timestamp)}</span>
              <strong>{toneLabel(item.tone)}</strong>
            </div>
            <div className="review-playback-main">
              <div className="review-playback-title">
                <span className={`review-playback-pill ${item.category}`}>{categoryLabel(item.category)}</span>
                <strong>{item.label}</strong>
              </div>
              <p>{item.detail}</p>
              <div className="review-playback-meta">
                <span>{item.opportunityTitle}</span>
                <span>{item.opportunityId}</span>
                {item.missionId && <span>Mission {item.missionId}</span>}
                {item.runId && <span>Run {item.runId}</span>}
                {item.field && <span>{item.field}</span>}
                {item.actionKind && <span>{item.actionKind}</span>}
                {item.catalystUrgency && <span>{item.catalystUrgency}</span>}
              </div>
              {item.chips.length > 0 && (
                <div className="review-playback-chips">
                  {item.chips.slice(0, 6).map((chip) => (
                    <span key={`${item.id}_${chip}`}>{chip}</span>
                  ))}
                </div>
              )}
            </div>
            <Link to={itemRoute(item)} className="secondary-btn tiny">
              <ExternalLink size={13} /> 打开
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}

export default ReviewPlayback;
