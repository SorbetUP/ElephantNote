#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

kill_port_1420() {
  local pids
  pids="$(lsof -ti tcp:1420 2>/dev/null || true)"

  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi
}

pkill -f 'target/debug/elephantnote-tauri' 2>/dev/null || true
pkill -f 'vite --config vite.tauri.config.js' 2>/dev/null || true
kill_port_1420

cd "$ROOT_DIR/src-tauri"
cargo tauri dev
