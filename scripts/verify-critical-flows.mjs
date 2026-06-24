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
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  'Elephant/front/app/utils/noteCardView.js',
  'Elephant/shared/apiContracts.js',
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
    "'mt::tab-saved'",
    'const nativeSend = ipc.send.bind(ipc)',
    'ipc.send = (channel, ...args) => {',
    'if (LOCAL_IPC_EVENTS.has(channel)) {',
    'dispatchLocalIpcEvent(target, channel, args)',
    'return nativeSend(channel, ...args)'
  ],
  'Tauri renderer-local IPC bridge must bypass core.invoke for MarkText save events'
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
  'src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  [
    'const assertRealFileWriter = (target) => {',
    'if (target.fileUtils?.__elephantnoteBootstrapFallback) {',
    'fileUtils.writeFile is unavailable',
    "ipc.on('mt::response-file-save'",
    'await target.fileUtils.writeFile(pathname, markdown)',
    "ipc.send('mt::tab-saved', id)",
    "ipc.send('mt::tab-save-failure', id, message)"
  ],
  'Tauri save bridge must reject fallback fileUtils, write to disk, and report success/failure'
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

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Critical ElephantNote flow guard passed.')
