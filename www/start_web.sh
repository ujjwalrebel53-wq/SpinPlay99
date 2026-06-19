#!/usr/bin/env bash
# Rebel Aadhaar Web Panel — e-Aadhaar PDF on website
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "[!] .env missing — copy .env.example and set WEB_ACCESS_PIN"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

export WEB_HOST="${WEB_HOST:-0.0.0.0}"
export WEB_PORT="${WEB_PORT:-8080}"

PY="${PYTHON:-python3}"
if ! "$PY" -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "[*] Installing web dependencies…"
  "$PY" -m pip install -q fastapi uvicorn python-multipart
fi

echo "[*] Rebel Web Panel — http://${WEB_HOST}:${WEB_PORT}"
echo "[*] PIN: ${WEB_ACCESS_PIN:+set}${WEB_ACCESS_PIN:-OFF (open)}"

exec "$PY" -m uvicorn web_app:app --host "$WEB_HOST" --port "$WEB_PORT" --app-dir "$ROOT"
