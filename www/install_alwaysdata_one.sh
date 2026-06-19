#!/usr/bin/env bash
# =============================================================================
# Rebel Aadhaar — AlwaysData ONE-COMMAND install
#
# Single line (SSH pe paste karo):
#
#   curl -fsSL https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-web-panel-95e1/www/install_alwaysdata_one.sh | bash
#
# Optional env:
#   WEB_PIN=5678 INSTALL_DIR=~/my-aadhar bash install_alwaysdata_one.sh
# =============================================================================
set -euo pipefail

REPO="${REPO:-https://github.com/ujjwalrebel53-wq/SpinPlay99.git}"
BRANCH="${BRANCH:-cursor/aadhaar-web-panel-95e1}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/aadhar-bot}"
WEB_PIN="${WEB_PIN:-1234}"
SKIP_PROXY_BENCH="${SKIP_PROXY_BENCH:-0}"

echo "╔══════════════════════════════════════════╗"
echo "║  Rebel Aadhaar — One-Command Install     ║"
echo "╚══════════════════════════════════════════╝"
echo "  Dir:    $INSTALL_DIR"
echo "  Branch: $BRANCH"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "❌ git not found — AlwaysData SSH pe git install karo"
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "[1/5] git pull…"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" 2>/dev/null || \
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  echo "[1/5] git clone…"
  rm -rf "$INSTALL_DIR" 2>/dev/null || true
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
fi

WWW="$INSTALL_DIR/www"
if [[ ! -d "$WWW" ]]; then
  echo "❌ www/ folder missing in repo"
  exit 1
fi
cd "$WWW"

echo "[2/5] setup_alwaysdata.sh…"
export WEB_ACCESS_PIN="$WEB_PIN"
bash setup_alwaysdata.sh

echo "[3/5] scripts executable…"
chmod +x setup_alwaysdata.sh start_web_alwaysdata.sh refresh_free_proxy.sh 2>/dev/null || true

if [[ "$SKIP_PROXY_BENCH" != "1" ]]; then
  echo "[4/5] free Indian proxy benchmark (fastest auto-pick)…"
  if bash refresh_free_proxy.sh; then
    echo "  ✅ proxy benchmark done"
  else
    echo "  ⚠ proxy benchmark skip — UIDAI_PROXY=auto still works from proxy_ranked.json"
  fi
else
  echo "[4/5] proxy benchmark skipped (SKIP_PROXY_BENCH=1)"
fi

echo "[5/5] .env PIN update…"
if [[ -f .env ]]; then
  if grep -q '^WEB_ACCESS_PIN=' .env; then
    sed -i "s/^WEB_ACCESS_PIN=.*/WEB_ACCESS_PIN=${WEB_PIN}/" .env 2>/dev/null || \
      perl -pi -e "s/^WEB_ACCESS_PIN=.*/WEB_ACCESS_PIN=${WEB_PIN}/" .env
  else
    echo "WEB_ACCESS_PIN=${WEB_PIN}" >> .env
  fi
  grep -q '^UIDAI_PROXY=' .env || echo 'UIDAI_PROXY=auto' >> .env
fi

# Quick verify
# shellcheck disable=SC1091
set -a
source .env 2>/dev/null || true
set +a
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

📁 Path: $WWW
🔑 PIN:  ${WEB_PIN}  (change: nano $WWW/.env)
🌐 Proxy: UIDAI_PROXY=auto
$(if [[ -n "$FASTEST" ]]; then echo "⚡ Fastest: $FASTEST"; fi)

━━━ AlwaysData Panel (ek baar) ━━━
  Web → Sites → Add → User program

  Directory:  $WWW
  Command:    bash start_web_alwaysdata.sh
  Virtualenv: .venv
  Python:     3.11+
  Environment (panel se copy):
    IP=fd00::…
    PORT=8100

━━━ Test (optional SSH) ━━━
  cd $WWW && bash start_web_alwaysdata.sh

━━━ Update later ━━━
  curl -fsSL https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/${BRANCH}/www/install_alwaysdata_one.sh | bash

EOF
