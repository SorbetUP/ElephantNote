#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI_DIR="$ROOT_DIR/Elephant/backend/tauri"
ANDROID_CONFIG="tauri.android.conf.json"
ANDROID_TARGET="${ANDROID_TARGET:-aarch64}"
ANDROID_BUILD_PROFILE="${ANDROID_BUILD_PROFILE:-release}"
ANDROID_APK_MAX_MIB="${ANDROID_APK_MAX_MIB:-24}"
APK_ROOT="$TAURI_DIR/gen/android/app/build/outputs/apk"
ANDROID_GRADLE_FILE="$TAURI_DIR/gen/android/app/build.gradle.kts"
ANDROID_MANIFEST="$TAURI_DIR/gen/android/app/src/main/AndroidManifest.xml"
MAIN_ACTIVITY="$TAURI_DIR/gen/android/app/src/main/java/com/elephantnote/app/MainActivity.kt"
MAIN_ACTIVITY_TEMPLATE="$ROOT_DIR/build/android/MainActivity.kt"
RENDERER_OUT="$ROOT_DIR/build/out/renderer"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

file_size_bytes() {
  if stat -c '%s' "$1" >/dev/null 2>&1; then
    stat -c '%s' "$1"
  else
    stat -f '%z' "$1"
  fi
}

ensure_compressed_native_libraries() {
  local gradle_file="$1"
  if [ ! -f "$gradle_file" ]; then
    echo "Missing generated Android Gradle file: $gradle_file" >&2
    exit 1
  fi

  node - "$gradle_file" <<'NODE'
const fs = require('node:fs')
const gradlePath = process.argv[2]
let source = fs.readFileSync(gradlePath, 'utf8')

if (!source.includes('useLegacyPackaging = true')) {
  const androidBlock = /android\s*\{/
  if (!androidBlock.test(source)) {
    throw new Error(`Unable to locate android { block in ${gradlePath}`)
  }

  source = source.replace(
    androidBlock,
    `android {
    // Store native libraries compressed in the APK. Android extracts them on install.
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }`
  )
  fs.writeFileSync(gradlePath, source)
}
NODE

  grep -q 'useLegacyPackaging = true' "$gradle_file"
  echo "[android-apk] native libraries will be compressed in the APK"
}

install_android_manifest_permissions() {
  if [ ! -f "$ANDROID_MANIFEST" ]; then
    echo "Missing generated Android manifest: $ANDROID_MANIFEST" >&2
    exit 1
  fi

  node - "$ANDROID_MANIFEST" <<'NODE'
const fs = require('node:fs')
const manifestPath = process.argv[2]
let source = fs.readFileSync(manifestPath, 'utf8')
const declarations = [
  '    <uses-permission android:name="android.permission.CAMERA" />',
  '    <uses-feature android:name="android.hardware.camera.any" android:required="false" />'
]

if (!source.includes('android.permission.CAMERA')) {
  const application = source.indexOf('<application')
  if (application < 0) throw new Error(`Unable to locate <application in ${manifestPath}`)
  source = `${source.slice(0, application)}${declarations.join('\n')}\n\n    ${source.slice(application)}`
  fs.writeFileSync(manifestPath, source)
}
NODE

  grep -q 'android.permission.CAMERA' "$ANDROID_MANIFEST"
  grep -q 'android.hardware.camera.any' "$ANDROID_MANIFEST"
  echo "[android-apk] installed Android camera permission and optional camera feature"
}

install_main_activity() {
  if [ ! -f "$MAIN_ACTIVITY_TEMPLATE" ]; then
    echo "Missing tracked Android activity template: $MAIN_ACTIVITY_TEMPLATE" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$MAIN_ACTIVITY")"
  cp "$MAIN_ACTIVITY_TEMPLATE" "$MAIN_ACTIVITY"
  cmp -s "$MAIN_ACTIVITY_TEMPLATE" "$MAIN_ACTIVITY"
  echo "[android-apk] installed tracked MainActivity template"
}

verify_android_renderer() {
  if [ ! -f "$RENDERER_OUT/index.html" ]; then
    echo "Android renderer output is missing: $RENDERER_OUT/index.html" >&2
    exit 1
  fi
  if grep -R -l --include='*.js' '__vite-browser-external' "$RENDERER_OUT" >/dev/null 2>&1; then
    echo "Android renderer still contains unresolved Node builtin stubs:" >&2
    grep -R -l --include='*.js' '__vite-browser-external' "$RENDERER_OUT" >&2 || true
    exit 1
  fi
  echo "[android-apk] renderer has no unresolved Vite Node builtin stubs"
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

install_android_manifest_permissions
install_main_activity
ensure_compressed_native_libraries "$ANDROID_GRADLE_FILE"

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

verify_android_renderer

FINAL_APK=""
if [ "$ANDROID_BUILD_PROFILE" = "release" ]; then
  UNSIGNED_APK="$(find "$APK_ROOT" -type f -name '*-release-unsigned.apk' -print | head -n 1)"
  if [ -z "$UNSIGNED_APK" ]; then
    echo "Release build completed but no unsigned ARM64 release APK was found under $APK_ROOT." >&2
    exit 1
  fi

  require_cmd keytool
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
printf '[android-apk] capture startup crash: adb logcat -c && adb shell am force-stop com.elephantnote.app && adb shell monkey -p com.elephantnote.app 1 && adb logcat -d -v threadtime AndroidRuntime:E libc:F elephantnote:I Tauri:I chromium:E "*:S"\n'
