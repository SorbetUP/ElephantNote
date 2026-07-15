#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="${ANDROID_PACKAGE_ID:-com.elephantnote.app}"
ACTIVITY="${ANDROID_ACTIVITY:-com.elephantnote.app/.MainActivity}"
CATALOG="${ANDROID_USAGE_CATALOG:-tests/app/usage/android/scenarios.json}"
DEVICE_UI_DUMP="/sdcard/elephant-usage-window.xml"
RESULTS_TSV="${ANDROID_USAGE_RESULTS_TSV:-android-usage-results.tsv}"
RESULTS_JSON="${ANDROID_USAGE_RESULTS_JSON:-android-usage-summary.json}"
RESULTS_JUNIT="${ANDROID_USAGE_RESULTS_JUNIT:-android-usage-junit.xml}"
LOG_FILE="${ANDROID_USAGE_LOG:-android-usage-logcat.txt}"
CURRENT_SCENARIO=""
CURRENT_STARTED_AT=0

: > "$RESULTS_TSV"
adb logcat -c

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
print(f'[android-usage] {label}_mean_delta={mean_delta:.3f} bbox={bbox}')
if not bbox or mean_delta < minimum:
    raise SystemExit(f'{label}: expected UI transition was not rendered')
PY
}

assert_process_alive() {
  local pid
  pid="$(adb shell pidof "$PACKAGE_ID" | tr -d '\r' || true)"
  test -n "$pid" || {
    echo "Elephant process is no longer alive." >&2
    return 1
  }
}

assert_no_renderer_regression() {
  adb logcat -d -v threadtime > "$LOG_FILE"
  if grep -Eq 'FATAL EXCEPTION|Process: com\.elephantnote\.app|Fatal signal.*com\.elephantnote\.app|SIGABRT|SIGSEGV' "$LOG_FILE"; then
    echo "A fatal Android crash was detected during app usage testing." >&2
    grep -E 'FATAL EXCEPTION|AndroidRuntime|Process: com\.elephantnote\.app|Fatal signal|SIGABRT|SIGSEGV' "$LOG_FILE" >&2 || true
    return 1
  fi
  if grep -Eq 'Tauri/Console:.*(Uncaught|ReferenceError|TypeError|SyntaxError)|Unhandled promise rejection|Command tauri_vault_read_binary not found|search\.initVault is not a function' "$LOG_FILE"; then
    echo "A renderer regression was detected during app usage testing." >&2
    grep -E 'Tauri/Console:.*(Uncaught|ReferenceError|TypeError|SyntaxError)|Unhandled promise rejection|Command tauri_vault_read_binary not found|search\.initVault is not a function' "$LOG_FILE" >&2 || true
    return 1
  fi
}

return_to_workspace() {
  local attempt
  for attempt in 1 2 3 4; do
    capture_ui android-usage-workspace.xml || true
    if [ -s android-usage-workspace.xml ] && grep -Eq 'Search notes|Open navigation' android-usage-workspace.xml; then
      return 0
    fi
    adb shell input keyevent 4 >/dev/null 2>&1 || true
    sleep 1
  done

  adb shell am force-stop "$PACKAGE_ID"
  adb shell am start -W -n "$ACTIVITY" >/dev/null
  sleep 4
  capture_ui android-usage-workspace.xml
  grep -Eq 'Search notes|Open navigation' android-usage-workspace.xml
}

scenario_library_layout_toggle() {
  return_to_workspace
  capture_ui android-layout-before.xml
  capture_screen android-layout-before.png

  local initial_label target_label
  if grep -q 'Show notes as list' android-layout-before.xml; then
    initial_label='Show notes as list'
    target_label='Show notes as grid'
  elif grep -q 'Show notes as grid' android-layout-before.xml; then
    initial_label='Show notes as grid'
    target_label='Show notes as list'
  else
    echo 'The mobile library layout control is absent.' >&2
    cat android-layout-before.xml >&2
    return 1
  fi

  tap_ui_node android-layout-before.xml "$initial_label"
  sleep 2
  capture_ui android-layout-after.xml
  capture_screen android-layout-after.png
  assert_screens_differ android-layout-before.png android-layout-after.png 0.45 library_layout_toggle
  grep -q "$target_label" android-layout-after.xml
  assert_process_alive
  assert_no_renderer_regression

  tap_ui_node android-layout-after.xml "$target_label"
  sleep 2
  capture_ui android-layout-restored.xml
  capture_screen android-layout-restored.png
  grep -q "$initial_label" android-layout-restored.xml
}

scenario_library_sort_sheet() {
  return_to_workspace
  capture_ui android-sort-before.xml
  capture_screen android-sort-before.png
  tap_ui_node android-sort-before.xml 'Sort notes'
  sleep 2
  capture_ui android-sort-sheet.xml
  capture_screen android-sort-sheet.png
  grep -q 'Title A' android-sort-sheet.xml
  assert_screens_differ android-sort-before.png android-sort-sheet.png 1.0 library_sort_sheet_open

  tap_ui_node android-sort-sheet.xml 'Title A'
  sleep 2
  capture_ui android-sort-after.xml
  capture_screen android-sort-after.png
  if grep -q 'Title A' android-sort-after.xml; then
    echo 'The mobile sort sheet did not close after selecting title ordering.' >&2
    cat android-sort-after.xml >&2
    return 1
  fi
  assert_process_alive
  assert_no_renderer_regression
}

scenario_open_existing_note() {
  return_to_workspace
  capture_ui android-note-workspace.xml
  capture_screen android-note-workspace.png
  tap_ui_node android-note-workspace.xml 'Open navigation'
  sleep 2
  capture_ui android-note-drawer.xml
  capture_screen android-note-drawer.png
  grep -q 'Getting Started' android-note-drawer.xml
  tap_ui_node android-note-drawer.xml 'Getting Started'
  sleep 4
  capture_ui android-note-open.xml || true
  capture_screen android-note-open.png
  assert_screens_differ android-note-drawer.png android-note-open.png 1.2 open_existing_note
  assert_process_alive
  assert_no_renderer_regression
}

record_result() {
  local id="$1"
  local status="$2"
  local duration="$3"
  local message="$4"
  printf '%s\t%s\t%s\t%s\n' "$id" "$status" "$duration" "$message" >> "$RESULTS_TSV"
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
            'regression': metadata.get(scenario_id, {}).get('regression', '')
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

on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "$CURRENT_SCENARIO" ]; then
    local duration=$((SECONDS - CURRENT_STARTED_AT))
    record_result "$CURRENT_SCENARIO" failed "$duration" "scenario exited with status $status"
    CURRENT_SCENARIO=""
  fi
  emit_reports || true
  exit "$status"
}
trap on_exit EXIT

run_scenario() {
  local id="$1"
  local function_name="$2"
  CURRENT_SCENARIO="$id"
  CURRENT_STARTED_AT=$SECONDS
  printf '[android-usage] START %s\n' "$id"
  "$function_name"
  local duration=$((SECONDS - CURRENT_STARTED_AT))
  record_result "$id" passed "$duration" ''
  printf '[android-usage] PASS %s (%ss)\n' "$id" "$duration"
  CURRENT_SCENARIO=""
}

mapfile -t SCENARIOS < <(python3 - "$CATALOG" <<'PY'
import json
import sys
for scenario in json.load(open(sys.argv[1]))['scenarios']:
    if scenario.get('runner') == 'android-regression':
        print(scenario['id'])
PY
)

for scenario in "${SCENARIOS[@]}"; do
  case "$scenario" in
    library-layout-toggle)
      run_scenario "$scenario" scenario_library_layout_toggle
      ;;
    library-sort-sheet)
      run_scenario "$scenario" scenario_library_sort_sheet
      ;;
    open-existing-note)
      run_scenario "$scenario" scenario_open_existing_note
      ;;
    *)
      echo "No Android usage implementation exists for catalog scenario: $scenario" >&2
      exit 1
      ;;
  esac
done

assert_no_renderer_regression
printf '[android-usage] success scenarios=%s\n' "${#SCENARIOS[@]}"
