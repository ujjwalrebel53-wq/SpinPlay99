#!/usr/bin/env bash
# AlwaysData Panel — YE command lagao (Web > Sites > User program)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG="${HOME}/admin/logs/services/rebel-web.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
exec >>"$LOG" 2>&1
echo "=== $(date -Iseconds) run.sh start ==="
echo "PWD=$ROOT USER=$(whoami)"
echo "IP=${IP:-unset} PORT=${PORT:-unset}"

if [[ ! -f .venv/bin/activate ]]; then
  echo "ERROR: .venv missing — run: bash setup_alwaysdata.sh"
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

export WEB_PDF_ENGINE="${WEB_PDF_ENGINE:-http}"
export UIDAI_PDF_CAPTCHA="${UIDAI_PDF_CAPTCHA:-http}"

# Panel MUST give IP + PORT (site wizard se)
if [[ -z "${IP:-}" || -z "${PORT:-}" ]]; then
  echo "ERROR: IP/PORT missing — AlwaysData site Environment mein add karo"
  echo "  IP=fd00::…  PORT=8100  (panel site create karte waqt milta hai)"
  exit 1
fi

if ! python -c "import fastapi, requests, uvicorn" 2>/dev/null; then
  echo "ERROR: pip deps missing"
  pip install -r requirements_alwaysdata.txt
fi

if ! python -c "from web_app_alwaysdata import app" 2>/dev/null; then
  echo "ERROR: web_app_alwaysdata import fail"
  exit 1
fi

echo "Starting uvicorn on ${IP}:${PORT}"
exec python -m uvicorn web_app_alwaysdata:app \
  --host "$IP" \
  --port "$PORT" \
  --app-dir "$ROOT" \
  --log-level info
