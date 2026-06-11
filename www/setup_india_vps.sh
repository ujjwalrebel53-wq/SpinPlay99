#!/bin/bash
# =============================================================================
# Indian VPS — /open SMS bot only (sex.py)
# Captcha → OTP → Aadhaar SMS | direct UIDAI | no proxy | no cookies
#
# Usage:
#   curl -fsSL .../setup_india_vps.sh | bash
#   BOT_TOKEN=xxx OWNER_ID=yyy bash setup_india_vps.sh
# =============================================================================
set -e

BOT_TOKEN="${BOT_TOKEN:-8805739645:AAEbAYAFnfZw8clG2Jqf513FbuhBhhFJUKA}"
OWNER_ID="${OWNER_ID:-8432393497}"
BRANCH="${BRANCH:-cursor/cookie-forever-proxy-trial-95e1}"
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www"
INSTALL_DIR="${INSTALL_DIR:-$HOME/aadhar-bot}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel /open — Indian VPS (SMS retrieve) ║"
echo "╚══════════════════════════════════════════╝"

if command -v apt-get >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null || [ "$(id -u)" -eq 0 ]; then
    SUDO=""
    [ "$(id -u)" -ne 0 ] && SUDO=sudo
    echo "[*] System packages…"
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq python3 python3-pip python3-venv curl wget \
      libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2 libxkbcommon0 \
      fonts-liberation ca-certificates 2>/dev/null || true
  fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

FILES=(
  sex.py bot_ui_classic.py bot_access.py browser_session.py uidai_api.py react_extract.py
  start_sex.sh install_playwright.sh requirements_sex.txt
)

echo "[*] Downloading ${#FILES[@]} files…"
for f in "${FILES[@]}"; do
  wget -q -O "$f" "$BASE/$f" || { echo "❌ fail: $f"; exit 1; }
  echo "  ✓ $f"
done
chmod +x start_sex.sh install_playwright.sh 2>/dev/null || true

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_OWNER_ID=${OWNER_ID}
TELEGRAM_ALLOWED_CHAT_IDS=${OWNER_ID}

UIDAI_NAME=KAMAR JAHAN
UIDAI_SESSION_HOURS=24
UIDAI_KEEPALIVE_MIN=10
UIDAI_POOL_WARM=0
UIDAI_BAKED_SESSION=0
UIDAI_COOKIE_SEED=0
UIDAI_COOKIE_PERSIST=0
EOF

echo "[*] Python venv + pip…"
if [ ! -f .venv/bin/activate ]; then
  python3 -m venv .venv 2>/dev/null || {
    pip3 install --user virtualenv
    python3 -m virtualenv .venv
  }
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements_sex.txt

echo "[*] Playwright Chromium…"
bash install_playwright.sh || { echo "❌ Chromium required for /open"; exit 1; }

echo "[*] UIDAI connectivity…"
if curl -fsS --connect-timeout 15 -o /dev/null https://myaadhaar.uidai.gov.in/retrieve-eid-uid; then
  echo "  ✅ UIDAI reachable"
else
  echo "  ❌ UIDAI blocked on this VPS — use Indian ISP VPS (not DigitalOcean/AWS)"
  exit 1
fi

pkill -9 -f "[p]ython.*sex\.py" 2>/dev/null || true
pkill -9 -f "[p]ython.*bot\.py" 2>/dev/null || true
sleep 2

nohup bash start_sex.sh > sex.log 2>&1 &
sleep 5

if pgrep -f "[p]ython.*sex\.py" >/dev/null; then
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  ✅ /open BOT RUNNING                     ║"
  echo "╚══════════════════════════════════════════╝"
  echo "  Folder  : $INSTALL_DIR"
  echo "  Logs    : tail -f $INSTALL_DIR/sex.log"
  echo "  Command : /open"
  echo "  Flow    : captcha → OTP → Aadhaar SMS"
  tail -15 sex.log 2>/dev/null || true
else
  echo "❌ Start failed — tail -50 $INSTALL_DIR/sex.log"
  exit 1
fi
