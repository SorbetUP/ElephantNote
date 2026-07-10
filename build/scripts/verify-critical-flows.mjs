import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const filePath = (relativePath) => path.join(root, relativePath)
const read = (relativePath) => {
  const target = filePath(relativePath)
  if (!fs.existsSync(target)) {
    failures.push(`Missing critical-flow file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(target, 'utf8')
}
const has = (relativePath, needle, description = needle) => {
  if (!read(relativePath).includes(needle)) failures.push(`${relativePath}: missing ${description}`)
}
const hasAll = (relativePath, needles, description) => {
  for (const needle of needles) has(relativePath, needle, `${description}: ${needle}`)
}
const lacks = (relativePath, needle, description = needle) => {
  if (read(relativePath).includes(needle)) {
    failures.push(`${relativePath}: unexpected ${description}`)
  }
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
  'package.json',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/sync-docker.yml',
  '.github/workflows/tauri-ci.yml',
  '.github/dependabot.yml',
  'agent/security/guardrails/guardrails-baseline.json',
  'build/scripts/security-guardrails-core.mjs',
  'build/scripts/verify-security-guardrails.mjs',
  'build/scripts/sync-two-docker-smoke.mjs',
  'agent/skill/README.md',
  'agent/skill/apex/SKILL.md',
  'agent/skill/apex/steps/step-05-validate.md',
  'agent/skill/apex/steps/step-09-verify.md',
  'agent/skill/elephantnote-ci/SKILL.md',
  'agent/skill/ci-architect/SKILL.md',
  'agent/skill/github-actions-linter/SKILL.md',
  'agent/skill/github-actions-security/SKILL.md',
  'agent/skill/runtime-ci-hardening/SKILL.md',
  'agent/skill/anti-fake-tests/SKILL.md',
  'agent/skill/tauri-ci-verifier/SKILL.md',
  'agent/skill/cross-platform-paths/SKILL.md',
  'agent/skill/ci-stability/SKILL.md',
  'agent/skill/supply-chain-verifier/SKILL.md',
  'agent/skill/artifact-release-gate/SKILL.md',
  'Elephant/frontend/src/renderer/src/main.js',
  'Elephant/frontend/src/renderer/src/platform/bootstrapGlobals.js',
  'Elephant/frontend/src/renderer/src/platform/rendererPathFacade.js',
  'Elephant/frontend/src/renderer/src/platform/tauriRuntimeBridge.js',
  'Elephant/frontend/src/renderer/src/platform/tauriElephantNoteBridge.js',
  'Elephant/frontend/src/renderer/src/platform/tauriLocalIpcBridge.js',
  'Elephant/frontend/src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  'Elephant/frontend/src/renderer/src/platform/tauriSearchConceptFallback.js',
  'Elephant/frontend/src/renderer/src/platform/piProviderInterface.js',
  'Elephant/frontend/src/renderer/src/store/editor.js',
  'Elephant/backend/tauri/src/lib_min.rs',
  'Elephant/backend/tauri/src/tauri_extra_commands.rs',
  'Elephant/backend/tauri/src/vault/sync.rs',
  'Elephant/backend/tauri/src/sync_contract_tests.rs',
  'Elephant/shared/apiContracts.js',
  'Elephant/shared/apiContractsRuntime.js',
  'Elephant/shared/sync.js',
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
  'Elephant/frontend/app/components/editor/RustEditorWithTabs.vue',
  'Elephant/frontend/app/components/shell/MainContent.vue',
  'Elephant/frontend/app/components/editor/ExcalidrawDialog.vue',
  'Elephant/frontend/app/services/elephantnoteClient/apiRuntime.js',
  'Elephant/frontend/app/services/elephantnoteClient/domainClients.js',
  'Elephant/frontend/app/utils/noteCardView.js',
  'Elephant/frontend/src/renderer/src/muya/MuyaRuntimeEditor.vue',
  'Elephant/frontend/src/renderer/src/muya/muyaDomRendererRuntime.js',
  'tests/app/unit/elephantnote/domainClients.spec.js',
  'tests/app/unit/specs/main/elephantnote/apiContracts.spec.js',
  'tests/app/unit/specs/main/elephantnote/apiRuntime.spec.js',
  'tests/app/unit/specs/main/elephantnote/securityGuardrails.spec.js',
  'tests/app/unit/specs/main/elephantnote/syncPlan.spec.js',
  'tests/app/unit/specs/main/elephantnote/tauriElephantNoteBridge.spec.js',
  'tests/app/unit/specs/main/elephantnote/tauriLocalIpcBridge.spec.js',
  'tests/app/unit/specs/main/elephantnote/tauriOnlyRuntime.spec.js',
  'tests/elephant/unit/sync/GitSyncEngine.spec.js',
  'tests/app/unit/realComponentImportSmoke.spec.js',
  'tests/app/unit/specs/main/elephantnote/agentSkills.spec.js',
  'tests/app/unit/muyaRustEditorActivation.spec.js',
  'tests/app/unit/muyaRustMuyaDomParity.spec.js',
  'vite.tauri.config.js',
  'vitest.config.js'
]) read(file)

ordered(
  '.github/workflows/ci.yml',
  [
    '- name: Critical ElephantNote flow guard',
    'run: node build/scripts/verify-critical-flows.mjs',
    '- name: Security guardrails',
    'run: pnpm security:guard',
    '- name: Unit tests',
    'run: pnpm test:unit'
  ],
  'main CI must run the critical-flow guard, security gate and complete unit suite'
)
hasAll(
  '.github/workflows/ci.yml',
  ['cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features'],
  'blocking Tauri cargo check in main CI'
)
hasAll(
  '.github/workflows/tauri-ci.yml',
  ['cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features'],
  'blocking Tauri all-target cargo check'
)
has('.github/workflows/codeql.yml', 'github/codeql-action/analyze@v3', 'CodeQL workflow')
has('.github/dependabot.yml', 'package-ecosystem: cargo', 'Cargo dependency monitoring')
has('package.json', '"security:guard": "node build/scripts/verify-security-guardrails.mjs"', 'security guard script')

ordered(
  'agent/skill/README.md',
  [
    '## CI and verification skills',
    '`ci-architect/`',
    '`github-actions-linter/`',
    '`github-actions-security/`',
    '`anti-fake-tests/`',
    '`tauri-ci-verifier/`',
    '`artifact-release-gate/`'
  ],
  'CI verification skills listed in skill index'
)
ordered(
  'agent/skill/apex/SKILL.md',
  [
    '## CI and verification routing',
    '../ci-architect/SKILL.md',
    '../anti-fake-tests/SKILL.md',
    '../tauri-ci-verifier/SKILL.md',
    '../artifact-release-gate/SKILL.md',
    'the selected gate must prove the user-visible or runtime contract touched by the change'
  ],
  'APEX routes CI work to narrow verification skills'
)
ordered(
  'agent/skill/elephantnote-ci/SKILL.md',
  [
    '## CI skill stack',
    '../ci-architect/SKILL.md',
    '../github-actions-linter/SKILL.md',
    '../github-actions-security/SKILL.md',
    '../anti-fake-tests/SKILL.md',
    '../tauri-ci-verifier/SKILL.md',
    '../artifact-release-gate/SKILL.md'
  ],
  'ElephantNote CI skill routes to the CI skill stack'
)
has('agent/skill/anti-fake-tests/SKILL.md', 'A test is valid only if it checks an observable contract', 'anti-fake observable contract rule')
has('agent/skill/tauri-ci-verifier/SKILL.md', 'A successful web build alone is not proof that the packaged app opens', 'Tauri packaged-app proof rule')
has('agent/skill/cross-platform-paths/SKILL.md', 'Hidden app folders must not show as normal notes in the main tree', 'hidden-folder path invariant')
has('agent/skill/artifact-release-gate/SKILL.md', 'The expected artifact exists at the expected path', 'artifact existence rule')

ordered(
  'Elephant/frontend/src/renderer/src/main.js',
  [
    'clearBootstrapFileUtilsFallbackForTauri()',
    'installTauriRuntimeBridge()',
    'ensureRendererPathFacade()',
    'installTauriElephantNoteBridge()',
    'installTauriSearchRuntimeGuards()',
    'installTauriSearchConceptFallback()',
    'installPiProviderBridge()',
    'installTauriMarkTextSaveBridge()',
    'installTauriLocalIpcBridge()'
  ],
  'renderer runtime bridge installation order'
)
hasAll(
  'Elephant/frontend/src/renderer/src/main.js',
  [
    "import { installTauriRuntimeBridge } from './platform/tauriRuntimeBridge'",
    "import { ensureRendererPathFacade } from './platform/rendererPathFacade'",
    "import { installTauriSearchConceptFallback } from './platform/tauriSearchConceptFallback'",
    "const runtime = 'tauri'",
    'unsupported runtime'
  ],
  'strict Tauri renderer bootstrap'
)
lacks('Elephant/frontend/src/renderer/src/main.js', 'tauri-compatible', 'compatibility renderer runtime')
lacks('Elephant/frontend/src/renderer/src/main.js', 'const ensurePathResolve =', 'inline renderer path facade')
lacks('Elephant/frontend/src/renderer/src/main.js', 'const normalizeSearchPath =', 'inline search concept normalization')
hasAll(
  'Elephant/frontend/src/renderer/src/platform/rendererPathFacade.js',
  ['export const ensureRendererPathFacade', 'scope.path.resolve'],
  'renderer path facade'
)
hasAll(
  'Elephant/frontend/src/renderer/src/platform/tauriRuntimeBridge.js',
  ['export const installTauriRuntimeBridge', 'requires the Tauri runtime bridge'],
  'strict Tauri runtime bridge'
)
hasAll(
  'Elephant/frontend/src/renderer/src/platform/tauriSearchConceptFallback.js',
  ['export const installTauriSearchConceptFallback', 'rust-search-concepts-command-unavailable'],
  'Tauri search concept fallback'
)
has('tests/app/unit/specs/main/elephantnote/tauriOnlyRuntime.spec.js', 'keeps search concept fallback out of the renderer bootstrap entrypoint', 'Tauri search fallback regression test')
ordered(
  'Elephant/frontend/src/renderer/src/platform/tauriLocalIpcBridge.js',
  [
    "'mt::response-file-save'",
    "'mt::response-file-save-as'",
    "'mt::open-file'",
    'target.elephantnote.notes.read({ relativePath })',
    "dispatchLocalIpcEvent(target, 'mt::open-new-tab'"
  ],
  'Tauri local IPC routing'
)
ordered(
  'Elephant/frontend/src/renderer/src/platform/tauriMarkTextSaveBridge.js',
  [
    'const writeViaRustBackend = async(target, pathname, markdown) => {',
    "return invoke('tauri_marktext_write_file', { pathname, content: markdown })",
    "ipc.send('mt::tab-saved', id)",
    "ipc.send('mt::tab-save-failure', id, message)"
  ],
  'Tauri save bridge result reporting'
)
has('Elephant/backend/tauri/src/lib_min.rs', 'tauri_extra_commands::tauri_marktext_write_file', 'registered MarkText backend writer')
ordered(
  'Elephant/backend/tauri/src/tauri_extra_commands.rs',
  [
    'fn writable_path_inside_root(root: &Path, candidate: &Path) -> R<PathBuf> {',
    'pub fn tauri_marktext_write_file(app: AppHandle, pathname: String, content: String) -> R<Value> {',
    'let path = writable_path_inside_root(Path::new(&root), Path::new(&pathname))?;',
    'let changed = write_text_if_changed(&path, &content)?;'
  ],
  'guarded Rust save command'
)

ordered(
  'Elephant/shared/apiContracts.js',
  [
    "const textString = (value) => typeof value === 'string'",
    'const optionalSyncOperationArray =',
    'operations: optionalSyncOperationArray',
    "action('NOTES_READ', 'notes.read'",
    "'NOTES_WRITE'",
    "'notes.write'",
    "action('SYNC_PLAN', 'sync.plan', syncRunPayload)"
  ],
  'base API contract shape'
)
ordered(
  'Elephant/shared/apiContractsRuntime.js',
  [
    "import * as baseContracts from './apiContracts.js'",
    'const validatedByBaseContract = baseContracts.validateApiPayload(actionName, payload)',
    "actionName === 'ai.config.set'",
    'baseContracts.validateApiPayload(actionName, validatedByBaseContract)',
    'return payload'
  ],
  'runtime-aware API contract wrapper'
)
has('vitest.config.js', "'common/elephantnote/apiContracts': apiContractsRuntime", 'Vitest alias for runtime-aware API contracts')
ordered(
  'tests/app/unit/specs/main/elephantnote/apiContracts.spec.js',
  [
    'accepts explicit valid sync.plan operations',
    'rejects unknown sync.plan operations instead of falling back to the default plan',
    'rejects non-array sync.plan operations',
    'accepts local runtime AI config payloads used by the Tauri bridge'
  ],
  'API contract regression tests'
)
ordered(
  'Elephant/frontend/app/services/elephantnoteClient/apiRuntime.js',
  [
    "import { validateApiPayload } from 'common/elephantnote/apiContracts'",
    'const validatedPayload = validateApiPayload(action, plainPayload)',
    'requireElephantNoteApi().call(action, validatedPayload)',
    'return localFallbackCall(validatedPayload)'
  ],
  'renderer API validation path'
)
ordered(
  'Elephant/frontend/app/services/elephantnoteClient/domainClients.js',
  [
    'const CHAT_REBUILD_COOLDOWN_MS',
    'const searchVaultInitializedForChat',
    'const shouldRebuildChatSearch',
    'notes: {',
    'read: (relativePath) =>',
    'call(API.NOTES_READ',
    'write: (payload = {}) => call(API.NOTES_WRITE, payload)'
  ],
  'front client note methods and chat search throttling'
)
has('tests/app/unit/elephantnote/domainClients.spec.js', 'does not rebuild chat search when the model already produced an answer', 'chat search rebuild throttling test')

ordered(
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
  [
    "import { elephantnoteClient } from '../../services/elephantnoteClient'",
    'const AUTOSAVE_POLL_MS',
    'const autosaveDelayFor',
    'elephantnoteClient.notes.write({',
    'noteSaveInterval = window.setInterval'
  ],
  'editor autosave persistence'
)
ordered(
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
  [
    'const saveExcalidraw = async ({ imageBlob, blob, sceneBlob, fileName } = {}) => {',
    'const writableImage = imageBlob || blob',
    'await window.fileUtils.writeFile(targetPath, writableImage)',
    'if (excalidrawInsertOnSave.value) {'
  ],
  'Excalidraw byte persistence'
)
hasAll(
  'Elephant/frontend/app/components/shell/MainContent.vue',
  ["import NoteEditorHost from '../editor/NoteEditorHost.vue'", '<note-editor-host'],
  'open notes use the real note shell'
)
lacks('Elephant/frontend/app/components/shell/MainContent.vue', 'RustNoteEditorHost', 'obsolete Rust overlay host')
hasAll(
  'vite.tauri.config.js',
  [
    'const rustEditorWithTabsPlugin = () => ({',
    "if (source !== '@/components/editorWithTabs') return null",
    'RustEditorWithTabs.vue',
    'rustEditorWithTabsPlugin()'
  ],
  'Tauri EditorWithTabs injection'
)
hasAll(
  'Elephant/frontend/app/components/editor/RustEditorWithTabs.vue',
  [
    'v-if="rustActive"',
    'v-else',
    'mode="active"',
    'defineAsyncComponent(',
    "() => import('@/components/editorWithTabs/index.vue')",
    "window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'rust'",
    "throw new Error('Rust Muya editor mounted without the canonical Rust engine.')"
  ],
  'single canonical Rust editor with lazy legacy fallback'
)
lacks('Elephant/frontend/app/components/editor/RustEditorWithTabs.vue', 'Teleport', 'overlay editor mounting')
lacks('Elephant/frontend/app/components/editor/RustEditorWithTabs.vue', 'display: none !important', 'hidden duplicate editor')
hasAll(
  'Elephant/frontend/src/renderer/src/muya/MuyaRuntimeEditor.vue',
  [
    "import 'muya/lib/assets/styles/index.css'",
    "import 'muya/themes/default.css'",
    'class="muya-runtime-editor editor-component"'
  ],
  'Muya styles and editor surface'
)
hasAll(
  'Elephant/frontend/src/renderer/src/muya/muyaDomRendererRuntime.js',
  [
    "root.id = 'ag-editor-id'",
    "root.setAttribute('data-muya-renderer', 'rust-compatible')",
    'ag-paragraph',
    'ag-fence-code',
    'ag-image-marked-text',
    'inlineNodes'
  ],
  'Rust state to Muya DOM adapter'
)
hasAll(
  'tests/app/unit/muyaRustMuyaDomParity.spec.js',
  [
    'renders Muya structure, hidden syntax, local images, headings and code blocks',
    'round-trips the visible Muya DOM without losing Markdown syntax'
  ],
  'Muya DOM parity regression tests'
)
ordered(
  'Elephant/frontend/app/components/editor/ExcalidrawDialog.vue',
  [
    'const blobToBytes = async(blob) => new Uint8Array(await blob.arrayBuffer())',
    'imageBlob: await blobToBytes(blob)',
    'sceneBlob: await sceneBlob.text()'
  ],
  'Excalidraw writable payload'
)
ordered(
  'Elephant/frontend/app/utils/noteCardView.js',
  [
    'const stripInlineFrontmatterPrefix',
    'const metadataPairPattern = new RegExp',
    'export const getNoteCardExcerpt = (entry) => cleanPreview'
  ],
  'note-card preview frontmatter cleanup'
)

ordered(
  'Elephant/shared/sync.js',
  [
    "export const SYNC_METADATA_DIR = '.elephantnote/sync'",
    "export const SYNC_COMPATIBILITY_METADATA_DIR = '.elephantnote'",
    'export const createDefaultSyncPlan = (payloadByOperation = {}) => {',
    'const explicitOperations = normalizeExplicitOperations',
    'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PULL)',
    'hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PUSH)'
  ],
  'shared sync plan'
)
for (const needle of [
  'desktopRclone": false',
  'mobileRcloneBinary": false',
  'mobileSyncRequiresBackend": false',
  'requiresExternalBinary": false'
]) {
  has('Elephant/backend/tauri/src/vault/sync.rs', needle, `Tauri external-free sync invariant ${needle}`)
}
for (const needle of [
  'sync_push_copies_visible_vault_files_to_local_target',
  'sync_pull_copies_target_files_back_to_vault',
  'sync_preserves_both_versions_on_conflict',
  'sync_run_reports_actionable_missing_target_error'
]) {
  has('Elephant/backend/tauri/src/vault/sync.rs', needle, `Tauri embedded sync unit test ${needle}`)
}
has('Elephant/backend/tauri/src/sync_contract_tests.rs', 'tauri_sync_runtime_is_embedded_local_and_external_free', 'Tauri local sync runtime contract test')
has('tests/app/unit/specs/main/elephantnote/syncPlan.spec.js', 'can pull into a second device without creating a local snapshot first', 'sync plan pull regression test')
has('tests/elephant/unit/sync/GitSyncEngine.spec.js', 'persists remote path and first run state after a successful sync', 'compatibility sync engine persistence regression test')
ordered(
  'build/scripts/sync-two-docker-smoke.mjs',
  [
    'assertPeerIdentity',
    'stopDevice(deviceB)',
    'device B reconnect auto-pull',
    "await assertNoTrackedSyncMetadata(deviceB, 'device B reconnect auto-pull')",
    'assertResourceBudget',
    'local sync metadata files stay untracked in each container git repository'
  ],
  'Docker pair sync smoke invariants'
)
has('.github/workflows/sync-docker.yml', 'node build/scripts/sync-two-docker-smoke.mjs', 'Docker pair sync workflow')

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Critical ElephantNote flow guard passed.')
