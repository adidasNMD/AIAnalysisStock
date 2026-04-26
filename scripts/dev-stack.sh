#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DEV_START_VENDORS="${DEV_START_VENDORS:-1}"
DEV_START_TRENDRADAR="${DEV_START_TRENDRADAR:-1}"
DEV_START_DAEMON="${DEV_START_DAEMON:-1}"
DEV_START_DASHBOARD="${DEV_START_DASHBOARD:-1}"
DEV_LOG_DIR="${DEV_LOG_DIR:-$ROOT_DIR/tmp/dev-stack}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-vendors)
      DEV_START_VENDORS=0
      ;;
    --no-trendradar)
      DEV_START_TRENDRADAR=0
      ;;
    --api-only)
      DEV_START_VENDORS=0
      DEV_START_DAEMON=0
      DEV_START_DASHBOARD=0
      DEV_START_TRENDRADAR=0
      ;;
    --no-dashboard)
      DEV_START_DASHBOARD=0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT_DIR"
mkdir -p "$DEV_LOG_DIR"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/scripts/load-env.sh"

CHECK_VENDORS="$DEV_START_VENDORS" CHECK_PORTS=1 bash "$ROOT_DIR/scripts/check-dev-env.sh"

port_in_use() {
  local port="$1"
  lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-20}"
  local delay="${4:-1}"

  for _ in $(seq 1 "$attempts"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "✅ ${name} ready -> ${url}"
      return 0
    fi
    sleep "$delay"
  done

  echo "⚠️  ${name} readiness check timed out -> ${url}"
  return 1
}

require_port_free() {
  local port="$1"
  local label="$2"
  if port_in_use "$port"; then
    echo "❌ ${label} 需要端口 ${port}，但该端口已被占用"
    exit 1
  fi
}

cleanup() {
  kill "${OPENBB_PID:-}" "${TA_PID:-}" "${TR_PID:-}" "${SERVER_PID:-}" "${DAEMON_PID:-}" "${DASH_PID:-}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "🧬 启动 OpenClaw 开发栈..."
echo "📁 日志目录: $DEV_LOG_DIR"

require_port_free 3000 "OpenClaw API"
if [ "$DEV_START_DASHBOARD" = "1" ]; then
  require_port_free 5173 "Dashboard"
fi
if [ "$DEV_START_VENDORS" = "1" ]; then
  require_port_free 8000 "OpenBB"
  require_port_free 8001 "TradingAgents"
fi

if [ "$DEV_START_VENDORS" = "1" ] && [ -x "$ROOT_DIR/vendors/openbb/.venv/bin/openbb-api" ]; then
  (
    cd "$ROOT_DIR/vendors/openbb"
    source .venv/bin/activate
    export OPENBB_CREDENTIALS_FMP_API_KEY="${FMP_API_KEY:-}"
    openbb-api --host 127.0.0.1 --port 8000
  ) > "$DEV_LOG_DIR/openbb.log" 2>&1 &
  OPENBB_PID=$!
  wait_for_http "OpenBB" "http://127.0.0.1:8000/api/v1/system/health" 30 1 || true
else
  echo "ℹ️  跳过 OpenBB（DEV_START_VENDORS=${DEV_START_VENDORS} 或可执行文件缺失）"
fi

if [ "$DEV_START_VENDORS" = "1" ] && [ -f "$ROOT_DIR/vendors/trading-agents/api_server.py" ] && [ -x "$ROOT_DIR/vendors/openbb/.venv/bin/uvicorn" ]; then
  (
    cd "$ROOT_DIR/vendors/trading-agents"
    source "$ROOT_DIR/vendors/openbb/.venv/bin/activate"
    uvicorn api_server:app --host 127.0.0.1 --port 8001 --reload
  ) > "$DEV_LOG_DIR/trading-agents.log" 2>&1 &
  TA_PID=$!
  wait_for_http "TradingAgents" "http://127.0.0.1:8001/api/health" 30 1 || true
else
  echo "ℹ️  跳过 TradingAgents（DEV_START_VENDORS=${DEV_START_VENDORS} 或可执行文件缺失）"
fi

if [ "$DEV_START_VENDORS" = "1" ] && [ "$DEV_START_TRENDRADAR" = "1" ] && [ -d "$ROOT_DIR/vendors/trendradar" ] && [ -x "$ROOT_DIR/vendors/openbb/.venv/bin/python3" ]; then
  (
    cd "$ROOT_DIR/vendors/trendradar"
    "$ROOT_DIR/vendors/openbb/.venv/bin/python3" -m trendradar
  ) > "$DEV_LOG_DIR/trendradar.log" 2>&1 &
  TR_PID=$!
  echo "✅ TrendRadar started"
else
  echo "ℹ️  跳过 TrendRadar（DEV_START_VENDORS=${DEV_START_VENDORS}, DEV_START_TRENDRADAR=${DEV_START_TRENDRADAR} 或 Python 环境缺失）"
fi

npm run dev:server > "$DEV_LOG_DIR/openclaw-api.log" 2>&1 &
SERVER_PID=$!
wait_for_http "OpenClaw API" "http://127.0.0.1:3000/api/health" 30 1

if [ "$DEV_START_DAEMON" = "1" ]; then
  npm run dev:daemon > "$DEV_LOG_DIR/openclaw-daemon.log" 2>&1 &
  DAEMON_PID=$!
else
  echo "ℹ️  跳过 OpenClaw daemon（DEV_START_DAEMON=${DEV_START_DAEMON}）"
fi

if [ "$DEV_START_DASHBOARD" = "1" ]; then
  npm run dev:dashboard > "$DEV_LOG_DIR/dashboard.log" 2>&1 &
  DASH_PID=$!
  wait_for_http "Dashboard" "http://127.0.0.1:5173" 30 1
else
  echo "ℹ️  跳过 Dashboard（DEV_START_DASHBOARD=${DEV_START_DASHBOARD}）"
fi

echo ""
echo "✅ 开发栈已启动"
echo "   API:       http://127.0.0.1:3000"
if [ "$DEV_START_DASHBOARD" = "1" ]; then
  echo "   Dashboard: http://127.0.0.1:5173"
fi
if [ "$DEV_START_VENDORS" = "1" ]; then
  echo "   OpenBB:    http://127.0.0.1:8000/docs"
  echo "   TA:        http://127.0.0.1:8001/docs"
fi
echo "   Logs:      $DEV_LOG_DIR"
echo ""
echo "按 Ctrl+C 结束全部进程"

wait
