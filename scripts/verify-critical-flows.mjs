import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const failures = []

const assertFile = (relativePath) => {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`Missing required critical-flow file: ${relativePath}`)
  }
}

const assertIncludes = (relativePath, needle, description) => {
  const content = read(relativePath)
  if (!content.includes(needle)) {
    failures.push(`${relativePath}: missing ${description || needle}`)
  }
}

const assertOrdered = (relativePath, needles, description) => {
  const content = read(relativePath)
  let cursor = -1
  for (const needle of needles) {
    const next = content.indexOf(needle, cursor + 1)
    if (next === -1) {
      failures.push(`${relativePath}: missing ordered invariant "${needle}" for ${description}`)
      return
    }
    cursor = next
  }
}

for (const requiredFile of [
  'test/unit/specs/main/elephantnote/markdown.spec.js',
  'test/unit/specs/main/elephantnote/markdownDocument.spec.js',
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  'scripts/verify-critical-flows.mjs'
]) {
  assertFile(requiredFile)
}

assertIncludes('.github/workflows/ci.yml', 'node scripts/verify-critical-flows.mjs', 'critical-flow guard in CI')
assertIncludes('.github/workflows/ci.yml', 'pnpm exec vitest run test/unit/specs/main/elephantnote', 'dedicated ElephantNote contract tests in CI')

assertOrdered(
  'src/renderer/src/main.js',
  [
    "import { installRuntimeBridge } from './platform/runtimeBridge'",
    "import { installTauriElephantNoteBridge } from './platform/tauriElephantNoteBridge'",
    "import { installTauriMarkTextSaveBridge } from './platform/tauriMarkTextSaveBridge'",
    'installRuntimeBridge()',
    'installTauriElephantNoteBridge()',
    'installTauriMarkTextSaveBridge()'
  ],
  'Tauri MarkText save bridge must be installed after the runtime and ElephantNote bridges'
)
assertOrdered(
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  [
    "ipc.on('mt::response-file-save'",
    "writeRecord(target, ipc, getRecordFromArgs(args), 'response-file-save')",
    "ipc.on('mt::save-tabs'",
    "writeRecord(target, ipc, record, 'save-tabs')",
    "ipc.on('mt::save-and-close-tabs'",
    "writeRecord(target, ipc, record, 'save-and-close-tabs')",
    "ipc.send('mt::force-close-tabs-by-id', closeIds)"
  ],
  'Tauri must handle the same MarkText save IPC events that Electron handles'
)
assertOrdered(
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  [
    "console.info('[tauri:marktext-save] write:start'",
    'await target.fileUtils?.writeFile?.(pathname, markdown)',
    "console.info('[tauri:marktext-save] write:done'",
    "ipc.send('mt::tab-saved', id)",
    "console.error('[tauri:marktext-save] write:failed'",
    "ipc.send('mt::tab-save-failure', id, message)"
  ],
  'Tauri MarkText save bridge must write to disk, acknowledge saved tabs and surface failures'
)
assertOrdered(
  'src/renderer/src/store/editor.js',
  [
    'HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options }) {',
    "window.electron.ipcRenderer.send(",
    "'mt::response-file-save'"
  ],
  'MarkText editor autosave must keep emitting the canonical Electron save event'
)

assertOrdered(
  'Elephant/shared/apiContracts.js',
  [
    'const textString = (value) => typeof value === \'string\'',
    "action('NOTES_READ', 'notes.read'",
    "action('NOTES_WRITE', 'notes.write'"
  ],
  'shared ElephantNote API contract must expose notes.read and notes.write for disk persistence'
)
assertOrdered(
  'Elephant/front/app/services/elephantnoteClient/domainClients.js',
  [
    'notes: {',
    'read: (relativePath) => call(API.NOTES_READ',
    'write: (payload = {}) => call(API.NOTES_WRITE, payload)'
  ],
  'front ElephantNote domain client must expose notes.write instead of relying on a missing method'
)
assertIncludes('src/renderer/src/platform/tauriElephantNoteBridge.js', "case 'notes.write': return bridge.notes.write(payload)", 'Tauri bridge API dispatch for notes.write')

assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const getActiveNoteFile = () => {',
    'if (currentFile.value?.pathname && window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname))',
    'editorStore.tabs.find'
  ],
  'active opened note must prefer currentFile before tab lookup so the editor does not render empty markdown during IPC/tab handoff'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const syncVisibleNoteMetadata = (pathname, metadata = {}) => {',
    'store.updateNoteMetadata(pathname, metadata)',
    'store.rootEntries = store.rootEntries.map((entry) => applyNoteMetadata(entry, pathname, metadata))'
  ],
  'editor metadata edits must synchronise rootEntries as well as the active list and opened-note history'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const persistNoteMarkdown = async(notePath, nextMarkdown, file = activeNoteFile.value || currentFile.value, reason = \'unknown\') => {',
    "console.info('[elephantnote:save] write:start'",
    'elephantnoteClient.notes.write({',
    'relativePath: notePath,',
    'markdown: nextMarkdown',
    'await window.fileUtils.writeFile(window.path.join(store.activeVault.path, notePath), nextMarkdown)',
    "console.info('[elephantnote:save] write:done'"
  ],
  'editor changes must be persisted to the note markdown file, with direct file fallback and visible save logs'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const rememberObservedMarkdown = (notePath, nextMarkdown, file, reason = \'observe\') => {',
    'if (file?.isSaved === false) {',
    'scheduleNoteSave(notePath, nextMarkdown, file, 0, `${reason}:first-unsaved`)'
  ],
  'first observation of an already dirty note must save instead of marking it as already persisted'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const pollActiveMarkdownSave = (reason = \'poll\') => {',
    'const file = getActiveNoteFile() || currentFile.value',
    'const nextMarkdown = file?.markdown',
    'scheduleNoteSave(notePath, nextMarkdown, file, 120, reason)',
    'noteSaveInterval = window.setInterval(() => pollActiveMarkdownSave(\'interval\'), 250)'
  ],
  'note autosave must poll the active editor markdown directly so it does not depend on fragile nested Pinia watchers'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const closeOpenedNote = async() => {',
    'await flushActiveNoteSave(\'close-note\')',
    'store.closeNote()'
  ],
  'closing a note must flush pending markdown before hiding the editor'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const updateCurrentFileMarkdown = (nextMarkdown, metadata = {}) => {',
    'syncVisibleNoteMetadata(notePath, metadata)',
    'searchStore.updateNoteIndex(notePath, nextMarkdown, metadata)',
    "scheduleNoteSave(notePath, nextMarkdown, file, 0, 'toolbar-edit')"
  ],
  'title/tag toolbar edits must update UI, search index and disk immediately'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const updateTitle = (nextTitle) => {',
    'renameDocumentTitle(markdown.value, title, fallbackTitle.value)',
    '{ title }'
  ],
  'title edits must update frontmatter/heading and visible metadata together'
)

assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'const normalizeRelativePath = (relativePath = \'\')',
    "replaceAll(String.fromCharCode(92), '/')",
    'const getDocumentPath = (document) => normalizeRelativePath'
  ],
  'search paths must be normalised before indexing/opening results without brittle backslash escaping'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'const loadBooleanSearchPreference = (key, fallback = false) => {',
    'const value = loadSearchPreference(key, String(Boolean(fallback)))',
    "showVisualizationLabels: loadBooleanSearchPreference('showVisualizationLabels')",
    "showFolderClusters: loadBooleanSearchPreference('showFolderClusters')",
    "autoRefreshInspection: loadBooleanSearchPreference('autoRefreshInspection')"
  ],
  'search boolean options must survive store re-creation and app restart'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'async hydrateLocalFallback() {',
    'await this.inspect()'
  ],
  'search fallback must hydrate local inspection before returning no results'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'const backendResults = Array.isArray(results)',
    'if (backendResults.length)',
    'await this.hydrateLocalFallback()',
    'this.results = this.localSearch(query, this.queryLimit)'
  ],
  'empty backend search results must fall back to local inspected documents'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    '} catch (error) {',
    'await this.hydrateLocalFallback()',
    'const fallbackResults = this.localSearch(query, this.queryLimit)'
  ],
  'backend search failures must still try local fallback'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'openResult(result) {',
    'const vaultStore = useVaultStore()',
    'const noteEntry = existingEntry || {',
    "vaultStore.activeWorkspaceView = 'notes'",
    "if (typeof vaultStore.openNote === 'function') {",
    'vaultStore.openNote(noteEntry)'
  ],
  'opening a search result must update vault navigation state instead of sending a detached open-file IPC only'
)

assertOrdered(
  'Elephant/front/app/utils/noteCardView.js',
  [
    'const stripInlineFrontmatterPrefix = (value = \'\') => {',
    'const closedInline = raw.match',
    'const metadataPairPattern = new RegExp',
    'export const getNoteCardExcerpt = (entry) => cleanPreview'
  ],
  'note cards must strip multiline and compact frontmatter before rendering previews'
)
assertIncludes(
  'test/unit/specs/main/elephantnote/markdownDocument.spec.js',
  'hides compact inline frontmatter when no body preview exists',
  'note card frontmatter preview regression test'
)

assertOrdered(
  'Elephant/front/app/stores/vaultStore.js',
  [
    'async moveEntry(entry, targetDirectoryPath = \'\') {',
    'elephantnoteClient.entries.move',
    'this.pinnedNotePaths = this.pinnedNotePaths.map',
    'this.openedNotePath = replacePathPrefix',
    'this.entries = await elephantnoteClient.directory.list(this.currentPath)',
    'this.rootEntries = await elephantnoteClient.directory.list(\'\')'
  ],
  'moving entries must refresh visible directory state and update opened/pinned paths'
)

assertIncludes('src-tauri/src/vault/mod.rs', 'pub mod sync;', 'Tauri sync module registration')
assertOrdered(
  'src-tauri/src/vault/commands.rs',
  [
    'pub fn tauri_sync_status(app: AppHandle) -> R<Value> {',
    'sync::sync_status(active_vault(&read_config(&app)?))',
    'pub fn tauri_sync_enqueue(app: AppHandle, operation: String, payload: Option<Value>) -> R<Value> {',
    'sync::sync_enqueue(get_active_vault(&app)?, operation, payload)',
    'pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> R<Value> {',
    'sync::sync_run(get_active_vault(&app)?, payload_by_operation)'
  ],
  'Tauri sync commands must call the Rust sync engine instead of returning stubbed JSON'
)
assertOrdered(
  'src-tauri/src/vault/sync.rs',
  [
    'pub const SYNC_CONFIG_FILE: &str = "sync-config.json";',
    'struct GitSyncEngine {',
    'Command::new("git")',
    'fn snapshot(&mut self, payload: &Value) -> R<()> {',
    'self.git(&["add", "-A"])?;',
    'self.git_args(&["commit".to_string(), "-m".to_string(), message])?;'
  ],
  'Tauri sync must implement real Git-backed snapshots with persisted configuration'
)
assertIncludes('src-tauri/src/vault/sync.rs', 'fn pull(&mut self, payload: &Value) -> R<()>', 'Tauri sync pull operation')
assertIncludes('src-tauri/src/vault/sync.rs', 'fn push(&mut self, payload: &Value) -> R<()>', 'Tauri sync push operation')
assertIncludes('src-tauri/src/vault/sync.rs', 'mod tests {', 'Rust unit tests for Tauri sync')

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Critical ElephantNote flow guard passed.')
