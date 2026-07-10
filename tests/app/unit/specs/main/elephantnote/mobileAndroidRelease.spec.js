import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('ElephantNote mobile Android release', () => {
  it('keeps the complete touch-first mobile shell from the validated mobile branch', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const shellStyles = read('Elephant/frontend/app/styles/app-shell.css')
    const emptyVault = read('Elephant/frontend/app/components/shell/EmptyVaultPicker.vue')
    const mobileVaultBridge = read('Elephant/frontend/src/renderer/src/platform/mobileVaultBridge.js')

    expect(shell).toContain('mobile')
    expect(shellStyles).toContain('@media')
    expect(shellStyles).toContain('safe-area-inset')
    expect(emptyVault).toContain('create')
    expect(mobileVaultBridge).toContain('createLocalVault')
    expect(mobileVaultBridge).toContain('/vaults/Personal')
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

  it('enforces a readable and stable phone workspace instead of shrinking desktop UI', () => {
    const mobileStyles = read('Elephant/frontend/src/renderer/src/mobile-android.css')

    expect(mobileStyles).toContain('--en-mobile-tap-target: 46px')
    expect(mobileStyles).toContain('.en-mobile-topbar')
    expect(mobileStyles).toContain('backdrop-filter: blur(18px)')
    expect(mobileStyles).toContain('.en-library-toolbar')
    expect(mobileStyles).toContain('position: sticky')
    expect(mobileStyles).toContain('.en-library-grid:not(.list)')
    expect(mobileStyles).toContain('grid-template-columns: 1fr')
    expect(mobileStyles).toContain('.en-note-card')
    expect(mobileStyles).toContain('min-height: 142px')
    expect(mobileStyles).toContain('.en-mobile-fab')
    expect(mobileStyles).toContain('width: 58px')
  })

  it('keeps synchronization readable and actionable with one-handed mobile controls', () => {
    const mobileStyles = read('Elephant/frontend/src/renderer/src/mobile-android.css')

    expect(mobileStyles).toContain('.en-sync-hero h3')
    expect(mobileStyles).toContain('font-size: 20px')
    expect(mobileStyles).toContain('.en-sync-row-copy strong')
    expect(mobileStyles).toContain('font-size: 14px')
    expect(mobileStyles).toContain('.en-sync-advanced-content > div')
    expect(mobileStyles).toContain('overflow-wrap: anywhere')
    expect(mobileStyles).toContain('.en-pair-pane textarea')
    expect(mobileStyles).toContain('min-height: 120px')
    expect(mobileStyles).toContain('.en-pair-share button')
    expect(mobileStyles).toContain('min-height: 48px')
  })

  it('builds an optimized signed ARM64 release APK by default and rejects oversized output', () => {
    const script = read('build/scripts/build_dev_apk.sh')
    const cargo = read('Elephant/backend/tauri/Cargo.toml')

    expect(script).toContain('ANDROID_TARGET="${ANDROID_TARGET:-aarch64}"')
    expect(script).toContain('ANDROID_BUILD_PROFILE="${ANDROID_BUILD_PROFILE:-release}"')
    expect(script).toContain('ANDROID_APK_MAX_MIB="${ANDROID_APK_MAX_MIB:-24}"')
    expect(script).toContain('rm -rf "$APK_ROOT"')
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
