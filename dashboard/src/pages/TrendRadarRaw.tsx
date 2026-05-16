import { useEffect, useMemo, useState } from 'react';
import { usePolling } from '../hooks/useAgentStream';
import { RefreshCw, Database, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  RAW_TREND_PAGE_SIZE,
  buildRawTrendPageInfo,
  buildRawTrendPlatformTabs,
  buildRawTrendStats,
  clampRawTrendPage,
  filterRawTrendItems,
  paginateRawTrendItems,
  type RawTrendFilterType,
  type RawTrendItem,
} from './trend-radar-raw-state';
import './trend-radar.css';

interface RawData {
  date: string | null;
  items: RawTrendItem[];
}

function statusMeta(matched: number) {
  if (matched === 1) return { label: '已收录', className: 'accepted' };
  if (matched === 0) return { label: '已滤除', className: 'rejected' };
  return { label: '待处理', className: 'unprocessed' };
}

export function TrendRadarRaw() {
  const [filterType, setFilterType] = useState<RawTrendFilterType>('all');
  const [activePlatform, setActivePlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const { data, loading, error } = usePolling<RawData>(
    async () => {
      const res = await fetch('/api/trendradar/raw');
      if (!res.ok) throw new Error('API Error');
      return res.json();
    },
    15000,
    []
  );

  const rawData = data || { date: null, items: [] };

  const platformTabs = useMemo(() => {
    return buildRawTrendPlatformTabs(rawData.items);
  }, [rawData.items]);

  const rawStats = useMemo(() => {
    return buildRawTrendStats(rawData.items);
  }, [rawData.items]);

  const filteredItems = useMemo(() => {
    return filterRawTrendItems(rawData.items, { filterType, activePlatform, searchQuery });
  }, [rawData.items, filterType, activePlatform, searchQuery]);

  const pageInfo = useMemo(() => {
    return buildRawTrendPageInfo(filteredItems.length, currentPage, RAW_TREND_PAGE_SIZE);
  }, [filteredItems.length, currentPage]);

  const pagedItems = useMemo(() => {
    return paginateRawTrendItems(filteredItems, pageInfo.currentPage, RAW_TREND_PAGE_SIZE);
  }, [filteredItems, pageInfo.currentPage]);

  useEffect(() => {
    if (pageInfo.currentPage !== currentPage) {
      setCurrentPage(pageInfo.currentPage);
    }
  }, [pageInfo.currentPage, currentPage]);

  const pageSummary = filteredItems.length > 0
    ? `显示 ${pageInfo.visibleStart} - ${pageInfo.visibleEnd} / ${filteredItems.length} 条`
    : '当前筛选范围内没有结果';

  const handleFilterChange = (val: RawTrendFilterType) => {
    setFilterType(val);
    setCurrentPage(0);
  };

  const handlePlatformChange = (val: string) => {
    setActivePlatform(val);
    setCurrentPage(0);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(0);
  };

  const setSafePage = (nextPage: number) => {
    setCurrentPage(clampRawTrendPage(nextPage, filteredItems.length, RAW_TREND_PAGE_SIZE));
  };

  if (loading && !rawData.items.length) {
    return (
      <div className="radar-container trend-radar-raw is-loading">
        <p className="loading-text"><RefreshCw className="spin" size={20} /> 正在调取底层情报库...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="radar-container trend-radar-raw">
        <h2 className="error-text">数据拉取失败: {error}</h2>
      </div>
    );
  }

  return (
    <div className="radar-container trend-radar-raw">
      <div className="radar-header glass-panel">
        <div className="radar-header-main">
          <Database size={24} className="radar-icon" />
          <div className="radar-header-copy">
            <h1>数据透视舱（原始数据）</h1>
            <span className="radar-date">
              {rawData.date || '等待数据接入...'} | 总获取: {rawStats.total} 条 | 当前: {filteredItems.length} 条
            </span>
          </div>
          
          <div className="radar-controls">
            <label className="raw-search">
              <Search size={15} aria-hidden="true" />
              <input
                data-trend-raw-search="true"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="搜索标题、来源、标签"
                aria-label="搜索原始情报"
              />
            </label>
            <select 
              data-trend-raw-filter="true"
              value={filterType} 
              onChange={(e) => handleFilterChange(e.target.value as RawTrendFilterType)}
              className="raw-filter-select"
              aria-label="筛选原始情报"
            >
              <option value="all">全量底稿 (所有数据)</option>
              <option value="accepted">已收录 (AI Accepted)</option>
              <option value="rejected">已滤除 (AI Rejected)</option>
              <option value="unprocessed">待处理 (Unprocessed)</option>
              <option value="rss">仅看海外/RSS源</option>
              <option value="hotlist">仅看国内热搜源</option>
            </select>
          </div>
        </div>

        <div className="raw-summary-strip" aria-label="原始情报统计">
          <span className="raw-summary-chip strong">当前 {filteredItems.length}</span>
          <span className="raw-summary-chip accepted">收录 {rawStats.accepted}</span>
          <span className="raw-summary-chip rejected">滤除 {rawStats.rejected}</span>
          <span className="raw-summary-chip unprocessed">待处理 {rawStats.unprocessed}</span>
          <span className="raw-summary-chip rss">RSS {rawStats.rss}</span>
          <span className="raw-summary-chip hotlist">热搜 {rawStats.hotlist}</span>
        </div>

        {platformTabs.length > 0 && (
          <div className="raw-platform-tabs" aria-label="原始情报来源平台">
            <button
              data-trend-raw-platform-tab="all"
              onClick={() => handlePlatformChange('all')}
              className={`raw-platform-tab ${activePlatform === 'all' ? 'active' : ''}`}
              aria-pressed={activePlatform === 'all'}
            >
              全部源
            </button>
            {platformTabs.map(([platform, count]) => (
              <button
                key={platform}
                data-trend-raw-platform-tab={platform}
                onClick={() => handlePlatformChange(platform)}
                className={`raw-platform-tab ${activePlatform === platform ? 'active' : ''}`}
                aria-pressed={activePlatform === platform}
                title={platform}
              >
                <span className="raw-platform-label">{platform}</span>
                <span className="raw-platform-count">
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pageInfo.totalPages > 1 && (
        <div className="raw-pagination">
          <span className="raw-pagination-count">
            {pageSummary}
          </span>
          <div className="raw-pagination-actions">
            <button
              data-trend-raw-page-prev="true"
              disabled={pageInfo.currentPage === 0}
              onClick={() => setSafePage(pageInfo.currentPage - 1)}
              className="raw-page-btn"
            >
              <ChevronLeft size={14} /> 上一页
            </button>
            <span className="raw-page-index">
              {pageInfo.currentPage + 1} / {pageInfo.totalPages}
            </span>
            <button
              data-trend-raw-page-next="true"
              disabled={pageInfo.currentPage >= pageInfo.totalPages - 1}
              onClick={() => setSafePage(pageInfo.currentPage + 1)}
              className="raw-page-btn"
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel raw-table-panel">
        <div className="raw-table-toolbar">
          <span data-trend-raw-page-summary="true">{pageSummary}</span>
          <span>每页 {RAW_TREND_PAGE_SIZE} 条</span>
        </div>
        <div className="raw-table-scroll" tabIndex={0} aria-label="原始情报数据表" data-trend-raw-table-scroll="true">
          <table className="raw-table">
            <colgroup>
              <col className="raw-status-col" />
              <col className="raw-title-col" />
              <col className="raw-source-col" />
              <col className="raw-time-col" />
              <col className="raw-tag-col" />
            </colgroup>
            <thead>
              <tr>
                <th>状态</th>
                <th>情报内容 (Title)</th>
                <th>探测节点 (Source)</th>
                <th>发现/最后爬取</th>
                <th>AI标签分类</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item: RawTrendItem) => {
                const status = statusMeta(item.matched);
                const sourceType = item.source_type === 'rss' ? 'RSS' : 'Hotlist';
                const url = item.url && item.url !== '#' ? item.url : '';

                return (
                  <tr
                    key={item.id}
                    className="raw-table-row"
                    data-trend-raw-row="true"
                    data-trend-raw-id={item.id}
                    data-trend-raw-matched={item.matched}
                    data-trend-raw-source={item.source_type}
                    data-trend-raw-platform={item.platform_name}
                  >
                    <td className="raw-table-cell raw-status-cell">
                      <span className={`raw-status-pill ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="raw-table-cell raw-title-cell">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="raw-title-link" title={item.title}>
                          {item.title}
                        </a>
                      ) : (
                        <span className="raw-title-link is-static" title={item.title}>
                          {item.title}
                        </span>
                      )}
                    </td>
                    <td className="raw-table-cell raw-source-cell">
                      <span className={`raw-source-pill ${item.source_type === 'rss' ? 'rss' : 'hotlist'}`} title={`${item.platform_name} · ${sourceType}`}>
                        {item.platform_name} · {sourceType}
                      </span>
                    </td>
                    <td className="raw-table-cell raw-muted-cell raw-time-cell">
                      <div className="raw-time-stack">
                        <span>首次: {item.first_crawl_time}</span>
                        <span>最新: {item.last_crawl_time}</span>
                      </div>
                    </td>
                    <td className="raw-table-cell raw-muted-cell raw-tag-cell">
                      <span className={item.matched_tag ? 'raw-tag-pill' : 'raw-tag-empty'}>
                        {item.matched_tag || '未分类'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {pagedItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="raw-empty-row">
                    <div className="raw-empty-state">
                      <strong>暂无符合条件的数据</strong>
                      <span>{rawStats.total > 0 ? '当前筛选范围内没有匹配记录。' : '底层情报接入后会出现在这里。'}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
