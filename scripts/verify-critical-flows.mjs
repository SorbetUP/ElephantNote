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
  'web/server.mjs',
  'web/sync/WebGitSyncEngine.mjs',
  'scripts/sync-two-docker-smoke.mjs',
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  'Elephant/front/app/components/editor/ExcalidrawDialog.vue',
  'Elephant/front/app/utils/noteCardView.js',
  'Elephant/shared/apiContracts.js',
  'Elephant/shared/sync.js',
  'Elephant/front/app/services/elephantnoteClient/domainClients.js',
  'test/unit/specs/main/elephantnote/markdownDocument.spec.js',
  'test/unit/specs/main/elephantnote/tauriLocalIpcBridge.spec.js',
  'test/unit/specs/main/elephantnote/syncPlan.spec.js',
  'test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js',
  '.github/workflows/sync-docker.yml'
]) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing critical-flow file: ${file}`)
}

has('.github/workflows/ci.yml', '- name: Critical ElephantNote flow guard\n        run: node scripts/verify-critical-flows.mjs', 'blocking critical-flow guard in CI')
has('.github/workflows/ci.yml', 'pnpm exec vitest run test/unit/specs/main/elephantnote', 'ElephantNote contract tests in CI')
has('.github/workflows/ci.yml', '- name: Cargo check\n        run: cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features', 'blocking Tauri cargo check in main CI')
has('.github/workflows/tauri-ci.yml', '- name: Cargo check all targets\n        run: cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features', 'blocking Tauri all-target cargo check')

ordered('src/renderer/src/platform/bootstrapGlobals.js', [
  '__elephantnoteBootstrapFallback: true',
  'if (!target.fileUtils && !target.__TAURI__) target.fileUtils = createFileUtilsFallback()',
  'if (target.fileUtils?.__elephantnoteBootstrapFallback && target.__TAURI__) delete target.fileUtils'
], 'bootstrap must not mask real Tauri fileUtils with a no-op writer')

ordered('src/renderer/src/main.js', [
  "import { installTauriMarkTextSaveBridge } from './platform/tauriMarkTextSaveBridge'",
  "import { installTauriLocalIpcBridge } from './platform/tauriLocalIpcBridge'",
  'clearBootstrapFileUtilsFallbackForTauri()',
  'installRuntimeBridge()',
  'installTauriElephantNoteBridge()',
  'installTauriMarkTextSaveBridge()',
  'installTauriLocalIpcBridge()'
], 'Tauri bridges must be installed in the correct order')

ordered('src/renderer/src/platform/tauriLocalIpcBridge.js', [
  "'mt::response-file-save'",
  "'mt::response-file-save-as'",
  "'mt::open-file'",
  'const fallbackRelativePath =',
  'target.elephantnote.notes.read({ relativePath })',
  "dispatchLocalIpcEvent(target, 'mt::open-new-tab'",
  'if (LOCAL_IPC_EVENTS.has(channel)) {',
  'dispatchLocalIpcEvent(target, channel, args)'
], 'Tauri local IPC must route open, save and save-as events locally')

ordered('test/unit/specs/main/elephantnote/tauriLocalIpcBridge.spec.js', [
  'opens a vault note through notes.read even when target.path is unavailable',
  "expect(read).toHaveBeenCalledWith({ relativePath: 'test_keep/Note.md' })",
  'falls back to native IPC for files outside the active vault',
  'keeps renderer-local save events local and does not call native IPC'
], 'Tauri local IPC bridge regression test must cover backend note open and save event routing')

ordered('src/renderer/src/store/editor.js', [
  'HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options }) {',
  "'mt::response-file-save'"
], 'MarkText editor must emit the canonical save IPC')
ordered('src/renderer/src/store/editor.js', [
  'FILE_SAVE_AS() {',
  "'mt::response-file-save-as'"
], 'MarkText editor must emit the canonical save-as IPC')

ordered('src/renderer/src/platform/tauriMarkTextSaveBridge.js', [
  'const writeViaRustBackend = async(target, pathname, markdown) => {',
  "return invoke('tauri_marktext_write_file', { pathname, content: markdown })",
  "ipc.on('mt::response-file-save'",
  "ipc.on('mt::response-file-save-as'",
  "ipc.send('mt::tab-saved', id)",
  "ipc.send('mt::tab-save-failure', id, message)"
], 'Tauri save bridge must write through Rust backend and report result')

ordered('src-tauri/src/tauri_extra_commands.rs', [
  'pub fn tauri_notes_write(app: AppHandle, relative_path: String, content: Option<String>, markdown: Option<String>) -> R<Value> {',
  'let content = content.or(markdown).unwrap_or_default();',
  'fs::write(&path, content)'
], 'Rust notes.write must accept markdown alias')
ordered('src-tauri/src/tauri_extra_commands.rs', [
  'pub fn tauri_marktext_write_file(pathname: String, content: String) -> R<Value> {',
  'if pathname.trim().is_empty() {',
  'fs::write(&path, content)'
], 'Rust MarkText backend writer must write absolute editor file paths')
has('src-tauri/src/lib_min.rs', 'tauri_extra_commands::tauri_marktext_write_file', 'registered MarkText backend writer')

ordered('Elephant/shared/apiContracts.js', [
  'const textString = (value) => typeof value === \'string\'',
  "action('NOTES_READ', 'notes.read'",
  "action('NOTES_WRITE', 'notes.write'"
], 'shared API must expose notes.read/write')
ordered('Elephant/front/app/services/elephantnoteClient/domainClients.js', [
  'notes: {',
  'read: (relativePath) => call(API.NOTES_READ',
  'write: (payload = {}) => call(API.NOTES_WRITE, payload)'
], 'front client must expose notes.write')
has('src/renderer/src/platform/tauriElephantNoteBridge.js', "case 'notes.write': return bridge.notes.write(payload)", 'Tauri ElephantNote notes.write dispatch')

ordered('Elephant/front/app/components/editor/NoteEditorHost.vue', [
  "import { elephantnoteClient } from '../../services/elephantnoteClient'",
  'const getActiveNoteFile = () => {',
  'currentFile.value?.pathname',
  'const persistNoteMarkdown = async',
  'elephantnoteClient.notes.write({',
  'const rememberObservedMarkdown =',
  'noteSaveInterval = window.setInterval'
], 'editor host must import the client and persist dirty active notes')
ordered('Elephant/front/app/components/editor/NoteEditorHost.vue', [
  'const saveExcalidraw = async({ imageBlob, blob, sceneBlob, fileName } = {}) => {',
  'const writableImage = imageBlob || blob',
  'if (!writableImage) {',
  'const resolvedName = fileName || excalidrawFileName.value',
  'await window.fileUtils.writeFile(targetPath, writableImage)',
  'if (excalidrawInsertOnSave.value) {'
], 'editor host must save Excalidraw bytes before inserting the markdown link')
ordered('Elephant/front/app/components/editor/ExcalidrawDialog.vue', [
  'const blobToBytes = async(blob) => new Uint8Array(await blob.arrayBuffer())',
  'imageBlob: await blobToBytes(blob)',
  'sceneBlob: await sceneBlob.text()'
], 'Excalidraw dialog must emit writable bytes/text')
ordered('Elephant/front/app/utils/noteCardView.js', [
  'const stripInlineFrontmatterPrefix',
  'const metadataPairPattern = new RegExp',
  'export const getNoteCardExcerpt = (entry) => cleanPreview'
], 'note cards must strip compact frontmatter before preview rendering')
has('test/unit/specs/main/elephantnote/markdownDocument.spec.js', 'hides compact inline frontmatter when no body preview exists', 'note card preview regression test')

ordered('Elephant/shared/sync.js', [
  'export const createDefaultSyncPlan = (payloadByOperation = {}) => {',
  'const explicitOperations = normalizeExplicitOperations',
  'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PULL)',
  'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PUSH)'
], 'shared sync plan must keep explicit pull/push operations for multi-device sync')
has('test/unit/specs/main/elephantnote/syncPlan.spec.js', 'can pull into a second device without creating a local snapshot first', 'sync plan second-device pull regression test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', 'preserves direct string enqueue operations', 'web sync direct enqueue regression test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', "expect(calls).toContainEqual(['rm', '--cached', '--ignore-unmatch'", 'web sync metadata untracking test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', 'compacts completed queue items so periodic auto-sync cannot grow memory forever', 'web sync queue compaction regression test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', "expect(config.backend).toBe('git')", 'web sync git backend regression test')
has('web/sync/WebGitSyncEngine.mjs', 'normalizeQueueInput', 'web sync queue input normalization')
has('web/sync/WebGitSyncEngine.mjs', 'untrackSyncMetadata', 'web sync metadata untracking')
has('web/sync/WebGitSyncEngine.mjs', 'compactQueue()', 'web sync queue compaction')
has('web/sync/WebGitSyncEngine.mjs', 'backend: SYNC_BACKENDS.GIT', 'web sync reports the git backend')
has('web/sync/WebGitSyncEngine.mjs', 'ensureGitExclude()', 'web sync must exclude local metadata from shared git history')
has('src-tauri/src/vault/sync.rs', 'explicit_pull_plan_does_not_force_snapshot', 'Tauri sync plan pull regression')
has('src-tauri/src/vault/sync.rs', 'ensure_git_exclude', 'Tauri sync metadata exclusion')
has('src-tauri/src/vault/sync.rs', 'untrack_sync_metadata', 'Tauri legacy sync metadata untracking')
has('src-tauri/src/sync_contract_tests.rs', 'second_device_can_pull_without_creating_local_snapshot', 'Tauri second-device pull contract test')
has('src-tauri/src/sync_contract_tests.rs', 'sync_metadata_stays_local_and_is_not_tracked_by_git', 'Tauri sync metadata local-only contract test')
has('src-tauri/src/sync_contract_tests.rs', 'legacy_tracked_sync_metadata_is_removed_from_git_index', 'Tauri legacy metadata untracking contract test')
has('web/server.mjs', 'ELEPHANTNOTE_SYNC_AUTO_INTERVAL_MS', 'auto sync loop configuration')
has('web/server.mjs', '/api/sync/auto/status', 'auto sync status endpoint')
has('scripts/sync-two-docker-smoke.mjs', 'assertPeerIdentity', 'two-device peer identity detection check')
has('scripts/sync-two-docker-smoke.mjs', 'stopDevice(deviceB)', 'offline device simulation')
has('scripts/sync-two-docker-smoke.mjs', 'device B reconnect auto-pull', 'automatic reconnect pull check')
has('scripts/sync-two-docker-smoke.mjs', 'assertResourceBudget', 'Docker sync memory and runtime budget check')
has('scripts/sync-two-docker-smoke.mjs', 'assertNoTrackedSyncMetadata', 'Docker sync metadata leak regression check')
has('scripts/sync-two-docker-smoke.mjs', 'local sync metadata files stay untracked in each container git repository', 'Docker sync metadata leak summary check')
has('.github/workflows/sync-docker.yml', 'node scripts/sync-two-docker-smoke.mjs', 'Docker pair sync workflow runs directly with Node')

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Critical ElephantNote flow guard passed.')
