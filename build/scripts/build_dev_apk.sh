#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI_DIR="$ROOT_DIR/Elephant/backend/tauri"
ANDROID_CONFIG="tauri.android.conf.json"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd cargo
require_cmd node
require_cmd pnpm

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT is not set. Install Android Studio/SDK first." >&2
  exit 1
fi

if [ ! -f "$TAURI_DIR/$ANDROID_CONFIG" ]; then
  echo "Missing Android Tauri config: $TAURI_DIR/$ANDROID_CONFIG" >&2
  exit 1
fi

if [ ! -d "$TAURI_DIR/gen/android" ]; then
  echo "Tauri Android project is not initialized; running cargo tauri android init with $ANDROID_CONFIG."
  cd "$TAURI_DIR"
  cargo tauri android init --config "$ANDROID_CONFIG"
fi

cd "$TAURI_DIR"
cargo tauri android build --debug --apk --config "$ANDROID_CONFIG"

for APK_DIR in \
  "$TAURI_DIR/gen/android/app/build/outputs/apk/debug" \
  "$TAURI_DIR/gen/android/app/build/outputs/apk"; do
  if [ -d "$APK_DIR" ]; then
    echo "APK generated in: $APK_DIR"
    find "$APK_DIR" -maxdepth 3 -name '*.apk' -print
  fi
done
