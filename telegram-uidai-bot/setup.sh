#!/bin/bash
# .env banao — kisi bhi VPS se chalega (auto India proxy)
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
UIDAI_PROXY=auto
UIDAI_INDIAN_PROXY_AUTO=1
UIDAI_BAKED_SESSION=1
UIDAI_COOKIE_SEED=1
EOF

echo ""
echo "Done — .env ban gaya ($WWW_DIR/.env)"
echo "Foreign VPS? wget uidai_baked_session.json bhi lo (setup.sh output dekho)."
echo "Ab chalao:"
echo "  cd $WWW_DIR"
echo "  python3 -m venv .venv && source .venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python bot.py"
