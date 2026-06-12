#!/bin/bash
# Chromium only — Ubuntu 22/24 safe (no libasound2 manual list)
set -e
cd "$(dirname "$0")"

echo "=== Playwright Chromium install (ubuntu24-v3) ==="

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif ! python3 -c "import playwright" 2>/dev/null; then
  echo "❌ Run first: bash install_all.sh"
  exit 1
fi

exec bash install_all.sh
