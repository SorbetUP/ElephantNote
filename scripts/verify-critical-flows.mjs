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
  'web/server.mjs',
  'web/sync/WebGitSyncEngine.mjs',
  'scripts/sync-two-docker-smoke.mjs',
  '.github/workflows/sync-docker.yml',
  'test/unit/specs/main/elephantnote/syncPlan.spec.js',
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
has('web/sync/WebGitSyncEngine.mjs', 'ensureGitExclude()', 'web sync must exclude local metadata from shared git history')
has('web/server.mjs', 'ELEPHANTNOTE_SYNC_AUTO_INTERVAL_MS', 'auto sync loop configuration')
has('web/server.mjs', '/api/sync/auto/status', 'auto sync status endpoint')
has('scripts/sync-two-docker-smoke.mjs', 'assertPeerIdentity', 'two-device peer identity detection check')
has('scripts/sync-two-docker-smoke.mjs', 'stopDevice(deviceB)', 'offline device simulation')
has('scripts/sync-two-docker-smoke.mjs', 'device B reconnect auto-pull', 'automatic reconnect pull check')
has('scripts/sync-two-docker-smoke.mjs', 'assertResourceBudget', 'Docker sync memory and runtime budget check')
has('.github/workflows/sync-docker.yml', 'pnpm test:sync:docker:pair', 'Docker pair sync workflow')

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Critical ElephantNote flow guard passed.')
