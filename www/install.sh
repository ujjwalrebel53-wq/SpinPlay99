#!/bin/bash
# VPS install — no sudo (venv + pip only)
set -e
cd "$(dirname "$0")"

echo "=== Rebel Aadhaar — install (no sudo) ==="

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found"
  exit 1
fi

# venv — try python3 -m venv, then virtualenv --user
if [ ! -f .venv/bin/activate ]; then
  rm -rf .venv 2>/dev/null || true
  if python3 -m venv .venv 2>/dev/null && [ -f .venv/bin/activate ]; then
    echo "✅ venv created"
  else
    echo "📦 python3-venv missing — trying virtualenv --user…"
    pip3 install --user virtualenv 2>/dev/null || pip install --user virtualenv
    python3 -m virtualenv .venv || ~/.local/bin/virtualenv .venv
  fi
fi

# shellcheck disable=SC1091
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# Playwright optional — not required for /pdf (aadhar.py)
if python3 -c "import playwright" 2>/dev/null; then
  playwright install chromium 2>/dev/null || echo "⚠ playwright chromium skip (optional for /open)"
fi

echo ""
echo "✅ Done. Next:"
echo "  source .venv/bin/activate"
echo "  bash start.sh"
echo ""
echo "aadhar.py CLI only:"
echo "  python3 aadhar.py"
