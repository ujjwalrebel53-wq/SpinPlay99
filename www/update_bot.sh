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

echo "=== Rebel Aadhaar bot update (${BRANCH}) ==="
for f in "${FILES[@]}"; do
  echo "  ↓ $f"
  curl -fsSL -o "$f" "${BASE}/${f}"
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
grep -q '^UIDAI_PDF_CAPTCHA=' .env || echo 'UIDAI_PDF_CAPTCHA=auto' >> .env
grep -q '^UIDAI_WHISPER_AUTO=' .env || echo 'UIDAI_WHISPER_AUTO=0' >> .env
grep -q '^UIDAI_NAME=' .env || echo 'UIDAI_NAME="KAMAR JAHAN"' >> .env

pkill -f '[p]ython3.*sex\.py' 2>/dev/null || true
sleep 2
nohup bash start_sex.sh > sex.log 2>&1 &
sleep 2
echo ""
echo "✅ Bot updated & restarted"
tail -8 sex.log 2>/dev/null || true
echo ""
echo "Test: /pdf 7651892956  |  /open 7651892956"
