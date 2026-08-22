#!/usr/bin/env bash
# Fix website "Python app chal nahi rahi" — install + test + panel guide
set -euo pipefail
cd "$(dirname "$0")"
ACCOUNT="$(whoami)"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Web Fix — $ACCOUNT"
echo "╚══════════════════════════════════════════╝"

bash setup_alwaysdata.sh 2>/dev/null || {
  python3 -m venv .venv 2>/dev/null || true
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -q -r requirements_alwaysdata.txt
}

chmod +x run.sh start_web_alwaysdata.sh status_web.sh

echo ""
echo "[*] Python import test…"
# shellcheck disable=SC1091
source .venv/bin/activate
python -c "from web_app_alwaysdata import app; print('  OK app:', app.title)"

echo ""
echo "[*] Panel site check (logs)…"
LOG="${HOME}/admin/logs/services/rebel-web.log"
if [[ -f "$LOG" ]]; then
  echo "  Last 15 lines of $LOG:"
  tail -15 "$LOG" | sed 's/^/    /'
else
  echo "  No log yet — panel se site start karo pehli baar"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  PANEL SETUP (zaroori — copy paste)      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  AlwaysData → Web → Sites → ADD ya EDIT"
echo ""
echo "  Type:         User program"
echo "  Directory:    /home/${ACCOUNT}/www"
echo "  Command:      bash /home/${ACCOUNT}/www/run.sh"
echo "  Virtualenv:   /home/${ACCOUNT}/www/.venv"
echo "  Python:       3.11 ya 3.12"
echo ""
echo "  Environment variables (site banate waqt panel deta hai):"
echo "    IP=fd00::xxxx"
echo "    PORT=8100"
echo ""
echo "  ⚠ Purani STATIC site DELETE karo agar alag hai"
echo "  ⚠ Sirf EK site honi chahiye — User program wali"
echo ""
echo "  Site URL: https://${ACCOUNT}.alwaysdata.net/"
echo "  PIN: $(grep '^WEB_ACCESS_PIN=' .env 2>/dev/null | cut -d= -f2 || echo 1234)"
echo ""
echo "  Panel save → 30 sec wait → browser:"
echo "  https://${ACCOUNT}.alwaysdata.net/api/health"
echo "  (JSON dikhe = OK)"
echo ""
