#!/bin/bash
# Repair corrupted Playwright driver + reinstall Chromium
set -e
cd "$(dirname "$0")"

echo "=== Fix corrupted Playwright ==="

if [ ! -f .venv/bin/activate ]; then
  echo "❌ .venv missing — run: bash install_all.sh"
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "[1] Remove broken playwright…"
pip uninstall -y playwright 2>/dev/null || true
rm -rf .venv/lib/python*/site-packages/playwright 2>/dev/null || true
pip cache purge 2>/dev/null || true

echo "[2] Fresh install (no cache)…"
pip install --no-cache-dir --force-reinstall "playwright==1.49.1"

DRIVER=".venv/lib/python3.12/site-packages/playwright/driver/package/lib/cli/programWithTestStub.js"
if [ ! -f "$DRIVER" ]; then
  # try any python version path
  DRIVER=$(find .venv/lib -path '*/playwright/driver/package/lib/cli/programWithTestStub.js' 2>/dev/null | head -1)
fi
if [ -z "$DRIVER" ] || [ ! -f "$DRIVER" ]; then
  echo "❌ Playwright driver still broken — try: rm -rf .venv && bash install_all.sh"
  exit 1
fi
echo "  ✅ driver files OK"

echo "[3] Chromium browser…"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
rm -rf "${PLAYWRIGHT_BROWSERS_PATH:?}"/* 2>/dev/null || true
python3 -m playwright install chromium

echo "[4] Launch test…"
python3 -c "
from playwright.sync_api import sync_playwright
p = sync_playwright().start()
b = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
b.close()
p.stop()
print('✅ Chromium WORKING')
"

echo ""
echo "Done. Start bot: bash start_sex.sh"
