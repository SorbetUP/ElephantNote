#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="${ANDROID_PACKAGE_ID:-com.elephantnote.app}"
ACTIVITY="${ANDROID_ACTIVITY:-com.elephantnote.app/.MainActivity}"
UI_TREE="${1:-android-note-open.xml}"
SCREENSHOT="${2:-android-note-open.png}"
REPORT="${3:-android-editor-chrome-validation.txt}"
DEVICE_UI_DUMP="/sdcard/elephant-editor-chrome.xml"

capture_ui() {
  local destination="$1"
  adb shell uiautomator dump "$DEVICE_UI_DUMP" >/dev/null 2>&1 || true
  adb pull "$DEVICE_UI_DUMP" "$destination" >/dev/null 2>&1 || true
  test -s "$destination"
}

capture_screen() {
  adb exec-out screencap -p > "$1"
  test -s "$1"
}

wait_for_ui_pattern() {
  local destination="$1"
  local pattern="$2"
  local label="$3"
  local timeout_seconds="${4:-35}"
  local deadline=$((SECONDS + timeout_seconds))

  while [ "$SECONDS" -lt "$deadline" ]; do
    capture_ui "$destination" || true
    if [ -s "$destination" ] && grep -Eq "$pattern" "$destination"; then
      return 0
    fi
    sleep 1
  done

  echo "$label" >&2
  [ -s "$destination" ] && cat "$destination" >&2
  return 1
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
  test -n "$coordinates" || {
    echo "Unable to find Android UI node containing: $needle" >&2
    cat "$dump_file" >&2
    return 1
  }
  read -r x y <<<"$coordinates"
  adb shell input tap "$x" "$y"
}

wait_for_workspace() {
  local deadline=$((SECONDS + 35))
  while [ "$SECONDS" -lt "$deadline" ]; do
    capture_ui android-editor-workspace.xml || true
    if [ -s android-editor-workspace.xml ] && grep -Eq 'Search notes|Open navigation' android-editor-workspace.xml; then
      return 0
    fi
    adb shell input keyevent 4 >/dev/null 2>&1 || true
    sleep 2
  done
  adb shell am force-stop "$PACKAGE_ID"
  adb shell am start -W -n "$ACTIVITY" >/dev/null
  sleep 5
  capture_ui android-editor-workspace.xml
  grep -Eq 'Search notes|Open navigation' android-editor-workspace.xml
}

create_production_note_fixture() {
  wait_for_workspace
  capture_ui android-editor-workspace.xml

  if ! grep -Fq 'New note' android-editor-workspace.xml; then
    echo 'The production New note action is not exposed in the Android accessibility tree.' >&2
    cat android-editor-workspace.xml >&2
    return 1
  fi
  tap_ui_node android-editor-workspace.xml 'New note'

  wait_for_ui_pattern \
    "$UI_TREE" \
    'Close note' \
    'The production New note action did not reach the real Android editor chrome.' \
    35
  capture_screen "$SCREENSHOT"
}

create_production_note_fixture

require_accessible_control() {
  local label="$1"
  if ! grep -Fq "$label" "$UI_TREE"; then
    if [ "$label" = 'Note title' ] && python3 - "$UI_TREE" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
for node in root.iter('node'):
    if node.attrib.get('class') != 'android.widget.EditText' or not node.attrib.get('text', '').strip():
        continue
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.attrib.get('bounds', ''))
    if match and int(match.group(2)) < 600:
        raise SystemExit(0)
raise SystemExit(1)
PY
    then
      return 0
    fi
    echo "Missing accessible note-editor control: $label" >&2
    cat "$UI_TREE" >&2
    exit 1
  fi
}

# The old duplicate full-window Rust overlay exposed only rendered markdown and
# an ad-hoc All notes button. The real NoteEditorHost must expose its complete
# title/tag/close chrome around the Rust editing surface.
require_accessible_control "Close note"
require_accessible_control "Note title"
require_accessible_control "Add tag"

python3 - "$SCREENSHOT" <<'PY'
import sys
from PIL import Image, ImageStat

image = Image.open(sys.argv[1]).convert('RGB')
width, height = image.size
if width < 300 or height < 500:
    raise SystemExit(f'Android editor screenshot is unexpectedly small: {width}x{height}')
stat = ImageStat.Stat(image)
spread = sum(variance ** 0.5 for variance in stat.var)
if spread < 6:
    raise SystemExit(f'Android editor screenshot is effectively blank (spread={spread:.2f})')
PY

{
  echo "ui_tree=$UI_TREE"
  echo "screenshot=$SCREENSHOT"
  echo "fixture=create-note-via-visible-fab"
  echo "production_create_action=passed"
  echo "close_note=present"
  echo "note_title=present"
  echo "add_tag=present"
  echo "result=passed"
} > "$REPORT"

cat "$REPORT"
