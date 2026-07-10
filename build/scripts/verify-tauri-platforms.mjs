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
const androidActivity = readText('build/android/MainActivity.kt')
const chatRuntime = readText('Elephant/backend/tauri/src/chat_runtime.rs')
const vaultConfig = readText('Elephant/backend/tauri/src/vault/config.rs')
const tauriBridge = readText('Elephant/frontend/src/renderer/src/platform/tauriElephantNoteBridge.js')
const mobileVaultBridge = readText('Elephant/frontend/src/renderer/src/platform/mobileVaultBridge.js')
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
  baseConfig.build?.frontendDist === '../../../build/out/renderer',
  'desktop frontendDist must point at the repository build output'
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
  androidConfig.build?.beforeBuildCommand === 'cd ../.. && pnpm tauri:web:build',
  'Android build must not run the desktop llama-server installer'
)
assert(
  androidConfig.build?.frontendDist === '../../../build/out/renderer',
  'Android frontendDist must point at the repository build output'
)
assert(
  androidConfig.app?.withGlobalTauri === true,
  'Android must inject window.__TAURI__ for the renderer bridge'
)
assert(
  androidConfig.app?.windows?.[0]?.title === 'ElephantNote',
  'Android app title must use the ElephantNote product name'
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
  'macOS Tauri window smoke verifier must run the packaged window verifier'
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
  buildAndroid.includes('build/android/MainActivity.kt') && buildAndroid.includes('cp "$MAIN_ACTIVITY_TEMPLATE" "$MAIN_ACTIVITY"'),
  'Android build must copy the tracked immersive MainActivity template'
)
assert(
  androidActivity.includes('enterImmersiveMode') &&
    androidActivity.includes('WindowInsets.Type.systemBars()') &&
    !androidActivity.includes('requestPermissions(') &&
    !androidActivity.includes('requestCameraPermissionIfNeeded'),
  'Android MainActivity must hide system bars without requesting camera during startup'
)
assert(
  buildAndroid.includes('android.permission.CAMERA') &&
    buildAndroid.includes('android.hardware.camera.any'),
  'Android build must install camera manifest declarations for on-demand QR scanning'
)
assert(
  buildAndroid.includes('cargo tauri android init --config "$ANDROID_CONFIG"'),
  'Android build script must initialize the generated Android project with the Android config'
)
assert(
  buildAndroid.includes('BUILD_ARGS=(android build --apk --target "$ANDROID_TARGET" --config "$ANDROID_CONFIG")'),
  'Android build script must build a target-specific APK with the Android config'
)
assert(
  buildAndroid.includes('ANDROID_BUILD_PROFILE') && buildAndroid.includes('BUILD_ARGS+=(--debug)'),
  'Android build script must support explicit debug and release profiles'
)

assert(chatRuntime.includes('#[cfg(mobile)]'), 'Chat runtime must have a mobile guard')
assert(
  chatRuntime.includes('desktop-only'),
  'Mobile chat guard must explain that bundled llama.cpp is desktop-only'
)
assert(
  chatRuntime.includes('#[cfg(not(mobile))]\nuse crate::local_llama_runtime;'),
  'Chat runtime must import bundled llama runtime only on desktop'
)
assert(
  chatRuntime.includes('#[cfg(not(mobile))]\nfn with_system_prompt'),
  'Desktop prompt assembly must not be required by mobile chat'
)
assert(
  libMin.includes('#[cfg(not(mobile))]\npub mod local_llama_runtime;'),
  'Bundled local llama runtime module must be desktop-only'
)
assert(
  vaultConfig.includes('fn normalize_config') && vaultConfig.includes('VaultConfig::default()'),
  'Vault config must normalize existing config without inventing a first-run vault'
)
assert(
  tauriBridge.includes('openVaultDirectory') &&
    tauriBridge.includes('directory: true') &&
    tauriBridge.includes('tauri_vaults_select_path'),
  'Tauri bridge must expose native system folder selection for scoped vault access'
)
assert(
  !buildAndroid.includes('READ_EXTERNAL_STORAGE') &&
    !buildAndroid.includes('WRITE_EXTERNAL_STORAGE') &&
    !buildAndroid.includes('MANAGE_EXTERNAL_STORAGE'),
  'Android build must not request deprecated broad storage permissions'
)
assert(
  mobileVaultBridge.includes('/vaults/Personal') &&
    mobileVaultBridge.includes('MOBILE_VAULT_CHOICE_KEY') &&
    mobileVaultBridge.includes('return { canceled: true }'),
  'Android bridge must require an explicit folder or private-vault choice'
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
