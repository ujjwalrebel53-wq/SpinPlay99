#!/bin/bash
# .env banao — nano ki zaroorat nahi
set -e
cd "$(dirname "$0")"

BUNDLE="./browser-extension/page-bundle.js"
DEFAULT_PROXY="auto"

TOKEN="${1:-}"
CHAT_ID="${2:-}"
PROXY_IN="${3:-}"

if [ -z "$TOKEN" ]; then
  echo "BotFather se TELEGRAM_BOT_TOKEN paste karo:"
  read -r TOKEN
fi
if [ -z "$CHAT_ID" ]; then
  echo "@userinfobot se apna chat id bhejo:"
  read -r CHAT_ID
fi
if [ -z "$PROXY_IN" ]; then
  echo "Indian VPN? Enter=auto India proxy, no=bina proxy:"
  read -r PROXY_IN
fi

case "$PROXY_IN" in
  ""|y|yes|default|auto|india) PROXY="auto" ;;
  no|n|none|skip) PROXY="none" ;;
  *) PROXY="$PROXY_IN" ;;
esac

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_ALLOWED_CHAT_IDS=$CHAT_ID
UIDAI_PROXY=$PROXY
UIDAI_INDIAN_PROXY_AUTO=1
REBEL_BUNDLE_PATH=$BUNDLE
EOF

echo ""
echo "Done — .env ban gaya ($(pwd)/.env)"
echo "Ab chalao:"
echo "  python3 -m venv .venv && source .venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  playwright install chromium"
echo "  python bot.py"
