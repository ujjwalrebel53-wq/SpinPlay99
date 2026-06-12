#!/bin/bash
# Full install — system deps + Python + Playwright Chromium (sex.py /open bot)
set -e
cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════╗"
echo "║  Full install — deps + Chromium          ║"
echo "╚══════════════════════════════════════════╝"

run_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "⚠ apt-get not found — skip system packages"
    return 0
  fi
  local SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO=sudo
  if [ -n "$SUDO" ] && ! $SUDO -n true 2>/dev/null; then
    echo "⚠ No sudo — skip apt (run as root for full install)"
    return 0
  fi

  echo "[1/5] apt update + system packages…"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq \
    python3 python3-pip python3-venv python3-dev \
    curl wget git ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
    libx11-6 libxext6 libxcb1 libdbus-1-3 libglib2.0-0 \
    fonts-liberation fonts-noto-color-emoji \
    2>/dev/null || $SUDO apt-get install -y python3 python3-pip python3-venv curl wget \
      libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2
  echo "  ✅ system packages"
}

if ! command -v python3 >/dev/null 2>&1; then
  run_apt
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found — install: apt install python3"
  exit 1
fi

run_apt

echo "[2/5] Python venv…"
REQ_FILE="requirements_sex.txt"
[ -f "$REQ_FILE" ] || REQ_FILE="requirements.txt"
[ -f "$REQ_FILE" ] || { echo "❌ $REQ_FILE missing"; exit 1; }

if [ ! -f .venv/bin/activate ]; then
  rm -rf .venv 2>/dev/null || true
  if python3 -m venv .venv 2>/dev/null && [ -f .venv/bin/activate ]; then
    echo "  ✅ venv created"
  else
    echo "  📦 trying virtualenv…"
    pip3 install --user virtualenv 2>/dev/null || pip install --user virtualenv
    python3 -m virtualenv .venv || ~/.local/bin/virtualenv .venv
  fi
fi

# shellcheck disable=SC1091
source .venv/bin/activate
echo "  ✅ venv active: $(python3 --version)"

echo "[3/5] pip packages ($REQ_FILE)…"
pip install --upgrade pip setuptools wheel
pip install -r "$REQ_FILE"
python3 -c "
import telegram, dotenv, requests, PIL
print('  ✅ telegram, dotenv, requests, Pillow')
"

echo "[4/5] Playwright Chromium + browser libs…"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

PW="python3 -m playwright"
command -v playwright >/dev/null 2>&1 && PW=playwright

if [ "$(id -u)" -eq 0 ]; then
  $PW install-deps chromium 2>/dev/null || true
elif sudo -n true 2>/dev/null; then
  sudo $PW install-deps chromium 2>/dev/null || true
fi

INSTALLED=0
for attempt in 1 2 3; do
  echo "  Chromium download attempt $attempt/3…"
  if [ "$(id -u)" -eq 0 ] || sudo -n true 2>/dev/null; then
    if $PW install --with-deps chromium 2>/dev/null; then
      INSTALLED=1
      break
    fi
  fi
  if $PW install chromium; then
    INSTALLED=1
    break
  fi
  sleep "$((attempt * 3))"
done

if [ "$INSTALLED" != 1 ]; then
  echo "❌ Chromium install failed — run: bash install_playwright.sh"
  exit 1
fi
echo "  ✅ Chromium installed"

echo "[5/5] Verify Chromium launch…"
python3 -c "
from playwright.sync_api import sync_playwright
p = sync_playwright().start()
b = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
b.close()
p.stop()
print('  ✅ Chromium launch OK')
"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ ALL REQUIREMENTS INSTALLED            ║"
echo "╚══════════════════════════════════════════╝"
echo "  Next: bash start_sex.sh"
echo "  Or:   nohup bash start_sex.sh > sex.log 2>&1 &"
