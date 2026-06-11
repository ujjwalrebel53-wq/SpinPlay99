#!/bin/bash
# Bot start — pehle check, phir run
set -e
cd "$(dirname "$0")"

echo "=== Rebel Aadhaar Bot — preflight ==="

MISSING=0
for f in bot.py bot_ui.py bot_access.py browser_session.py uidai_api.py react_extract.py proxy_india.py indian_proxy_seeds.txt proxy_ranked.json benchmark_proxies.py; do
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

if [ -d .venv ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if ! python3 -c "import telegram, playwright, dotenv" 2>/dev/null; then
  echo "❌ Dependencies missing — chalao:"
  echo "  pip install -r requirements.txt"
  echo "  playwright install chromium"
  exit 1
fi

echo "✅ OK — bot start ho raha hai…"
exec python3 bot.py
