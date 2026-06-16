#!/bin/bash
# Quick bot health check
set -e
cd "$(dirname "$0")"

echo "=== Bot diagnose ==="

if [ -f .env ]; then
  tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs)
  if [ -n "$tok" ]; then
    echo "Token: ${tok:0:12}… (${#tok} chars)"
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --connect-timeout 15 --max-time 20 "https://api.telegram.org/bot${tok}/getMe" >/dev/null 2>&1; then
        echo "✅ getMe OK"
      else
        echo "❌ getMe FAIL — network timeout ya token galat"
      fi
    fi
  else
    echo "❌ TELEGRAM_BOT_TOKEN empty"
  fi
else
  echo "❌ .env missing"
fi

if pgrep -f '[p]ython3.*sex\.py' >/dev/null; then
  echo "✅ sex.py running — PID $(pgrep -f '[p]ython3.*sex\.py' | tr '\n' ' ')"
else
  echo "❌ sex.py NOT running"
fi

if pgrep -f 'bash.*start_sex\.sh' >/dev/null; then
  echo "⚠ start_sex.sh shell still up"
fi

PYTHON=python3
[ -f .venv/bin/python ] && PYTHON=".venv/bin/python"

echo ""
echo "Telegram network:"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --connect-timeout 15 --max-time 20 -o /dev/null "https://api.telegram.org" 2>/dev/null; then
    echo "  ✅ api.telegram.org reachable"
  else
    echo "  ❌ api.telegram.org TIMEOUT — VPS network/firewall block"
    echo "     Fix: Indian ISP VPS, allow outbound 443, or TELEGRAM_PROXY in .env"
  fi
fi
if [ -f .env ]; then
  px=$(grep -E '^TELEGRAM_PROXY=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [ -n "$px" ]; then
    echo "  Proxy set: ${px%%@*}@***"
  fi
fi

echo ""
echo "Python deps:"
for m in dotenv telegram playwright; do
  if "$PYTHON" -c "import $m" 2>/dev/null; then
    echo "  ✅ $m"
  else
    echo "  ❌ $m — pip install -r requirements_sex.txt"
  fi
done

echo ""
echo "Last sex.log:"
tail -25 sex.log 2>/dev/null || echo "(no log)"

echo ""
echo "Restart: FORCE_RESTART=1 SKIP_CHROMIUM_TEST=1 bash start_sex.sh"
