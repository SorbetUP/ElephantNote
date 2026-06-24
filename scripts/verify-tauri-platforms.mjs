import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const readText = (path) => readFileSync(resolve(root, path), 'utf8')
const readJson = (path) => JSON.parse(readText(path))

const errors = []
const assert = (condition, message) => {
  if (!condition) errors.push(message)
}

const packageJson = readJson('package.json')
const baseConfig = readJson('src-tauri/tauri.conf.json')
const linuxConfig = readJson('src-tauri/tauri.linux.conf.json')
const androidConfig = readJson('src-tauri/tauri.android.conf.json')
const buildDev = readText('build_dev.sh')
const buildAndroid = readText('build_dev_apk.sh')
const chatRuntime = readText('src-tauri/src/chat_runtime.rs')
const vaultConfig = readText('src-tauri/src/vault/config.rs')
const tauriExtra = readText('src-tauri/src/tauri_extra_commands.rs')

for (const script of [
  'tauri:check',
  'tauri:platform:check',
  'tauri:linux:build',
  'tauri:android:init',
  'tauri:android:build'
]) {
  assert(packageJson.scripts?.[script], `Missing package script: ${script}`)
}

assert(existsSync(resolve(root, 'static/icon.png')), 'static/icon.png must exist for Linux/Android bundles')
assert(baseConfig.bundle?.icon?.includes('../static/icon.png'), 'base Tauri bundle must include a PNG icon for Linux')
assert(baseConfig.bundle?.resources?.includes('bin'), 'desktop Tauri config must keep bin resources for bundled llama-server')

assert(Array.isArray(linuxConfig.bundle?.targets), 'Linux override must use explicit Linux bundle targets')
assert(linuxConfig.bundle.targets.includes('deb'), 'Linux override must build deb packages')
assert(linuxConfig.bundle.targets.includes('appimage'), 'Linux override must build AppImage packages')
assert(!JSON.stringify(linuxConfig.app?.windows || []).includes('titleBarStyle'), 'Linux override must not reuse macOS titleBarStyle')

assert(androidConfig.build?.beforeBuildCommand === 'pnpm tauri:web:build', 'Android build must not run the desktop llama-server installer')
assert(Array.isArray(androidConfig.bundle?.resources), 'Android bundle resources must be an explicit array')
assert(androidConfig.bundle.resources.length === 0, 'Android bundle must not include desktop bin resources')
assert(androidConfig.bundle?.icon?.includes('../static/icon.png'), 'Android config must use the PNG icon')

assert(buildDev.includes('tauri.linux.conf.json'), 'Linux dev must use the Linux Tauri config override')
assert(buildAndroid.includes('tauri.android.conf.json'), 'Android build script must use the Android Tauri config override')
assert(buildAndroid.includes('ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1'), 'Android build must skip bundled llama-server')
assert(buildAndroid.includes('cargo tauri android init'), 'Android build script must initialize the generated Android project when missing')

assert(chatRuntime.includes('#[cfg(mobile)]'), 'Chat runtime must have a mobile guard')
assert(chatRuntime.includes('desktop-only'), 'Mobile chat guard must explain that bundled llama.cpp is desktop-only')
assert(vaultConfig.includes('MOBILE_DEFAULT_VAULT_ID'), 'Vault config must define a mobile fallback vault')
assert(vaultConfig.includes('app_data_dir'), 'Mobile fallback vault must use the app data directory')
assert(tauriExtra.includes('vault_config::get_active_vault'), 'Extra commands must use the shared vault config path resolver')

if (errors.length > 0) {
  console.error('[tauri-platforms] compatibility guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[tauri-platforms] macOS/Linux/Android compatibility guard passed')
