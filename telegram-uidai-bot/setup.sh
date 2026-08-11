#!/bin/bash
# .env banao — pure API bot, no proxy
set -e
WWW_DIR="$(cd "$(dirname "$0")/../www" && pwd)"
cd "$WWW_DIR"

TOKEN="${1:-}"
CHAT_ID="${2:-}"

if [ -z "$TOKEN" ]; then
  echo "BotFather se TELEGRAM_BOT_TOKEN paste karo:"
  read -r TOKEN
fi
if [ -z "$CHAT_ID" ]; then
  echo "@userinfobot se apna chat id bhejo:"
  read -r CHAT_ID
fi

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_ALLOWED_CHAT_IDS=$CHAT_ID
TELEGRAM_OWNER_ID=$CHAT_ID
EOF

echo ""
echo "Done — .env ban gaya ($WWW_DIR/.env)"
echo "Pehle test: python bot.py --test"
echo "Ab chalao:"
echo "  cd $WWW_DIR"
echo "  python3 -m venv .venv && source .venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python bot.py"
