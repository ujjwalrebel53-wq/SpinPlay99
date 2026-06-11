#!/bin/bash
# =============================================================================
# Indian VPS — one-command bot setup (direct UIDAI, no proxy)
# Usage:  curl -fsSL .../setup_india_vps.sh | bash
#     or: bash setup_india_vps.sh
# =============================================================================
set -e

BOT_TOKEN="${BOT_TOKEN:-8805739645:AAEbAYAFnfZw8clG2Jqf513FbuhBhhFJUKA}"
OWNER_ID="${OWNER_ID:-8432393497}"
BRANCH="${BRANCH:-cursor/cookie-forever-proxy-trial-95e1}"
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www"
INSTALL_DIR="${INSTALL_DIR:-$HOME/aadhar-bot}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Aadhaar — Indian VPS Setup        ║"
echo "╚══════════════════════════════════════════╝"

# System deps (when sudo available)
if command -v apt-get >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    echo "[*] System packages…"
    sudo apt-get update -qq
    sudo apt-get install -y -qq python3 python3-pip python3-venv curl wget git 2>/dev/null || true
  else
    echo "[*] No sudo — user-only install (OK on Indian VPS)"
  fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
echo "[*] Install dir: $INSTALL_DIR"

FILES=(
  bot.py bot_ui.py bot_access.py aadhar.py start.sh install.sh requirements.txt
  uidai_api.py uidai_cookie_session.py http_uidai_flow.py audio_captcha.py
  captcha_solver.py react_extract.py browser_session.py
  test_aadhar_mock.py test_aadhar_live.py
)

echo "[*] Downloading ${#FILES[@]} files…"
for f in "${FILES[@]}"; do
  wget -q -O "$f" "$BASE/$f" || { echo "❌ fail: $f"; exit 1; }
  echo "  ✓ $f"
done

chmod +x install.sh start.sh setup_india_vps.sh 2>/dev/null || true

echo "[*] Writing .env (India direct)…"
cat > .env <<EOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_OWNER_ID=${OWNER_ID}
TELEGRAM_ALLOWED_CHAT_IDS=${OWNER_ID}

# Indian VPS — direct UIDAI
AADHAR_TIMEOUT=20
AADHAR_CONNECT_TIMEOUT=8

DOB_BYPASS=1
CAPTCHA_BYPASS=0
UIDAI_CAPTCHA_BYPASS=0
UIDAI_OCR=0
UIDAI_AUTO_CAPTCHA=0
UIDAI_POOL_WARM=0
UIDAI_HTTP_MODE=auto
UIDAI_BAKED_SESSION=0
EOF

echo "[*] Python venv + pip…"
bash install.sh

# shellcheck disable=SC1091
source .venv/bin/activate

echo "[*] Mock test (offline flow)…"
python3 test_aadhar_mock.py || { echo "❌ mock test fail"; exit 1; }

echo "[*] Live UIDAI test (India direct)…"
if python3 test_aadhar_live.py; then
  echo "✅ Live UIDAI OK"
else
  echo "⚠ Live test skip/warn — bot will still start"
fi

echo "[*] Stopping old bot…"
pkill -9 -f "[p]ython.*bot\.py" 2>/dev/null || true
sleep 2

echo "[*] Starting bot…"
nohup bash start.sh > bot.log 2>&1 &
sleep 4

if pgrep -f "[p]ython.*bot\.py" >/dev/null; then
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  ✅ BOT IS RUNNING                        ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "  Folder : $INSTALL_DIR"
  echo "  Logs   : tail -f $INSTALL_DIR/bot.log"
  echo "  Telegram: @Rebelbabyyyadharbot"
  echo "  Command : /pdf"
  echo ""
  tail -15 bot.log 2>/dev/null || true
else
  echo "❌ Bot start failed — see: tail -50 $INSTALL_DIR/bot.log"
  exit 1
fi
