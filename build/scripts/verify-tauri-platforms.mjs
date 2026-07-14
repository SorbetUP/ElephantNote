import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const readText = (path) => readFileSync(resolve(root, path), 'utf8')
const readJson = (path) => JSON.parse(readText(path))

const errors = []
const assert = (condition, message) => {
  if (!condition) errors.push(message)
}

const packageJson = readJson('package.json')
const baseConfig = readJson('Elephant/backend/tauri/tauri.conf.json')
const linuxConfig = readJson('Elephant/backend/tauri/tauri.linux.conf.json')
const androidConfig = readJson('Elephant/backend/tauri/tauri.android.conf.json')
const buildDev = readText('build/scripts/build_dev.sh')
const buildAndroid = readText('build/scripts/build_dev_apk.sh')
const chatRuntime = readText('Elephant/backend/tauri/src/chat_runtime.rs')
const vaultConfig = readText('Elephant/backend/tauri/src/vault/config.rs')
const tauriExtra = readText('Elephant/backend/tauri/src/tauri_extra_commands.rs')
const libMin = readText('Elephant/backend/tauri/src/lib_min.rs')

for (const script of [
  'tauri:check',
  'tauri:platform:check',
  'tauri:mac:smoke',
  'tauri:linux:build',
  'tauri:android:init',
  'tauri:android:dev',
  'tauri:android:build'
]) {
  assert(packageJson.scripts?.[script], `Missing package script: ${script}`)
}

assert(
  existsSync(resolve(root, 'Elephant/assets/static/icon.png')),
  'Elephant/assets/static/icon.png must exist for Linux/Android bundles'
)
assert(
  baseConfig.bundle?.icon?.includes('../../assets/static/icon.png'),
  'base Tauri bundle must include a PNG icon for Linux'
)
assert(
  baseConfig.bundle?.resources?.includes('bin'),
  'desktop Tauri config must keep bin resources for bundled llama-server'
)
assert(
  baseConfig.build?.beforeDevCommand === 'pnpm --dir .. tauri:web:dev',
  'desktop Tauri dev hook must execute the root package script from Elephant/'
)
assert(
  baseConfig.build?.beforeBuildCommand ===
    'pnpm --dir .. tauri:llama:install && pnpm --dir .. tauri:codex:install && pnpm --dir .. tauri:web:build',
  'desktop Tauri build hook must execute all root package scripts from Elephant/'
)

assert(
  Array.isArray(linuxConfig.bundle?.targets),
  'Linux override must use explicit Linux bundle targets'
)
assert(linuxConfig.bundle.targets.includes('deb'), 'Linux override must build deb packages')
assert(
  linuxConfig.bundle.targets.includes('appimage'),
  'Linux override must build AppImage packages'
)
assert(
  !JSON.stringify(linuxConfig.app?.windows || []).includes('titleBarStyle'),
  'Linux override must not reuse macOS titleBarStyle'
)

assert(
  androidConfig.build?.beforeDevCommand === 'pnpm --dir .. tauri:web:dev',
  'Android dev hook must execute the root renderer script from Elephant/'
)
assert(
  androidConfig.build?.beforeBuildCommand === 'pnpm --dir .. tauri:web:build',
  'Android build must run only the root renderer build and skip desktop runtime installers'
)
assert(
  Array.isArray(androidConfig.bundle?.resources),
  'Android bundle resources must be an explicit array'
)
assert(
  androidConfig.bundle.resources.length === 0,
  'Android bundle must not include desktop bin resources'
)
assert(
  androidConfig.bundle?.icon?.includes('../../assets/static/icon.png'),
  'Android config must use the PNG icon'
)

assert(
  packageJson.scripts['tauri:android:init'].includes('tauri.android.conf.json'),
  'Android init script must use the Android config'
)
assert(
  packageJson.scripts['tauri:android:dev'].includes('tauri.android.conf.json'),
  'Android dev script must use the Android config'
)
assert(
  packageJson.scripts['tauri:dev'] === './build/scripts/build_dev.sh',
  'Tauri dev script must live under build/scripts/'
)
assert(
  packageJson.scripts['tauri:android:build'] === './build/scripts/build_dev_apk.sh',
  'Android build script must live under build/scripts/'
)
assert(
  packageJson.scripts['tauri:mac:smoke'] === 'node build/scripts/tauri-macos-window-smoke.mjs',
  'macOS smoke script must run the packaged window verifier'
)
assert(
  existsSync(resolve(root, 'build/scripts/tauri-macos-window-smoke.mjs')),
  'macOS Tauri window smoke verifier must exist'
)
assert(
  buildDev.includes('tauri.linux.conf.json'),
  'Linux dev must use the Linux Tauri config override'
)
assert(
  !buildDev.includes('TAURI_ARGS'),
  'Tauri dev script must not use an empty Bash array under set -u'
)
assert(
  buildDev.includes('cargo tauri dev "$@"'),
  'macOS Tauri dev must run without config args while preserving CLI passthrough'
)
assert(
  buildAndroid.includes('tauri.android.conf.json'),
  'Android build script must use the Android Tauri config override'
)
assert(
  buildAndroid.includes('ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1'),
  'Android build must skip bundled llama-server'
)
assert(
  buildAndroid.includes('cargo tauri android init --config "$ANDROID_CONFIG"'),
  'Android build script must initialize the generated Android project with the Android config'
)
assert(
  buildAndroid.includes('cargo tauri android build --debug --apk --config "$ANDROID_CONFIG"'),
  'Android build script must build with the Android config'
)

assert(chatRuntime.includes('#[cfg(mobile)]'), 'Chat runtime must have a mobile guard')
assert(
  chatRuntime.includes('Desktop AI runtimes are unavailable on mobile in this build.'),
  'Mobile chat guard must explicitly reject desktop AI runtimes'
)
assert(
  chatRuntime.includes('#[cfg(not(mobile))]\nuse crate::local_llama_runtime;'),
  'Chat runtime must import bundled llama runtime only on desktop'
)
assert(
  chatRuntime.includes('#[cfg(not(mobile))]\nfn grounded_messages('),
  'Grounded desktop prompt assembly must not be required by mobile chat'
)
assert(
  libMin.includes('#[cfg(not(mobile))]\npub mod local_llama_runtime;'),
  'Bundled local llama runtime module must be desktop-only'
)
assert(
  vaultConfig.includes('MOBILE_DEFAULT_VAULT_ID'),
  'Vault config must define a mobile fallback vault'
)
assert(
  vaultConfig.includes('app_data_dir'),
  'Mobile fallback vault must use the app data directory'
)
assert(
  tauriExtra.includes('vault_config::get_active_vault'),
  'Extra commands must use the shared vault config path resolver'
)
assert(
  libMin.includes('mod platform_contract_tests;'),
  'Rust platform contract tests must be registered'
)
assert(
  existsSync(resolve(root, 'Elephant/backend/tauri/src/platform_contract_tests.rs')),
  'Rust platform contract tests must exist'
)

if (errors.length > 0) {
  console.error('[tauri-platforms] compatibility guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[tauri-platforms] macOS/Linux/Android compatibility guard passed')
