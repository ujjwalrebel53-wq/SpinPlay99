#!/bin/bash
# Bot start — pehle check, phir run
set -e
cd "$(dirname "$0")"

echo "=== Rebel Aadhaar Bot — preflight ==="

# Ek hi instance — 409 Conflict avoid
if pgrep -f "[p]ython3.*bot\.py" >/dev/null 2>&1; then
  echo "⚠ Purana bot process band kar rahe hain…"
  pkill -f "[p]ython3.*bot\.py" 2>/dev/null || true
  sleep 2
fi

MISSING=0
for f in bot.py bot_ui.py bot_access.py aadhar.py browser_session.py uidai_api.py uidai_cookie_session.py http_uidai_flow.py audio_captcha.py captcha_solver.py react_extract.py proxy_india.py indian_proxy_seeds.txt proxy_ranked.json benchmark_proxies.py; do
  if [ ! -f "$f" ]; then
    echo "❌ Missing: $f"
    MISSING=1
  fi
done
if [ "$MISSING" = 1 ]; then
  echo ""
  echo "Fix — saari files download karo:"
  echo '  BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/www"'
  echo '  for f in bot.py bot_ui.py bot_access.py browser_session.py uidai_api.py react_extract.py proxy_india.py setup.sh; do'
  echo '    wget -O "$f" "$BASE/$f"'
  echo '  done'
  exit 1
fi

if [ ! -f .env ]; then
  echo "❌ .env nahi mila — pehle: bash setup.sh"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN .env me set karo (@BotFather se)"
  exit 1
fi

USE_VENV=0
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  USE_VENV=1
elif [ -d .venv ] && [ ! -f .venv/bin/activate ]; then
  echo "⚠ Broken .venv — system Python use hoga (ya: apt install python3-venv)"
  rm -rf .venv 2>/dev/null || true
fi

if [ "$USE_VENV" = 0 ]; then
  rm -rf .venv 2>/dev/null || true
  if python3 -m venv .venv >/dev/null 2>&1 && [ -f .venv/bin/activate ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
    USE_VENV=1
    echo "📦 venv ready"
  fi
fi

if ! python3 -c "import telegram, playwright, dotenv, requests" 2>/dev/null; then
  echo "📦 Installing dependencies…"
  if [ "$USE_VENV" = 1 ]; then
    pip install -q -r requirements.txt
  else
    pip install -q --user -r requirements.txt 2>/dev/null || pip install -q -r requirements.txt
  fi
  playwright install chromium 2>/dev/null || true
fi

if ! python3 -c "import telegram, playwright, dotenv, requests" 2>/dev/null; then
  echo "❌ Dependencies missing — chalao:"
  echo "  pip install -r requirements.txt"
  echo "  playwright install chromium"
  exit 1
fi

# Webhook hatao — polling conflict fix
if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null \
    && echo "✅ Webhook cleared" || echo "⚠ Webhook clear skip"
fi

echo "✅ OK — bot start ho raha hai…"
exec python3 bot.py
