#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing Actions policy file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

const workflows = {
  desktop: '.github/workflows/tauri-desktop-acceptance.yml',
  e2e: '.github/workflows/e2e.yml',
  android: '.github/workflows/android-apk.yml',
  addons: '.github/workflows/addon-platform-validation.yml',
  cleanup: '.github/workflows/actions-storage-cleanup.yml',
  storageGuard: '.github/workflows/actions-storage-guard.yml',
  trust: '.github/workflows/test.yml',
  muya: '.github/workflows/muya-wasm.yml',
  production: '.github/workflows/test-performance-hardening.yml',
  rustEditor: '.github/workflows/rust-editor-production-validation.yml',
  setup: '.github/actions/setup/action.yml'
}

const contents = Object.fromEntries(
  Object.entries(workflows).map(([key, relativePath]) => [key, read(relativePath)])
)

const forbid = (key, needle, description) => {
  if (contents[key].includes(needle)) {
    failures.push(`${workflows[key]}: forbidden ${description}`)
  }
}

const requireMarker = (key, needle, description) => {
  if (!contents[key].includes(needle)) {
    failures.push(`${workflows[key]}: missing ${description}`)
  }
}

for (const key of ['desktop', 'e2e']) {
  forbid(key, "      - 'agent/**'", 'push trigger for agent branches in addition to pull_request')
}

forbid('desktop', '            dist/**', 'desktop distribution directory in an Actions artifact')
forbid(
  'e2e',
  '            Elephant/backend/tauri/target/release/bundle/appimage/*.AppImage',
  'AppImage binary in E2E diagnostics'
)
forbid('e2e', '            build/out/addons/releases/**', 'native addon release directory in E2E diagnostics')
forbid('addons', '            build/addons/*.enaddon', 'reference .enaddon archive in validation evidence')
forbid('addons', '            build/out/addons/releases/**/*.enaddon', 'physical .enaddon archives in validation evidence')
forbid('cleanup', '/actions/caches/', 'cache deletion in the artifact cleanup workflow')

for (const key of ['desktop', 'e2e', 'android', 'addons']) {
  const uploadAlways = /- name: Upload[^\n]*\n\s+if: always\(\)/g.test(contents[key])
  if (uploadAlways) failures.push(`${workflows[key]}: upload-artifact must not run after cancellation`)

  const retentions = [...contents[key].matchAll(/retention-days:\s*(\d+)/g)]
    .map((match) => Number(match[1]))
  for (const retention of retentions) {
    if (!Number.isInteger(retention) || retention > 3) {
      failures.push(`${workflows[key]}: artifact retention ${retention} days exceeds the 3-day budget`)
    }
  }
}

for (const key of ['desktop', 'muya', 'production', 'rustEditor']) {
  forbid(key, 'cargo install wasm-bindgen-cli', 'source compilation of wasm-bindgen CLI')
  requireMarker(key, 'actions/checkout@v6', 'Node 24 checkout action')
  requireMarker(key, 'actions/upload-artifact@v7', 'Node 24 artifact upload action')
}

requireMarker('storageGuard', 'actions/checkout@v6', 'Node 24 checkout action')
requireMarker('trust', 'actions/checkout@v6', 'Node 24 checkout action')
requireMarker('trust', 'actions/setup-node@v6', 'Node 24 setup-node action')
requireMarker('trust', 'actions/upload-artifact@v7', 'Node 24 artifact upload action')
requireMarker('setup', 'actions/setup-node@v6', 'Node 24 setup-node action')
requireMarker('setup', 'package-manager-cache: false', 'explicit setup-node automatic-cache opt-out')
requireMarker('setup', 'install-wasm-bindgen-cli.mjs', 'verified prebuilt wasm-bindgen installer')

requireMarker('desktop', 'Upload compact Tauri acceptance evidence', 'compact desktop evidence upload')
requireMarker('desktop', 'compression-level: 9', 'maximum compression for desktop evidence')
requireMarker('e2e', 'Upload compact Linux proof diagnostics', 'compact AppImage proof upload')
requireMarker('e2e', 'if: failure()\n    runs-on: ubuntu-24.04', 'failure-only concise diagnostics job')
requireMarker('android', 'Upload Android review APK for develop or manual review', 'conditional APK publication')
requireMarker(
  'android',
  "if: github.event_name == 'workflow_dispatch' || github.event_name == 'push'",
  'APK upload restriction to develop pushes or manual review'
)
requireMarker('android', 'Upload compact Android proof', 'compact Android success evidence')
requireMarker('android', 'Upload Android failure diagnostics', 'failure-only Android screenshots and logs')
requireMarker('addons', 'addon-package-sha256.txt', 'addon package checksum evidence')
requireMarker('addons', 'addon-rust-package-sha256.txt', 'native addon checksum evidence')
requireMarker('cleanup', "      - 'agent/**'", 'one-time agent branch cleanup trigger')
requireMarker('cleanup', 'actions: write', 'Actions artifact deletion permission')
requireMarker('cleanup', 'older than ${KEEP_DAYS} days', 'bounded artifact retention cleanup')

if (failures.length > 0) {
  console.error('[actions-storage-budget] FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('[actions-storage-budget] PASS: artifacts are compact and migrated proof workflows use Node 24 actions plus verified prebuilt Rust tooling')
