#!/bin/bash
# .env banao — nano ki zaroorat nahi
set -e
WWW_DIR="$(cd "$(dirname "$0")/../www" && pwd)"
cd "$WWW_DIR"

BUNDLE="$WWW_DIR/browser-extension/page-bundle.js"
DEFAULT_PROXY="http://139.167.218.162:3127"

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
  echo "Proxy? Enter = default, no = bina proxy:"
  read -r PROXY_IN
fi

case "$PROXY_IN" in
  ""|y|yes|default) PROXY="$DEFAULT_PROXY" ;;
  no|n|none|skip) PROXY="" ;;
  *) PROXY="$PROXY_IN" ;;
esac

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_ALLOWED_CHAT_IDS=$CHAT_ID
UIDAI_PROXY=$PROXY
REBEL_BUNDLE_PATH=$BUNDLE
EOF

echo ""
echo "Done — .env ban gaya ($WWW_DIR/.env)"
echo "Ab chalao:"
echo "  cd $WWW_DIR"
echo "  python3 -m venv .venv && source .venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python bot.py"
