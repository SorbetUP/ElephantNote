#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$ROOT_DIR/src-tauri"

if [ ! -d "$TAURI_DIR/gen/android" ]; then
  echo "Tauri Android project is not initialized yet."
  echo "Run: cd src-tauri && cargo tauri android init"
  exit 1
fi

cd "$TAURI_DIR"
cargo tauri android build --debug --apk

for APK_DIR in \
  "$TAURI_DIR/gen/android/app/build/outputs/apk/debug" \
  "$TAURI_DIR/gen/android/app/build/outputs/apk"; do
  if [ -d "$APK_DIR" ]; then
    echo "APK generated in: $APK_DIR"
    find "$APK_DIR" -maxdepth 3 -name '*.apk' -print
  fi
done
