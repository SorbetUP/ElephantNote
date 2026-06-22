#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

cargo llvm-cov \
  --lib \
  --fail-under-lines 90 \
  --ignore-filename-regex 'src/(lib_min|main|vault_min|vault_backend|vault_backend2|lib)\\.rs'
