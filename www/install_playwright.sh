#!/bin/bash
# Install Playwright Chromium + Linux system libraries (for /open and sex.py)
set -e
cd "$(dirname "$0")"

echo "=== Playwright Chromium install ==="

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif ! python3 -c "import playwright" 2>/dev/null; then
  echo "❌ Playwright Python package missing — run: bash install_all.sh"
  exit 1
fi

PW="python3 -m playwright"
command -v playwright >/dev/null 2>&1 && PW=playwright

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
echo "[*] Browser path: $PLAYWRIGHT_BROWSERS_PATH"

apt_sudo() {
  if [ "$(id -u)" -eq 0 ]; then "$@";
  elif sudo -n true 2>/dev/null; then sudo "$@";
  else return 1; fi
}

install_apt_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "⚠ apt-get not found — skip system deps"
    return 0
  fi
  echo "[*] playwright install-deps chromium (Ubuntu 22/24 safe)…"
  if apt_sudo env DEBIAN_FRONTEND=noninteractive $PW install-deps chromium; then
    echo "  ✅ system libraries"
  else
    echo "  ⚠ install-deps failed — will try --with-deps"
  fi
}

install_browser() {
  local n=1
  local max=3
  while [ "$n" -le "$max" ]; do
    echo "[*] Downloading Chromium (attempt $n/$max)…"
    if apt_sudo true 2>/dev/null; then
      if apt_sudo env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
        $PW install --with-deps chromium; then
        return 0
      fi
    fi
    if $PW install chromium; then
      return 0
    fi
    n=$((n + 1))
    sleep "$((n * 3))"
  done
  return 1
}

DISK=$(df -m "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
if [ -n "$DISK" ] && [ "$DISK" -lt 400 ] 2>/dev/null; then
  echo "⚠ Low disk space (${DISK}MB free) — Chromium needs ~400MB"
fi

install_apt_deps

if install_browser; then
  echo ""
  echo "✅ Chromium installed."
  python3 -c "
from playwright.sync_api import sync_playwright
p = sync_playwright().start()
b = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
b.close()
p.stop()
print('✅ Chromium launch OK')
"
  exit 0
fi

echo ""
echo "❌ Failed to install browsers"
echo ""
echo "As root on VPS:"
echo "  cd $(pwd)"
echo "  source .venv/bin/activate"
echo "  playwright install-deps chromium"
echo "  playwright install chromium"
exit 1
