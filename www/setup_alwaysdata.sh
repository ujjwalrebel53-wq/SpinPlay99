#!/usr/bin/env bash
# =============================================================================
# AlwaysData — sirf website (lightweight, no Playwright)
# Python engine Indian VPS pe chalega (setup_india_api.sh)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel — AlwaysData Website Setup        ║"
echo "╚══════════════════════════════════════════╝"

PY="python"
command -v python >/dev/null 2>&1 || PY="python3"

echo "[1/3] Lightweight venv…"
if [[ ! -f .venv/bin/activate ]]; then
  $PY -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
PY="python"

echo "[2/3] pip (no Playwright)…"
pip install --upgrade pip
pip install --no-cache-dir -r requirements_alwaysdata.txt

echo "[3/3] .env…"
if [[ ! -f .env ]]; then
  cat > .env <<'EOF'
WEB_ACCESS_PIN=1234
WEB_HOST=0.0.0.0
WEB_PORT=8080

# Indian VPS API — yahan engine chal raha hai
INDIA_API_URL=http://YOUR_INDIAN_VPS_IP:8787
INDIA_API_KEY=same_key_as_india_vps_env
INDIA_API_TIMEOUT=120
EOF
  echo "  ✅ .env created"
else
  echo "  ℹ .env exists"
fi

chmod +x start_web_alwaysdata.sh 2>/dev/null || true

cat <<'EOF'

╔══════════════════════════════════════════╗
║  ✅ AlwaysData website ready              ║
╚══════════════════════════════════════════╝

1) Indian VPS pe pehle chalao:
     bash setup_india_api.sh
     bash start_api_india.sh

2) .env edit karo:
     INDIA_API_URL=http://INDIAN_VPS_IP:8787
     INDIA_API_KEY=<same as India .env>

3) AlwaysData Panel → Web > Sites:
     Type:      User program
     Directory: /home/ACCOUNT/aadhar-bot/www
     Command:   bash start_web_alwaysdata.sh
     Virtualenv: .venv
     Env:       IP=fd00::…  PORT=8100

EOF
