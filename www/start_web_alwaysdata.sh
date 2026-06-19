#!/usr/bin/env bash
# AlwaysData — website only (engine Indian VPS pe)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

HOST="${IP:-${WEB_HOST:-0.0.0.0}}"
PORT="${PORT:-${WEB_PORT:-8080}}"

PY="python"
command -v python >/dev/null 2>&1 || PY="python3"

if ! "$PY" -c "import fastapi, httpx" 2>/dev/null; then
  echo "[!] deps missing — bash setup_alwaysdata.sh"
  exit 1
fi

if [[ -z "${INDIA_API_URL:-}" || -z "${INDIA_API_KEY:-}" ]]; then
  echo "[!] INDIA_API_URL aur INDIA_API_KEY .env mein set karo"
  exit 1
fi

echo "[*] AlwaysData Web → India API: ${INDIA_API_URL}"
exec "$PY" -m uvicorn web_app_alwaysdata:app --host "$HOST" --port "$PORT" --app-dir "$ROOT"
