#!/usr/bin/env bash
# Check if Rebel web app already running
set -euo pipefail
echo "=== Rebel Web Status ==="
echo ""
echo "Panel site (AlwaysData):"
echo "  https://$(whoami 2>/dev/null || echo ujjwal).alwaysdata.net/"
echo ""
echo "Processes:"
pgrep -af "uvicorn web_app_alwaysdata" 2>/dev/null || echo "  (none via pgrep)"
echo ""
echo "Port 8080:"
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | grep ':8080' || echo "  free"
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp 2>/dev/null | grep ':8080' || echo "  free"
else
  echo "  (ss/netstat nahi mila)"
fi
echo ""
if [[ -f .env ]]; then
  echo ".env PIN: $(grep '^WEB_ACCESS_PIN=' .env | head -1)"
  echo ".env proxy: $(grep '^UIDAI_PROXY=' .env | head -1)"
fi
echo ""
echo "Agar site chal rahi hai to SSH se start mat karo — panel manage karti hai."
echo "Restart: AlwaysData panel → Sites → site → Restart"
