import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const failures = []

const has = (relativePath, needle, description = needle) => {
  const content = read(relativePath)
  if (!content.includes(needle)) failures.push(`${relativePath}: missing ${description}`)
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

for (const file of [
  'src/renderer/src/platform/bootstrapGlobals.js',
  'src/renderer/src/platform/tauriLocalIpcBridge.js',
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  'src/renderer/src/main.js',
  'src/renderer/src/store/editor.js',
  'src-tauri/src/tauri_extra_commands.rs',
  'src-tauri/src/lib_min.rs',
  'src-tauri/src/vault/sync.rs',
  'src-tauri/src/sync_contract_tests.rs',
  'src-tauri/capabilities/default.json',
  'web/server.mjs',
  'web/sync/WebGitSyncEngine.mjs',
  'scripts/sync-two-docker-smoke.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/tauri-ci.yml',
  '.github/workflows/sync-docker.yml',
  'test/unit/specs/main/elephantnote/syncPlan.spec.js',
  'test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js',
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  'Elephant/front/app/utils/noteCardView.js',
  'Elephant/shared/apiContracts.js',
  'Elephant/shared/sync.js',
  'Elephant/front/app/services/elephantnoteClient/domainClients.js'
]) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing critical-flow file: ${file}`)
}

has('.github/workflows/ci.yml', 'node scripts/verify-critical-flows.mjs', 'critical-flow guard in CI')
has('.github/workflows/ci.yml', 'pnpm exec vitest run test/unit/specs/main/elephantnote', 'ElephantNote contract tests in CI')
has('.github/workflows/ci.yml', 'permissions:\n  contents: read', 'least-privilege default CI token permissions')
has('.github/workflows/ci.yml', 'cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features', 'main CI all-target Tauri cargo check')
has('.github/workflows/tauri-ci.yml', "- 'assistant/**'", 'Tauri CI runs on assistant branches')
has('.github/workflows/tauri-ci.yml', 'cargo fmt --manifest-path src-tauri/Cargo.toml -- --check', 'Tauri CI Rust format check')
has('.github/workflows/tauri-ci.yml', 'cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features', 'Tauri CI all-target cargo check')
has('.github/workflows/tauri-ci.yml', 'continue-on-error: true', 'Tauri coverage remains diagnostic during migration')
has('src-tauri/capabilities/default.json', 'core:window:allow-start-dragging', 'Tauri window dragging permission')
has('src-tauri/capabilities/default.json', 'notification:default', 'Tauri notification permission remains enabled')

ordered(
  'src/renderer/src/platform/bootstrapGlobals.js',
  [
    '__elephantnoteBootstrapFallback: true',
    'if (!target.fileUtils && !target.__TAURI__) target.fileUtils = createFileUtilsFallback()',
    'if (target.fileUtils?.__elephantnoteBootstrapFallback && target.__TAURI__) delete target.fileUtils'
  ],
  'bootstrap must not mask real Tauri fileUtils with a no-op writer'
)
ordered(
  'src/renderer/src/main.js',
  [
    "import { installTauriMarkTextSaveBridge } from './platform/tauriMarkTextSaveBridge'",
    "import { installTauriLocalIpcBridge } from './platform/tauriLocalIpcBridge'",
    'const clearBootstrapFileUtilsFallbackForTauri = () => {',
    'clearBootstrapFileUtilsFallbackForTauri()',
    'installRuntimeBridge()',
    'installTauriElephantNoteBridge()',
    'installTauriMarkTextSaveBridge()',
    'installTauriLocalIpcBridge()'
  ],
  'Tauri bridges must clear fallback, install save listener, then route local IPC sends to local listeners'
)
ordered(
  'src/renderer/src/platform/tauriLocalIpcBridge.js',
  [
    'const LOCAL_IPC_EVENTS = new Set([',
    "'mt::response-file-save'",
    "'mt::response-file-save-as'",
    "'mt::tab-saved'",
    'const nativeSend = ipc.send.bind(ipc)',
    'ipc.send = (channel, ...args) => {',
    'if (LOCAL_IPC_EVENTS.has(channel)) {',
    'dispatchLocalIpcEvent(target, channel, args)',
    'return nativeSend(channel, ...args)'
  ],
  'Tauri renderer-local IPC bridge must bypass core.invoke for MarkText save and save-as events'
)
ordered(
  'src/renderer/src/platform/tauriLocalIpcBridge.js',
  [
    'const NOTE_OPEN_EVENTS = new Set([',
    "'mt::open-file'",
    "'mt::open-file-by-window-id'",
    'const readVaultNote = async',
    'target.elephantnote.notes.read({ relativePath })',
    'const openVaultNoteWithBackend = async',
    'open-file via notes.read',
    "dispatchLocalIpcEvent(target, 'mt::open-new-tab'",
    'if (NOTE_OPEN_EVENTS.has(channel)) {'
  ],
  'Tauri vault note opening must read through the Rust notes.read backend before falling back to fileUtils'
)
ordered(
  'src/renderer/src/store/editor.js',
  [
    'HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options }) {',
    "'mt::response-file-save'"
  ],
  'MarkText editor must emit the canonical Electron save IPC'
)
ordered(
  'src/renderer/src/store/editor.js',
  [
    'FILE_SAVE_AS() {',
    "'mt::response-file-save-as'"
  ],
  'MarkText save-as must keep emitting the canonical Electron save-as IPC'
)
ordered(
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  [
    'const writeViaRustBackend = async(target, pathname, markdown) => {',
    "return invoke('tauri_marktext_write_file', { pathname, content: markdown })",
    "ipc.on('mt::response-file-save'",
    "ipc.on('mt::response-file-save-as'",
    "ipc.send('mt::tab-saved', id)",
    "ipc.send('mt::tab-save-failure', id, message)"
  ],
  'Tauri save bridge must use the Rust backend writer and report success/failure for save and save-as'
)
ordered(
  'src-tauri/src/tauri_extra_commands.rs',
  [
    'pub fn tauri_notes_write(app: AppHandle, relative_path: String, content: Option<String>, markdown: Option<String>) -> R<Value> {',
    'let content = content.or(markdown).unwrap_or_default();',
    'fs::write(&path, content)'
  ],
  'Rust note write command must accept both content and markdown payloads before writing to disk'
)
ordered(
  'src-tauri/src/tauri_extra_commands.rs',
  [
    'pub fn tauri_marktext_write_file(pathname: String, content: String) -> R<Value> {',
    'if pathname.trim().is_empty() {',
    'fs::write(&path, content)'
  ],
  'Rust MarkText backend writer must write absolute editor file paths without relying on renderer FS plugin permissions'
)
has('src-tauri/src/lib_min.rs', 'tauri_extra_commands::tauri_marktext_write_file', 'registered MarkText backend file writer')
ordered(
  'Elephant/shared/apiContracts.js',
  [
    'const textString = (value) => typeof value === \'string\'',
    "action('NOTES_READ', 'notes.read'",
    "action('NOTES_WRITE', 'notes.write'"
  ],
  'shared API must expose notes.read/write'
)
ordered(
  'Elephant/front/app/services/elephantnoteClient/domainClients.js',
  [
    'notes: {',
    'read: (relativePath) => call(API.NOTES_READ',
    'write: (payload = {}) => call(API.NOTES_WRITE, payload)'
  ],
  'front client must expose notes.write'
)
has('src/renderer/src/platform/tauriElephantNoteBridge.js', "case 'notes.write': return bridge.notes.write(payload)", 'Tauri ElephantNote notes.write dispatch')
ordered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const getActiveNoteFile = () => {',
    'currentFile.value?.pathname',
    'editorStore.tabs.find',
    'const syncVisibleNoteMetadata = (pathname, metadata = {}) => {',
    'store.rootEntries = store.rootEntries.map',
    'const persistNoteMarkdown = async',
    'elephantnoteClient.notes.write({',
    'await window.fileUtils.writeFile',
    'const rememberObservedMarkdown =',
    'if (file?.isSaved === false)',
    'noteSaveInterval = window.setInterval'
  ],
  'ElephantNote editor must keep UI metadata and fallback save path coherent'
)
ordered(
  'Elephant/front/app/utils/noteCardView.js',
  [
    'const stripInlineFrontmatterPrefix',
    'const metadataPairPattern = new RegExp',
    'export const getNoteCardExcerpt = (entry) => cleanPreview'
  ],
  'note cards must strip compact frontmatter before preview rendering'
)
has('test/unit/specs/main/elephantnote/markdownDocument.spec.js', 'hides compact inline frontmatter when no body preview exists', 'note card preview regression test')

ordered(
  'Elephant/shared/sync.js',
  [
    'export const createDefaultSyncPlan = (payloadByOperation = {}) => {',
    'const explicitOperations = normalizeExplicitOperations',
    'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PULL)',
    'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PUSH)'
  ],
  'shared sync plan must keep explicit pull/push operations for multi-device sync'
)
has('test/unit/specs/main/elephantnote/syncPlan.spec.js', 'can pull into a second device without creating a local snapshot first', 'sync plan second-device pull regression test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', 'compacts completed queue items so periodic auto-sync cannot grow memory forever', 'web sync queue compaction regression test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', "expect(config.backend).toBe('git')", 'web sync git backend regression test')
has('web/sync/WebGitSyncEngine.mjs', 'compactQueue()', 'web sync queue compaction')
has('web/sync/WebGitSyncEngine.mjs', 'backend: SYNC_BACKENDS.GIT', 'web sync reports the git backend')
has('web/sync/WebGitSyncEngine.mjs', 'ensureGitExclude()', 'web sync must exclude local metadata from shared git history')
has('src-tauri/src/vault/sync.rs', 'explicit_pull_plan_does_not_force_snapshot', 'Tauri sync plan pull regression')
has('src-tauri/src/vault/sync.rs', 'ensure_git_exclude', 'Tauri sync metadata exclusion')
has('src-tauri/src/sync_contract_tests.rs', 'second_device_can_pull_without_creating_local_snapshot', 'Tauri second-device pull contract test')
has('src-tauri/src/sync_contract_tests.rs', 'sync_metadata_stays_local_and_is_not_tracked_by_git', 'Tauri sync metadata local-only contract test')
has('web/server.mjs', 'ELEPHANTNOTE_SYNC_AUTO_INTERVAL_MS', 'auto sync loop configuration')
has('web/server.mjs', '/api/sync/auto/status', 'auto sync status endpoint')
has('scripts/sync-two-docker-smoke.mjs', 'assertPeerIdentity', 'two-device peer identity detection check')
has('scripts/sync-two-docker-smoke.mjs', 'stopDevice(deviceB)', 'offline device simulation')
has('scripts/sync-two-docker-smoke.mjs', 'device B reconnect auto-pull', 'automatic reconnect pull check')
has('scripts/sync-two-docker-smoke.mjs', 'assertResourceBudget', 'Docker sync memory and runtime budget check')
has('.github/workflows/sync-docker.yml', 'node scripts/sync-two-docker-smoke.mjs', 'Docker pair sync workflow runs directly with Node')

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Critical ElephantNote flow guard passed.')
