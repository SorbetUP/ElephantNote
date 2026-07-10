import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('ElephantNote mobile Android release', () => {
  it('keeps the complete touch-first mobile shell and a real animated drawer', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const shellStyles = read('Elephant/frontend/app/styles/app-shell.css')
    const emptyVault = read('Elephant/frontend/app/components/shell/EmptyVaultPicker.vue')
    const mobileVaultBridge = read('Elephant/frontend/src/renderer/src/platform/mobileVaultBridge.js')

    expect(shell).toContain("'en-mobile-shell': isMobileShell")
    expect(shell).toContain('v-if="sidebarVisible || isMobileShell"')
    expect(shell).toContain(':class="{ visible: sidebarVisible }"')
    expect(shell).toContain('translate3d(-104%, 0, 0)')
    expect(shell).toContain('cubic-bezier(0.22, 1, 0.36, 1)')
    expect(shell).toContain("'elephantnote:vault-files-changed'")
    expect(shellStyles).toContain('@media')
    expect(shellStyles).toContain('safe-area-inset')
    expect(emptyVault).toContain('Choose vault folder')
    expect(emptyVault).toContain('Use private app folder instead')
    expect(mobileVaultBridge).toContain('MOBILE_VAULT_CHOICE_KEY')
    expect(mobileVaultBridge).toContain('return { canceled: true }')
    expect(mobileVaultBridge).not.toContain('using phone vault')
  })

  it('normalizes direct Tauri create responses for notes and folders', () => {
    const clients = read('Elephant/frontend/app/services/elephantnoteClient/domainClients.js')
    const sidebar = read('Elephant/frontend/app/components/navigation/SidebarNav.vue')

    expect(clients).toContain('normalizeCreatedNote')
    expect(clients).toContain('normalizeCreatedFolder')
    expect(clients).toContain("call(API.DIRECTORY_LIST")
    expect(clients).toContain("[parentPath, 'New Folder']")
    expect(sidebar).toContain('New note')
    expect(sidebar).toContain('New folder')
    expect(sidebar).toContain('store.createNote()')
    expect(sidebar).toContain('store.createFolder()')
  })

  it('loads explicit phone interaction styles and makes Sync pairing full-screen', () => {
    const html = read('Elephant/frontend/src/renderer/index.html')
    const mobileStyles = read('Elephant/frontend/src/renderer/src/mobile-android.css')

    expect(html).toContain('/src/mobile-android.css')
    expect(html).toContain('/src/platform/mobileVaultBridge.js')
    expect(mobileStyles).toContain('height: 100dvh')
    expect(mobileStyles).toContain('.en-pair-modal')
    expect(mobileStyles).toContain('width: 100vw')
    expect(mobileStyles).toContain('env(safe-area-inset-top)')
    expect(mobileStyles).toContain('env(safe-area-inset-bottom)')
    expect(mobileStyles).toContain('min-height: 44px')
    expect(mobileStyles).toContain('.en-qr-preview')
  })

  it('treats only a clean Iroh code-zero shutdown as successful completion', () => {
    const syncClient = read('Elephant/frontend/app/services/irohSyncClient.js')

    expect(syncClient).toContain('cleanPeerCloseMessage')
    expect(syncClient).toContain("message.includes('closed by peer: 0')")
    expect(syncClient).toContain('transportClosedCleanly: true')
    expect(syncClient).toContain('IROH_SYNC_FILES_CHANGED_EVENT')
    expect(syncClient).toContain('publishVaultFilesChanged(status)')
  })

  it('builds an optimized signed ARM64 release APK by default and rejects oversized output', () => {
    const script = read('build/scripts/build_dev_apk.sh')
    const cargo = read('Elephant/backend/tauri/Cargo.toml')

    expect(script).toContain('ANDROID_TARGET="${ANDROID_TARGET:-aarch64}"')
    expect(script).toContain('ANDROID_BUILD_PROFILE="${ANDROID_BUILD_PROFILE:-release}"')
    expect(script).toContain('ANDROID_APK_MAX_MIB="${ANDROID_APK_MAX_MIB:-24}"')
    expect(script).toContain('rm -rf "$APK_ROOT"')
    expect(script).toContain('ELEPHANTNOTE_ANDROID_BUILD=1')
    expect(script).toContain('ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1')
    expect(script).toContain('useLegacyPackaging = true')
    expect(script).toContain('native libraries will be compressed in the APK')
    expect(script).toContain("stat -c '%s'")
    expect(script).toContain("stat -f '%z'")
    expect(script).toContain('apksigner')
    expect(script).toContain('verify --verbose')
    expect(script).toContain('above the ${ANDROID_APK_MAX_MIB}MiB limit')
    expect(cargo).toContain('[profile.release]')
    expect(cargo).toContain('opt-level = "z"')
    expect(cargo).toContain('lto = "thin"')
    expect(cargo).toContain('strip = "symbols"')
    expect(cargo).not.toContain('panic = "abort"')
  })

  it('installs camera permission, immersive system bars and tracked Android activity', () => {
    const script = read('build/scripts/build_dev_apk.sh')
    const activity = read('build/android/MainActivity.kt')
    const vite = read('vite.tauri.config.js')
    const nodeShim = read(
      'Elephant/frontend/src/renderer/src/platform/mobileNodeBuiltinsShim.js'
    )

    expect(activity).toContain('requestCameraPermissionIfNeeded()')
    expect(activity).toContain('Manifest.permission.CAMERA')
    expect(activity).toContain('WindowInsets.Type.systemBars()')
    expect(activity).toContain('BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE')
    expect(activity).toContain('onWindowFocusChanged')
    expect(script).toContain('android.permission.CAMERA')
    expect(script).toContain('android.hardware.camera.any')
    expect(script).toContain('cp "$MAIN_ACTIVITY_TEMPLATE" "$MAIN_ACTIVITY"')
    expect(script).toContain("'__vite-browser-external'")
    expect(vite).toContain("process.env.ELEPHANTNOTE_ANDROID_BUILD === '1'")
    expect(vite).toContain("'child_process'")
    expect(vite).toContain("'fs/promises'")
    expect(vite).toContain("'crypto'")
    expect(vite).toContain("'zlib'")
    expect(nodeShim).toContain('Use the Tauri bridge instead')
    expect(nodeShim).toContain('export const spawn')
    expect(nodeShim).toContain('export const statSync')
    expect(nodeShim).toContain('export const createHash')
  })

  it('keeps the Android runtime mobile-only and exposes the Tauri bridge', () => {
    const config = JSON.parse(read('Elephant/backend/tauri/tauri.android.conf.json'))

    expect(config.build.beforeBuildCommand).toBe('cd ../.. && pnpm tauri:web:build')
    expect(config.build.frontendDist).toBe('../../../build/out/renderer')
    expect(config.app.withGlobalTauri).toBe(true)
    expect(config.app.windows[0].title).toBe('ElephantNote')
    expect(config.bundle.resources).toEqual([])
  })
})
