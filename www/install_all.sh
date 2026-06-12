#!/bin/bash
# Full install — system deps + Python + Playwright Chromium (sex.py /open bot)
set -e
cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════╗"
echo "║  Full install — deps + Chromium          ║"
echo "╚══════════════════════════════════════════╝"

apt_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif sudo -n true 2>/dev/null; then
    sudo "$@"
  else
    return 1
  fi
}

run_apt_base() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "⚠ apt-get not found — skip system packages"
    return 0
  fi
  if ! apt_sudo true 2>/dev/null; then
    echo "⚠ No root/sudo — skip apt (run as root for full install)"
    return 0
  fi

  echo "[1/5] apt update + Python tools…"
  apt_sudo apt-get update -qq
  # Ubuntu 22/24 — only stable package names (no libasound2 manual list)
  apt_sudo apt-get install -y \
    python3 python3-pip python3-venv python3-dev \
    curl wget git ca-certificates \
    || apt_sudo apt-get install -y python3 python3-pip python3-venv curl wget ca-certificates
  echo "  ✅ Python system packages"
}

run_apt_base

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found — run as root: apt install python3 python3-venv"
  exit 1
fi

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

echo "[4/5] Playwright Chromium + OS browser libraries…"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

PW="python3 -m playwright"
command -v playwright >/dev/null 2>&1 && PW=playwright

# Playwright knows Ubuntu 22/24 package names (libasound2t64 etc.)
echo "  Installing Chromium system libs via playwright install-deps…"
if apt_sudo env DEBIAN_FRONTEND=noninteractive $PW install-deps chromium; then
  echo "  ✅ playwright install-deps OK"
else
  echo "  ⚠ install-deps had issues — trying --with-deps on browser install…"
fi

INSTALLED=0
for attempt in 1 2 3; do
  echo "  Chromium download attempt $attempt/3…"
  if apt_sudo true 2>/dev/null; then
    if apt_sudo env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
      $PW install --with-deps chromium; then
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
  echo "❌ Chromium install failed"
  echo "   Manual: source .venv/bin/activate && playwright install-deps chromium && playwright install chromium"
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
