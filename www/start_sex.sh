#!/bin/bash
# Classic /open SMS bot — Indian VPS only (multi-user safe start)
set -e
cd "$(dirname "$0")"

echo "=== Rebel /open bot (sex.py) ==="

LOCKFILE="${TMPDIR:-/tmp}/aadhar-bot-sex.lock"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "❌ sex.py already running (lock: $LOCKFILE)"
  exit 1
fi

pkill -TERM -f "[p]ython3.*sex\.py" 2>/dev/null || true
pkill -TERM -f "[p]ython3.*bot\.py" 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pgrep -f "[p]ython3.*sex\.py" >/dev/null || break
  sleep 1
done
pkill -KILL -f "[p]ython3.*sex\.py" 2>/dev/null || true
pkill -KILL -f "[p]ython3.*bot\.py" 2>/dev/null || true
pkill -f "chromium.*headless" 2>/dev/null || true
pkill -f "playwright.*run-driver" 2>/dev/null || true
sleep 2

for f in sex.py bot_ui_classic.py bot_access.py browser_session.py uidai_api.py react_extract.py captcha_solver.py audio_captcha.py aadhar.py pdf_unlock.py; do
  [ -f "$f" ] || { echo "❌ Missing: $f"; exit 1; }
done

[ -f .env ] || { echo "❌ .env missing — run setup_india_vps.sh"; exit 1; }

TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
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
  echo "❌ Playwright missing — run: bash install_all.sh"
  exit 1
}

if [ "${SKIP_CHROMIUM_TEST:-0}" != "1" ]; then
  timeout 20 python3 -c "
from playwright.sync_api import sync_playwright
p = sync_playwright().start()
b = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
b.close()
p.stop()
" 2>/dev/null || echo "⚠ Chromium test skipped/failed — starting bot anyway"
else
  echo "⚠ SKIP_CHROMIUM_TEST=1 — chromium preflight skipped"
fi

echo "✅ Starting sex.py…"
exec python3 sex.py
