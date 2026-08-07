import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const target = (relativePath) => path.join(root, relativePath)

const read = (relativePath) => {
  const absolute = target(relativePath)
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing critical-flow file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(absolute, 'utf8')
}

const has = (relativePath, needle, description = needle) => {
  if (!read(relativePath).includes(needle)) failures.push(`${relativePath}: missing ${description}`)
}

const lacks = (relativePath, needle, description = needle) => {
  if (read(relativePath).includes(needle)) failures.push(`${relativePath}: unexpected ${description}`)
}

const missing = (relativePath, description = relativePath) => {
  if (fs.existsSync(target(relativePath))) failures.push(`${relativePath}: unexpected ${description}`)
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
  '.github/workflows/tauri-ci.yml',
  '.github/workflows/e2e.yml',
  '.github/workflows/test.yml',
  'build/scripts/verify-security-guardrails.mjs',
  'build/scripts/verify-test-trust.mjs',
  'build/scripts/verify-three-layer-sensitivity.mjs',
  'build/scripts/run-backend-contract-trust.mjs',
  'build/scripts/run-frontend-behavior-trust.mjs',
  'build/scripts/run-packaged-user-journey-trust.mjs',
  'build/scripts/lib/real-app-harness.mjs',
  'tests/trust/test-layers.json',
  'Elephant/frontend/src/renderer/src/main.js',
  'Elephant/frontend/src/renderer/src/Main.vue',
  'Elephant/frontend/src/renderer/src/pages/app.vue',
  'Elephant/frontend/src/renderer/src/addons/builtin/index.js',
  'Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js',
  'Elephant/frontend/src/renderer/src/addons/officialAddonCatalogBridge.js',
  'Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue',
  'Elephant/frontend/app/components/shell/MainContent.vue',
  'Elephant/frontend/app/components/navigation/IconRail.vue',
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
  'Elephant/frontend/app/components/editor/ExcalidrawDialog.vue',
  'Elephant/backend/tauri/Cargo.toml',
  'Elephant/backend/tauri/src/lib_min.rs',
  'Elephant/backend/tauri/src/core_commands.rs',
  'Elephant/backend/tauri/src/addon_services.rs',
  'Elephant/backend/tauri/src/addon_runtime_access.rs',
  'Elephant/backend/tauri/src/addon_http_access.rs',
  'Elephant/backend/tauri/src/official_addon_catalog.rs'
]) read(file)

missing('Elephant/backend/tauri/src/tauri_extra_commands.rs', 'legacy optional command module')
missing('Elephant/backend/tauri/src/sync_commands.rs', 'legacy core Sync commands')
missing('Elephant/backend/tauri/src/sync', 'legacy core Iroh runtime directory')
missing('Elephant/backend/tauri/src/vault/sync_iroh', 'legacy core Sync backend directory')
missing('Elephant/frontend/app/components/views/DashboardView.vue', 'core Dashboard view')

for (const legacyTestPath of [
  'tests/app/e2e/playwright.config.js',
  'tests/app/e2e/search-inspect.spec.js',
  'tests/app/unit/addons/baseOfficialAddonRuntime.spec.js',
  'vitest.config.js',
  'vitest.critical.config.js'
]) missing(legacyTestPath, 'removed synthetic or legacy JavaScript test surface')

ordered(
  '.github/workflows/ci.yml',
  [
    '- name: Critical ElephantNote flow guard',
    'run: node build/scripts/verify-critical-flows.mjs',
    '- name: Security guardrails',
    'run: pnpm security:guard',
    '- name: Test trust policy',
    'run: pnpm test:trust:guard'
  ],
  'main CI critical, security and real-proof trust order'
)
has(
  '.github/workflows/ci.yml',
  'cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features',
  'blocking Tauri Cargo check'
)
has(
  '.github/workflows/tauri-ci.yml',
  'cargo test --manifest-path Elephant/backend/tauri/Cargo.toml --lib --no-default-features',
  'blocking Tauri library tests'
)
has('package.json', '"security:guard": "node build/scripts/verify-security-guardrails.mjs"', 'security guard command')
has('package.json', '"test:trust:guard": "node build/scripts/verify-test-trust.mjs"', 'real test trust guard command')

for (const [script, runner] of [
  ['test:backend:raw', 'run-backend-contract-trust.mjs'],
  ['test:frontend:behavior:raw', 'run-frontend-behavior-trust.mjs'],
  ['test:user:packaged:raw', 'run-packaged-user-journey-trust.mjs'],
  ['test:layers:sensitivity', 'verify-three-layer-sensitivity.mjs']
]) {
  has('package.json', `"${script}"`, `real proof script ${script}`)
  has('package.json', runner, `real proof runner ${runner}`)
}

for (const marker of [
  '"id": "backend-contract"',
  '"id": "frontend-behavior"',
  '"id": "packaged-user-journey"',
  '"requiredPackagedFormat": "linux-appimage"',
  '"user-physical-x11-input-rust-disk"',
  '"user-crash-restart-restores-visible-work"'
]) has('tests/trust/test-layers.json', marker, `real proof manifest marker ${marker}`)

for (const marker of [
  'pnpm test:trust:guard',
  'pnpm test:backend:raw',
  'pnpm test:frontend:raw',
  'pnpm test:user:packaged:raw',
  'pnpm test:layers:sensitivity',
  'ELEPHANT_PACKAGED_FORMAT=linux-appimage',
  'bundle/appimage/*.AppImage',
  'test-results/trusted/packaged-user-journey/**'
]) has('.github/workflows/e2e.yml', marker, `distributed AppImage proof marker ${marker}`)

has('build/scripts/verify-test-trust.mjs', 'tracked legacy JavaScript test files are forbidden', 'legacy JS test rejection')
has('build/scripts/verify-test-trust.mjs', "const expectedCategories = ['backend-contract', 'frontend-behavior', 'packaged-user-journey']", 'exact real proof categories')
has('build/scripts/verify-three-layer-sensitivity.mjs', "payload.status !== 'NOT PROVEN'", 'mutation must force NOT PROVEN')
has('build/scripts/run-packaged-user-journey-trust.mjs', 'requirePackagedApp: true', 'development launcher rejection')
has('build/scripts/run-packaged-user-journey-trust.mjs', "status: 'PROVEN'", 'explicit packaged PROVEN artifact')
has('build/scripts/run-packaged-user-journey-trust.mjs', "status: 'NOT PROVEN'", 'explicit packaged NOT PROVEN artifact')
has('build/scripts/lib/real-app-harness.mjs', 'ELEPHANT_AUTOMATION_TOKEN', 'authenticated external app API')

ordered(
  'Elephant/frontend/src/renderer/src/main.js',
  [
    "import './addons/officialAddonCatalogBridge'",
    'clearBootstrapFileUtilsFallbackForTauri()',
    'installTauriRuntimeBridge()',
    'ensureRendererPathFacade()',
    'installTauriElephantNoteBridge()'
  ],
  'official catalogue and Tauri renderer bridge installation order'
)
has('Elephant/frontend/src/renderer/src/main.js', "const runtime = 'tauri'", 'Tauri-only runtime selection')
lacks('Elephant/frontend/src/renderer/src/main.js', 'tauri-compatible', 'compatibility runtime fallback')
ordered(
  'Elephant/frontend/src/renderer/src/main.js',
  [
    'installAcceptanceTestBridge({ pinia })',
    'installAcceptancePhysicalSurface(globalThis)'
  ],
  'acceptance physical surface must only start after the acceptance bridge exists'
)
lacks('Elephant/frontend/src/renderer/src/Main.vue', 'automationAcceptancePhysicalSurface', 'unconditional acceptance-only physical surface import')
ordered(
  'Elephant/frontend/src/renderer/src/pages/app.vue',
  [
    'if (isTauriRuntime) mainStore.SET_INITIALIZED()',
    'await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()'
  ],
  'Tauri shell readiness must not wait for optional listener setup'
)
lacks('Elephant/frontend/src/renderer/src/pages/app.vue', 'if (!mainStore.init) mainStore.SET_INITIALIZED()', 'delayed Tauri shell readiness')

has('Elephant/frontend/src/renderer/src/addons/builtin/index.js', 'builtinAddons = Object.freeze([])', 'empty builtin addon catalogue')
lacks('Elephant/frontend/src/renderer/src/addons/builtin/index.js', 'import(', 'bundled optional addon import')

has('Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js', 'const isOfficialRecord', 'official package classification')
has('Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js', "if (!official && !await externalAddonApi.getCommunityEnabled())", 'community consent boundary')
has('Elephant/frontend/src/renderer/src/addons/isolatedAddonWorkerSource.js', "['fetch','WebSocket','EventSource','XMLHttpRequest'", 'isolated worker network surface removal')
has('Elephant/frontend/src/renderer/src/addons/isolatedAddonWorkerSource.js', "rpc('storage.get'", 'brokered addon storage')
has('Elephant/frontend/src/renderer/src/addons/officialAddonCatalogBridge.js', 'tauri_official_addons_catalog_list', 'official catalogue bridge')
has('Elephant/backend/tauri/src/lib_min.rs', 'addons::tauri_addons_list,', 'external addon registry compatibility command')

lacks('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'en-addon-browser-overview', 'obsolete addon overview surface')
lacks('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'All addons', 'obsolete catalogue headline')
lacks('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'Back to catalogue', 'obsolete detail-only navigation')
has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'class="en-addons-toolbar"', 'shared addon and pack toolbar')
has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'placeholder="Search addons"', 'addon search control')
has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'placeholder="Search addon packs"', 'addon pack search control')
has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'class="en-addon-browser"', 'persistent split addon browser')
has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', ':data-addon-id="entry.id"', 'stable addon list identity')
has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', 'class="en-installed-only-control"', 'installed addon filter')
for (const addonId of ['elephant.ai-chat', 'elephant.ai-search', 'elephant.ai-ocr', 'elephant.wiki', 'elephant.graph']) {
  has('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue', `'${addonId}'`, `visible AI module ${addonId}`)
}

has('Elephant/frontend/app/components/shell/MainContent.vue', '<addon-workspace-router', 'physical addon workspace router')
has('Elephant/frontend/app/components/shell/MainContent.vue', "entry?.contribution?.zone === 'workspace.notes'", 'package-owned workspace panels')
lacks('Elephant/frontend/app/components/shell/MainContent.vue', 'DashboardView', 'core Dashboard implementation')
lacks('Elephant/frontend/app/components/shell/MainContent.vue', 'SigmaCanvas', 'core Graph implementation')
lacks('Elephant/frontend/app/components/shell/MainContent.vue', 'WikiView', 'core Wiki implementation')
lacks('Elephant/frontend/app/components/shell/MainContent.vue', 'ModelsView', 'core model library implementation')
lacks('Elephant/frontend/app/components/navigation/IconRail.vue', "id: 'dashboard', title: 'Dashboard'", 'core Dashboard rail item')
has('Elephant/frontend/app/components/navigation/IconRail.vue', 'dashboard: LayoutDashboard', 'addon Dashboard icon mapping')

has('Elephant/backend/tauri/src/addon_services.rs', 'const SERVICE_PROTOCOL: &str = "elephant-addon-service-v1"', 'versioned addon service protocol')
has('Elephant/backend/tauri/src/addon_services.rs', 'Addon native permission was not granted', 'native permission gate')
has('Elephant/backend/tauri/src/addon_services.rs', 'Path traversal is not allowed', 'service executable traversal rejection')
has('Elephant/backend/tauri/src/addon_services.rs', 'Persistent process services require a desktop addon package', 'mobile process rejection')
has('Elephant/backend/tauri/src/addon_services.rs', 'MAX_RESPONSE_BYTES', 'bounded service responses')

for (const command of [
  'tauri_addons_service_status',
  'tauri_addons_service_start',
  'tauri_addons_service_call',
  'tauri_addons_service_stop'
]) has('Elephant/backend/tauri/src/lib_min.rs', command, `registered ${command} command`)

has('Elephant/backend/tauri/src/lib_min.rs', '#[path = "core_commands.rs"]', 'minimal core command module')
for (const leakedCoreMarker of [
  'pub mod ocr;',
  'pub mod model_domain;',
  'pub mod sync;',
  'tauri_ocr_',
  'tauri_embedding_',
  'tauri_models_',
  'tauri_codex_',
  'tauri_ai_config_',
  'tauri_search_inspect',
  'iroh_sync_'
]) lacks('Elephant/backend/tauri/src/lib_min.rs', leakedCoreMarker, `optional runtime leakage ${leakedCoreMarker}`)

for (const leakedDependency of [
  'iroh =',
  'iroh-mdns-address-lookup',
  'tokenizers =',
  'fastembed ='
]) lacks('Elephant/backend/tauri/Cargo.toml', leakedDependency, `optional dependency ${leakedDependency}`)

has('Elephant/backend/tauri/Cargo.toml', 'reqwest =', 'generic permission-scoped addon HTTP client')
has('Elephant/backend/tauri/src/addon_http_access.rs', 'read_enabled_addon', 'enabled-package HTTP permission check')
has('Elephant/backend/tauri/src/addon_http_access.rs', 'Network access to a local or private address', 'addon HTTP anti-SSRF guard')
has('Elephant/backend/tauri/src/addon_http_access.rs', 'External addon HTTPS requests are restricted to port 443', 'addon HTTPS port restriction')

for (const leakedCoreImplementation of [
  'tauri_ai_config_get',
  'tauri_models_get_selection',
  'tauri_search_inspect',
  'portable-markdown-index',
  'codex --version',
  'tauri-rust://'
]) lacks('Elephant/backend/tauri/src/core_commands.rs', leakedCoreImplementation, `optional implementation ${leakedCoreImplementation}`)

missing('addons', 'materialized official addon source tree')
missing('Elephant/backend/tauri/resources/official-addons', 'embedded official addon resources')
has('build/scripts/run-tauri-web-build.mjs', "runNode('build/scripts/build-muya-wasm.mjs')", 'core-only renderer build')
lacks('build/scripts/run-tauri-web-build.mjs', 'sync-elephant-addons', 'addon repository checkout from the core build')
lacks('build/scripts/run-tauri-web-build.mjs', 'prepare-tauri-addon-resources', 'embedded addon preparation from the core build')

ordered(
  'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
  [
    "import { elephantnoteClient } from '../../services/elephantnoteClient'",
    'const AUTOSAVE_POLL_MS',
    'elephantnoteClient.notes.write({',
    'noteSaveInterval = window.setInterval'
  ],
  'editor autosave persistence'
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

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Critical ElephantNote flow guard passed.')
