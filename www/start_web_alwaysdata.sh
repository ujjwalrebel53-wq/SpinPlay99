#!/usr/bin/env bash
# AlwaysData — User Program site start (Web > Sites > User program)
# Panel mein Environment variables set karo: IP=fd00::…  PORT=8100
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

# AlwaysData panel injects these for User Program sites
HOST="${IP:-${WEB_HOST:-0.0.0.0}}"
PORT="${PORT:-${WEB_PORT:-8080}}"

PY="python"
if ! command -v python >/dev/null 2>&1; then
  PY="python3"
fi

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

if ! "$PY" -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "[!] fastapi missing — pehle: bash setup_alwaysdata.sh"
  exit 1
fi

echo "[*] Rebel Web (AlwaysData) — host=$HOST port=$PORT"
exec "$PY" -m uvicorn web_app:app --host "$HOST" --port "$PORT" --app-dir "$ROOT"
