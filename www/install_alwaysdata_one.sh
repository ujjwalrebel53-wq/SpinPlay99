#!/usr/bin/env bash
# =============================================================================
# Rebel Aadhaar — AlwaysData ONE-COMMAND install
# Files seedha ~/www mein — aadhar-bot folder NAHI banega
#
#   curl -fsSL https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-web-panel-95e1/www/install_alwaysdata_one.sh | bash
#
# Optional:
#   WEB_PIN=5678 INSTALL_DIR=~/www bash install_alwaysdata_one.sh
# =============================================================================
set -euo pipefail

REPO="${REPO:-https://github.com/ujjwalrebel53-wq/SpinPlay99.git}"
BRANCH="${BRANCH:-cursor/aadhaar-web-panel-95e1}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/www}"
REPO_CACHE="${REPO_CACHE:-$HOME/.rebel-aadhar-src}"
WEB_PIN="${WEB_PIN:-1234}"
SKIP_PROXY_BENCH="${SKIP_PROXY_BENCH:-0}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Aadhaar — One-Command Install     ║"
echo "╚══════════════════════════════════════════╝"
echo "  Install: $INSTALL_DIR"
echo "  Branch:  $BRANCH"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "❌ git not found"
  exit 1
fi

mkdir -p "$INSTALL_DIR"

echo "[1/5] git fetch (cache: $REPO_CACHE)…"
if [[ -d "$REPO_CACHE/.git" ]]; then
  git -C "$REPO_CACHE" fetch origin "$BRANCH"
  git -C "$REPO_CACHE" checkout "$BRANCH" 2>/dev/null || true
  git -C "$REPO_CACHE" reset --hard "origin/$BRANCH"
else
  rm -rf "$REPO_CACHE" 2>/dev/null || true
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$REPO_CACHE"
fi

if [[ ! -d "$REPO_CACHE/www" ]]; then
  echo "❌ repo mein www/ missing"
  exit 1
fi

echo "[2/5] copy files → $INSTALL_DIR …"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.venv/' \
    "$REPO_CACHE/www/" "$INSTALL_DIR/"
else
  # fallback — .env / .venv preserve
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name '.env' ! -name '.venv' -exec rm -rf {} + 2>/dev/null || true
  shopt -s dotglob nullglob
  for item in "$REPO_CACHE/www"/*; do
    base="$(basename "$item")"
    [[ "$base" == ".env" || "$base" == ".venv" ]] && continue
    cp -a "$item" "$INSTALL_DIR/"
  done
  shopt -u dotglob nullglob
fi

cd "$INSTALL_DIR"

echo "[3/5] setup_alwaysdata.sh…"
export WEB_ACCESS_PIN="$WEB_PIN"
bash setup_alwaysdata.sh

chmod +x setup_alwaysdata.sh start_web_alwaysdata.sh refresh_free_proxy.sh install_alwaysdata_one.sh 2>/dev/null || true

if [[ "$SKIP_PROXY_BENCH" != "1" ]]; then
  echo "[4/5] proxy benchmark…"
  bash refresh_free_proxy.sh || echo "  ⚠ proxy bench skip"
else
  echo "[4/5] proxy benchmark skipped"
fi

echo "[5/5] .env PIN…"
if [[ -f .env ]]; then
  if grep -q '^WEB_ACCESS_PIN=' .env; then
    sed -i "s/^WEB_ACCESS_PIN=.*/WEB_ACCESS_PIN=${WEB_PIN}/" .env 2>/dev/null || \
      perl -pi -e "s/^WEB_ACCESS_PIN=.*/WEB_ACCESS_PIN=${WEB_PIN}/" .env
  else
    echo "WEB_ACCESS_PIN=${WEB_PIN}" >> .env
  fi
  grep -q '^UIDAI_PROXY=' .env || echo 'UIDAI_PROXY=auto' >> .env
fi

PY="python"
[[ -f .venv/bin/activate ]] && source .venv/bin/activate && PY="python"
FASTEST=""
if [[ -f proxy_ranked.json ]]; then
  FASTEST="$($PY -c "import json; d=json.load(open('proxy_ranked.json')); print(d['proxies'][0]['proxy'] if d.get('proxies') else '')" 2>/dev/null || true)"
fi

cat <<EOF

╔══════════════════════════════════════════╗
║  ✅ INSTALL COMPLETE                      ║
╚══════════════════════════════════════════╝

📁 Path: $INSTALL_DIR
🔑 PIN:  ${WEB_PIN}
🌐 Proxy: UIDAI_PROXY=auto
$(if [[ -n "$FASTEST" ]]; then echo "⚡ Fastest: $FASTEST"; fi)

━━━ AlwaysData Panel ━━━
  Directory:  $INSTALL_DIR
  Command:    bash $INSTALL_DIR/run.sh
  Virtualenv: .venv
  Env:        IP=fd00::…  PORT=8100

━━━ Update (same command) ━━━
  curl -fsSL https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www/install_alwaysdata_one.sh | bash

EOF
