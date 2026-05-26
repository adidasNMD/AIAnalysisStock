import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radar, TrendingUp, Radio, Activity, ExternalLink, RefreshCw, Calendar, FileText } from 'lucide-react';
import { fetchTrendRadarLatest, fetchTrendRadarDates, type TrendRadarResult } from '../api';
import {
  buildTrendRadarPlatformGroups,
  buildTrendRadarSummary,
  buildTrendRadarTopItems,
} from './trend-radar-hub-state';
import './trend-radar.css';

interface HtmlReport {
  date: string;
  filename: string;
  time: string;
}

export function TrendRadarHub() {
  const [data, setData] = useState<TrendRadarResult | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [htmlReports, setHtmlReports] = useState<HtmlReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<HtmlReport | null>(null);

  const loadData = useCallback(async (date?: string) => {
    setLoading(true);
    const result = await fetchTrendRadarLatest(date);
    setData(result);
    setLoading(false);
  }, []);

  const loadHtmlReports = useCallback(async () => {
    try {
      const res = await fetch('/api/trendradar/reports');
      if (res.ok) {
        const reports: HtmlReport[] = await res.json();
        setHtmlReports(reports);
        setSelectedReport((current) => current || reports[0] || null);
      }
    } catch { /* ignore */ }
  }, []);

  // 首次加载：获取可用日期 + 拉取最新数据
  useEffect(() => {
    void fetchTrendRadarDates().then(setDates);
    void loadHtmlReports();
  }, [loadHtmlReports]);

  useEffect(() => {
    void loadData(selectedDate);
    const interval = setInterval(() => void loadData(selectedDate), 300000);
    return () => clearInterval(interval);
  }, [loadData, selectedDate]);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const summary = useMemo(() => buildTrendRadarSummary(items), [items]);
  const topItems = useMemo(() => buildTrendRadarTopItems(items), [items]);
  const platformGroups = useMemo(() => buildTrendRadarPlatformGroups(items), [items]);

  const handleDateChange = (date: string) => {
    setSelectedDate(date || undefined);
  };

  if (loading && !data) {
    return (
      <div className="page loading-state">
        <RefreshCw size={32} className="spin" />
        <p className="trend-radar-loading-note">正在连接 TrendRadar 数据中枢...</p>
      </div>
    );
  }

  return (
    <div className="page trend-radar-hub">
      <div className="page-header">
        <div className="page-title">
          <Radar className="header-icon trend-radar-icon" />
          <h1>全景情报雷达 <span>TrendRadar</span></h1>
        </div>
        <div className="radar-controls">
          {/* C3: 日期选择器 */}
          {dates.length > 0 && (
            <div className="date-selector">
              <Calendar size={14} />
              <select
                value={selectedDate || ''}
                onChange={(e) => handleDateChange(e.target.value)}
              >
                <option value="">最新</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-secondary" onClick={() => loadData(selectedDate)} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> {loading ? '同步中' : '手动刷新'}
          </button>
        </div>
      </div>

      {!data?.items.length ? (
        <div className="empty-state glass-panel">
          <Radio size={48} className="radar-empty-icon" />
          <h3>信号静默</h3>
          <p>当前未捕获到任何最新热点行情数据，请检查 TrendRadar 守护进程状态。</p>
        </div>
      ) : (
        <div className="radar-grid">
          {/* 左侧大屏：综合热度 Top 10 */}
          <div className="radar-main glass-panel glow-purple">
            <div className="panel-header">
              <Activity size={18} />
              <h2>全网共振焦点舱 (Top Resonance)</h2>
              <span className="badge">
                {data.date}
              </span>
            </div>

            <div className="radar-summary-strip" aria-label="TrendRadar summary">
              <span className="radar-summary-chip strong">信号 {summary.totalItems}</span>
              <span className="radar-summary-chip">平台 {summary.platformCount}</span>
              <span className="radar-summary-chip hot">最高波次 {summary.topCrawlCount}</span>
              <span className="radar-summary-chip">累计波次 {summary.totalCrawlCount}</span>
            </div>
            
            <div className="top-hits-list">
              {topItems.map((item, idx) => (
                <div key={item.id} className="hit-item glass-card">
                  <div className={`hit-rank rank-${idx + 1}`}>{idx + 1}</div>
                  <div className="hit-content">
                    <div className="hit-meta">
                      <span className="hit-platform">{item.platform_name}</span>
                      <span className="hit-crawls">
                        <TrendingUp size={12} /> 热度波次 {item.crawl_count}
                      </span>
                      <span className="hit-time">{item.first_crawl_time.split(' ')[1]} 爆发</span>
                    </div>
                    <a href={item.url || '#'} target="_blank" rel="noreferrer" className="hit-title">
                      <span>{item.title}</span>
                      {item.url && <ExternalLink size={14} className="external-icon" />}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：各平台温差分布 */}
          <div className="radar-side">
            <h3 className="section-title">板块温差图 (Platform Heat)</h3>
            <div className="platform-stack">
              {platformGroups.map((group) => (
                <div key={group.platformName} className="platform-panel glass-panel">
                  <div className="platform-header">
                    <h4 title={group.platformName}>{group.platformName}</h4>
                    <span className="platform-count">{group.count} 个引爆点 · {group.totalCrawlCount} 波次</span>
                  </div>
                  <div className="platform-items">
                    {group.topItems.map((pItem, i) => (
                      <div key={pItem.id} className="p-item">
                        <span className="p-rank">{i + 1}</span>
                        <a href={pItem.url || '#'} target="_blank" rel="noreferrer" className="p-title" title={pItem.title}>
                          {pItem.title}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TrendRadar AI 深度分析报告（HTML 嵌入） ── */}
      {htmlReports.length > 0 && (
        <div className="radar-report-section glass-panel">
          <div className="radar-report-header">
            <FileText size={18} />
            <h2>AI 深度分析报告 (Full Report)</h2>
            <div className="radar-report-toolbar">
              <select
                value={selectedReport ? `${selectedReport.date}/${selectedReport.filename}` : ''}
                onChange={(e) => {
                  const [d, f] = e.target.value.split('/');
                  const rpt = htmlReports.find(r => r.date === d && r.filename === f);
                  if (rpt) setSelectedReport(rpt);
                }}
                className="radar-report-select"
              >
                {htmlReports.map(r => (
                  <option key={`${r.date}/${r.filename}`} value={`${r.date}/${r.filename}`}>
                    {r.date} @ {r.time}
                  </option>
                ))}
              </select>
              {selectedReport && (
                <a
                  href={`/api/trendradar/reports/${selectedReport.date}/${selectedReport.filename}`}
                  target="_blank"
                  rel="noreferrer"
                  className="radar-report-link"
                >
                  新窗口打开 <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
          {selectedReport && (
            <iframe
              src={`/api/trendradar/reports/${selectedReport.date}/${selectedReport.filename}`}
              className="radar-report-frame"
              title="TrendRadar AI Report"
              loading="lazy"
            />
          )}
        </div>
      )}
    </div>
  );
}
