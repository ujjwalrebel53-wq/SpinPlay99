#!/usr/bin/env bash
# Free Indian proxy refresh — UIDAI speed test, fastest → proxy_ranked.json
set -euo pipefail
cd "$(dirname "$0")"
PY="python"
command -v python >/dev/null 2>&1 || PY="python3"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  PY="python"
fi
echo "[*] Benchmarking free Indian proxies vs UIDAI…"
"$PY" benchmark_proxies.py
echo ""
if [[ -f proxy_ranked.json ]]; then
  echo "[*] Top proxy:"
  "$PY" -c "import json; d=json.load(open('proxy_ranked.json')); print(d['proxies'][0] if d.get('proxies') else 'none')"
  echo ""
  echo "Set in .env: UIDAI_PROXY=auto  (uses fastest from proxy_ranked.json)"
fi
