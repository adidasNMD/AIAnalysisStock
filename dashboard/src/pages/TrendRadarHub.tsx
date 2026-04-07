import { useState, useEffect } from 'react';
import { Radar, TrendingUp, Radio, Activity, ExternalLink, RefreshCw, Calendar, FileText } from 'lucide-react';
import { fetchTrendRadarLatest, fetchTrendRadarDates, type TrendRadarResult } from '../api';

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

  const loadData = async (date?: string) => {
    setLoading(true);
    const result = await fetchTrendRadarLatest(date);
    setData(result);
    setLoading(false);
  };

  const loadHtmlReports = async () => {
    try {
      const res = await fetch('/api/trendradar/reports');
      if (res.ok) {
        const reports: HtmlReport[] = await res.json();
        setHtmlReports(reports);
        if (reports.length > 0 && !selectedReport) {
          setSelectedReport(reports[0]!);
        }
      }
    } catch { /* ignore */ }
  };

  // 首次加载：获取可用日期 + 拉取最新数据
  useEffect(() => {
    fetchTrendRadarDates().then(setDates);
    loadData();
    loadHtmlReports();
    const interval = setInterval(() => loadData(selectedDate), 300000);
    return () => clearInterval(interval);
  }, []);

  const handleDateChange = (date: string) => {
    setSelectedDate(date || undefined);
    loadData(date || undefined);
  };

  if (loading && !data) {
    return (
      <div className="page loading-state">
        <RefreshCw size={32} className="spin" />
        <p style={{ marginTop: '16px' }}>正在连接 TrendRadar 数据中枢...</p>
      </div>
    );
  }

  // 按平台分组
  const platforms = Array.from(new Set(data?.items.map(item => item.platform_name) || []));

  return (
    <div className="page trend-radar-hub">
      <div className="page-header">
        <div className="page-title">
          <Radar className="header-icon" style={{ stroke: '#8b5cf6' }} />
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
          <Radio size={48} style={{ opacity: 0.3 }} />
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
            
            <div className="top-hits-list">
              {data.items.slice(0, 20).map((item, idx) => (
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
                      {item.title}
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
              {platforms.map(platform => {
                const platformItems = data.items.filter(i => i.platform_name === platform);
                return (
                  <div key={platform} className="platform-panel glass-panel">
                    <div className="platform-header">
                      <h4>{platform}</h4>
                      <span className="platform-count">{platformItems.length} 个引爆点</span>
                    </div>
                    <div className="platform-items">
                      {platformItems.slice(0, 5).map((pItem, i) => (
                        <div key={pItem.id} className="p-item">
                          <span className="p-rank">{i + 1}</span>
                          <a href={pItem.url} target="_blank" rel="noreferrer" className="p-title" title={pItem.title}>
                            {pItem.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TrendRadar AI 深度分析报告（HTML 嵌入） ── */}
      {htmlReports.length > 0 && (
        <div className="radar-report-section glass-panel" style={{ marginTop: '24px' }}>
          <div className="panel-header" style={{ marginBottom: '12px' }}>
            <FileText size={18} />
            <h2>AI 深度分析报告 (Full Report)</h2>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={selectedReport ? `${selectedReport.date}/${selectedReport.filename}` : ''}
                onChange={(e) => {
                  const [d, f] = e.target.value.split('/');
                  const rpt = htmlReports.find(r => r.date === d && r.filename === f);
                  if (rpt) setSelectedReport(rpt);
                }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#e0e0e0',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
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
                  style={{ color: '#8b5cf6', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  新窗口打开 <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
          {selectedReport && (
            <iframe
              src={`/api/trendradar/reports/${selectedReport.date}/${selectedReport.filename}`}
              style={{
                width: '100%',
                height: '80vh',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                background: '#1a1a2e',
              }}
              title="TrendRadar AI Report"
            />
          )}
        </div>
      )}
    </div>
  );
}
