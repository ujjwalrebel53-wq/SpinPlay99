#!/bin/bash
# One-command VPS update — latest /open + /pdf bot
set -e
cd "$(dirname "$0")"

BRANCH="${BRANCH:-main}"
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www"

FILES=(
  update_bot.sh
  sex.py aadhar.py browser_session.py react_extract.py pdf_unlock.py
  uidai_api.py bot_ui_classic.py bot_access.py captcha_solver.py audio_captcha.py
  start_sex.sh install_all.sh requirements_sex.txt
)

ASSET_FILES=(
  Picsart_26-06-12_12-40-13-733.jpg
  assets/Picsart_26-06-12_12-40-13-733.jpg
)

echo "=== Rebel Aadhaar bot update (${BRANCH}) ==="
for f in "${FILES[@]}"; do
  echo "  ↓ $f"
  curl -fsSL -o "$f" "${BASE}/${f}"
done
mkdir -p assets
for f in "${ASSET_FILES[@]}"; do
  echo "  ↓ $f"
  if [[ "$f" == Picsart_* ]]; then
    curl -fsSL -o "$f" "https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/$f"
  else
    curl -fsSL -o "$f" "${BASE}/${f}" || \
      curl -fsSL -o "$f" "https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/Picsart_26-06-12_12-40-13-733.jpg"
  fi
done

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -q -U pip
  pip install -q pypdf==5.1.0
  pip install -q -r requirements_sex.txt 2>/dev/null || true
else
  echo "⚠ .venv missing — run: bash install_all.sh"
fi

touch .env
grep -q '^UIDAI_PDF_CAPTCHA=' .env || echo 'UIDAI_PDF_CAPTCHA=browser' >> .env
grep -q '^UIDAI_WHISPER_AUTO=' .env || echo 'UIDAI_WHISPER_AUTO=0' >> .env
grep -q '^UIDAI_NAME=' .env || echo 'UIDAI_NAME="KAMAR JAHAN"' >> .env
grep -q '^UIDAI_FAST=' .env || echo 'UIDAI_FAST=1' >> .env
grep -q '^UIDAI_POOL_WARM=' .env || echo 'UIDAI_POOL_WARM=1' >> .env

pkill -f '[p]ython3.*sex\.py' 2>/dev/null || true
pkill -f '[p]ython3.*bot\.py' 2>/dev/null || true
pkill -f 'chromium.*headless' 2>/dev/null || true
sleep 4
nohup env SKIP_CHROMIUM_TEST=1 bash start_sex.sh > sex.log 2>&1 &
sleep 4
if ! pgrep -f '[p]ython3.*sex\.py' >/dev/null; then
  echo "❌ Bot failed to start — tail -30 sex.log"
  tail -30 sex.log 2>/dev/null || true
  exit 1
fi
echo ""
echo "✅ Bot updated & restarted"
tail -8 sex.log 2>/dev/null || true
echo ""
echo "Test: /pdf 7651892956  |  /open 7651892956"
