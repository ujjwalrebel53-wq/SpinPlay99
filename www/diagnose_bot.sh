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
      if curl -fsS "https://api.telegram.org/bot${tok}/getMe" >/dev/null 2>&1; then
        echo "✅ getMe OK"
      else
        echo "❌ getMe FAIL — token galat ya revoked (@BotFather se naya lo)"
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
