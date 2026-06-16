#!/bin/bash
# Classic /open SMS bot — Indian VPS (multi-user safe restart)
set -e

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

cd "$(dirname "$0")"

echo "=== Rebel /open bot (sex.py) ==="

LOCKFILE="${TMPDIR:-/tmp}/aadhar-bot-sex.lock"
CURL_TG=(--connect-timeout 15 --max-time 25 -fsS)

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

TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs)
[ -n "$TELEGRAM_BOT_TOKEN" ] || { echo "❌ TELEGRAM_BOT_TOKEN empty in .env"; exit 1; }
case "$TELEGRAM_BOT_TOKEN" in *:*) ;; *)
  echo "❌ TELEGRAM_BOT_TOKEN format galat"; exit 1 ;; esac

PYTHON=python3
if [ -f .venv/bin/python ]; then
  PYTHON=".venv/bin/python"
elif [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  PYTHON=python3
fi

_telegram_network_fail() {
  echo "❌ NETWORK — VPS api.telegram.org tak nahi pahunch raha (timeout)"
  echo ""
  echo "Ye token problem NAHI hai — datacenter Telegram block karta hai."
  echo ""
  echo "Quick fix: bash fix_telegram_network.sh"
  echo ""
  echo "Manual:"
  echo "  .env → TELEGRAM_PROXY=http://IP:PORT  (ya UIDAI_PROXY same)"
  echo "  pip install 'httpx[socks]'"
  echo "  FORCE_RESTART=1 bash start_sex.sh"
  exit 1
}

_read_env_proxy() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs
}

if command -v curl >/dev/null 2>&1; then
  TG_PROXY=$(_read_env_proxy TELEGRAM_PROXY)
  [ -z "$TG_PROXY" ] && TG_PROXY=$(_read_env_proxy UIDAI_PROXY)
  [ "$TG_PROXY" = "auto" ] && TG_PROXY=""

  CURL_DIRECT=(curl "${CURL_TG[@]}" -o /dev/null)
  if ! "${CURL_DIRECT[@]}" "https://api.telegram.org" 2>/dev/null; then
    if [ -n "$TG_PROXY" ] && curl "${CURL_TG[@]}" -x "$TG_PROXY" -o /dev/null "https://api.telegram.org" 2>/dev/null; then
      echo "✅ Telegram via proxy ($TG_PROXY)"
      [ -z "$(_read_env_proxy TELEGRAM_PROXY)" ] && echo "TELEGRAM_PROXY=$TG_PROXY" >> .env
    else
      _telegram_network_fail
    fi
  else
    echo "✅ Telegram direct OK"
  fi
  CURL_EXTRA=()
  [ -n "$TG_PROXY" ] && CURL_EXTRA=(-x "$TG_PROXY")
  curl "${CURL_TG[@]}" "${CURL_EXTRA[@]}" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null \
    && echo "✅ Webhook cleared" || echo "⚠ Webhook clear skipped"
  ME_JSON=$(curl "${CURL_TG[@]}" "${CURL_EXTRA[@]}" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" 2>&1) || ME_JSON=""
  if ! echo "$ME_JSON" | grep -q '"ok":true'; then
    if echo "$ME_JSON" | grep -qiE 'timed out|timeout|couldn.t connect|failed to connect'; then
      _telegram_network_fail
    fi
    echo "❌ Token reject — getMe fail:"
    echo "$ME_JSON" | head -5
    echo "Fix: @BotFather se sahi TELEGRAM_BOT_TOKEN .env mein (no quotes)"
    exit 1
  fi
  BOT_USER=$(echo "$ME_JSON" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "✅ Token OK — @${BOT_USER:-bot}"
fi

if ! "$PYTHON" -c "import dotenv, telegram, playwright" 2>/dev/null; then
  echo "❌ Python deps missing — run: bash install_all.sh"
  exit 1
fi

echo "✅ Starting sex.py with $PYTHON …"
exec "$PYTHON" sex.py
