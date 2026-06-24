#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

kill_port_1420() {
  local pids
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  pids="$(lsof -ti tcp:1420 2>/dev/null || true)"

  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi
}

pkill -f 'target/debug/elephantnote-tauri' 2>/dev/null || true
pkill -f 'vite --config vite.tauri.config.js' 2>/dev/null || true
kill_port_1420

cd "$ROOT_DIR"
node scripts/ensure-tauri-llama-server.mjs

TAURI_ARGS=()
if [ "$(uname -s 2>/dev/null || echo unknown)" = "Linux" ]; then
  TAURI_ARGS+=(--config tauri.linux.conf.json)
fi

cd "$ROOT_DIR/src-tauri"
cargo tauri dev "${TAURI_ARGS[@]}"
