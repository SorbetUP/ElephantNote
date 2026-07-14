import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const processNativeSlugs = ['ai-ocr', 'code-execution', 'sync', 'open-models', 'codex-connection']

const manifestFor = (slug) => JSON.parse(
  fs.readFileSync(path.join(root, 'addons/official', slug, 'manifest.json'), 'utf8')
)
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('native addon mobile compatibility', () => {
  it('never advertises downloaded process services as Android or iOS executables', () => {
    for (const slug of processNativeSlugs) {
      const manifest = manifestFor(slug)
      expect(manifest.native.runner).toBe('service')
      expect(Object.keys(manifest.native.sidecars).some((key) => /^(android|ios)-/.test(key))).toBe(false)
      expect(manifest.native.mobile.android.supported).toBe(false)
      expect(manifest.native.mobile.android.reason).toMatch(/host adapter/i)
      expect(manifest.native.mobile.ios.supported).toBe(false)
      expect(manifest.native.mobile.ios.reason).toMatch(/host adapter/i)
    }
  })

  it('keeps Sites renderer-owned and installable on desktop, Android and iOS', () => {
    const manifest = manifestFor('sites')
    const source = read('addons/official/sites/main.js')
    expect(manifest.version).toBe('1.3.0')
    expect(manifest.permissions.native).toBeUndefined()
    expect(manifest.native).toBeUndefined()
    expect(source).toContain('tauri_addons_assets_allow_directory')
    expect(source).toContain('convertFileSrc')
    expect(source).toContain("runtime: 'tauri-asset-protocol'")
    expect(source).not.toContain('tauri_site_preview_')
    expect(fs.existsSync(path.join(root, 'addons/official/sites/addon.build.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'addons/official/sites/native'))).toBe(false)
  })

  it('keeps Iroh physically outside Android and iOS application builds', () => {
    const cargo = read('Elephant/backend/tauri/Cargo.toml')
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    const vault = read('Elephant/backend/tauri/src/vault/mod.rs')
    const syncManifest = manifestFor('sync')
    const syncCargo = read('addons/official/sync/native/Cargo.toml')

    expect(cargo).not.toMatch(/^iroh\s*=/m)
    expect(cargo).not.toMatch(/^iroh-mdns-address-lookup\s*=/m)
    expect(lib).not.toContain('pub mod sync;')
    expect(lib).not.toContain('IrohSyncState')
    expect(vault).not.toContain('pub mod sync;')
    expect(fs.existsSync(path.join(root, 'Elephant/backend/tauri/src/sync_commands.rs'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'Elephant/backend/tauri/src/sync'))).toBe(false)
    expect(syncCargo).toMatch(/^iroh\s*=\s*"1\.0\.2"/m)
    expect(syncCargo).toMatch(/^iroh-mdns-address-lookup\s*=/m)
    expect(syncManifest.native.mobile.android.supported).toBe(false)
    expect(syncManifest.native.mobile.ios.supported).toBe(false)
  })
})
