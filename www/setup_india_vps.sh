#!/bin/bash
# =============================================================================
# Indian VPS — FULL install + /open bot (sex.py)
# System deps → pip → Chromium → UIDAI test → start bot
#
# Usage:
#   curl -fsSL .../setup_india_vps.sh | bash
#   BOT_TOKEN=xxx OWNER_ID=yyy bash setup_india_vps.sh
# =============================================================================
set -e

BOT_TOKEN="${BOT_TOKEN:-8805739645:AAGNcL2ehRTPo_vKscNnGt4XbXSzkligtLM}"
OWNER_ID="${OWNER_ID:-8432393497}"
BRANCH="${BRANCH:-cursor/cookie-forever-proxy-trial-95e1}"
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www"
INSTALL_DIR="${INSTALL_DIR:-$HOME/aadhar-bot}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel /open — Indian VPS FULL SETUP     ║"
echo "╚══════════════════════════════════════════╝"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

FILES=(
  sex.py bot_ui_classic.py bot_access.py browser_session.py uidai_api.py react_extract.py captcha_solver.py audio_captcha.py aadhar.py pdf_unlock.py
  start_sex.sh install_all.sh install_playwright.sh install_whisper.sh fix_playwright.sh requirements_sex.txt .env.open
)

echo "[*] Downloading ${#FILES[@]} files (fresh, no cache)…"
for f in "${FILES[@]}"; do
  rm -f "$f"
  curl -fsSL -o "$f" "$BASE/$f" || wget -q -O "$f" "$BASE/$f" || { echo "❌ fail: $f"; exit 1; }
  echo "  ✓ $f"
done
head -1 install_all.sh | grep -q install_all || true
grep -q ubuntu24-v3 install_all.sh || { echo "❌ old install_all.sh — retry download"; exit 1; }
chmod +x start_sex.sh install_all.sh install_playwright.sh 2>/dev/null || true

cat > .env <<EOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_OWNER_ID=${OWNER_ID}
TELEGRAM_ALLOWED_CHAT_IDS=${OWNER_ID}

UIDAI_NAME="KAMAR JAHAN"
UIDAI_SESSION_HOURS=24
UIDAI_KEEPALIVE_MIN=10
UIDAI_POOL_WARM=0
DOB_BYPASS=1
CAPTCHA_BYPASS=0
UIDAI_CAPTCHA_BYPASS=0
UIDAI_WHISPER=1
UIDAI_WHISPER_AUTO=0
WHISPER_MODEL=tiny
UIDAI_PDF_CAPTCHA=auto
UIDAI_OCR=0
UIDAI_AUTO_CAPTCHA=0
EOF

echo ""
bash install_all.sh

echo ""
echo "[*] UIDAI connectivity test…"
if curl -fsS --connect-timeout 15 -o /dev/null https://myaadhaar.uidai.gov.in/retrieve-eid-uid; then
  echo "  ✅ UIDAI reachable from this VPS"
else
  echo "  ❌ UIDAI blocked — need Indian ISP VPS (not AWS/DO)"
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
