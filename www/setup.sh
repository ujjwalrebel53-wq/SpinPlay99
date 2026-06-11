#!/bin/bash
# Create .env — no nano needed
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
TELEGRAM_OWNER_ID=$DEFAULT_OWNER
TELEGRAM_ALLOWED_CHAT_IDS=$CHAT_ID
UIDAI_CAPTCHA_BYPASS=1
UIDAI_OCR=1
UIDAI_COOKIE_SEED=1
EOF

echo ""
echo "Done — .env created at $(pwd)/.env"
echo "Next:"
echo "  python3 -m venv .venv && source .venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  playwright install chromium"
echo "  python bot.py"
