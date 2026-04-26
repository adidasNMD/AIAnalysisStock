#!/usr/bin/env bash

# Source this script from other scripts to load the same environment file
# without printing or reshaping secret values.

OPENCLAW_ENV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_ROOT="${OPENCLAW_ROOT:-$(dirname "$OPENCLAW_ENV_SCRIPT_DIR")}"

if [ -f "$OPENCLAW_ROOT/config/.env" ]; then
  OPENCLAW_ENV_FILE="$OPENCLAW_ROOT/config/.env"
elif [ -f "$OPENCLAW_ROOT/.env" ]; then
  OPENCLAW_ENV_FILE="$OPENCLAW_ROOT/.env"
else
  echo "⚠️  未找到 .env 文件，请先复制 config/.env.example 到 .env 或 config/.env"
  if [ "${BASH_SOURCE[0]}" != "$0" ]; then
    return 1
  fi
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$OPENCLAW_ENV_FILE"
set +a

export OPENCLAW_ENV_FILE
echo "✅ 已加载 ${OPENCLAW_ENV_FILE#$OPENCLAW_ROOT/}"
