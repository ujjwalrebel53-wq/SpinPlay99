#!/bin/bash
# =============================================================================
# 143 DigitalOcean VPS — bot here, UIDAI via 187 proxy
# Run on: 143.110.244.100
#
# Usage:
#   UIDAI_PROXY=http://187.127.150.208:3128 bash setup_do_bot_143.sh
# With auth:
#   UIDAI_PROXY=http://rebel:YourSecret123@187.127.150.208:3128 bash setup_do_bot_143.sh
# =============================================================================
set -e

BOT_TOKEN="${BOT_TOKEN:-8805739645:AAEbAYAFnfZw8clG2Jqf513FbuhBhhFJUKA}"
OWNER_ID="${OWNER_ID:-8432393497}"
UIDAI_PROXY_URL="${UIDAI_PROXY:-http://187.127.150.208:3128}"
BRANCH="${BRANCH:-cursor/cookie-forever-proxy-trial-95e1}"
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www"
INSTALL_DIR="${INSTALL_DIR:-$HOME/aadhar-bot}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Bot — DO VPS (143) + 187 proxy    ║"
echo "╚══════════════════════════════════════════╝"
echo "  UIDAI_PROXY=$UIDAI_PROXY_URL"

if command -v apt-get >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null || [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO=sudo
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq python3 python3-pip python3-venv curl wget \
    libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2 libxkbcommon0 \
    fonts-liberation ca-certificates 2>/dev/null || true
  fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

FILES=(
  bot.py bot_ui.py bot_ui_classic.py bot_access.py aadhar.py sex.py start.sh install.sh
  install_playwright.sh check_uidai_network.sh uidai_proxy.py requirements.txt
  uidai_api.py uidai_cookie_session.py http_uidai_flow.py audio_captcha.py
  captcha_solver.py react_extract.py browser_session.py proxy_india.py
  test_aadhar_mock.py
)

echo "[*] Downloading files…"
for f in "${FILES[@]}"; do
  wget -q -O "$f" "$BASE/$f" && echo "  ✓ $f" || { echo "❌ $f"; exit 1; }
done
chmod +x install.sh start.sh install_playwright.sh check_uidai_network.sh 2>/dev/null || true

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_OWNER_ID=${OWNER_ID}
TELEGRAM_ALLOWED_CHAT_IDS=${OWNER_ID}

# DO bot — UIDAI through Indian VPS proxy
UIDAI_PROXY=${UIDAI_PROXY_URL}
UIDAI_DIRECT_FIRST=0
UIDAI_PROXY_FALLBACK=0

AADHAR_TIMEOUT=25
AADHAR_CONNECT_TIMEOUT=12
UIDAI_HTTP_TIMEOUT=60

DOB_BYPASS=1
CAPTCHA_BYPASS=0
UIDAI_CAPTCHA_BYPASS=0
UIDAI_OCR=0
UIDAI_AUTO_CAPTCHA=0
UIDAI_POOL_WARM=0
UIDAI_HTTP_MODE=auto
UIDAI_BAKED_SESSION=0
UIDAI_COOKIE_SEED=0
UIDAI_COOKIE_PERSIST=0
EOF

echo "[*] Proxy test (must return HTTP 200/302)…"
if curl -fsS --connect-timeout 20 --max-time 30 -x "$UIDAI_PROXY_URL" \
  -o /dev/null -w "  UIDAI via proxy: HTTP %{http_code}\n" \
  https://myaadhaar.uidai.gov.in/retrieve-eid-uid; then
  echo "  ✅ Proxy + UIDAI OK"
else
  echo "  ❌ Proxy test FAILED — run setup_uidai_proxy_187.sh on 187 first"
  echo "  Continuing install anyway…"
fi

bash install.sh
bash install_playwright.sh || echo "⚠ Playwright optional for /pdf"

source .venv/bin/activate
python3 test_aadhar_mock.py

pkill -9 -f "[p]ython.*bot\.py" 2>/dev/null || true
sleep 2
curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" >/dev/null || true

nohup bash start.sh > bot.log 2>&1 &
sleep 5

if pgrep -f "[p]ython.*bot\.py" >/dev/null; then
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  ✅ BOT RUNNING ON DO (143)               ║"
  echo "╚══════════════════════════════════════════╝"
  echo "  Logs: tail -f $INSTALL_DIR/bot.log"
  tail -20 bot.log 2>/dev/null || true
else
  echo "❌ Start failed — tail -50 $INSTALL_DIR/bot.log"
  exit 1
fi
