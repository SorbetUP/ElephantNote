#!/usr/bin/env bash
set -uo pipefail

PACKAGE_ID="${ANDROID_PACKAGE_ID:-com.elephantnote.app}"
ACTIVITY="${ANDROID_ACTIVITY:-com.elephantnote.app/.MainActivity}"
CATALOG="${ANDROID_USAGE_CATALOG:-tests/app/usage/android/scenarios.json}"
RESULTS_TSV="${ANDROID_USAGE_RESULTS_TSV:-android-usage-results.tsv}"
RESULTS_JSON="${ANDROID_USAGE_RESULTS_JSON:-android-usage-summary.json}"
RESULTS_JUNIT="${ANDROID_USAGE_RESULTS_JUNIT:-android-usage-junit.xml}"
LOG_FILE="${ANDROID_USAGE_LOG:-android-usage-logcat.txt}"
SCENARIO_ID="note-back-roundtrip"
SCENARIO_LOG="android-usage-${SCENARIO_ID}.log"
DEVICE_UI_DUMP="/sdcard/elephant-note-fixture.xml"
STARTED_AT=$SECONDS

capture_ui() {
  local destination="$1"
  adb shell uiautomator dump "$DEVICE_UI_DUMP" >/dev/null 2>&1 || true
  adb pull "$DEVICE_UI_DUMP" "$destination" >/dev/null 2>&1 || true
  test -s "$destination"
}

capture_screen() {
  local destination="$1"
  adb exec-out screencap -p > "$destination"
  test -s "$destination"
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
  if [ -z "$coordinates" ]; then
    echo "Unable to find Android UI node containing: $needle" >&2
    cat "$dump_file" >&2
    return 1
  fi
  read -r x y <<<"$coordinates"
  adb shell input tap "$x" "$y"
}

assert_not_blank() {
  local screenshot="$1"
  local label="$2"
  python3 - "$screenshot" "$label" <<'PY'
import sys
from PIL import Image, ImageStat

path, label = sys.argv[1:]
image = Image.open(path).convert('RGB')
width, height = image.size
region = image.crop((
    max(0, int(width * .03)),
    max(0, int(height * .04)),
    min(width, int(width * .97)),
    min(height, int(height * .94))
))
pixels = list(region.get_flattened_data())
white = sum(1 for red, green, blue in pixels if red >= 245 and green >= 245 and blue >= 245)
non_white_ratio = 1 - white / max(1, len(pixels))
contrast = max(ImageStat.Stat(region).stddev)
print(f'[android-note-fixture] {label} non_white_ratio={non_white_ratio:.4f} contrast={contrast:.2f}')
if non_white_ratio < 0.005 or contrast < 4.0:
    raise SystemExit(f'{label}: screenshot is effectively a uniform blank surface')
PY
}

assert_screens_differ() {
  local before="$1"
  local after="$2"
  local minimum="$3"
  local label="$4"
  python3 - "$before" "$after" "$minimum" "$label" <<'PY'
import sys
from PIL import Image, ImageChops, ImageStat

before_path, after_path, minimum, label = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
before = Image.open(before_path).convert('RGB')
after = Image.open(after_path).convert('RGB')
if before.size != after.size:
    raise SystemExit(f'{label}: screenshot dimensions changed unexpectedly')
difference = ImageChops.difference(before, after)
mean_delta = sum(ImageStat.Stat(difference).mean) / 3
bbox = difference.getbbox()
print(f'[android-note-fixture] {label}_mean_delta={mean_delta:.3f} bbox={bbox}')
if not bbox or mean_delta < minimum:
    raise SystemExit(f'{label}: expected UI transition was not rendered')
PY
}

assert_process_alive() {
  local pid
  pid="$(adb shell pidof "$PACKAGE_ID" | tr -d '\r' || true)"
  test -n "$pid" || {
    echo 'Elephant process is no longer alive.' >&2
    return 1
  }
}

assert_no_renderer_regression() {
  adb logcat -d -v threadtime > "$LOG_FILE"
  local app_pid
  app_pid="$(adb shell pidof "$PACKAGE_ID" | awk '{print $1}' || true)"

  python3 - "$LOG_FILE" "$PACKAGE_ID" "$app_pid" <<'PY'
import sys
from pathlib import Path

log_path, package_id, app_pid = sys.argv[1], sys.argv[2], sys.argv[3].strip()
failures = []
for line in Path(log_path).read_text(errors='replace').splitlines():
    fields = line.split()
    package_crash = package_id in line and ('Process:' in line or 'Fatal signal' in line)
    pid_crash = bool(app_pid) and len(fields) > 3 and fields[2] == app_pid and any(
        marker in line for marker in ('FATAL EXCEPTION', 'SIGABRT', 'SIGSEGV')
    )
    if package_crash or pid_crash:
        failures.append(line)
if failures:
    print('A fatal Elephant Android crash was detected during note fixture testing.', file=sys.stderr)
    for line in failures[-80:]:
        print(line, file=sys.stderr)
    raise SystemExit(1)
PY

  if grep -Eq 'Tauri/Console:.*(Uncaught|ReferenceError|TypeError|SyntaxError)|Unhandled promise rejection|Command tauri_vault_read_binary not found|search\.initVault is not a function' "$LOG_FILE"; then
    echo 'A renderer regression was detected during note fixture testing.' >&2
    grep -E 'Tauri/Console:.*(Uncaught|ReferenceError|TypeError|SyntaxError)|Unhandled promise rejection|Command tauri_vault_read_binary not found|search\.initVault is not a function' "$LOG_FILE" >&2 || true
    return 1
  fi
}

return_to_workspace() {
  local attempt
  for attempt in 1 2 3 4 5; do
    capture_ui android-note-fixture-workspace.xml || true
    if [ -s android-note-fixture-workspace.xml ] && \
       grep -Eq 'Search notes|Open navigation' android-note-fixture-workspace.xml; then
      return 0
    fi
    adb shell input keyevent 4 >/dev/null 2>&1 || true
    sleep 1
  done

  adb shell am force-stop "$PACKAGE_ID"
  adb shell am start -W -n "$ACTIVITY" >/dev/null
  wait_for_ui_pattern \
    android-note-fixture-workspace.xml \
    'Search notes|Open navigation' \
    'Timed out waiting for the mobile workspace before creating the note fixture.' \
    35
}

emit_reports() {
  python3 - "$CATALOG" "$RESULTS_TSV" "$RESULTS_JSON" "$RESULTS_JUNIT" <<'PY'
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

catalog_path, tsv_path, json_path, junit_path = map(Path, sys.argv[1:])
catalog = json.loads(catalog_path.read_text())
metadata = {item['id']: item for item in catalog['scenarios']}
results = []
if tsv_path.exists():
    for raw in tsv_path.read_text().splitlines():
        if not raw.strip():
            continue
        scenario_id, status, duration, message = (raw.split('\t', 3) + [''])[:4]
        results.append({
            'id': scenario_id,
            'status': status,
            'durationSeconds': int(duration),
            'message': message,
            'description': metadata.get(scenario_id, {}).get('description', ''),
            'regression': metadata.get(scenario_id, {}).get('regression', ''),
            'tags': metadata.get(scenario_id, {}).get('tags', [])
        })
summary = {
    'schemaVersion': 1,
    'platform': 'android',
    'passed': sum(item['status'] == 'passed' for item in results),
    'failed': sum(item['status'] == 'failed' for item in results),
    'results': results
}
json_path.write_text(json.dumps(summary, indent=2) + '\n')

testsuite = ET.Element('testsuite', {
    'name': 'Elephant Android app usage regressions',
    'tests': str(len(results)),
    'failures': str(summary['failed']),
    'time': str(sum(item['durationSeconds'] for item in results))
})
for item in results:
    case = ET.SubElement(testsuite, 'testcase', {
        'classname': 'android.app-usage',
        'name': item['id'],
        'time': str(item['durationSeconds'])
    })
    if item['status'] == 'failed':
        failure = ET.SubElement(case, 'failure', {'message': item['message'] or 'scenario failed'})
        failure.text = item['regression']
ET.ElementTree(testsuite).write(junit_path, encoding='utf-8', xml_declaration=True)
PY
}

run_fixture() {
  return_to_workspace
  capture_ui android-note-fixture-before.xml
  capture_screen android-note-fixture-before.png
  assert_not_blank android-note-fixture-before.png note_fixture_before

  grep -Fq 'New note' android-note-fixture-before.xml || {
    echo 'The production New note action is not exposed in the Android accessibility tree.' >&2
    cat android-note-fixture-before.xml >&2
    return 1
  }
  tap_ui_node android-note-fixture-before.xml 'New note'

  wait_for_ui_pattern \
    android-note-fixture-editor.xml \
    'Close note' \
    'The production New note action did not open the real Android editor.' \
    35
  grep -Fq 'Note title' android-note-fixture-editor.xml
  grep -Fq 'Add tag' android-note-fixture-editor.xml
  capture_screen android-note-fixture-editor.png
  assert_not_blank android-note-fixture-editor.png note_fixture_editor
  assert_screens_differ android-note-fixture-before.png android-note-fixture-editor.png 1.0 note_fixture_create

  adb shell input keyevent 4
  wait_for_ui_pattern \
    android-note-fixture-after-back.xml \
    'Search notes|Open navigation' \
    'Android system back did not return from the created note to the workspace.' \
    35
  capture_screen android-note-fixture-after-back.png
  assert_not_blank android-note-fixture-after-back.png note_fixture_after_back
  assert_screens_differ android-note-fixture-editor.png android-note-fixture-after-back.png 1.0 note_fixture_back
  assert_process_alive
  assert_no_renderer_regression

  {
    echo 'fixture=create-note-via-visible-fab'
    echo 'editor_controls=present'
    echo 'android_system_back=returned-to-workspace'
    echo 'result=passed'
  } > android-note-fixture-validation.txt
}

set +e
(
  set -euo pipefail
  run_fixture
) > >(tee "$SCENARIO_LOG") 2>&1
STATUS=$?
set -e
DURATION=$((SECONDS - STARTED_AT))

mkdir -p "$(dirname "$RESULTS_TSV")" 2>/dev/null || true
TMP_RESULTS="${RESULTS_TSV}.tmp"
if [ -f "$RESULTS_TSV" ]; then
  awk -F '\t' -v scenario="$SCENARIO_ID" '$1 != scenario' "$RESULTS_TSV" > "$TMP_RESULTS"
else
  : > "$TMP_RESULTS"
fi

if [ "$STATUS" -eq 0 ]; then
  printf '%s\tpassed\t%s\t\n' "$SCENARIO_ID" "$DURATION" >> "$TMP_RESULTS"
else
  MESSAGE="$(tail -n 8 "$SCENARIO_LOG" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')"
  MESSAGE="${MESSAGE//$'\t'/ }"
  printf '%s\tfailed\t%s\t%s\n' "$SCENARIO_ID" "$DURATION" "$MESSAGE" >> "$TMP_RESULTS"
fi
mv "$TMP_RESULTS" "$RESULTS_TSV"
emit_reports

if [ "$STATUS" -eq 0 ]; then
  printf '[android-note-fixture] PASS %s (%ss)\n' "$SCENARIO_ID" "$DURATION"
else
  printf '[android-note-fixture] FAIL %s (%ss)\n' "$SCENARIO_ID" "$DURATION" >&2
fi
exit "$STATUS"
