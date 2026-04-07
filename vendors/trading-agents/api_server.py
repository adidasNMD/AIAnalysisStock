"""
Sineige Alpha Engine — TradingAgents FastAPI Wrapper

将 TradingAgents 的 LangGraph 分析引擎包装为 HTTP 微服务。
这是在 vendors/trading-agents/ 中唯一新增的文件。

端口: 8001
接口:
  POST /api/analyze  — 分析单只票，返回完整辩论记录 + PM 裁决
  GET  /api/health   — 健康检查

启动: uvicorn api_server:app --host 0.0.0.0 --port 8001
"""

import os
import sys
import json
import time
import traceback
from datetime import date, datetime
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 确保 tradingagents 模块可导入
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

app = FastAPI(
    title="TradingAgents API",
    description="Sineige Alpha Engine — 第二大脑 (量化分析引擎)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== 请求/响应模型 =====

class AnalyzeRequest(BaseModel):
    ticker: str
    date: Optional[str] = None  # "YYYY-MM-DD", 默认今天
    config: Optional[Dict[str, Any]] = None  # 来自 OpenClaw 的统一模型配置
    context: Optional[str] = None  # 前置推导上下文


class AnalyzeResponse(BaseModel):
    ticker: str
    date: str
    status: str  # "success" | "error"
    decision: str  # 最终裁决文本
    log_states: Dict[str, Any]  # 完整的分析过程
    duration_seconds: float
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    version: str
    default_provider: str
    default_model: str


# ===== 配置构建 =====

def build_config(client_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    合并默认配置和客户端传入的配置。
    客户端配置来自 OpenClaw 的统一模型配置中心 (config/models.yaml)。
    """
    config = DEFAULT_CONFIG.copy()

    if client_config:
        # 映射 OpenClaw 的统一配置到 TradingAgents 的配置格式
        if "llm_provider" in client_config:
            config["llm_provider"] = client_config["llm_provider"]
        if "base_url" in client_config:
            config["backend_url"] = client_config["base_url"]
        if "researchers_model" in client_config:
            config["deep_think_llm"] = client_config["researchers_model"]
        if "analysts_model" in client_config:
            config["quick_think_llm"] = client_config["analysts_model"]

        # 设置 API KEY 到环境变量（TradingAgents 内部通过 env 读取）
        if "api_key" in client_config:
            provider = config.get("llm_provider", "openai").lower()
            if provider == "zhipu":
                os.environ["ZHIPUAI_API_KEY"] = client_config["api_key"]
            elif provider == "openai":
                os.environ["OPENAI_API_KEY"] = client_config["api_key"]
            elif provider == "anthropic":
                os.environ["ANTHROPIC_API_KEY"] = client_config["api_key"]

    # 中文输出
    config["output_language"] = "Chinese"

    # 结果存放到主仓库的 out 目录
    results_dir = os.environ.get(
        "TRADINGAGENTS_RESULTS_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "out", "ta_results")
    )
    config["results_dir"] = results_dir

    return config


# ===== 接口实现 =====

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_ticker(request: AnalyzeRequest):
    """
    分析单只票。

    调用 TradingAgents 的完整 LangGraph 流程：
    4位分析师 → Bull/Bear辩论 → Trader → 风控三方 → Portfolio Manager

    返回完整的 log_states_dict（包含所有分析师报告、辩论记录、PM裁决）。
    """
    ticker = request.ticker.upper().replace("$", "")
    analysis_date = request.date or date.today().isoformat()

    print(f"\n{'='*60}")
    print(f"[TradingAgents API] 🟢 开始分析: {ticker} ({analysis_date})")
    print(f"{'='*60}\n")

    start_time = time.time()

    try:
        # 构建配置
        config = build_config(request.config)

        # 创建 TradingAgents 图
        ta_graph = TradingAgentsGraph(
            selected_analysts=["market", "social", "news", "fundamentals"],
            config=config,
            debug=False,
        )

        # 执行分析
        final_state, decision = ta_graph.propagate(ticker, analysis_date, request.context)

        duration = round(time.time() - start_time, 2)

        # 获取完整的 log_states
        log_states = ta_graph.log_states_dict.get(str(analysis_date), {})

        print(f"\n[TradingAgents API] ✅ {ticker} 分析完成 ({duration}s)")
        print(f"[TradingAgents API] 🎯 裁决: {decision}")

        return AnalyzeResponse(
            ticker=ticker,
            date=analysis_date,
            status="success",
            decision=str(decision),
            log_states=make_serializable(log_states),
            duration_seconds=duration,
        )

    except Exception as e:
        duration = round(time.time() - start_time, 2)
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n[TradingAgents API] ❌ {ticker} 分析失败 ({duration}s): {error_msg}")
        traceback.print_exc()

        return AnalyzeResponse(
            ticker=ticker,
            date=analysis_date,
            status="error",
            decision="",
            log_states={},
            duration_seconds=duration,
            error=error_msg,
        )


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """健康检查"""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        default_provider=DEFAULT_CONFIG.get("llm_provider", "unknown"),
        default_model=DEFAULT_CONFIG.get("deep_think_llm", "unknown"),
    )


@app.get("/")
async def root():
    return {
        "service": "TradingAgents API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }


# ===== 工具函数 =====

def make_serializable(obj: Any) -> Any:
    """递归将对象转为 JSON 可序列化格式"""
    if isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_serializable(item) for item in obj]
    elif isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif hasattr(obj, '__dict__'):
        return make_serializable(obj.__dict__)
    elif isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    else:
        return str(obj)


# ===== 启动入口 =====

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("TA_PORT", "8001"))
    print(f"\n🟢 TradingAgents API starting on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
