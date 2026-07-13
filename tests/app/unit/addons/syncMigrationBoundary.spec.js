import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Sync physical migration boundary', () => {
  it('owns the persistent Iroh endpoint and stable identity in a package service', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    const build = JSON.parse(read('addons/official/sync/addon.build.json'))
    const native = read('addons/official/sync/native/src/main.rs')

    expect(manifest.native.runner).toBe('service')
    expect(manifest.native.protocol).toBe('elephant-addon-service-v1')
    expect(build.runner).toBe('service')
    expect(native).toContain('Endpoint::builder(presets::Minimal)')
    expect(native).toContain('.secret_key(secret_key)')
    expect(native).toContain('.address_lookup(MdnsAddressLookup::builder().service_name(MDNS_SERVICE))')
    expect(native).toContain('load_or_create_secret_key')
    expect(native).toContain('wait_for_endpoint_addr')
    expect(native).toContain('sync.endpoint')
  })

  it('moves identity, wire schema, manifests, planning and local application while keeping the active router and transfers explicit in core', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    const entry = read('addons/official/sync/main.service.js')
    const native = read('addons/official/sync/native/src/main.rs')
    const nativeLibrary = read('addons/official/sync/native/src/lib.rs')
    const protocol = read('addons/official/sync/native/src/protocol.rs')
    const legacyEntry = read('addons/official/sync/main.js')
    const core = read('Elephant/backend/tauri/src/lib_min.rs')
    const coreRuntime = read('Elephant/backend/tauri/src/sync/mod.rs')

    expect(manifest.description).toContain('vault manifest scanning and deterministic sync planning')
    expect(entry).toContain("from './main.js'")
    expect(entry).toContain("this.callNativeService('sync.scan'")
    expect(entry).toContain("this.callNativeService('sync.plan'")
    expect(entry).toContain("this.callNativeService('sync.apply-local'")
    expect(native).toContain('const IDENTITY_FILE: &str = "iroh-endpoint.key"')
    expect(native).toContain('mod manifest;')
    expect(native).toContain('mod plan;')
    expect(native).toContain('mod local_ops;')
    expect(nativeLibrary).toContain('pub mod protocol;')
    expect(protocol).toContain('pub const ALPN: &[u8] = b"elephantnote/vault-sync/1"')
    expect(protocol).toContain('pub enum ControlMessage')
    expect(protocol).toContain('PairRequest(PairRequest)')
    expect(protocol).toContain('SyncOpen(SyncOpen)')
    expect(entry).not.toContain("callNativeService('sync.run'")
    expect(legacyEntry).toContain("this.invoke('iroh_sync_run'")
    expect(core).toContain('sync_commands::iroh_sync_run')
    expect(coreRuntime).toContain('.accept(protocol::ALPN, VaultSyncProtocol { app })')
    expect(coreRuntime).toContain('struct VaultSyncProtocol')
  })

  it('keeps mobile unsupported until a real package-owned host exists', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    expect(manifest.native.mobile.android.supported).toBe(false)
    expect(manifest.native.mobile.ios.supported).toBe(false)
    expect(manifest.native.mobile.android.reason).toContain('mobile Sync host adapter')
    expect(manifest.native.mobile.ios.reason).toContain('mobile Sync host adapter')
  })
})
