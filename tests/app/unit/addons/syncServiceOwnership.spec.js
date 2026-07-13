import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Sync package-owned service boundary', () => {
  it('declares a desktop-only persistent native service', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    expect(manifest.version).toBe('1.2.0')
    expect(manifest.runtime.entry).toBe('main.service.js')
    expect(manifest.permissions.native).toBe(true)
    expect(manifest.native.runner).toBe('service')
    expect(manifest.native.protocol).toBe('elephant-addon-service-v1')
    expect(Object.keys(manifest.native.sidecars)).toContain('linux-x86_64')
    expect(Object.keys(manifest.native.sidecars).some((key) => /^(android|ios)-/.test(key))).toBe(false)
    expect(manifest.native.mobile.android.supported).toBe(false)
    expect(manifest.native.mobile.ios.supported).toBe(false)
  })

  it('owns a stable endpoint and package pairing router', () => {
    const native = read('addons/official/sync/native/src/main.rs')
    expect(native).toContain('Endpoint::builder(presets::Minimal)')
    expect(native).toContain('.secret_key(secret_key)')
    expect(native).toContain('.address_lookup(MdnsAddressLookup::builder().service_name(MDNS_SERVICE))')
    expect(native).toContain('load_or_create_secret_key')
    expect(native).toContain('wait_for_endpoint_addr')
    expect(native).toContain('Router::builder(endpoint.clone())')
    expect(native).toContain('PairingProtocol')
    expect(native).toContain('handle_incoming_pairing')
    expect(native).toContain('"stableIdentity": true')
    expect(native).toContain('"owner": ADDON_ID')
    expect(native).not.toContain('tauri::command')
  })

  it('connects package pairing and planning to the generic service host', () => {
    const source = read('addons/official/sync/main.service.js')
    expect(source).toContain('tauri_addons_service_start')
    expect(source).toContain('tauri_addons_service_call')
    expect(source).toContain('tauri_addons_service_stop')
    expect(source).toContain('api.resources.provide(SERVICE_RESOURCE')
    expect(source).toContain("this.callNativeService('sync.status')")
    expect(source).toContain("this.callNativeService('sync.create-invite'")
    expect(source).toContain("this.callNativeService('sync.accept-invite'")
    expect(source).toContain("this.callNativeService('sync.scan'")
    expect(source).toContain("this.callNativeService('sync.plan'")
    expect(source).toContain("this.callNativeService('sync.apply-local'")
  })

  it('owns pairing, scan, planning and local operations without claiming network transfer completion', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    const native = read('addons/official/sync/native/src/main.rs')
    const base = read('addons/official/sync/main.js')

    expect(manifest.description).toMatch(/manifest scanning and deterministic sync planning/i)
    expect(native).toContain('"wire-protocol"')
    expect(native).toContain('"pairing"')
    expect(native).toContain('"networkTransfersReady": false')
    expect(native).not.toContain('"sync.run" =>')
    expect(base).toContain("this.invoke('iroh_sync_run'")
  })
})
