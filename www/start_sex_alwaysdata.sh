#!/usr/bin/env bash
# AlwaysData Service — Telegram bot background (optional)
# Panel: Advanced > Services > Add
#   Directory: .../www
#   Command: bash start_sex_alwaysdata.sh
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

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

PY="python"
command -v python >/dev/null 2>&1 || PY="python3"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "[!] TELEGRAM_BOT_TOKEN missing in .env"
  exit 1
fi

echo "[*] Rebel Telegram bot (AlwaysData service)…"
exec "$PY" sex.py
