#!/usr/bin/env bash
# =============================================================================
# Indian VPS — sirf PDF engine API (website AlwaysData pe alag chalegi)
#
# Usage:
#   cd ~/aadhar-bot/www
#   bash setup_india_api.sh
#   nano .env   # INDIA_API_KEY=strong_random_key
#   bash start_api_india.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_KEY="${INDIA_API_KEY:-$(openssl rand -hex 24 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(24))')}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel — Indian VPS API Setup            ║"
echo "╚══════════════════════════════════════════╝"

if [[ -f install_all.sh ]]; then
  echo "[*] Full install (Playwright + deps)…"
  bash install_all.sh
else
  echo "[*] pip install…"
  python3 -m venv .venv 2>/dev/null || true
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -r requirements_sex.txt
fi

if [[ ! -f .env ]]; then
  cp .env.example .env 2>/dev/null || touch .env
fi

grep -q '^INDIA_API_KEY=' .env 2>/dev/null || echo "INDIA_API_KEY=${API_KEY}" >> .env
grep -q '^INDIA_API_HOST=' .env 2>/dev/null || echo 'INDIA_API_HOST=0.0.0.0' >> .env
grep -q '^INDIA_API_PORT=' .env 2>/dev/null || echo 'INDIA_API_PORT=8787' >> .env

chmod +x start_api_india.sh 2>/dev/null || true

echo ""
echo "UIDAI test…"
if curl -fsS --connect-timeout 15 -o /dev/null https://myaadhaar.uidai.gov.in/retrieve-eid-uid; then
  echo "  ✅ UIDAI reachable"
else
  echo "  ❌ UIDAI blocked — Indian VPS chahiye"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ India API ready                       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  .env mein ye key AlwaysData wale .env mein bhi same rakho:"
grep '^INDIA_API_KEY=' .env | head -1
echo ""
echo "  Start:  bash start_api_india.sh"
echo "  URL:    http://INDIAN_VPS_IP:8787/api/health"
echo "          Header: X-Rebel-Api-Key: <INDIA_API_KEY>"
echo ""
echo "  Firewall: port 8787 AlwaysData IP se allow karo"
echo "  Optional: INDIA_API_ALLOWED_IPS=alwaysdata.server.ip"
