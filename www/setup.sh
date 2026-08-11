#!/bin/bash
# Create .env — pure API bot, no proxy
set -e
cd "$(dirname "$0")"

DEFAULT_OWNER="8432393497"

TOKEN="${1:-}"
CHAT_ID="${2:-}"

if [ -z "$TOKEN" ]; then
  echo "Paste TELEGRAM_BOT_TOKEN from BotFather:"
  read -r TOKEN
fi
if [ -z "$CHAT_ID" ]; then
  echo "Your chat id from @userinfobot (Enter = $DEFAULT_OWNER):"
  read -r CHAT_ID
fi
CHAT_ID="${CHAT_ID:-$DEFAULT_OWNER}"

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_OWNER_ID=$CHAT_ID
TELEGRAM_ALLOWED_CHAT_IDS=$CHAT_ID
UIDAI_CAPTCHA_BYPASS=0
UIDAI_OCR=0
UIDAI_AUTO_CAPTCHA=0
EOF

echo ""
echo "Done — .env created at $(pwd)/.env"
echo "Test API first:"
echo "  python bot.py --test"
echo ""
echo "Next:"
echo "  python3 -m venv .venv && source .venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python bot.py"
