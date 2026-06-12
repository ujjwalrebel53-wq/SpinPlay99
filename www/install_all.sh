#!/bin/bash
# Full install — system deps + Python + Playwright Chromium (sex.py /open bot)
# Ubuntu 22.04 + 24.04 (libasound2t64)
set -e
cd "$(dirname "$0")"

INSTALL_SCRIPT_VERSION="2026-06-11-ubuntu24-v3"
echo "install_all.sh version: $INSTALL_SCRIPT_VERSION"
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

# Pick package name: libfoo or libfoot64 on Ubuntu 24.04
apt_resolve_pkg() {
  local base="$1"
  if apt-cache show "${base}t64" >/dev/null 2>&1; then
    echo "${base}t64"
  elif apt-cache show "$base" >/dev/null 2>&1; then
    echo "$base"
  else
    echo ""
  fi
}

install_browser_system_libs() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "  ⚠ no apt-get — skip browser libs"
    return 0
  fi
  if ! apt_sudo true 2>/dev/null; then
    echo "  ⚠ no root — skip browser libs"
    return 0
  fi

  echo "  Installing Chromium OS libraries (Ubuntu 22/24)…"
  apt_sudo apt-get update -qq

  local core=(
    libnss3 libnspr4 libdrm2 libxkbcommon0 libgbm1
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2
    libpango-1.0-0 libcairo2 libatspi2.0-0
    libx11-6 libxext6 libxcb1 libdbus-1-3 libglib2.0-0
    fonts-liberation libatk1.0-0
  )

  local optional_bases=(libasound2 libatk-bridge2.0-0 libcups2)
  local extra=()
  local b p
  for b in "${optional_bases[@]}"; do
    p=$(apt_resolve_pkg "$b")
    [ -n "$p" ] && extra+=("$p")
  done

  if [ ${#extra[@]} -eq 0 ]; then
    echo "  ⚠ could not resolve audio/atk libs — continuing"
  fi

  apt_sudo apt-get install -y "${core[@]}" "${extra[@]}"
  echo "  ✅ browser system libraries"
}

run_apt_base() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "⚠ apt-get not found — skip"
    return 0
  fi
  if ! apt_sudo true 2>/dev/null; then
    echo "⚠ No root/sudo — skip apt"
    return 0
  fi

  echo "[1/5] apt update + Python tools…"
  apt_sudo apt-get update -qq
  apt_sudo apt-get install -y \
    python3 python3-pip python3-venv python3-dev \
    curl wget git ca-certificates
  echo "  ✅ Python system packages"
}

run_apt_base

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found"
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
pip install --no-cache-dir -r "$REQ_FILE"
python3 -c "
import telegram, dotenv, requests, PIL
print('  ✅ telegram, dotenv, requests, Pillow')
"

# Corrupt playwright driver check (MODULE_NOT_FOUND programWithTestStub)
if ! find .venv/lib -path '*/playwright/driver/package/lib/cli/programWithTestStub.js' 2>/dev/null | grep -q .; then
  echo "  ⚠ Playwright driver corrupt — repairing…"
  pip uninstall -y playwright 2>/dev/null || true
  rm -rf .venv/lib/python*/site-packages/playwright 2>/dev/null || true
  pip install --no-cache-dir --force-reinstall "playwright==1.49.1"
fi
if ! find .venv/lib -path '*/playwright/driver/package/lib/cli/programWithTestStub.js' 2>/dev/null | grep -q .; then
  echo "❌ Playwright install broken — run: bash fix_playwright.sh"
  exit 1
fi
echo "  ✅ Playwright driver OK"

echo "[4/5] Chromium OS libs + browser download…"
install_browser_system_libs

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

PW="python3 -m playwright"
command -v playwright >/dev/null 2>&1 && PW=playwright

# Do NOT use --with-deps on Ubuntu 24 (breaks on libasound2)
INSTALLED=0
for attempt in 1 2 3; do
  echo "  Chromium download attempt $attempt/3…"
  if $PW install chromium; then
    INSTALLED=1
    break
  fi
  sleep "$((attempt * 3))"
done

if [ "$INSTALLED" != 1 ]; then
  echo "❌ Chromium download failed"
  exit 1
fi
echo "  ✅ Chromium downloaded"

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
