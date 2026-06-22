#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cargo tauri android build --debug --apk

for APK_DIR in \
  "$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/debug" \
  "$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk"; do
  if [ -d "$APK_DIR" ]; then
    echo "APK generated in: $APK_DIR"
    find "$APK_DIR" -maxdepth 3 -name '*.apk' -print
  fi
done
