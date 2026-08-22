#!/bin/bash
# Login Try Bot — separate Telegram bot for configured site password tries
set -e
cd "$(dirname "$0")"

echo "=== Login Try Bot (login_bot.py) ==="

pkill -TERM -f "[p]ython3.*login_bot\.py" 2>/dev/null || true
sleep 1
pkill -KILL -f "[p]ython3.*login_bot\.py" 2>/dev/null || true

[ -f .env ] || { echo "❌ .env missing"; exit 1; }

LOGIN_BOT_TOKEN=$(grep -E '^LOGIN_BOT_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$LOGIN_BOT_TOKEN" ] || { echo "❌ Set LOGIN_BOT_TOKEN in .env"; exit 1; }

grep -q '^LOGIN_SITE_URL=' .env || { echo "❌ Set LOGIN_SITE_URL in .env"; exit 1; }
grep -q '^LOGIN_USERNAME=' .env || { echo "❌ Set LOGIN_USERNAME in .env"; exit 1; }

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

for f in login_bot.py login_try.py pdf_unlock.py uidai_api.py bot_access.py; do
  [ -f "$f" ] || { echo "❌ Missing: $f"; exit 1; }
done

python3 -c "import selenium" 2>/dev/null || {
  echo "Installing selenium…"
  pip install -q "selenium>=4.15.0"
}
python3 -c "
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
o = Options()
o.add_argument('--headless=new')
o.add_argument('--no-sandbox')
o.add_argument('--disable-dev-shm-usage')
d = webdriver.Chrome(options=o)
d.get('about:blank')
d.quit()
print('✅ Selenium + Chrome OK')
" || {
  echo "❌ Selenium/Chrome fail — install: apt install chromium-browser OR set CHROME_BIN in .env"
  exit 1
}

curl -fsS "https://api.telegram.org/bot${LOGIN_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null 2>&1 || true

nohup python3 login_bot.py >> login_bot.log 2>&1 &
echo "✅ Login Try Bot started (PID $!) — tail -f login_bot.log"
