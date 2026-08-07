#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing Actions storage policy file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

const workflows = {
  desktop: '.github/workflows/tauri-desktop-acceptance.yml',
  e2e: '.github/workflows/e2e.yml',
  android: '.github/workflows/android-apk.yml',
  ci: '.github/workflows/ci.yml',
  cleanup: '.github/workflows/actions-storage-cleanup.yml'
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
forbid('cleanup', '/actions/caches/', 'cache deletion in the artifact cleanup workflow')

const oversizedCachePaths = [
  '~/.cargo/registry',
  '~/.cargo/git',
  '~/.gradle/caches',
  'Elephant/backend/tauri/target'
]
for (const key of ['android', 'ci']) {
  for (const cachePath of oversizedCachePaths) {
    forbid(key, cachePath, `oversized or stale-prone cache path ${cachePath}`)
  }
}
for (const key of ['android', 'ci']) {
  forbid(key, 'cargo install tauri-cli', 'per-job Tauri CLI compilation')
  forbid(key, 'cargo install wasm-bindgen-cli', 'per-job wasm-bindgen CLI compilation')
}

for (const key of ['desktop', 'e2e', 'android', 'ci']) {
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

requireMarker('desktop', 'Upload compact Tauri acceptance evidence', 'compact desktop evidence upload')
requireMarker('desktop', 'compression-level: 9', 'maximum compression for desktop evidence')
requireMarker('desktop', 'uses: ./.github/actions/setup-tauri-cli', 'shared pinned Tauri CLI setup')
requireMarker('e2e', 'Upload compact Linux proof diagnostics', 'compact AppImage proof upload')
requireMarker('e2e', 'if: failure()\n    runs-on: ubuntu-24.04', 'failure-only concise diagnostics job')
requireMarker('e2e', 'uses: ./.github/actions/setup-tauri-cli', 'shared pinned Tauri CLI setup')
requireMarker('android', 'Upload Android review APK for develop or manual review', 'conditional APK publication')
requireMarker(
  'android',
  "if: github.event_name == 'workflow_dispatch' || github.event_name == 'push'",
  'APK upload restriction to develop pushes or manual review'
)
requireMarker('android', 'Upload compact Android proof', 'compact Android success evidence')
requireMarker('android', 'Upload Android failure diagnostics', 'failure-only Android screenshots and logs')
requireMarker('android', 'Cache Gradle wrapper only', 'bounded Android Gradle cache')
requireMarker('android', 'uses: ./.github/actions/setup-tauri-cli', 'shared pinned Android Tauri CLI setup')
requireMarker('ci', 'uses: ./.github/actions/setup-tauri-cli', 'shared pinned Tauri CLI setup for macOS smoke')
requireMarker('ci', 'Verify exact prebuilt wasm-bindgen CLI', 'prebuilt wasm-bindgen verification instead of compilation')
requireMarker('cleanup', "      - 'agent/**'", 'one-time agent branch cleanup trigger')
requireMarker('cleanup', 'actions: write', 'Actions artifact deletion permission')
requireMarker('cleanup', 'older than ${KEEP_DAYS} days', 'bounded artifact retention cleanup')

if (failures.length > 0) {
  console.error('[actions-storage-budget] FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('[actions-storage-budget] PASS: PR artifacts and caches are compact, short-lived and automatically cleaned')
