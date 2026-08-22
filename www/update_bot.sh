#!/bin/bash
# One-command VPS update — latest /open + /pdf bot
set -e
cd "$(dirname "$0")"

BRANCH="${BRANCH:-cursor/fix-multi-user-start-95e1}"
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www"

FILES=(
  update_bot.sh
  sex.py aadhar.py browser_session.py react_extract.py pdf_unlock.py pdf_preview.py
  uidai_api.py bot_ui_classic.py bot_access.py captcha_solver.py audio_captcha.py
  start_sex.sh fix_telegram_network.sh install_all.sh requirements_sex.txt bot_ui_classic.py
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
chmod +x start_sex.sh update_bot.sh install_all.sh 2>/dev/null || true
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
  pip install -q "pymupdf>=1.24.0"
  pip install -q -r requirements_sex.txt 2>/dev/null || true
else
  echo "⚠ .venv missing — run: bash install_all.sh"
  pip install -q -r requirements_sex.txt 2>/dev/null || true
fi

touch .env
grep -q '^TELEGRAM_BOT_TOKEN=' .env || {
  echo "❌ TELEGRAM_BOT_TOKEN missing in .env — add your @BotFather token"
  exit 1
}
grep -q '^UIDAI_PDF_CAPTCHA=' .env || echo 'UIDAI_PDF_CAPTCHA=auto' >> .env
grep -q '^UIDAI_WHISPER_AUTO=' .env || echo 'UIDAI_WHISPER_AUTO=0' >> .env
grep -q '^UIDAI_NAME=' .env || echo 'UIDAI_NAME="KAMAR JAHAN"' >> .env
grep -q '^UIDAI_FAST=' .env || echo 'UIDAI_FAST=1' >> .env
grep -q '^UIDAI_POOL_WARM=' .env || echo 'UIDAI_POOL_WARM=1' >> .env

pkill -TERM -f '[p]ython3.*sex\.py' 2>/dev/null || true
for pid in $(pgrep -f 'start_sex\.sh' 2>/dev/null || true); do
  kill -TERM "$pid" 2>/dev/null || true
done
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pgrep -f '[p]ython3.*sex\.py' >/dev/null || break
  sleep 1
done
pkill -KILL -f '[p]ython3.*sex\.py' 2>/dev/null || true
for pid in $(pgrep -f 'start_sex\.sh' 2>/dev/null || true); do
  kill -KILL "$pid" 2>/dev/null || true
done
sleep 2

FORCE_RESTART=1 SKIP_CHROMIUM_TEST=1 nohup bash start_sex.sh >> sex.log 2>&1 &
sleep 5

if pgrep -f '[p]ython3.*sex\.py' >/dev/null; then
  echo ""
  echo "✅ Bot running (PID $(pgrep -f '[p]ython3.*sex\.py' | head -1))"
  tail -12 sex.log 2>/dev/null || true
else
  echo ""
  echo "❌ Bot NOT running — last log lines:"
  tail -40 sex.log 2>/dev/null || echo "(no sex.log)"
  exit 1
fi
echo ""
echo "Test: /start  |  /fetch MOBILE  |  /pdf MOBILE"
