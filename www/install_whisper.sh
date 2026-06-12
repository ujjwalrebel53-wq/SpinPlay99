#!/bin/bash
# Install OpenAI Whisper + CPU PyTorch (audio captcha auto-solve when image fails)
set -e
cd "$(dirname "$0")"

echo "=== Whisper + PyTorch (CPU) install ==="

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

echo "[1/4] Remove broken torch/whisper…"
pip uninstall -y openai-whisper whisper torch torchvision torchaudio 2>/dev/null || true
pip cache purge 2>/dev/null || true

echo "[2/4] Install PyTorch CPU (Python 3.12 safe)…"
pip install --no-cache-dir --upgrade pip setuptools wheel
pip install --no-cache-dir \
  torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cpu

echo "[3/4] Install openai-whisper…"
pip install --no-cache-dir openai-whisper

echo "[4/4] Verify torch + whisper…"
python3 -c "
import torch
import whisper
print('  torch', torch.__version__)
print('  whisper OK')
# broken torch check
import torch.utils.data.datapipes.iter.sharding  # noqa: F401
print('  torch datapipes OK')
"

MODEL="${WHISPER_MODEL:-tiny}"
echo ""
echo "Preloading Whisper model: $MODEL …"
WHISPER_MODEL="$MODEL" python3 -c "
import os, whisper
m = os.getenv('WHISPER_MODEL', 'tiny').strip() or 'tiny'
print(f'  Downloading {m}…')
whisper.load_model(m)
print('  ✅ model ready')
"

echo ""
echo "✅ Whisper ready (model=$MODEL)"
echo "  .env: UIDAI_WHISPER=1"
echo "  Light VPS: WHISPER_MODEL=tiny (default in this script)"
