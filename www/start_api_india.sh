#!/usr/bin/env bash
# Indian VPS — PDF engine API (Playwright + UIDAI)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "[!] .env missing — INDIA_API_KEY set karo"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

HOST="${INDIA_API_HOST:-0.0.0.0}"
PORT="${INDIA_API_PORT:-8787}"
PY="${PYTHON:-python3}"

if [[ -z "${INDIA_API_KEY:-}" ]]; then
  echo "[!] INDIA_API_KEY empty — .env mein strong key daalo"
  exit 1
fi

echo "[*] India PDF API — http://${HOST}:${PORT}"
exec "$PY" -m uvicorn web_api_india:app --host "$HOST" --port "$PORT" --app-dir "$ROOT"
