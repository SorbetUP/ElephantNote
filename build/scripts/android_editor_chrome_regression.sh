#!/usr/bin/env bash
set -euo pipefail

UI_TREE="${1:-android-note-open.xml}"
SCREENSHOT="${2:-android-note-open.png}"
REPORT="${3:-android-editor-chrome-validation.txt}"

if [ ! -s "$UI_TREE" ]; then
  echo "Missing Android note UI tree: $UI_TREE" >&2
  exit 1
fi
if [ ! -s "$SCREENSHOT" ]; then
  echo "Missing Android note screenshot: $SCREENSHOT" >&2
  exit 1
fi

require_accessible_control() {
  local label="$1"
  if ! grep -Fq "$label" "$UI_TREE"; then
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
spread = sum(channel[1] ** 0.5 for channel in stat.var)
if spread < 6:
    raise SystemExit(f'Android editor screenshot is effectively blank (spread={spread:.2f})')
PY

{
  echo "ui_tree=$UI_TREE"
  echo "screenshot=$SCREENSHOT"
  echo "close_note=present"
  echo "note_title=present"
  echo "add_tag=present"
  echo "result=passed"
} > "$REPORT"

cat "$REPORT"
