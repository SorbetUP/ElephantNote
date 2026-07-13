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

  it('owns and publishes the live Iroh endpoint from its native crate', () => {
    const native = read('addons/official/sync/native/src/main.rs')
    expect(native).toContain('Endpoint::bind(presets::N0)')
    expect(native).toContain('MdnsAddressLookup::builder()')
    expect(native).toContain('.build(endpoint.id())')
    expect(native).toContain('.address_lookup()')
    expect(native).toContain('let endpoint_id = self.ensure_endpoint().await?.id().to_string()')
    expect(native).toContain('"endpointId": endpoint_id')
    expect(native).toContain('"owner": "elephant.sync"')
    expect(native).toContain('elephant-addon-service-v1')
    expect(native).not.toContain('tauri::command')
  })

  it('connects the renderer to the generic service host', () => {
    const source = read('addons/official/sync/main.service.js')
    expect(source).toContain('tauri_addons_service_start')
    expect(source).toContain('tauri_addons_service_call')
    expect(source).toContain('tauri_addons_service_stop')
    expect(source).toContain('api.resources.provide(SERVICE_RESOURCE')
    expect(source).toContain("this.callNativeService('sync.status')")
    expect(source).toContain("this.callNativeService('sync.scan'")
    expect(source).toContain("this.callNativeService('sync.plan'")
    expect(source).toContain("this.callNativeService('sync.apply-local'")
  })

  it('owns scan, planning and local operations without claiming network transfer completion', () => {
    const manifest = JSON.parse(read('addons/official/sync/manifest.json'))
    const native = read('addons/official/sync/native/src/main.rs')
    const base = read('addons/official/sync/main.js')

    expect(manifest.description).toMatch(/manifest scanning and deterministic sync planning/i)
    expect(native).toContain('"ownedCapabilities": ["endpoint", "manifest", "plan", "local-operations"]')
    expect(native).not.toContain('sync.run')
    expect(base).toContain("this.invoke('iroh_sync_run'")
  })
})
