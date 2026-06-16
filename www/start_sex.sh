#!/bin/bash
# Classic /open SMS bot — Indian VPS (multi-user safe restart)
set -e

# Must run under bash (not sh/dash)
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

cd "$(dirname "$0")"

echo "=== Rebel /open bot (sex.py) ==="

LOCKFILE="${TMPDIR:-/tmp}/aadhar-bot-sex.lock"

_stop_old() {
  pkill -TERM -f "[p]ython3.*sex\.py" 2>/dev/null || true
  pkill -TERM -f "[p]ython3.*bot\.py" 2>/dev/null || true
  local pid
  for pid in $(pgrep -f 'start_sex\.sh' 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    kill -TERM "$pid" 2>/dev/null || true
  done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f "[p]ython3.*sex\.py" >/dev/null || break
    sleep 1
  done
  pkill -KILL -f "[p]ython3.*sex\.py" 2>/dev/null || true
  pkill -KILL -f "[p]ython3.*bot\.py" 2>/dev/null || true
  for pid in $(pgrep -f 'start_sex\.sh' 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    kill -KILL "$pid" 2>/dev/null || true
  done
  pkill -f "chromium.*headless" 2>/dev/null || true
  pkill -f "playwright.*run-driver" 2>/dev/null || true
  sleep 1
}

# Kill stale processes FIRST — then take lock
_stop_old

exec 9>"$LOCKFILE"
if ! flock -n 9; then
  if [ "${FORCE_RESTART:-0}" = "1" ]; then
    echo "⚠ FORCE_RESTART — clearing stale lock…"
    _stop_old
    sleep 2
    flock -n 9 || { echo "❌ Could not acquire lock ($LOCKFILE)"; exit 1; }
  else
    echo "❌ sex.py already running (lock: $LOCKFILE)"
    echo "   Fix: FORCE_RESTART=1 bash start_sex.sh"
    exit 1
  fi
fi

for f in sex.py bot_ui_classic.py bot_access.py browser_session.py uidai_api.py react_extract.py captcha_solver.py audio_captcha.py aadhar.py pdf_unlock.py; do
  [ -f "$f" ] || { echo "❌ Missing: $f"; exit 1; }
done

[ -f .env ] || { echo "❌ .env missing — run setup_india_vps.sh or bash setup.sh TOKEN CHAT_ID"; exit 1; }

TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$TELEGRAM_BOT_TOKEN" ] || { echo "❌ TELEGRAM_BOT_TOKEN empty in .env"; exit 1; }
[ "${#TELEGRAM_BOT_TOKEN}" -ge 20 ] || { echo "❌ TELEGRAM_BOT_TOKEN invalid (too short)"; exit 1; }

PYTHON=python3
if [ -f .venv/bin/python ]; then
  PYTHON=".venv/bin/python"
elif [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  PYTHON=python3
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null \
    && echo "✅ Webhook cleared" || echo "⚠ Webhook clear failed (check token)"
fi

if ! "$PYTHON" -c "import dotenv, telegram, playwright" 2>/dev/null; then
  echo "❌ Python deps missing — run: bash install_all.sh"
  echo "   Or: pip install -r requirements_sex.txt && playwright install chromium"
  exit 1
fi

echo "✅ Starting sex.py with $PYTHON …"
exec "$PYTHON" sex.py
