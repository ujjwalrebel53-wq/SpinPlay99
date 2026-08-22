#!/bin/bash
# Diagnose + fix Telegram API connectivity from VPS
set -e
cd "$(dirname "$0")"

echo "=== Telegram network fix ==="
echo ""

_ok() { echo "  ✅ $1"; }
_fail() { echo "  ❌ $1"; }

# 1. General internet
echo "[1] Internet test"
if curl -fsS --connect-timeout 10 --max-time 15 -o /dev/null https://google.com 2>/dev/null; then
  _ok "google.com OK"
else
  _fail "No internet — VPS pe outbound HTTPS band hai"
  exit 1
fi

# 2. Direct Telegram
echo ""
echo "[2] Direct Telegram (api.telegram.org)"
DIRECT_OK=0
if curl -fsS --connect-timeout 15 --max-time 20 -o /dev/null https://api.telegram.org 2>/dev/null; then
  _ok "api.telegram.org direct OK — proxy ki zaroorat nahi"
  DIRECT_OK=1
else
  _fail "api.telegram.org TIMEOUT — ye datacenter/ISP Telegram block karta hai"
fi

# 3. Try proxies from .env
PROXY=""
if [ -f .env ]; then
  PROXY=$(grep -E '^TELEGRAM_PROXY=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
  if [ -z "$PROXY" ]; then
    PROXY=$(grep -E '^UIDAI_PROXY=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
    [ "$PROXY" = "auto" ] && PROXY=""
  fi
fi

if [ "$DIRECT_OK" = "0" ] && [ -n "$PROXY" ]; then
  echo ""
  echo "[3] Proxy test: $PROXY"
  if curl -fsS --connect-timeout 15 --max-time 25 -x "$PROXY" -o /dev/null https://api.telegram.org 2>/dev/null; then
    _ok "Telegram OK via proxy!"
    echo ""
    if ! grep -q '^TELEGRAM_PROXY=' .env 2>/dev/null; then
      echo "Adding TELEGRAM_PROXY to .env …"
      echo "TELEGRAM_PROXY=$PROXY" >> .env
    fi
    echo ""
    echo "Ab chalao: FORCE_RESTART=1 bash start_sex.sh"
    exit 0
  else
    _fail "Proxy se bhi Telegram fail — naya proxy chahiye"
  fi
fi

if [ "$DIRECT_OK" = "1" ]; then
  echo ""
  echo "Network theek — FORCE_RESTART=1 bash start_sex.sh"
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "FIX — Telegram blocked on this VPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option A — .env mein working proxy (Indian residential best):"
echo "  TELEGRAM_PROXY=http://IP:PORT"
echo "  ya TELEGRAM_PROXY=socks5://user:pass@IP:PORT"
echo "  pip install 'httpx[socks]'   # socks5 ke liye"
echo ""
echo "Option B — UIDAI_PROXY same rakho (auto use hota hai):"
echo "  UIDAI_PROXY=http://IP:PORT"
echo "  TELEGRAM_USE_UIDAI_PROXY=1"
echo ""
echo "Option C — VPS badlo:"
echo "  Indian ISP host (Jio/Airtel broadband / desi provider)"
echo "  AWS/DigitalOcean/Vultr pe Telegram aksar block"
echo ""
echo "Option D — Bot ghar ke PC pe chalao jahan Telegram app chalti ho"
echo ""
exit 1
