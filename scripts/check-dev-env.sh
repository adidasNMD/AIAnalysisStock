#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CHECK_VENDORS="${CHECK_VENDORS:-1}"
CHECK_PORTS="${CHECK_PORTS:-0}"

failures=0
warnings=0

note_ok() {
  echo "✅ $1"
}

note_warn() {
  warnings=$((warnings + 1))
  echo "⚠️  $1"
}

note_fail() {
  failures=$((failures + 1))
  echo "❌ $1"
}

require_path() {
  local path="$1"
  local label="$2"
  if [ -e "$path" ]; then
    note_ok "$label"
  else
    note_fail "$label 缺失: $path"
  fi
}

warn_path() {
  local path="$1"
  local label="$2"
  if [ -e "$path" ]; then
    note_ok "$label"
  else
    note_warn "$label 缺失: $path"
  fi
}

port_in_use() {
  local port="$1"
  lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

check_port() {
  local port="$1"
  local label="$2"
  if port_in_use "$port"; then
    note_fail "$label 端口已被占用: $port"
  else
    note_ok "$label 端口可用: $port"
  fi
}

cd "$ROOT_DIR"

echo "🧪 OpenClaw dev environment preflight"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/scripts/load-env.sh" >/dev/null

require_path "$ROOT_DIR/node_modules" "Root node_modules"
require_path "$ROOT_DIR/dashboard/node_modules" "Dashboard node_modules"
require_path "$ROOT_DIR/config/models.yaml" "统一模型配置 config/models.yaml"
require_path "$ROOT_DIR/data" "数据目录 data"

if [ -n "${LLM_API_KEY:-}" ]; then
  note_ok "LLM_API_KEY 已配置"
else
  note_warn "LLM_API_KEY 未配置，OpenClaw AI 分析会失败"
fi

if [ -n "${AI_API_KEY:-}" ]; then
  note_ok "AI_API_KEY 已配置"
else
  note_warn "AI_API_KEY 未配置，TrendRadar AI 过滤会失败"
fi

if [ -n "${FMP_API_KEY:-}" ]; then
  note_ok "FMP_API_KEY 已配置"
else
  note_warn "FMP_API_KEY 未配置，OpenBB/FMP 数据能力会降级"
fi

if [ "$CHECK_VENDORS" = "1" ]; then
  warn_path "$ROOT_DIR/vendors/openbb/.venv/bin/openbb-api" "OpenBB API 可执行文件"
  warn_path "$ROOT_DIR/vendors/openbb/.venv/bin/uvicorn" "uvicorn 可执行文件"
  warn_path "$ROOT_DIR/vendors/trading-agents/api_server.py" "TradingAgents API"
  warn_path "$ROOT_DIR/vendors/trendradar" "TrendRadar 目录"
fi

if [ "$CHECK_PORTS" = "1" ]; then
  check_port 3000 "OpenClaw API"
  check_port 5173 "Dashboard"
  if [ "$CHECK_VENDORS" = "1" ]; then
    check_port 8000 "OpenBB"
    check_port 8001 "TradingAgents"
  fi
fi

echo ""
if [ "$failures" -gt 0 ]; then
  echo "❌ Preflight failed: ${failures} failure(s), ${warnings} warning(s)"
  exit 1
fi

echo "✅ Preflight passed: ${warnings} warning(s)"
