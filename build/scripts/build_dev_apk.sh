#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI_DIR="$ROOT_DIR/Elephant/backend/tauri"
ANDROID_CONFIG="tauri.android.conf.json"
ANDROID_TARGET="${ANDROID_TARGET:-aarch64}"
ANDROID_BUILD_PROFILE="${ANDROID_BUILD_PROFILE:-release}"
ANDROID_APK_MAX_MIB="${ANDROID_APK_MAX_MIB:-24}"
APK_ROOT="$TAURI_DIR/gen/android/app/build/outputs/apk"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

file_size_bytes() {
  stat -f '%z' "$1" 2>/dev/null || stat -c '%s' "$1"
}

require_cmd cargo
require_cmd node
require_cmd pnpm

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK_ROOT" ]; then
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

# Never report stale APKs from an older profile or ABI as the current result.
rm -rf "$APK_ROOT"
mkdir -p "$APK_ROOT"

cd "$TAURI_DIR"
BUILD_ARGS=(android build --apk --target "$ANDROID_TARGET" --config "$ANDROID_CONFIG")
if [ "$ANDROID_BUILD_PROFILE" = "debug" ]; then
  BUILD_ARGS+=(--debug)
fi

printf '[android-apk] profile=%s target=%s max_size=%sMiB\n' \
  "$ANDROID_BUILD_PROFILE" "$ANDROID_TARGET" "$ANDROID_APK_MAX_MIB"
ELEPHANTNOTE_ANDROID_BUILD=1 \
ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1 \
  cargo tauri "${BUILD_ARGS[@]}"

FINAL_APK=""
if [ "$ANDROID_BUILD_PROFILE" = "release" ]; then
  UNSIGNED_APK="$(find "$APK_ROOT" -type f -name '*-release-unsigned.apk' -print | head -n 1)"
  if [ -z "$UNSIGNED_APK" ]; then
    echo "Release build completed but no unsigned ARM64 release APK was found under $APK_ROOT." >&2
    exit 1
  fi

  require_cmd keytool
  # Plain lexical ordering is supported by both macOS BSD sort and GNU sort.
  APKSIGNER="$(find "$SDK_ROOT/build-tools" -type f -name apksigner -print 2>/dev/null | sort | tail -n 1)"
  if [ -z "$APKSIGNER" ] || [ ! -x "$APKSIGNER" ]; then
    echo "Unable to find Android SDK apksigner under $SDK_ROOT/build-tools." >&2
    exit 1
  fi

  DEBUG_KEYSTORE="${ANDROID_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
  mkdir -p "$(dirname "$DEBUG_KEYSTORE")"
  if [ ! -f "$DEBUG_KEYSTORE" ]; then
    echo "[android-apk] creating local Android debug keystore at $DEBUG_KEYSTORE"
    keytool -genkeypair -noprompt \
      -keystore "$DEBUG_KEYSTORE" \
      -storepass android \
      -alias androiddebugkey \
      -keypass android \
      -dname 'CN=Android Debug,O=Android,C=US' \
      -keyalg RSA \
      -keysize 2048 \
      -validity 10000 >/dev/null
  fi

  FINAL_APK="${UNSIGNED_APK%-unsigned.apk}-debug-signed.apk"
  "$APKSIGNER" sign \
    --ks "$DEBUG_KEYSTORE" \
    --ks-key-alias androiddebugkey \
    --ks-pass pass:android \
    --key-pass pass:android \
    --out "$FINAL_APK" \
    "$UNSIGNED_APK"
  "$APKSIGNER" verify --verbose "$FINAL_APK"
  rm -f "$UNSIGNED_APK"
else
  FINAL_APK="$(find "$APK_ROOT" -type f -name '*-debug.apk' -print | head -n 1)"
fi

if [ -z "$FINAL_APK" ] || [ ! -s "$FINAL_APK" ]; then
  echo "No non-empty APK was generated." >&2
  exit 1
fi

APK_BYTES="$(file_size_bytes "$FINAL_APK")"
MAX_BYTES=$((ANDROID_APK_MAX_MIB * 1024 * 1024))
APK_MIB="$(awk -v bytes="$APK_BYTES" 'BEGIN { printf "%.2f", bytes / 1024 / 1024 }')"

printf '[android-apk] output=%s\n' "$FINAL_APK"
printf '[android-apk] size=%sMiB bytes=%s\n' "$APK_MIB" "$APK_BYTES"

if [ "$ANDROID_BUILD_PROFILE" = "release" ] && [ "$APK_BYTES" -gt "$MAX_BYTES" ]; then
  echo "Release APK is ${APK_MIB}MiB, above the ${ANDROID_APK_MAX_MIB}MiB limit." >&2
  exit 1
fi

printf '[android-apk] install with: adb install -r %q\n' "$FINAL_APK"
