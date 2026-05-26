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
# shellcheck source=./load-env.sh
source "$ROOT_DIR/scripts/load-env.sh"

echo ""

# 1. OpenBB API (端口 8000)
echo "🟣 [1/6] Starting OpenBB API on :8000..."
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

# 3. OpenClaw daemon
echo "🔵 [3/6] Starting OpenClaw daemon..."
cd "$ROOT_DIR"
npm run daemon &
DAEMON_PID=$!
echo "       PID: $DAEMON_PID"

# 4. OpenClaw API (端口 3000)
echo "🔵 [4/6] Starting OpenClaw API on :3000..."
cd "$ROOT_DIR"
npm run server &
API_PID=$!
echo "       PID: $API_PID"

# 5. Dashboard (端口 5173)
echo "🖥️  [5/6] Starting Dashboard on :5173..."
cd "$ROOT_DIR/dashboard"
npm run dev -- --host 127.0.0.1 --port 5173 &
DASH_PID=$!
echo "       PID: $DASH_PID"

# 6. TrendRadar 定时爬虫 (每30分钟运行一次)
echo "🟡 [6/6] Starting TrendRadar Auto-Scraper (Every 30m)..."
(
  cd "$ROOT_DIR/vendors/trendradar"
  while true; do
    echo "[TrendRadar] 🦇 开始自动化情报采集..."
    "$ROOT_DIR/vendors/openbb/.venv/bin/python3" -m trendradar > crawler.log 2>&1 || true
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
trap "kill $OPENBB_PID $TA_PID $DAEMON_PID $API_PID $DASH_PID $TR_PID 2>/dev/null; pkill -P $TR_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
