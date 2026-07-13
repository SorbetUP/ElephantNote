import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Sync physical migration boundary', () => {
  it('owns the persistent Iroh endpoint in a package service', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    const build = JSON.parse(read('addons/official/sync/addon.build.json'))
    const native = read('addons/official/sync/native/src/main.rs')

    expect(manifest.native.runner).toBe('service')
    expect(manifest.native.protocol).toBe('elephant-addon-service-v1')
    expect(build.runner).toBe('service')
    expect(native).toContain('Endpoint::bind(presets::N0)')
    expect(native).toContain('.build(endpoint.id())')
    expect(native).toContain('.address_lookup()')
    expect(native).toContain('MdnsAddressLookup')
    expect(native).toContain('sync.endpoint')
  })

  it('does not pretend that file transfer has already moved out of core', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    const entry = read('addons/official/sync/main.service.js')
    const legacyEntry = read('addons/official/sync/main.js')
    const core = read('Elephant/backend/tauri/src/lib_min.rs')

    expect(manifest.description).toContain('legacy file transfer operations are migrated')
    expect(entry).toContain("from './main.js'")
    expect(entry).not.toContain("callNativeService('sync.run'")
    expect(legacyEntry).toContain("this.invoke('iroh_sync_run'")
    expect(core).toContain('sync_commands::iroh_sync_run')
  })

  it('keeps mobile unsupported until a real package-owned host exists', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    expect(manifest.native.mobile.android.supported).toBe(false)
    expect(manifest.native.mobile.ios.supported).toBe(false)
    expect(manifest.native.mobile.android.reason).toContain('mobile Sync host adapter')
    expect(manifest.native.mobile.ios.reason).toContain('mobile Sync host adapter')
  })
})
