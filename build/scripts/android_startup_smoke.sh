#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="${ANDROID_PACKAGE_ID:-com.elephantnote.app}"
ACTIVITY="${ANDROID_ACTIVITY:-com.elephantnote.app/.MainActivity}"
APK_ROOT="${ANDROID_APK_ROOT:-Elephant/backend/tauri/gen/android/app/build/outputs/apk}"
STARTUP_WAIT_SECONDS="${ANDROID_STARTUP_WAIT_SECONDS:-45}"
LOG_FILE="${ANDROID_STARTUP_LOG:-android-startup-logcat.txt}"
SCREENSHOT_FILE="${ANDROID_STARTUP_SCREENSHOT:-android-startup-screen.png}"
UI_DUMP_FILE="${ANDROID_STARTUP_UI_DUMP:-android-startup-window.xml}"
DEVICE_UI_DUMP="/sdcard/elephant-startup-window.xml"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd adb

capture_ui() {
  local destination="$1"
  adb shell uiautomator dump "$DEVICE_UI_DUMP" >/dev/null 2>&1 || true
  adb pull "$DEVICE_UI_DUMP" "$destination" >/dev/null 2>&1 || true
  test -s "$destination"
}

tap_ui_node() {
  local dump_file="$1"
  local needle="$2"
  local coordinates
  coordinates="$(python3 - "$dump_file" "$needle" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

path, needle = sys.argv[1], sys.argv[2].casefold()
root = ET.parse(path).getroot()
for node in root.iter('node'):
    haystack = ' '.join([
        node.attrib.get('text', ''),
        node.attrib.get('content-desc', ''),
        node.attrib.get('hint', '')
    ]).casefold()
    if needle not in haystack:
        continue
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.attrib.get('bounds', ''))
    if not match:
        continue
    left, top, right, bottom = map(int, match.groups())
    print((left + right) // 2, (top + bottom) // 2)
    break
PY
)"
  if [ -z "$coordinates" ]; then
    echo "Unable to find Android UI node containing: $needle" >&2
    cat "$dump_file" >&2
    return 1
  fi
  read -r x y <<<"$coordinates"
  adb shell input tap "$x" "$y"
}

assert_no_renderer_regression() {
  adb logcat -d -v threadtime > "$LOG_FILE"
  if grep -Eq 'FATAL EXCEPTION|Process: com\.elephantnote\.app|Fatal signal.*com\.elephantnote\.app|SIGABRT|SIGSEGV' "$LOG_FILE"; then
    echo "A fatal Android crash was detected." >&2
    grep -E 'FATAL EXCEPTION|AndroidRuntime|Process: com\.elephantnote\.app|Fatal signal|SIGABRT|SIGSEGV' "$LOG_FILE" >&2 || true
    exit 1
  fi
  if grep -Eq 'Tauri/Console:.*(Uncaught|ReferenceError|TypeError|SyntaxError)|Unhandled promise rejection|Command tauri_vault_read_binary not found|search\.initVault is not a function' "$LOG_FILE"; then
    echo "A renderer contract regression was detected during Android interaction testing." >&2
    grep -E 'Tauri/Console:.*(Uncaught|ReferenceError|TypeError|SyntaxError)|Unhandled promise rejection|Command tauri_vault_read_binary not found|search\.initVault is not a function' "$LOG_FILE" >&2 || true
    exit 1
  fi
}

APK="${ANDROID_APK_PATH:-}"
if [ -z "$APK" ]; then
  APK="$(find "$APK_ROOT" -type f -name '*-debug.apk' -print | head -n 1)"
fi
if [ -z "$APK" ] || [ ! -s "$APK" ]; then
  echo "No non-empty Android debug APK found under $APK_ROOT" >&2
  exit 1
fi

printf '[android-startup] apk=%s\n' "$APK"
adb wait-for-device
adb install -r "$APK"
adb shell pm clear "$PACKAGE_ID" >/dev/null
adb shell settings put secure immersive_mode_confirmations confirmed >/dev/null 2>&1 || true
adb logcat -c
adb shell am force-stop "$PACKAGE_ID"

START_OUTPUT="$(adb shell am start -W -n "$ACTIVITY" 2>&1)"
printf '%s\n' "$START_OUTPUT"
if printf '%s\n' "$START_OUTPUT" | grep -Eqi 'Error|Exception|does not exist'; then
  echo "Android Activity Manager failed to launch Elephant." >&2
  exit 1
fi

READY=0
DEADLINE=$((SECONDS + STARTUP_WAIT_SECONDS))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  capture_ui "$UI_DUMP_FILE" || true
  if [ -s "$UI_DUMP_FILE" ]; then
    if grep -Eq 'Choose your first vault|Stockage privé|Dossier Android|Search notes' "$UI_DUMP_FILE"; then
      READY=1
      break
    fi
    if grep -Eq 'Elephant n[^<]*(pas pu démarrer|a pas pu démarrer)' "$UI_DUMP_FILE"; then
      echo "Elephant rendered its startup failure surface." >&2
      cat "$UI_DUMP_FILE" >&2
      exit 1
    fi
  fi
  sleep 3
done

adb exec-out screencap -p > "$SCREENSHOT_FILE"
test -s "$SCREENSHOT_FILE"

PID="$(adb shell pidof "$PACKAGE_ID" | tr -d '\r' || true)"
if [ -z "$PID" ]; then
  echo "Elephant process is not alive after startup." >&2
  assert_no_renderer_regression
  exit 1
fi
printf '[android-startup] pid=%s\n' "$PID"

ACTIVITY_DUMP="$(adb shell dumpsys activity activities || true)"
WINDOW_DUMP="$(adb shell dumpsys window windows || true)"
RESUMED="$(printf '%s\n' "$ACTIVITY_DUMP" | grep -E -m 1 'topResumedActivity|mResumedActivity|ResumedActivity' || true)"
FOCUSED="$(printf '%s\n' "$WINDOW_DUMP" | grep -E -m 1 'mCurrentFocus|mFocusedApp' || true)"
VISIBLE="$(printf '%s\n' "$ACTIVITY_DUMP" | grep -E -m 1 "ActivityRecord.*${PACKAGE_ID}.*(RESUMED|visible=true)" || true)"
PERMISSION_UI="$(printf '%s\n' "$ACTIVITY_DUMP" | grep -Ei -m 1 'permissioncontroller.*(GrantPermissionsActivity|permission\.ui)' || true)"

{
  printf '\n[android-startup-diagnostics]\n'
  printf 'pid=%s\n' "$PID"
  printf 'resumed=%s\n' "$RESUMED"
  printf 'focused=%s\n' "$FOCUSED"
  printf 'visible=%s\n' "$VISIBLE"
  printf 'permission_ui=%s\n' "$PERMISSION_UI"
  printf 'mobile_shell_ready=%s\n' "$READY"
} >> "$LOG_FILE"

if ! printf '%s\n' "$RESUMED" "$FOCUSED" "$VISIBLE" | grep -q "$PACKAGE_ID"; then
  echo "Elephant is alive but no resumed, focused, or visible Activity record was found." >&2
  exit 1
fi

if [ -n "$PERMISSION_UI" ]; then
  echo "Android permission UI interrupted startup: $PERMISSION_UI" >&2
  exit 1
fi

if [ "$READY" -ne 1 ]; then
  echo "Elephant never rendered the mobile vault or workspace UI within ${STARTUP_WAIT_SECONDS}s." >&2
  if [ -s "$UI_DUMP_FILE" ]; then cat "$UI_DUMP_FILE" >&2; fi
  exit 1
fi

CAMERA_LINE="$(adb shell dumpsys package "$PACKAGE_ID" | grep -m 1 'android.permission.CAMERA:' || true)"
printf '[android-startup] camera=%s\n' "$CAMERA_LINE"
printf 'camera=%s\n' "$CAMERA_LINE" >> "$LOG_FILE"
if printf '%s' "$CAMERA_LINE" | grep -q 'granted=true'; then
  echo "Camera permission was granted during startup; it must only be requested by a user action." >&2
  exit 1
fi

assert_no_renderer_regression

python3 - "$SCREENSHOT_FILE" <<'PY'
import sys
from PIL import Image, ImageStat

path = sys.argv[1]
image = Image.open(path).convert('RGB')
width, height = image.size
left = max(0, int(width * 0.03))
top = max(0, int(height * 0.04))
right = min(width, int(width * 0.97))
bottom = min(height, int(height * 0.94))
region = image.crop((left, top, right, bottom))
pixels = list(region.getdata())
white = sum(1 for red, green, blue in pixels if red >= 245 and green >= 245 and blue >= 245)
non_white_ratio = 1 - white / max(1, len(pixels))
contrast = max(ImageStat.Stat(region).stddev)
print(
    f'[android-startup] screenshot={width}x{height} '
    f'non_white_ratio={non_white_ratio:.4f} contrast={contrast:.2f}'
)
if non_white_ratio < 0.005 or contrast < 4.0:
    raise SystemExit('Android startup screenshot is effectively a uniform blank surface')
PY

# Exercise the exact interactions that regressed on the physical phone.
capture_ui "$UI_DUMP_FILE"
tap_ui_node "$UI_DUMP_FILE" 'Search notes'
sleep 5
capture_ui android-search-window.xml
adb exec-out screencap -p > android-search-screen.png
adb shell input text 'Untitled'
sleep 4
capture_ui android-search-results-window.xml
assert_no_renderer_regression
if ! grep -Eq 'Search notes, paths, tags, or ideas|Searching locally|No matching notes found|Untitled' android-search-results-window.xml; then
  echo "The Android search control opened but did not expose a functional search surface." >&2
  cat android-search-results-window.xml >&2
  exit 1
fi

adb shell input keyevent 4
sleep 2
capture_ui android-workspace-after-search.xml
tap_ui_node android-workspace-after-search.xml 'Settings'
sleep 3
capture_ui android-settings-window.xml
adb exec-out screencap -p > android-settings-screen.png
assert_no_renderer_regression
if ! grep -q 'Settings' android-settings-window.xml; then
  echo "The Android Settings page did not open." >&2
  cat android-settings-window.xml >&2
  exit 1
fi

adb shell input keyevent 4
sleep 2
capture_ui android-workspace-after-settings.xml
tap_ui_node android-workspace-after-settings.xml 'Open navigation'
sleep 2
capture_ui android-drawer-window.xml
adb exec-out screencap -p > android-drawer-screen.png
assert_no_renderer_regression
if ! grep -Eq 'All notes|Getting Started' android-drawer-window.xml; then
  echo "The Android navigation drawer did not expose the vault tree." >&2
  cat android-drawer-window.xml >&2
  exit 1
fi

printf '[android-startup] success package=%s pid=%s mobile_shell_ready=true search_ready=true settings_ready=true drawer_ready=true camera_not_requested=true white_screen=false\n' "$PACKAGE_ID" "$PID"
