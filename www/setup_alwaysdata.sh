#!/usr/bin/env bash
# =============================================================================
# AlwaysData VPS — PURA code yahi (HTTP only, NO Chromium/Selenium)
#
#   cd ~/www && bash setup_alwaysdata.sh
#
# ZAROORI: Indian proxy — AlwaysData France se UIDAI direct block hota hai
#   .env → UIDAI_PROXY=socks5://user:pass@indian-host:1080
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Aadhaar — AlwaysData FULL (HTTP)  ║"
echo "║  No Chromium · No Selenium · No Playwright║"
echo "╚══════════════════════════════════════════╝"

PY="python"
command -v python >/dev/null 2>&1 || PY="python3"
echo "[*] $($PY --version 2>&1)"

echo "[1/4] venv…"
if [[ ! -f .venv/bin/activate ]]; then
  $PY -m venv .venv || {
    $PY -m pip install --user virtualenv
    $PY -m virtualenv .venv
  }
fi
# shellcheck disable=SC1091
source .venv/bin/activate
PY="python"

echo "[2/4] pip (HTTP engine only)…"
pip install --upgrade pip
pip install --no-cache-dir -r requirements_alwaysdata.txt

echo "[3/4] .env…"
if [[ ! -f .env ]]; then
  cat > .env <<'EOF'
# Website PIN
WEB_ACCESS_PIN=1234

# AlwaysData panel se IP/PORT aata hai — local test ke liye:
WEB_HOST=0.0.0.0
WEB_PORT=8080

# HTTP-only engine (browser OFF)
WEB_PDF_ENGINE=http
UIDAI_PDF_CAPTCHA=http
UIDAI_FAST=1
UIDAI_WHISPER=0
UIDAI_OCR=0
UIDAI_AUTO_CAPTCHA=0
FLOW_IDLE_SEC=300
DOB_BYPASS=1

# ★ ZAROORI — Indian proxy (AlwaysData France hai, UIDAI India)
# auto = fastest free proxy from proxy_ranked.json (bash refresh_free_proxy.sh)
UIDAI_PROXY=auto

# Ya manually fastest (benchmark 2026-06): Gandhinagar ~1.2s
# UIDAI_PROXY=http://117.236.124.166:3128

# Indian VPS proxy mode — khali chhodo (standalone)
# INDIA_API_URL=
# INDIA_API_KEY=
EOF
  echo "  ✅ .env created"
else
  echo "  ℹ .env exists"
fi

# Force HTTP mode in .env
grep -q '^WEB_PDF_ENGINE=' .env 2>/dev/null || echo 'WEB_PDF_ENGINE=http' >> .env
grep -q '^UIDAI_PDF_CAPTCHA=' .env 2>/dev/null || echo 'UIDAI_PDF_CAPTCHA=http' >> .env

chmod +x start_web_alwaysdata.sh 2>/dev/null || true

echo "[4/4] UIDAI test (via proxy if set)…"
# shellcheck disable=SC1091
set -a
source .env 2>/dev/null || true
set +a
PROXY_URL="${UIDAI_PROXY:-}"
if [[ "${PROXY_URL,,}" == "auto" || "${PROXY_URL,,}" == "india" || -z "$PROXY_URL" ]]; then
  PROXY_URL="$(python -c "
try:
    from proxy_india import _load_cache, fastest_proxy_url
    print(_load_cache() or fastest_proxy_url() or '')
except Exception:
    print('')
" 2>/dev/null || true)"
fi
PROXY_ARG=""
if [[ -n "$PROXY_URL" && "${PROXY_URL,,}" != "auto" && "${PROXY_URL,,}" != "india" ]]; then
  PROXY_ARG="-x ${PROXY_URL}"
  echo "  Using proxy: ${PROXY_URL}"
fi
if curl -fsS $PROXY_ARG --connect-timeout 25 -o /dev/null \
    https://myaadhaar.uidai.gov.in/retrieve-eid-uid 2>/dev/null; then
  echo "  ✅ UIDAI reachable"
else
  echo "  ⚠ UIDAI fail — bash refresh_free_proxy.sh chalao"
fi

python - <<'PY'
import os
os.environ.setdefault('WEB_PDF_ENGINE', 'http')
from web_pdf_http import warm_web_pool
import asyncio
asyncio.run(warm_web_pool())
print('  ✅ HTTP engine import OK')
PY

cat <<EOF

╔══════════════════════════════════════════╗
║  ✅ AlwaysData install complete           ║
╚══════════════════════════════════════════╝

━━━ .env edit (ZAROORI) ━━━
  nano $ROOT/.env

  UIDAI_PROXY=socks5://user:pass@indian-proxy:1080
  WEB_ACCESS_PIN=apna_pin

━━━ Single command install (next time) ━━━
  curl -fsSL https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-web-panel-95e1/www/install_alwaysdata_one.sh | bash

━━━ AlwaysData Panel → Web > Sites ━━━
  Type:       User program
  Directory:  $ROOT
  Command:    bash start_web_alwaysdata.sh
  Virtualenv: .venv
  Python:     3.11+
  Environment variables (panel se copy):
    IP=fd00::…
    PORT=8100

  Site: https://YOUR_ACCOUNT.alwaysdata.net

━━━ Flow ━━━
  PIN → Name/Mobile/DOB → Captcha (HTTP image) → OTP1
      → Captcha2 → OTP2 → PDF Download

  Captcha user manually type karega — browser nahi chahiye.

━━━ Files (engine) ━━━
  web_app_alwaysdata.py  — website
  web_pdf_http.py        — UIDAI HTTP API (no browser)
  aadhar.py              — PDF logic
  uidai_api.py pdf_unlock.py

EOF
