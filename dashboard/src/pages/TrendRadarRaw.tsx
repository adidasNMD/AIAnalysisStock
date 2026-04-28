import { useState, useMemo } from 'react';
import { usePolling } from '../hooks/useAgentStream';
import { RefreshCw, Database, Filter, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface RawItem {
  id: number;
  title: string;
  url: string;
  first_crawl_time: string;
  last_crawl_time: string;
  platform_name: string;
  source_type: string;
  matched: number; // 1 = accepted, 0 = rejected, -1 = not processed
  matched_tag: string | null;
}

interface RawData {
  date: string | null;
  items: RawItem[];
}

const PAGE_SIZE = 200;

export function TrendRadarRaw() {
  const [filterType, setFilterType] = useState<string>('all');
  const [activePlatform, setActivePlatform] = useState<string>('all');
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

  // 获取所有唯一的平台分类（用 useMemo 缓存）
  const platformTabs = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of rawData.items) {
      map.set(item.platform_name, (map.get(item.platform_name) || 0) + 1);
    }
    // 按数量降序排列
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawData.items]);

  // 过滤后的数据列表
  const filteredItems = useMemo(() => {
    return rawData.items.filter((item: RawItem) => {
      // 主要状态过滤
      if (filterType === 'accepted' && item.matched !== 1) return false;
      if (filterType === 'rejected' && item.matched !== 0) return false;
      if (filterType === 'unprocessed' && item.matched !== -1) return false;
      if (filterType === 'rss' && item.source_type !== 'rss') return false;
      if (filterType === 'hotlist' && item.source_type !== 'hotlist') return false;

      // 平台 Tab 过滤
      if (activePlatform !== 'all' && item.platform_name !== activePlatform) return false;

      return true;
    });
  }, [rawData.items, filterType, activePlatform]);

  // 分页
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pagedItems = filteredItems.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // 切换过滤器时重置页码
  const handleFilterChange = (val: string) => {
    setFilterType(val);
    setCurrentPage(0);
  };
  const handlePlatformChange = (val: string) => {
    setActivePlatform(val);
    setCurrentPage(0);
  };

  if (loading && !rawData.items.length) {
    return (
      <div className="radar-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <p className="loading-text"><RefreshCw className="spin" size={20} /> 正在调取底层情报库...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="radar-container">
        <h2 className="error-text">❌ 数据拉取失败: {error}</h2>
      </div>
    );
  }

  return (
    <div className="radar-container">
      <div className="radar-header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Database size={24} className="radar-icon" />
          <div style={{ flex: 1 }}>
            <h1>数据透视舱（原始数据）</h1>
            <span className="radar-date">{rawData.date || '等待数据接入...'} | 总获取: {rawData.items.length}条</span>
          </div>
          
          <div className="radar-controls">
            <select 
              value={filterType} 
              onChange={(e) => handleFilterChange(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#e0e0e0',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '14px',
              }}
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

        {/* 独立展示区 Tabs */}
        {platformTabs.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => handlePlatformChange('all')}
              style={{
                background: activePlatform === 'all' ? 'rgba(74, 108, 247, 0.4)' : 'rgba(255,255,255,0.05)',
                border: activePlatform === 'all' ? '1px solid rgba(74, 108, 247, 0.8)' : '1px solid rgba(255,255,255,0.1)',
                color: activePlatform === 'all' ? '#fff' : '#aaa',
                padding: '6px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s ease'
              }}
            >
              全部源
            </button>
            {platformTabs.map(([platform, count]) => (
              <button
                key={platform}
                onClick={() => handlePlatformChange(platform)}
                style={{
                  background: activePlatform === platform ? 'rgba(74, 108, 247, 0.4)' : 'rgba(255,255,255,0.05)',
                  border: activePlatform === platform ? '1px solid rgba(74, 108, 247, 0.8)' : '1px solid rgba(255,255,255,0.1)',
                  color: activePlatform === platform ? '#fff' : '#aaa',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                {platform}
                <span style={{ 
                  background: activePlatform === platform ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)', 
                  padding: '2px 6px', 
                  borderRadius: '10px',
                  fontSize: '11px'
                }}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 分页控制 */}
      {totalPages > 1 && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <span style={{ color: '#9ca3af', fontSize: '13px' }}>
            显示 {currentPage * PAGE_SIZE + 1} - {Math.min((currentPage + 1) * PAGE_SIZE, filteredItems.length)} / {filteredItems.length} 条
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(p => p - 1)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: currentPage === 0 ? '#555' : '#e0e0e0', padding: '6px 12px', borderRadius: '6px', cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px'
              }}
            >
              <ChevronLeft size={14} /> 上一页
            </button>
            <span style={{ color: '#9ca3af', fontSize: '13px' }}>
              {currentPage + 1} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(p => p + 1)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: currentPage >= totalPages - 1 ? '#555' : '#e0e0e0', padding: '6px 12px', borderRadius: '6px', cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px'
              }}
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ marginTop: '12px', padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <tr>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '500', fontSize: '13px' }}>状态</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '500', fontSize: '13px' }}>情报内容 (Title)</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '500', fontSize: '13px' }}>探测节点 (Source)</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '500', fontSize: '13px' }}>发现/最后爬取</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: '500', fontSize: '13px' }}>AI标签分类</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item: RawItem, idx: number) => (
                <tr key={`${currentPage}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '12px 16px' }}>
                    {item.matched === 1 ? <CheckCircle size={16} color="#10b981" /> : 
                     item.matched === 0 ? <XCircle size={16} color="#ef4444" /> : 
                     <Filter size={16} color="#6b7280" />}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <a href={item.url || '#'} target="_blank" rel="noreferrer" style={{ color: '#e5e7eb', textDecoration: 'none' }}>
                      {item.title}
                    </a>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ 
                      background: item.source_type === 'rss' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(236, 72, 153, 0.2)', 
                      color: item.source_type === 'rss' ? '#60a5fa' : '#f472b6',
                      padding: '2px 8px', borderRadius: '4px', fontSize: '12px'
                    }}>
                      {item.platform_name}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '13px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>首次: {item.first_crawl_time}</span>
                      <span>最新: {item.last_crawl_time}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '13px' }}>
                    {item.matched_tag || '-'}
                  </td>
                </tr>
              ))}
              {pagedItems.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>
                    暂无符合条件的数据
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
