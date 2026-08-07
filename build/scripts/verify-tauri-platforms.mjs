import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const absolute = (path) => resolve(root, path)
const readText = (path) => readFileSync(absolute(path), 'utf8')
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
const cargoToml = readText('Elephant/backend/tauri/Cargo.toml')
const vaultConfig = readText('Elephant/backend/tauri/src/vault/config.rs')
const coreCommands = readText('Elephant/backend/tauri/src/core_commands.rs')
const libMin = readText('Elephant/backend/tauri/src/lib_min.rs')
const addonServices = readText('Elephant/backend/tauri/src/addon_services.rs')
const desktopAcceptanceWorkflow = readText('.github/workflows/tauri-desktop-acceptance.yml')

const resolveNodeEntrypoint = (command) => {
  const match = String(command || '').trim().match(/^node\s+([^\s;&|]+\.mjs)(?:\s|$)/)
  return match?.[1] || null
}

const tauriWebBuildCommand = packageJson.scripts?.['tauri:web:build']
const tauriWebBuildEntrypoint = resolveNodeEntrypoint(tauriWebBuildCommand)
const tauriWebBuildSource = tauriWebBuildEntrypoint && existsSync(absolute(tauriWebBuildEntrypoint))
  ? readText(tauriWebBuildEntrypoint)
  : ''

const assertWorkspaceBuildHook = (config, label) => {
  const command = config.build?.beforeBuildCommand
  assert(command && typeof command === 'object', `${label} beforeBuildCommand must use the Tauri object form`)
  assert(command?.script === 'pnpm tauri:web:build', `${label} must only build the core renderer`)
  assert(command?.cwd === '../../..', `${label} frontend build must run from the repository workspace root`)
}

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
  existsSync(absolute('Elephant/assets/static/icon.png')),
  'Elephant/assets/static/icon.png must exist for Linux/Android bundles'
)
assert(
  baseConfig.productName === 'Elephant',
  'The packaged desktop product name must be Elephant'
)
assert(
  baseConfig.app?.windows?.[0]?.title === 'Elephant',
  'The desktop window title must be Elephant'
)
assert(
  baseConfig.bundle?.icon?.includes('../../assets/static/icon.png'),
  'Base Tauri bundle must include a PNG icon for Linux'
)
assertWorkspaceBuildHook(baseConfig, 'Core Tauri build')
assert(
  !('resources' in (baseConfig.bundle || {})) ||
    (Array.isArray(baseConfig.bundle.resources) && baseConfig.bundle.resources.length === 0),
  'Core desktop bundle must not embed official addon resources'
)
assert(
  typeof tauriWebBuildCommand === 'string' && Boolean(tauriWebBuildEntrypoint),
  'Tauri web build must delegate to an explicit Node .mjs launcher'
)
assert(
  Boolean(tauriWebBuildEntrypoint) && existsSync(absolute(tauriWebBuildEntrypoint)),
  'Tauri web build launcher must exist'
)
assert(
  !tauriWebBuildSource.includes('sync-elephant-addons') &&
    !tauriWebBuildSource.includes('prepare-tauri-addon-resources'),
  'Tauri production build launcher must remain independent from the addon repository'
)
for (const platform of ['linux-x86_64', 'windows-x86_64', 'macos-x86_64', 'macos-aarch64']) {
  assert(
    desktopAcceptanceWorkflow.includes(`name: ${platform}`),
    `Tauri desktop acceptance workflow must cover ${platform}`
  )
}
assert(
  desktopAcceptanceWorkflow.includes('test:desktop:acceptance:packaged'),
  'Tauri desktop acceptance workflow must execute the packaged scenario'
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

assertWorkspaceBuildHook(androidConfig, 'Android build')
assert(
  Array.isArray(androidConfig.bundle?.resources) && androidConfig.bundle.resources.length === 0,
  'Android bundle must not include desktop process resources'
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
  packageJson.scripts['tauri:dev'].includes('./build/scripts/build_dev.sh'),
  'Tauri dev script must execute build/scripts/build_dev.sh'
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
  existsSync(absolute('build/scripts/tauri-macos-window-smoke.mjs')),
  'macOS Tauri window smoke verifier must exist'
)
assert(buildDev.includes('tauri.linux.conf.json'), 'Linux dev must use the Linux Tauri config override')
assert(!buildDev.includes('TAURI_ARGS'), 'Tauri dev script must not use an empty Bash array under set -u')
assert(
  buildDev.includes('cargo tauri dev "$@"'),
  'macOS Tauri dev must preserve CLI passthrough'
)
assert(
  !buildDev.includes('ensure-tauri-llama-server') && !buildDev.includes('ensure-tauri-codex-runtime'),
  'Core development startup must not download optional AI runtimes'
)
assert(
  buildAndroid.includes('cargo tauri android init --config "$ANDROID_CONFIG"'),
  'Android build script must initialize the generated project with the Android config'
)
assert(
  buildAndroid.includes('BUILD_ARGS=(android build --apk --target "$ANDROID_TARGET" --config "$ANDROID_CONFIG")'),
  'Android build script must construct a profile-aware APK build using the Android config and requested target'
)
assert(
  buildAndroid.includes('if [ "$ANDROID_BUILD_PROFILE" = debug ]; then BUILD_ARGS+=(--debug); fi'),
  'Android debug builds must append the Tauri --debug flag without forcing release builds into debug mode'
)
assert(
  buildAndroid.includes('ELEPHANTNOTE_ANDROID_BUILD=1 cargo tauri "${BUILD_ARGS[@]}"'),
  'Android build script must execute the validated argument array under the Android renderer build flag'
)
assert(
  !buildAndroid.includes('ELEPHANTNOTE_SKIP_LLAMA_BUNDLE'),
  'Android build must not carry obsolete bundled-llama switches'
)

assert(
  addonServices.includes('Persistent process services require a desktop addon package'),
  'Generic native service host must reject downloaded process services on mobile'
)
assert(
  !libMin.includes('pub mod local_llama_runtime;') && !libMin.includes('pub mod chat_runtime;'),
  'Extracted local model and chat runtimes must remain absent from core'
)
assert(
  !baseConfig.build.beforeBuildCommand.script.includes('llama') &&
    !baseConfig.build.beforeBuildCommand.script.includes('codex'),
  'Tauri build command must not reference extracted Open Models or Codex installers'
)

assert(
  !cargoToml.match(/^iroh\s*=/m) && !cargoToml.includes('iroh-mdns-address-lookup'),
  'Iroh must remain physically absent from the desktop and mobile core Cargo graph'
)
assert(
  cargoToml.includes("[target.'cfg(not(any(target_os = \"android\", target_os = \"ios\")))'.dependencies]"),
  'Remaining desktop-only generic dependencies must stay target-scoped away from Android/iOS'
)

assert(vaultConfig.includes('MOBILE_DEFAULT_VAULT_ID'), 'Vault config must define a mobile fallback vault')
assert(vaultConfig.includes('app_data_dir'), 'Mobile fallback vault must use the app data directory')
assert(
  coreCommands.includes('vault_config::get_active_vault'),
  'Core commands must use the shared vault config path resolver'
)
assert(
  !existsSync(absolute('Elephant/backend/tauri/src/tauri_extra_commands.rs')),
  'Legacy optional command module must stay physically absent'
)
assert(libMin.includes('mod platform_contract_tests;'), 'Rust platform contract tests must be registered')
assert(
  existsSync(absolute('Elephant/backend/tauri/src/platform_contract_tests.rs')),
  'Rust platform contract tests must exist'
)

if (errors.length > 0) {
  console.error('[tauri-platforms] compatibility guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[tauri-platforms] macOS/Linux/Android core and addon boundary guard passed')
