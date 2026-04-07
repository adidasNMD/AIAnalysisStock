import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, BarChart3, Shield, TrendingUp, TrendingDown, Clock, Zap, Target, Activity, CheckCircle, Search, Filter } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fetchMissionDetail, fetchTraceByMissionId, type MissionFull, type TraceContent } from '../api';

// 终态集合 — 这些状态不会再变化，到达后停止轮询
const TERMINAL_STATES = new Set(['fully_enriched', 'main_only', 'failed']);

export function MissionViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mission, setMission] = useState<MissionFull | null>(null);
  const [trace, setTrace] = useState<TraceContent | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // A3: 数据加载与 ticker 选择解耦 + 终态自动停止轮询
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const load = async () => {
      const data = await fetchMissionDetail(id);
      setMission(data);
      if (data?.openclawTickers?.[0] && !selectedTicker) {
        setSelectedTicker(data.openclawTickers[0]);
      }

      if (data?.id) {
        const trData = await fetchTraceByMissionId(data.id);
        setTrace(trData);
      }
      setLoading(false);

      // A3: 到达终态后清除轮询
      if (data && TERMINAL_STATES.has(data.status)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    load();
    intervalRef.current = setInterval(load, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [id]); // P10 fix: 不再依赖 selectedTicker

  if (loading && !mission) return <div className="page loading-state"><Clock size={32} className="spin" /> 加载分析脑波中...</div>;
  if (!mission) return <div className="page error-state">Mission 迷航... 未找到对应追踪记录。</div>;

  // C1: optional chaining 安全取值
  const currentOpenBB = mission.openbbData?.find(d => d.ticker === selectedTicker);
  const currentTA = mission.taResults?.find(r => r.ticker === selectedTicker);

  return (
    <div className="page mission-viewer">
      <div className="viewer-header glass-panel">
        <button className="back-btn" onClick={() => navigate('/missions')}>
          <ArrowLeft size={16} /> 返回指挥台
        </button>
        <div className="viewer-title">
          <h1>{mission.input.query}</h1>
          <div className="viewer-meta">
            <span className={`status-pill ${mission.status}`}>{mission.status.replace(/_/g, ' ').toUpperCase()}</span>
            <span><Clock size={12}/> {new Date(mission.createdAt).toLocaleString()}</span>
            <span><Zap size={12}/> {Math.round(mission.totalDurationMs / 1000)}s</span>
          </div>
        </div>
      </div>

      {/* Ticker 专属标签栏 */}
      {mission.openclawTickers.length > 0 && (
        <div className="ticker-ribbon">
          <span className="ribbon-label"><Target size={14}/> 锁定猎物: </span>
          {mission.openclawTickers.map(t => (
            <button
              key={t}
              className={`ticker-tab ${t === selectedTicker ? 'active' : ''}`}
              onClick={() => setSelectedTicker(t)}
            >${t}</button>
          ))}
        </div>
      )}

      {/* 双栏布局 */}
      <div className="viewer-layout">
        
        <div className="viewer-main">
          {/* ━━━ OpenClaw 脑电波还原 ━━━ */}
          <section className="brain-section glass-panel">
            <div className="brain-header openclaw">
              <Brain size={18} />
              <span>大脑 A · OpenClaw 策略推导链路</span>
              <span className="brain-duration">{Math.round(mission.openclawDurationMs / 1000)}s</span>
            </div>
            
            {trace && trace.steps.length > 0 ? (
              <div className="trace-timeline">
                {trace.steps.map((step, i) => (
                  <div key={i} className="trace-step glass-card">
                    <div className="step-point"></div>
                    <div className="step-info">
                      <div className="step-agent">
                        {step.agentName === 'DataScout' && <Search size={14}/>}
                        {step.agentName === 'Normalizer' && <Filter size={14}/>}
                        {(step.agentName === 'Strategist' || step.agentName === 'InvestmentCouncil') && <Brain size={14}/>}
                        {(step.agentName === 'Synthesizer') && <CheckCircle size={14}/>}
                        <span className="agent-name">{step.agentName}</span>
                        <span className="agent-phase">{step.phase}</span>
                        <span className="agent-time">{step.durationMs}ms</span>
                      </div>
                      
                      <div className="step-output markdown-body custom-scroll">
                        {typeof step.output === 'string' ? (
                          <ReactMarkdown>{step.output}</ReactMarkdown>
                        ) : (
                          <pre>{JSON.stringify(step.output, null, 2)}</pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="brain-content markdown-body">
                {mission.openclawReport ? (
                  <ReactMarkdown>{mission.openclawReport}</ReactMarkdown>
                ) : (
                  <div className="brain-empty">OpenClaw 链路捕获中...</div>
                )}
              </div>
            )}
          </section>

          {/* ━━━ TradingAgents 量化竞技场 ━━━ */}
          {currentTA && (
            <section className="brain-section glass-panel">
              <div className="brain-header ta">
                <BarChart3 size={18} />
                <span>大脑 B · TradingAgents 竞技场 — ${selectedTicker}</span>
                <span className="brain-duration">{currentTA.duration}s</span>
              </div>

              {currentTA.status === 'error' ? (
                <div className="brain-error">分析崩溃: {currentTA.error}</div>
              ) : (
                <div className="arena-content">
                  
                  {/* 对抗赛与PM图章联合版块 */}
                  <div className="arena-top-tier">
                    <div className="pm-gauge-card glass-card">
                      <h4>📊 定盘决策 (PM)</h4>
                      <div className={`pm-stamp ${currentTA.portfolioManagerDecision?.action?.toLowerCase() ?? ''}`}>
                        {currentTA.portfolioManagerDecision?.action ?? 'N/A'}
                      </div>
                      <div className="pm-alloc-bar">
                        <div className="alloc-fill" style={{ 
                          width: currentTA.portfolioManagerDecision?.allocation ?? '0%', 
                          background: currentTA.portfolioManagerDecision?.action === 'BUY' ? 'var(--accent-green)' : currentTA.portfolioManagerDecision?.action === 'SELL' ? 'var(--accent-crimson)' : 'var(--accent-amber)' 
                        }}></div>
                        <span className="alloc-text">仓位分配: {currentTA.portfolioManagerDecision?.allocation ?? 'N/A'}</span>
                      </div>
                      <div className="pm-sl-level">止损线: {currentTA.portfolioManagerDecision?.stopLoss || 'N/A'}</div>
                      <p className="pm-reason compact-scroll">{currentTA.portfolioManagerDecision?.reasoning ?? ''}</p>
                    </div>

                    <div className="debate-arena glass-card">
                      <div className="debate-side bull-side">
                        <div className="side-title"><TrendingUp size={16}/> Bull Case</div>
                        <div className="side-args compact-scroll">
                          {currentTA.investmentDebate?.bullArguments?.map((arg, i) => <p key={i}>• {arg}</p>) ?? <p className="brain-empty">无数据</p>}
                        </div>
                      </div>
                      <div className="debate-side bear-side">
                        <div className="side-title"><TrendingDown size={16}/> Bear Case</div>
                        <div className="side-args compact-scroll">
                          {currentTA.investmentDebate?.bearArguments?.map((arg, i) => <p key={i}>• {arg}</p>) ?? <p className="brain-empty">无数据</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 风控透镜三棱镜 */}
                  <div className="risk-prism">
                    <h4>🛡️ 风控三棱视角</h4>
                    <div className="prism-grid">
                      <div className="prism-face aggressive">
                        <span className="prism-icon">🔥 激进</span>
                        <p>{currentTA.riskDebate?.aggressiveView ?? '暂无'}</p>
                      </div>
                      <div className="prism-face neutral">
                        <span className="prism-icon">⚖️ 中性</span>
                        <p>{currentTA.riskDebate?.neutralView ?? '暂无'}</p>
                      </div>
                      <div className="prism-face conservative">
                        <span className="prism-icon">🛡️ 保守</span>
                        <p>{currentTA.riskDebate?.conservativeView ?? '暂无'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
          
          {/* 双大脑共识 */}
          {mission.consensus.length > 0 && (
            <section className="consensus-section glass-panel">
              <h4><Shield size={18}/> 终极共识雷达</h4>
              <div className="consensus-grid">
                {mission.consensus.map(c => (
                  <div key={c.ticker} className={`consensus-card ${c.agreement}`}>
                    <div className="cc-ticker">${c.ticker}</div>
                    <div className="cc-verdicts">
                      <span className={`cc-oc align-${c.openclawVerdict?.toLowerCase()}`}>OC: {c.openclawVerdict || '-'}</span>
                      <span className={`cc-ta align-${c.taVerdict?.toLowerCase()}`}>TA: {c.taVerdict || '-'}</span>
                      {c.openbbVerdict && <span className={`cc-obb ${c.openbbVerdict.toLowerCase()}`}>BB: {c.openbbVerdict}</span>}
                    </div>
                    <div className={`cc-agreement ${c.agreement}`}>
                      {c.agreement === 'agree' ? '🟢 双重确认' :
                       c.agreement === 'disagree' ? '🔴 激烈分歧' :
                       c.agreement === 'partial' ? '🟡 部分共振' : '⏳ 待定'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        {/* ━━━ 右侧边栏：OpenBB 数据仪表 ━━━ */}
        <aside className="viewer-sidebar">
          {currentOpenBB ? (
            <div className="sidebar-data glass-panel">
              <h4 className="obb-title"><Activity size={16}/> {selectedTicker} 金融底座</h4>
              
              {/* 综合评级大图章 */}
              <div className={`openbb-verdict-card ${currentOpenBB.verdict?.toLowerCase() ?? ''}`}>
                <div className="verdict-label">OpenBB 量化信号</div>
                <div className="verdict-value">{currentOpenBB.verdict ?? '-'}</div>
                <div className="verdict-reason">{currentOpenBB.verdictReason ?? ''}</div>
              </div>

              {/* 视觉进度条指标区 — C1: 全部 optional chaining */}
              <div className="obb-metrics">
                <div className="obb-group">
                  <div className="obb-group-title">技术动量</div>
                  {currentOpenBB.background?.rsi14 != null && (
                    <div className="metric-bar-container">
                      <div className="metric-header">
                        <span>RSI (14)</span>
                        <span className={currentOpenBB.background.rsi14 > 70 ? 'text-red' : currentOpenBB.background.rsi14 < 30 ? 'text-green' : ''}>
                          {currentOpenBB.background.rsi14.toFixed(1)}
                        </span>
                      </div>
                      <div className="metric-track">
                        <div className="metric-fill" style={{ 
                          width: `${Math.min(100, currentOpenBB.background.rsi14)}%`,
                          background: currentOpenBB.background.rsi14 > 70 ? 'var(--accent-crimson)' : currentOpenBB.background.rsi14 < 30 ? 'var(--accent-green)' : 'var(--accent-cyan)'
                        }}></div>
                      </div>
                    </div>
                  )}

                  <div className="metric-status-row">
                    <span>SMA 20 突破</span>
                    {currentOpenBB.core?.priceVsSma20 === 'above' ? 
                      <span className="status-badge green">之上运行</span> : 
                      <span className="status-badge red">跌落趋势</span>}
                  </div>
                </div>

                <div className="obb-group">
                  <div className="obb-group-title">基盘与筹码</div>
                  <div className="metric-row">
                    <span>市值</span>
                    <strong>
                      {currentOpenBB.core?.marketCap != null
                        ? (currentOpenBB.core.marketCap / 1e9 > 1
                          ? `$${(currentOpenBB.core.marketCap / 1e9).toFixed(2)}B`
                          : `$${(currentOpenBB.core.marketCap / 1e6).toFixed(2)}M`)
                        : '-'}
                    </strong>
                  </div>
                  
                  {currentOpenBB.core?.institutionalOwnership != null && (
                    <div className="metric-bar-container">
                      <div className="metric-header">
                        <span>机构持仓</span>
                        <span>{currentOpenBB.core.institutionalOwnership.toFixed(1)}%</span>
                      </div>
                      <div className="metric-track">
                        <div className="metric-fill" style={{ width: `${currentOpenBB.core.institutionalOwnership}%`, background: 'var(--accent-amber)' }}></div>
                      </div>
                    </div>
                  )}

                  <div className="metric-status-row">
                    <span>内部人交易</span>
                    <span className={`status-badge ${currentOpenBB.core?.insiderNetDirection === 'net_buy' ? 'green' : 'red'}`}>
                      {currentOpenBB.core?.insiderNetDirection?.toUpperCase() || '-'}
                    </span>
                  </div>
                </div>

                <div className="obb-group">
                  <div className="obb-group-title">基本面乘数</div>
                  <div className="metric-grid">
                    <div className="m-box">
                      <span className="m-label">P/E</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.peRatio?.toFixed(1) ?? '-'}</span>
                    </div>
                    <div className="m-box">
                      <span className="m-label">P/S</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.psRatio?.toFixed(1) ?? '-'}</span>
                    </div>
                    <div className="m-box">
                      <span className="m-label">Rev YoY</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.revenueGrowthYoY != null ? `${currentOpenBB.auxiliary.revenueGrowthYoY}%` : '-'}</span>
                    </div>
                    <div className="m-box">
                      <span className="m-label">FCF</span>
                      <span className="m-val">{currentOpenBB.auxiliary?.freeCashFlow != null ? `$${currentOpenBB.auxiliary.freeCashFlow.toFixed(1)}` : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="sidebar-empty glass-panel">
              <Activity size={32} />
              <p>等待金融底座数据注入</p>
            </div>
          )}
        </aside>
      </div>

    </div>
  );
}
