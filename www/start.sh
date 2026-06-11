#!/bin/bash
# Bot start — preflight checks then run
set -e
cd "$(dirname "$0")"

echo "=== Rebel Aadhaar Bot — preflight ==="

# Single instance — avoid 409 Conflict
if pgrep -f "[p]ython3.*bot\.py" >/dev/null 2>&1; then
  echo "⚠ Stopping previous bot process…"
  pkill -f "[p]ython3.*bot\.py" 2>/dev/null || true
  sleep 2
fi

MISSING=0
for f in bot.py bot_ui.py bot_access.py aadhar.py browser_session.py uidai_api.py uidai_cookie_session.py http_uidai_flow.py audio_captcha.py captcha_solver.py react_extract.py; do
  if [ ! -f "$f" ]; then
    echo "❌ Missing: $f"
    MISSING=1
  fi
done
if [ "$MISSING" = 1 ]; then
  echo ""
  echo "Fix — download all files:"
  echo '  BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/www"'
  echo '  for f in bot.py bot_ui.py bot_access.py browser_session.py uidai_api.py react_extract.py setup.sh; do'
  echo '    wget -O "$f" "$BASE/$f"'
  echo '  done'
  exit 1
fi

if [ ! -f .env ]; then
  echo "❌ .env not found — run: bash setup.sh"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz" ]; then
  echo "❌ Set TELEGRAM_BOT_TOKEN in .env (from @BotFather)"
  exit 1
fi

USE_VENV=0
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  USE_VENV=1
elif [ -d .venv ] && [ ! -f .venv/bin/activate ]; then
  echo "⚠ Broken .venv — using system Python (or: apt install python3-venv)"
  rm -rf .venv 2>/dev/null || true
fi

if [ "$USE_VENV" = 0 ]; then
  rm -rf .venv 2>/dev/null || true
  if python3 -m venv .venv >/dev/null 2>&1 && [ -f .venv/bin/activate ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
    USE_VENV=1
    echo "📦 venv ready"
  else
    echo "📦 venv failed — try: bash install.sh"
    pip3 install --user virtualenv 2>/dev/null || true
    if python3 -m virtualenv .venv 2>/dev/null || ~/.local/bin/virtualenv .venv 2>/dev/null; then
      # shellcheck disable=SC1091
      source .venv/bin/activate
      USE_VENV=1
    fi
  fi
fi

need_install=0
python3 -c "import telegram, dotenv, requests" 2>/dev/null || need_install=1

if [ "$need_install" = 1 ]; then
  echo "📦 Installing dependencies (venv, no sudo)…"
  if [ "$USE_VENV" = 1 ]; then
    pip install -q -r requirements.txt
  else
    pip install -q --user -r requirements.txt 2>/dev/null || pip install -q -r requirements.txt
  fi
fi

# playwright optional — /pdf = aadhar.py, /open = browser
if python3 -c "import playwright" 2>/dev/null; then
  if ! python3 -m playwright install --dry-run chromium >/dev/null 2>&1; then
    echo "⚠ Chromium not installed — run: bash install_playwright.sh"
    echo "  (/pdf works without Chromium; /open and sex.py need it)"
  fi
fi

if ! python3 -c "import telegram, dotenv, requests" 2>/dev/null; then
  echo "❌ Dependencies missing — run: bash install.sh"
  exit 1
fi

if ! python3 -c "import aadhar" 2>/dev/null; then
  echo "❌ aadhar.py missing — download with wget"
  exit 1
fi

# Clear webhook — polling conflict fix
if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null \
    && echo "✅ Webhook cleared" || echo "⚠ Webhook clear skipped"
fi

if ! python3 -c "import playwright" 2>/dev/null; then
  echo "⚠ Playwright not installed — /pdf works; for /open run: pip install playwright && playwright install chromium"
fi

echo "✅ OK — starting bot…"
exec python3 bot.py
