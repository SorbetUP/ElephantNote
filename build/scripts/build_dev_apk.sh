#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI_DIR="$ROOT_DIR/Elephant/backend/tauri"
ANDROID_CONFIG="tauri.android.conf.json"
ANDROID_TARGET="${ANDROID_TARGET:-aarch64}"
ANDROID_BUILD_PROFILE="${ANDROID_BUILD_PROFILE:-debug}"

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

case "$ANDROID_BUILD_PROFILE" in
  debug|release) ;;
  *)
    echo "ANDROID_BUILD_PROFILE must be 'debug' or 'release', got: $ANDROID_BUILD_PROFILE" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"
node build/scripts/ensure-dev-dependencies.mjs

if [ ! -d "$TAURI_DIR/gen/android" ]; then
  echo "Tauri Android project is not initialized; running cargo tauri android init with $ANDROID_CONFIG."
  cd "$TAURI_DIR"
  cargo tauri android init --config "$ANDROID_CONFIG"
fi

cd "$TAURI_DIR"
BUILD_ARGS=(android build --apk --target "$ANDROID_TARGET" --config "$ANDROID_CONFIG")
if [ "$ANDROID_BUILD_PROFILE" = "debug" ]; then
  BUILD_ARGS+=(--debug)
fi

printf '[android-apk] profile=%s target=%s\n' "$ANDROID_BUILD_PROFILE" "$ANDROID_TARGET"
ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1 cargo tauri "${BUILD_ARGS[@]}"

APK_ROOT="$TAURI_DIR/gen/android/app/build/outputs/apk"
echo "APK output:"
find "$APK_ROOT" -type f -name '*.apk' -print -exec du -h {} \; 2>/dev/null || true
