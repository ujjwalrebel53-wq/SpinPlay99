#!/usr/bin/env bash
# =============================================================================
# Rebel Aadhaar — AlwaysData VPS / hosting install
#
# SSH se chalao:
#   cd ~
#   git clone https://github.com/ujjwalrebel53-wq/SpinPlay99.git aadhar-bot
#   cd aadhar-bot/www
#   bash setup_alwaysdata.sh
#
# Phir AlwaysData panel:
#   Web > Sites > Add > Type: User program
#   Working directory: /home/YOUR_ACCOUNT/aadhar-bot/www
#   Command: bash start_web_alwaysdata.sh
#   Environment: IP=fd00::…,PORT=8100  (panel se copy karo)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BRANCH="${BRANCH:-cursor/aadhaar-web-panel-95e1}"
WEB_PIN="${WEB_ACCESS_PIN:-1234}"
ACCOUNT_HINT="${ALWAYSDATA_ACCOUNT:-your_account}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Aadhaar — AlwaysData Setup        ║"
echo "╚══════════════════════════════════════════╝"
echo "  Dir: $ROOT"
echo ""

# AlwaysData: python (not python3)
PY="python"
if ! command -v python >/dev/null 2>&1; then
  PY="python3"
fi
echo "[*] Python: $($PY --version 2>&1)"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

echo "[1/6] Virtualenv (.venv)…"
if [[ ! -f .venv/bin/activate ]]; then
  rm -rf .venv 2>/dev/null || true
  if $PY -m venv .venv 2>/dev/null; then
    echo "  ✅ venv OK"
  else
    echo "  📦 venv fail — virtualenv try…"
    $PY -m pip install --user virtualenv
    $PY -m virtualenv .venv
  fi
fi
# shellcheck disable=SC1091
source .venv/bin/activate
PY="python"

echo "[2/6] pip packages…"
pip install --upgrade pip setuptools wheel
REQ="requirements_sex.txt"
[[ -f "$REQ" ]] || REQ="requirements.txt"
pip install --no-cache-dir -r "$REQ"

echo "[3/6] Playwright Chromium…"
pip install --no-cache-dir "playwright==1.49.1"
for attempt in 1 2 3; do
  echo "  download attempt $attempt/3…"
  if python -m playwright install chromium; then
    break
  fi
  sleep "$((attempt * 2))"
done

echo "[4/6] Chromium launch test…"
python - <<'PY'
from playwright.sync_api import sync_playwright
p = sync_playwright().start()
b = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
b.close()
p.stop()
print('  ✅ Chromium OK')
PY

echo "[5/6] .env file…"
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
  else
    cat > .env <<EOF
WEB_ACCESS_PIN=${WEB_PIN}
WEB_HOST=0.0.0.0
WEB_PORT=8080
UIDAI_FAST=1
UIDAI_POOL_WARM=1
UIDAI_PDF_CAPTCHA=browser
UIDAI_INSTANT_FORM=1
FLOW_IDLE_SEC=300
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}
EOF
  fi
  echo "  ✅ .env created — WEB_ACCESS_PIN edit karo"
else
  echo "  ℹ .env already exists — skip"
fi

# AlwaysData-friendly paths in .env
grep -q '^PLAYWRIGHT_BROWSERS_PATH=' .env 2>/dev/null || \
  echo "PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}" >> .env

chmod +x start_web.sh start_web_alwaysdata.sh 2>/dev/null || true

echo "[6/6] UIDAI network test…"
if curl -fsS --connect-timeout 20 -o /dev/null https://myaadhaar.uidai.gov.in/retrieve-eid-uid; then
  echo "  ✅ UIDAI reachable"
else
  echo "  ⚠ UIDAI timeout — AlwaysData France se block ho sakta hai"
  echo "    Indian proxy .env mein: UIDAI_PROXY=http://user:pass@host:port"
fi

cat <<EOF

╔══════════════════════════════════════════╗
║  ✅ AlwaysData install complete           ║
╚══════════════════════════════════════════╝

━━━ STEP 1 — .env edit (SSH) ━━━
  nano $ROOT/.env

  Zaroori:
    WEB_ACCESS_PIN=apna_pin
    WEB_ACCESS_PIN khali = bina PIN open site

  Agar UIDAI block:
    UIDAI_PROXY=socks5://user:pass@indian-proxy:1080

━━━ STEP 2 — AlwaysData Panel (Web > Sites) ━━━
  Type:        User program
  Name:        aadhaar (jo bhi)
  Directory:   $ROOT
  Command:     bash start_web_alwaysdata.sh

  Environment variables (panel se copy — example):
    IP=fd00::5:xxxx
    PORT=8100

  Python version: 3.11 ya 3.12 (Environment > Python)
  Virtualenv:     $ROOT/.venv

  Site URL: https://${ACCOUNT_HINT}.alwaysdata.net
            (ya apna domain jo site pe lagaya ho)

━━━ STEP 3 — Test ━━━
  Browser: apni site URL kholo
  PIN → Name/Mobile/DOB → Captcha → OTP → PDF Download

━━━ Optional: Telegram bot (Advanced > Services) ━━━
  Name:     rebel-bot
  Command:  bash start_sex_alwaysdata.sh
  Directory: $ROOT
  Port:     8300 (services range 8300-8499)

Logs: \$HOME/admin/logs/uwsgi/  (web site)
      \$HOME/admin/logs/services/ (background service)

Branch update:
  cd $ROOT && git fetch origin ${BRANCH} && git checkout ${BRANCH} && git pull

EOF
