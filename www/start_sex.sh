#!/bin/bash
# Classic /open SMS bot — Indian VPS only
set -e
cd "$(dirname "$0")"

echo "=== Rebel /open bot (sex.py) ==="

pkill -f "[p]ython3.*sex\.py" 2>/dev/null || true
pkill -f "[p]ython3.*bot\.py" 2>/dev/null || true
sleep 2

for f in sex.py bot_ui_classic.py bot_access.py browser_session.py uidai_api.py react_extract.py; do
  [ -f "$f" ] || { echo "❌ Missing: $f"; exit 1; }
done

[ -f .env ] || { echo "❌ .env missing — run setup_india_vps.sh"; exit 1; }

# shellcheck disable=SC1091
set -a
source .env
set +a

[ -n "$TELEGRAM_BOT_TOKEN" ] || { echo "❌ TELEGRAM_BOT_TOKEN in .env"; exit 1; }

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null \
    && echo "✅ Webhook cleared" || true
fi

python3 -c "import playwright" 2>/dev/null || {
  echo "❌ Playwright missing — bash install_playwright.sh"
  exit 1
}

echo "✅ Starting sex.py…"
exec python3 sex.py
