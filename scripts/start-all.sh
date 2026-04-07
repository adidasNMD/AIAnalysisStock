#!/bin/bash
# ==========================================
# Sineige Alpha Intelligence Engine
# 一键启动全部服务
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🧬 =========================================="
echo "🧬 Sineige Alpha Intelligence Engine"
echo "🧬 =========================================="
echo ""

# 加载环境变量
if [ -f "$ROOT_DIR/config/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/config/.env" | xargs)
  echo "✅ 已加载 config/.env"
elif [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
  echo "✅ 已加载 .env"
else
  echo "⚠️  未找到 .env 文件，请先复制 config/.env.example 到 config/.env"
  exit 1
fi

echo ""

# 1. OpenBB API (端口 8000)
echo "🟣 [1/4] Starting OpenBB API on :8000..."
cd "$ROOT_DIR/vendors/openbb"
if [ -d ".venv" ]; then
  source .venv/bin/activate
fi
export OPENBB_CREDENTIALS_FMP_API_KEY=$FMP_API_KEY
openbb-api --host 0.0.0.0 --port 8000 &
OPENBB_PID=$!
echo "       PID: $OPENBB_PID"

# 2. TradingAgents API (端口 8001)
echo "🟢 [2/4] Starting TradingAgents API on :8001..."
cd "$ROOT_DIR/vendors/trading-agents"
if [ -d ".venv" ]; then
  source .venv/bin/activate
elif [ -d "../openbb/.venv" ]; then
  source ../openbb/.venv/bin/activate
fi
uvicorn api_server:app --host 0.0.0.0 --port 8001 &
TA_PID=$!
echo "       PID: $TA_PID"

# 3. OpenClaw 主服务 (端口 3000)
echo "🔵 [3/4] Starting OpenClaw on :3000..."
cd "$ROOT_DIR"
npm run daemon &
OC_PID=$!
echo "       PID: $OC_PID"

# 4. Dashboard (端口 5173)
echo "🖥️  [4/5] Starting Dashboard on :5173..."
cd "$ROOT_DIR/dashboard"
npm run dev &
DASH_PID=$!
echo "       PID: $DASH_PID"

# 5. TrendRadar 定时爬虫 (每30分钟运行一次)
echo "🟡 [5/5] Starting TrendRadar Auto-Scraper (Every 30m)..."
(
  cd "$ROOT_DIR/vendors/trendradar"
  while true; do
    echo "[TrendRadar] 🦇 开始自动化情报采集..."
    /Users/sineige/Desktop/AIAnalysisStock/vendors/openbb/.venv/bin/python3 -m trendradar > crawler.log 2>&1 || true
    echo "[TrendRadar] 💤 采集完毕，休眠 30 分钟..."
    sleep 1800
  done
) &
TR_PID=$!
echo "       PID: $TR_PID"

echo ""
echo "✅ =========================================="
echo "✅ All services started!"
echo "✅ =========================================="
echo ""
echo "   🟣 OpenBB API:       http://localhost:8000/docs"
echo "   🟢 TradingAgents:    http://localhost:8001/docs"
echo "   🔵 OpenClaw API:     http://localhost:3000"
echo "   🖥️  Dashboard:        http://localhost:5173"
echo ""
echo "   🟡 TrendRadar:       后台静默定时运行中 (每30分钟)"
echo ""
echo "   按 Ctrl+C 停止所有服务"

# 等待所有后台进程
trap "kill $OPENBB_PID $TA_PID $OC_PID $DASH_PID $TR_PID 2>/dev/null; pkill -P $TR_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
