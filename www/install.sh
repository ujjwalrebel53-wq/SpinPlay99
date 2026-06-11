#!/bin/bash
# VPS install — bina sudo (venv + pip only)
set -e
cd "$(dirname "$0")"

echo "=== Rebel Aadhaar — install (no sudo) ==="

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 nahi mila"
  exit 1
fi

# venv — pehle try python3 -m venv, phir virtualenv --user
if [ ! -f .venv/bin/activate ]; then
  rm -rf .venv 2>/dev/null || true
  if python3 -m venv .venv 2>/dev/null && [ -f .venv/bin/activate ]; then
    echo "✅ venv created"
  else
    echo "📦 python3-venv missing — virtualenv --user try…"
    pip3 install --user virtualenv 2>/dev/null || pip install --user virtualenv
    python3 -m virtualenv .venv || ~/.local/bin/virtualenv .venv
  fi
fi

# shellcheck disable=SC1091
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# Playwright optional — /pdf aadhar.py ke liye zaroori nahi
if python3 -c "import playwright" 2>/dev/null; then
  playwright install chromium 2>/dev/null || echo "⚠ playwright chromium skip (optional for /open)"
fi

echo ""
echo "✅ Done. Ab chalao:"
echo "  source .venv/bin/activate"
echo "  bash start.sh"
echo ""
echo "Sirf aadhar.py CLI:"
echo "  python3 aadhar.py"
