import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const processNativeSlugs = ['ai-ocr', 'code-execution']

const manifestFor = (slug) => JSON.parse(
  fs.readFileSync(path.join(root, 'addons/official', slug, 'manifest.json'), 'utf8')
)

describe('native addon mobile compatibility', () => {
  it('never advertises downloaded process sidecars as Android or iOS executables', () => {
    for (const slug of processNativeSlugs) {
      const manifest = manifestFor(slug)
      expect(manifest.native.runner).toBe('process')
      expect(Object.keys(manifest.native.sidecars).some((key) => /^(android|ios)-/.test(key))).toBe(false)
      expect(manifest.native.mobile.android.supported).toBe(false)
      expect(manifest.native.mobile.android.reason).toMatch(/host adapter/i)
      expect(manifest.native.mobile.ios.supported).toBe(false)
      expect(manifest.native.mobile.ios.reason).toMatch(/host adapter/i)
    }
  })

  it('keeps Sites renderer-owned and installable on desktop, Android and iOS', () => {
    const manifest = manifestFor('sites')
    const source = fs.readFileSync(path.join(root, 'addons/official/sites/main.js'), 'utf8')
    expect(manifest.version).toBe('1.3.0')
    expect(manifest.permissions.native).toBeUndefined()
    expect(manifest.native).toBeUndefined()
    expect(source).toContain('tauri_addons_assets_allow_directory')
    expect(source).toContain('convertFileSrc')
    expect(source).not.toContain('api.native.call')
    expect(fs.existsSync(path.join(root, 'addons/official/sites/addon.build.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'addons/official/sites/native'))).toBe(false)
  })

  it('does not resolve Iroh inside Android or iOS application builds', () => {
    const cargo = fs.readFileSync(path.join(root, 'Elephant/backend/tauri/Cargo.toml'), 'utf8')
    const lib = fs.readFileSync(path.join(root, 'Elephant/backend/tauri/src/lib_min.rs'), 'utf8')
    const vault = fs.readFileSync(path.join(root, 'Elephant/backend/tauri/src/vault/mod.rs'), 'utf8')
    const commands = fs.readFileSync(path.join(root, 'Elephant/backend/tauri/src/sync_commands.rs'), 'utf8')
    const marker = '[target.\'cfg(not(any(target_os = "android", target_os = "ios")))\'.dependencies]'
    const [shared, desktop = ''] = cargo.split(marker)

    expect(shared).not.toMatch(/^iroh\s*=/m)
    expect(shared).not.toMatch(/^iroh-mdns-address-lookup\s*=/m)
    expect(desktop).toMatch(/^iroh\s*=/m)
    expect(desktop).toMatch(/^iroh-mdns-address-lookup\s*=/m)
    expect(lib).toContain('#[cfg(not(mobile))]\npub mod sync;')
    expect(lib).toContain('#[cfg(not(mobile))]\n      app.manage(sync::IrohSyncState::new());')
    expect(vault).toContain('#[cfg(not(mobile))]\npub mod sync;')
    expect(commands).toContain('#[cfg(mobile)]\nmod mobile')
    expect(commands).toContain('addon-required')
  })
})
