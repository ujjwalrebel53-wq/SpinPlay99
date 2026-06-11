#!/bin/bash
# Install Playwright Chromium + Linux system libraries (for /open and sex.py)
set -e
cd "$(dirname "$0")"

echo "=== Playwright Chromium install ==="

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif ! python3 -c "import playwright" 2>/dev/null; then
  echo "❌ Playwright Python package missing — run: bash install.sh"
  exit 1
fi

PW="python3 -m playwright"
if command -v playwright >/dev/null 2>&1; then
  PW=playwright
fi

# Writable browser cache (avoids permission errors)
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
echo "[*] Browser path: $PLAYWRIGHT_BROWSERS_PATH"

install_apt_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "⚠ apt-get not found — skip system deps (manual install may be needed)"
    return 0
  fi
  echo "[*] Installing Chromium system libraries…"
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update -qq
    $PW install-deps chromium || true
    apt-get install -y -qq \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
      libx11-6 libxext6 libxcb1 libdbus-1-3 libglib2.0-0 \
      fonts-liberation wget ca-certificates \
      2>/dev/null || true
  elif sudo -n true 2>/dev/null; then
    sudo apt-get update -qq
    sudo $PW install-deps chromium || true
  else
    echo "⚠ No root/sudo — trying: playwright install-deps (may fail)"
    $PW install-deps chromium 2>/dev/null || true
  fi
}

install_browser() {
  local n=1
  local max=3
  while [ "$n" -le "$max" ]; do
    echo "[*] Downloading Chromium (attempt $n/$max)…"
    # --with-deps = apt libraries + browser (needs root once on VPS)
    if [ "$(id -u)" -eq 0 ] || sudo -n true 2>/dev/null; then
      if $PW install --with-deps chromium 2>/dev/null; then
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

free_mb() {
  df -m "$HOME" 2>/dev/null | awk 'NR==2 {print $4}'
}

DISK=$(free_mb)
if [ -n "$DISK" ] && [ "$DISK" -lt 400 ] 2>/dev/null; then
  echo "⚠ Low disk space (${DISK}MB free) — Chromium needs ~400MB"
fi

install_apt_deps

if install_browser; then
  echo ""
  echo "✅ Chromium installed."
  $PW install --dry-run chromium 2>/dev/null || true
  echo ""
  echo "Test: python3 -c \"from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(); b.close(); p.stop(); print('OK')\""
  exit 0
fi

echo ""
echo "❌ Failed to install browsers"
echo ""
echo "Try as root on Indian VPS:"
echo "  cd $(pwd)"
echo "  source .venv/bin/activate"
echo "  apt-get update && apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2 libxkbcommon0"
echo "  playwright install-deps chromium"
echo "  playwright install chromium"
echo ""
echo "If download blocked, check firewall or run:"
echo "  export PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright"
echo "  playwright install chromium"
echo ""
echo "Only /pdf (aadhar.py) works without Chromium. /open and sex.py need Chromium."
exit 1
