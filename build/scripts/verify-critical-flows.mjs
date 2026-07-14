import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const legacy = spawnSync(
  process.execPath,
  [path.join(root, 'build/scripts/verify-critical-flows-legacy.mjs')],
  { cwd: root, encoding: 'utf8' }
)

const combined = `${legacy.stdout || ''}\n${legacy.stderr || ''}`.trim()
const allowedLegacyFailures = new Set([
  '.github/workflows/ci.yml: missing ordered invariant "run: node build/scripts/verify-critical-flows.mjs" for main CI must run the guard, security gate and ElephantNote contract tests',
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue: missing ordered invariant "const AUTOSAVE_POLL_MS" for editor autosave persistence',
  'Elephant/backend/tauri/src/vault/sync.rs: missing ordered invariant "const BACKEND_LOCAL: &str = "elephant-local";" for Tauri embedded local sync engine',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri external-free sync invariant desktopRclone": false',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri external-free sync invariant mobileRcloneBinary": false',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri external-free sync invariant mobileSyncRequiresBackend": false',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri external-free sync invariant requiresExternalBinary": false',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri embedded sync unit test sync_push_copies_visible_vault_files_to_local_target',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri embedded sync unit test sync_pull_copies_target_files_back_to_vault',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri embedded sync unit test sync_preserves_both_versions_on_conflict',
  'Elephant/backend/tauri/src/vault/sync.rs: missing Tauri embedded sync unit test sync_run_reports_actionable_missing_target_error',
  'Elephant/backend/tauri/src/sync_contract_tests.rs: missing Tauri local sync runtime contract test',
  '.github/workflows/sync-docker.yml: missing Docker pair sync workflow'
])

const legacyFailures = combined
  .split(/\r?\n/)
  .filter((line) => line.startsWith('- '))
  .map((line) => line.slice(2))
const unexpectedLegacyFailures = legacyFailures.filter((failure) => !allowedLegacyFailures.has(failure))
if (unexpectedLegacyFailures.length > 0) {
  console.error(combined)
  console.error('Unexpected legacy critical-flow regressions:')
  for (const failure of unexpectedLegacyFailures) console.error(`- ${failure}`)
  process.exit(1)
}
if (legacy.status !== 0 && legacyFailures.length === 0) {
  console.error(combined)
  console.error('Legacy critical-flow guard failed without structured diagnostics.')
  process.exit(1)
}

const failures = []
const read = (relativePath) => {
  const target = path.join(root, relativePath)
  if (!fs.existsSync(target)) {
    failures.push(`Missing current critical-flow file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(target, 'utf8')
}
const has = (relativePath, needle, description = needle) => {
  if (!read(relativePath).includes(needle)) failures.push(`${relativePath}: missing ${description}`)
}
const ordered = (relativePath, needles, description) => {
  const content = read(relativePath)
  let cursor = -1
  for (const needle of needles) {
    const index = content.indexOf(needle, cursor + 1)
    if (index < 0) {
      failures.push(`${relativePath}: missing ordered invariant "${needle}" for ${description}`)
      return
    }
    cursor = index
  }
}

ordered(
  '.github/workflows/ci.yml',
  [
    '- name: Critical ElephantNote flow guard',
    'node build/scripts/verify-critical-flows.mjs 2>&1 | tee build/coverage/critical-flow-guard.log',
    '- name: Security guardrails',
    'run: pnpm security:guard'
  ],
  'journaled critical-flow guard before security checks'
)

ordered(
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
  [
    'const AUTOSAVE_DELAY_MS = 160',
    'const autosaveDelayFor',
    'let noteSaveTimer = null',
    'elephantnoteClient.notes.write({'
  ],
  'adaptive timer-based editor autosave persistence'
)

ordered(
  'Elephant/backend/tauri/src/vault/sync.rs',
  [
    'include!("sync_iroh/base.rs");',
    'include!("sync_iroh/network.rs");',
    'include!("sync_iroh/commands.rs");',
    'include!("sync_iroh/e2e_tests.rs");'
  ],
  'modular Iroh sync runtime'
)
ordered(
  'Elephant/backend/tauri/src/vault/sync_iroh/base.rs',
  [
    'const BACKEND_IROH: &str = "iroh";',
    'fn planned_operations(payload: &Value, paired: bool)',
    '"transport": "iroh-quic"',
    '"requiresExternalBinary": false',
    '"runtime": "tauri-rust-iroh"'
  ],
  'Iroh peer-to-peer runtime without external binary'
)

has(
  'Elephant/backend/tauri/src/vault/sync_iroh/e2e_tests.rs',
  'two_real_iroh_endpoints_exchange_modify_and_delete_vault_content',
  'real two-endpoint Iroh exchange regression'
)
for (const invariant of [
  'assert_eq!(first_status["transferredFiles"].as_u64(), Some(2));',
  'assert!(!root_b.join("B.md").exists());',
  'assert_eq!(fourth.conflicts, vec!["A.md"]);',
  'assert_eq!(archived_a, archived_b);',
  'assert!(manifest_a.content_equals(&manifest_b));'
]) {
  has(
    'Elephant/backend/tauri/src/vault/sync_iroh/e2e_tests.rs',
    invariant,
    `Iroh end-to-end invariant ${invariant}`
  )
}

for (const regression of [
  'status_initializes_real_iroh_sync_metadata_without_git',
  'whole_vault_manifest_includes_content_but_excludes_device_configuration',
  'excluded_configuration_cannot_be_uploaded_deleted_or_conflicted',
  'three_way_plan_propagates_deletion_and_preserves_concurrent_edits',
  'public_sync_plan_declares_iroh_without_external_binary'
]) {
  has(
    'Elephant/backend/tauri/src/sync_contract_tests.rs',
    regression,
    `Iroh sync contract test ${regression}`
  )
}

if (failures.length > 0) {
  console.error('Current Elephant critical-flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Critical ElephantNote flow guard passed (legacy invariants + current Iroh/autosave contracts).')
