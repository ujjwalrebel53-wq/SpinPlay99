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

if ! "$PY" -c "import fastapi, requests" 2>/dev/null; then
  echo "[!] deps missing — bash setup_alwaysdata.sh"
  exit 1
fi

if [[ -z "${INDIA_API_URL:-}" ]]; then
  export WEB_PDF_ENGINE="${WEB_PDF_ENGINE:-http}"
  export UIDAI_PDF_CAPTCHA="${UIDAI_PDF_CAPTCHA:-http}"
fi

if [[ -z "${INDIA_API_URL:-}" ]]; then
  echo "[*] AlwaysData HTTP standalone (no browser)"
else
  echo "[*] AlwaysData proxy → ${INDIA_API_URL}"
fi
exec "$PY" -m uvicorn web_app_alwaysdata:app --host "$HOST" --port "$PORT" --app-dir "$ROOT"
