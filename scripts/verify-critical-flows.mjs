import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

const filePath = (relativePath) => path.join(root, relativePath)
const exists = (relativePath) => fs.existsSync(filePath(relativePath))
const read = (relativePath) => {
  if (!exists(relativePath)) {
    failures.push(`Missing critical-flow file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(filePath(relativePath), 'utf8')
}

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

const requireFiles = (files) => {
  for (const file of files) {
    if (!exists(file)) failures.push(`Missing critical-flow file: ${file}`)
  }
}

requireFiles([
  'package.json',
  'src/main/config.js',
  'src/preload/index.js',
  'src/renderer/src/main.js',
  'src/renderer/src/platform/bootstrapGlobals.js',
  'src/renderer/src/platform/tauriElephantNoteBridge.js',
  'src/renderer/src/platform/tauriLocalIpcBridge.js',
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  'src/renderer/src/platform/piProviderInterface.js',
  'src/renderer/src/store/editor.js',
  'src-tauri/src/lib_min.rs',
  'src-tauri/src/tauri_extra_commands.rs',
  'src-tauri/src/vault/sync.rs',
  'src-tauri/src/sync_contract_tests.rs',
  'web/server.mjs',
  'web/sync/WebGitSyncEngine.mjs',
  'scripts/security-guardrails-core.mjs',
  'scripts/verify-security-guardrails.mjs',
  'scripts/sync-two-docker-smoke.mjs',
  'security/guardrails-baseline.json',
  'Elephant/shared/apiContracts.js',
  'Elephant/shared/sync.js',
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  'Elephant/front/app/components/editor/ExcalidrawDialog.vue',
  'Elephant/front/app/services/elephantnoteClient/apiRuntime.js',
  'Elephant/front/app/services/elephantnoteClient/domainClients.js',
  'Elephant/front/app/services/elephantnoteClient/legacyCalls.js',
  'Elephant/front/app/utils/noteCardView.js',
  'test/unit/elephantnote/domainClients.spec.js',
  'test/unit/specs/main/elephantnote/apiContracts.spec.js',
  'test/unit/specs/main/elephantnote/apiRuntime.spec.js',
  'test/unit/specs/main/elephantnote/electronWindowSecurity.spec.js',
  'test/unit/specs/main/elephantnote/legacyCalls.spec.js',
  'test/unit/specs/main/elephantnote/markdownDocument.spec.js',
  'test/unit/specs/main/elephantnote/piProviderInterface.spec.js',
  'test/unit/specs/main/elephantnote/securityGuardrails.spec.js',
  'test/unit/specs/main/elephantnote/syncPlan.spec.js',
  'test/unit/specs/main/elephantnote/tauriElephantNoteBridge.spec.js',
  'test/unit/specs/main/elephantnote/tauriLocalIpcBridge.spec.js',
  'test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js',
  '.github/dependabot.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/sync-docker.yml',
  '.github/workflows/tauri-ci.yml'
])

has('package.json', '"security:guard": "node scripts/verify-security-guardrails.mjs"', 'security guard script in package.json')
ordered('.github/workflows/ci.yml', [
  '- name: Critical ElephantNote flow guard',
  'run: node scripts/verify-critical-flows.mjs',
  '- name: Security guardrails',
  'run: pnpm security:guard',
  'pnpm exec vitest run test/unit/specs/main/elephantnote'
], 'main CI must run critical guard, security guard and ElephantNote contract tests')
has('.github/workflows/ci.yml', 'cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features', 'blocking Tauri cargo check in main CI')
has('.github/workflows/tauri-ci.yml', 'cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features', 'blocking Tauri all-target cargo check')
has('.github/workflows/codeql.yml', 'github/codeql-action/analyze@v3', 'CodeQL security analysis workflow')
has('.github/dependabot.yml', 'package-ecosystem: cargo', 'Dependabot coverage for Cargo dependencies')

ordered('src/main/config.js', [
  'const secureWebPreferences = Object.freeze({',
  'contextIsolation: true',
  'nodeIntegration: false',
  'webSecurity: true',
  'webPreferences: { ...secureWebPreferences }'
], 'Electron windows must use secure shared webPreferences')
ordered('src/preload/index.js', [
  'if (process.contextIsolated)',
  "contextBridge.exposeInMainWorld('electron'",
  "contextBridge.exposeInMainWorld('fileUtils'",
  "contextBridge.exposeInMainWorld('path'",
  "contextBridge.exposeInMainWorld('elephantnote'"
], 'secure Electron renderer must expose required APIs through preload')
has('test/unit/specs/main/elephantnote/electronWindowSecurity.spec.js', 'keeps renderer Node.js disabled and browser security enabled', 'Electron security regression test')

ordered('scripts/security-guardrails-core.mjs', [
  'export const DEFAULT_BASELINE_PATH',
  'const isBroadFsScope',
  "id: 'TAURI_FS_SCOPE_BROAD'",
  'const scanGitHubWorkflows',
  "id: 'GITHUB_ACTIONS_PULL_REQUEST_TARGET'",
  'const scanPackageScripts',
  "id: 'PACKAGE_SCRIPT_REMOTE_PIPE_TO_SHELL'",
  'const scanCommittedSecrets',
  'export const collectSecurityFindings'
], 'security guardrails must wire broad scopes, workflow checks, package script checks, secret checks and finding collection')
for (const secretFindingId of [
  "id: 'SECRET_ENV_FILE_COMMITTED'",
  "id: 'SECRET_PRIVATE_KEY_FILE'",
  "id: 'SECRET_PRIVATE_KEY_CONTENT'",
  "id: 'SECRET_GITHUB_TOKEN'",
  "id: 'SECRET_OPENAI_COMPATIBLE_TOKEN'"
]) {
  has('scripts/security-guardrails-core.mjs', secretFindingId, `security secret detector ${secretFindingId}`)
}
ordered('scripts/verify-security-guardrails.mjs', [
  'loadSecurityBaseline(root)',
  'collectSecurityFindings(root)',
  'splitFindingsByBaseline(findings, baseline)',
  'summary.hasBlockingFindings',
  'process.exit(1)'
], 'security guardrail runner must fail on unbaselined blockers')
has('security/guardrails-baseline.json', 'TAURI_FS_SCOPE_BROAD', 'explicit baseline for current broad Tauri fs scopes')
ordered('test/unit/specs/main/elephantnote/securityGuardrails.spec.js', [
  'flags broad Tauri filesystem scopes',
  'rejects pull_request_target workflows',
  'rejects committed real environment files while allowing examples',
  'rejects private key material in committed files',
  'rejects GitHub and OpenAI-compatible tokens in source files'
], 'security guardrail regression tests must cover broad scopes, unsafe workflows and secrets')

ordered('src/renderer/src/platform/bootstrapGlobals.js', [
  '__elephantnoteBootstrapFallback: true',
  'if (!target.fileUtils && !target.__TAURI__) target.fileUtils = createFileUtilsFallback()',
  'if (target.fileUtils?.__elephantnoteBootstrapFallback && target.__TAURI__) delete target.fileUtils'
], 'bootstrap must not mask real Tauri fileUtils with a no-op writer')
ordered('src/renderer/src/main.js', [
  "import { installTauriElephantNoteBridge } from './platform/tauriElephantNoteBridge'",
  "import { installPiProviderBridge } from './platform/piProviderInterface'",
  "import { installTauriMarkTextSaveBridge } from './platform/tauriMarkTextSaveBridge'",
  "import { installTauriLocalIpcBridge } from './platform/tauriLocalIpcBridge'",
  'clearBootstrapFileUtilsFallbackForTauri()',
  'installRuntimeBridge()',
  'installTauriElephantNoteBridge()',
  'installPiProviderBridge()',
  'installTauriMarkTextSaveBridge()',
  'installTauriLocalIpcBridge()'
], 'Tauri and PI bridges must be installed in the correct order')
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
ordered('src/renderer/src/platform/tauriMarkTextSaveBridge.js', [
  'const writeViaRustBackend = async(target, pathname, markdown) => {',
  "return invoke('tauri_marktext_write_file', { pathname, content: markdown })",
  "ipc.on('mt::response-file-save'",
  "ipc.on('mt::response-file-save-as'",
  "ipc.send('mt::tab-saved', id)",
  "ipc.send('mt::tab-save-failure', id, message)"
], 'Tauri save bridge must write through Rust backend and report result')
ordered('src/renderer/src/store/editor.js', [
  'HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options }) {',
  "'mt::response-file-save'"
], 'MarkText editor must emit the canonical save IPC')
has('test/unit/specs/main/elephantnote/tauriLocalIpcBridge.spec.js', 'keeps renderer-local save events local and does not call native IPC', 'Tauri local IPC bridge save routing test')

ordered('src-tauri/src/tauri_extra_commands.rs', [
  'fn writable_relative_path(root: &str, relative_path: &str) -> R<PathBuf> {',
  'pub fn tauri_notes_write(app: AppHandle, relative_path: String, content: Option<String>, markdown: Option<String>) -> R<Value> {',
  'let content = content.or(markdown).unwrap_or_default();',
  'let changed = write_text_if_changed(&path, &content)?;'
], 'Rust notes.write must accept markdown alias and use the guarded writer')
ordered('src-tauri/src/tauri_extra_commands.rs', [
  'fn writable_path_inside_root(root: &Path, candidate: &Path) -> R<PathBuf> {',
  'pub fn tauri_marktext_write_file(app: AppHandle, pathname: String, content: String) -> R<Value> {',
  'let path = writable_path_inside_root(Path::new(&root), Path::new(&pathname))?;',
  'let changed = write_text_if_changed(&path, &content)?;'
], 'Rust MarkText backend writer must stay inside the active vault and report result')
has('src-tauri/src/tauri_extra_commands.rs', 'writable_path_inside_root_rejects_absolute_paths_outside_root', 'Rust regression test for refusing writes outside the vault')
has('src-tauri/src/tauri_extra_commands.rs', 'existing_path_guard_rejects_reads_outside_root', 'Rust regression test for refusing reads outside the vault')
has('src-tauri/src/lib_min.rs', 'tauri_extra_commands::tauri_marktext_write_file', 'registered MarkText backend writer')

ordered('Elephant/shared/apiContracts.js', [
  "const textString = (value) => typeof value === 'string'",
  'const optionalSyncOperationArray =',
  'operations: optionalSyncOperationArray',
  "action('NOTES_READ', 'notes.read'",
  "action('NOTES_WRITE', 'notes.write'",
  "action('SYNC_PLAN', 'sync.plan', syncRunPayload)"
], 'shared API must expose notes.read/write and validate explicit sync plan operations')
has('Elephant/shared/apiContracts.js', 'localRuntime: optionalObject', 'AI config contract must accept local runtime settings')
ordered('test/unit/specs/main/elephantnote/apiContracts.spec.js', [
  'accepts explicit valid sync.plan operations',
  'rejects unknown sync.plan operations instead of falling back to the default plan',
  'rejects non-array sync.plan operations',
  'accepts local runtime AI config payloads used by the Tauri bridge'
], 'API contract tests must reject unsafe sync plans and accept local runtime config')
ordered('Elephant/front/app/services/elephantnoteClient/apiRuntime.js', [
  "import { validateApiPayload } from 'common/elephantnote/apiContracts'",
  'const plainPayload = toPlainObject(payload)',
  'const validatedPayload = validateApiPayload(action, plainPayload)',
  'requireElephantNoteApi().call(action, validatedPayload)',
  'return legacyCall(validatedPayload)'
], 'renderer API runtime must validate payloads before public bridge and legacy fallback dispatch')
has('test/unit/specs/main/elephantnote/apiRuntime.spec.js', 'rejects invalid payloads before they can reach legacy fallback calls', 'API runtime validation regression test')
has('test/unit/specs/main/elephantnote/tauriElephantNoteBridge.spec.js', 'routes public API sync.plan payloads to the Rust command', 'Tauri bridge public sync.plan routing test')
ordered('Elephant/front/app/services/elephantnoteClient/domainClients.js', [
  'const CHAT_REBUILD_COOLDOWN_MS',
  'const searchVaultInitializedForChat',
  'const shouldRebuildChatSearch',
  'notes: {',
  'read: (relativePath) => call(API.NOTES_READ',
  'write: (payload = {}) => call(API.NOTES_WRITE, payload)'
], 'front client must expose notes.write and throttle chat search rebuilds')
has('test/unit/elephantnote/domainClients.spec.js', 'does not repeatedly rebuild chat search when citations are still empty', 'chat search rebuild throttling regression test')
has('src/renderer/src/platform/tauriElephantNoteBridge.js', "case 'notes.write': return bridge.notes.write(payload)", 'Tauri ElephantNote notes.write dispatch')

ordered('src/renderer/src/platform/piProviderInterface.js', [
  'export const piModelsUrl',
  'export const normalizePiModels',
  'export const normalizePiCodexModels',
  "error: 'invalid_json'",
  'export const installPiProviderBridge'
], 'PI provider interface must normalize models, handle invalid JSON and install the bridge')
has('test/unit/specs/main/elephantnote/piProviderInterface.spec.js', 'returns a structured error instead of throwing on invalid JSON responses', 'PI invalid JSON regression test')

ordered('Elephant/front/app/components/editor/NoteEditorHost.vue', [
  "import { elephantnoteClient } from '../../services/elephantnoteClient'",
  'const AUTOSAVE_POLL_MS',
  'const autosaveDelayFor',
  'const getActiveNoteFile = () => {',
  'currentFile.value?.pathname',
  'const persistNoteMarkdown = async',
  'elephantnoteClient.notes.write({',
  'const rememberObservedMarkdown =',
  'noteSaveInterval = window.setInterval'
], 'editor host must import the client, throttle autosave and persist dirty active notes')
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
has('Elephant/front/app/components/editor/NoteEditorHost.vue', "bus.on('open-excalidraw-from-image', openExcalidrawFromImage)", 'image-backed Excalidraw open event')
ordered('Elephant/front/app/utils/noteCardView.js', [
  'const stripInlineFrontmatterPrefix',
  'const metadataPairPattern = new RegExp',
  'export const getNoteCardExcerpt = (entry) => cleanPreview'
], 'note cards must strip compact frontmatter before preview rendering')
has('test/unit/specs/main/elephantnote/markdownDocument.spec.js', 'hides compact inline frontmatter when no body preview exists', 'note card preview regression test')

ordered('Elephant/shared/sync.js', [
  "export const SYNC_METADATA_DIR = '.elephantnote/sync'",
  "export const SYNC_LEGACY_METADATA_DIR = '.elephantnote'",
  'export const createDefaultSyncPlan = (payloadByOperation = {}) => {',
  'const explicitOperations = normalizeExplicitOperations',
  'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PULL)',
  'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PUSH)'
], 'shared sync plan must keep explicit pull/push operations and Tauri-compatible metadata layout')
ordered('src-tauri/src/vault/sync.rs', [
  'fn enqueue_default_plan(&mut self, payload_by_operation: &Value) -> R<()> {',
  'let operations = explicit_operations(payload_by_operation);',
  'if payload_has(payload_by_operation, SYNC_OPERATION_SYNC)',
  'let has_explicit_git_operation',
  'if payload_has(payload_by_operation, operation)'
], 'Tauri sync plan expansion must keep explicit operations without forcing snapshots')
has('src-tauri/src/vault/sync.rs', 'fn ensure_git_exclude(&self) -> R<()>', 'Tauri sync metadata exclusion')
has('src-tauri/src/vault/sync.rs', 'fn untrack_sync_metadata(&self) -> R<()>', 'Tauri legacy sync metadata untracking')
has('src-tauri/src/sync_contract_tests.rs', 'second_device_can_pull_without_creating_local_snapshot', 'Tauri second-device pull contract test')
has('src-tauri/src/sync_contract_tests.rs', 'sync_metadata_stays_local_and_is_not_tracked_by_git', 'Tauri sync metadata local-only contract test')
has('src-tauri/src/sync_contract_tests.rs', 'legacy_tracked_sync_metadata_is_removed_from_git_index', 'Tauri legacy metadata untracking contract test')
has('test/unit/specs/main/elephantnote/syncPlan.spec.js', 'can pull into a second device without creating a local snapshot first', 'sync plan second-device pull regression test')
has('test/unit/specs/main/elephantnote/webGitSyncEngine.spec.js', 'compacts completed queue items so periodic auto-sync cannot grow memory forever', 'web sync queue compaction regression test')
ordered('web/sync/WebGitSyncEngine.mjs', [
  'normalizeQueueInput',
  'readMetadataJson',
  'ALL_LOCAL_METADATA_FILES',
  'untrackSyncMetadata',
  'compactQueue()',
  'backend: SYNC_BACKENDS.GIT',
  'ensureGitExclude()'
], 'web sync engine must normalize queue input, migrate metadata and keep local metadata untracked')
ordered('scripts/sync-two-docker-smoke.mjs', [
  'assertPeerIdentity',
  'stopDevice(deviceB)',
  'device B reconnect auto-pull',
  'assertResourceBudget',
  'assertNoTrackedSyncMetadata',
  'local sync metadata files stay untracked in each container git repository'
], 'Docker sync smoke must cover peer identity, offline reconnect, resource budget and metadata leaks')
has('.github/workflows/sync-docker.yml', 'node scripts/sync-two-docker-smoke.mjs', 'Docker pair sync workflow runs directly with Node')

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Critical ElephantNote flow guard passed.')
