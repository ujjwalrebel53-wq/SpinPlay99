#!/bin/bash
# Install OpenAI Whisper for /pdf audio captcha auto-solve (when image fails)
set -e
cd "$(dirname "$0")"

echo "=== Whisper install (audio captcha auto-solve) ==="

if command -v apt-get >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update -qq
    apt-get install -y -qq ffmpeg 2>/dev/null || apt-get install -y ffmpeg
  elif sudo -n true 2>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq ffmpeg 2>/dev/null || sudo apt-get install -y ffmpeg
  fi
fi

if [ ! -f .venv/bin/activate ]; then
  echo "❌ .venv missing — run: bash install_all.sh"
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "[1/3] pip install openai-whisper…"
pip install --no-cache-dir --upgrade pip
pip install --no-cache-dir openai-whisper

echo "[2/3] Verify import…"
python3 -c "import whisper; print('  ✅ whisper', getattr(whisper, '__version__', 'OK'))"

MODEL="${WHISPER_MODEL:-base}"
echo "[3/3] Preload model: $MODEL (first run downloads ~150MB)…"
python3 -c "
import whisper
import os
m = os.getenv('WHISPER_MODEL', '$MODEL').strip() or 'base'
print(f'  Loading {m}…')
whisper.load_model(m)
print('  ✅ model ready')
"

echo ""
echo "✅ Whisper installed — image fail pe audio auto-captcha chalega"
echo "  Light VPS: WHISPER_MODEL=tiny bash install_whisper.sh"
