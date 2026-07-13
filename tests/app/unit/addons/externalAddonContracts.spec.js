import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
import { builtinAddons } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/index.js'
import { normalizeAddonManifest } from '../../../../Elephant/frontend/src/renderer/src/addons/manifest.js'
import { installExternalAddonRuntime } from '../../../../Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const createManifest = (overrides = {}) => ({
  id: 'com.example.addon',
  name: 'Example addon',
  version: '1.0.0',
  runtime: { type: 'javascript-worker', entry: 'main.js' },
  permissions: {
    notes: { read: ['Inbox/**'], write: ['Reports/**'] },
    network: { hosts: ['api.example.com'] },
    storage: true,
    commands: true
  },
  contributes: {
    commands: [{ id: 'com.example.addon.run', title: 'Run example' }]
  },
  ...overrides
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const installFakeWorker = () => {
  const messages = []
  let worker
  class FakeWorker {
    constructor() {
      worker = this
      this.listeners = new Map()
    }

    postMessage(message) {
      messages.push(message)
      if (message.type === 'activate') {
        queueMicrotask(() => this.emit('message', {
          type: 'activation-result',
          id: message.id,
          ok: true,
          result: { activated: true }
        }))
      }
      if (message.type === 'deactivate') {
        queueMicrotask(() => this.emit('message', {
          type: 'deactivation-result',
          id: message.id,
          ok: true
        }))
      }
    }

    addEventListener(type, listener) { this.listeners.set(type, listener) }
    removeEventListener(type) { this.listeners.delete(type) }
    emit(type, data) { this.listeners.get(type)?.({ data }) }
    terminate = vi.fn()
  }
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('Blob', class {})
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() })
  return { messages, get worker() { return worker } }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('external addon manifest contracts', () => {
  it('normalizes structured capabilities without exposing mutable arrays', () => {
    const source = createManifest()
    const manifest = normalizeAddonManifest(source)
    expect(manifest.permissions.notes.read).toEqual(['Inbox/**'])
    expect(manifest.permissions.notes.write).toEqual(['Reports/**'])
    expect(manifest.permissions.network.hosts).toEqual(['api.example.com'])
    expect(manifest.permissions.storage).toBe(true)
    expect(manifest.permissions.commands).toBe(true)
    source.permissions.notes.read.push('*')
    expect(manifest.permissions.notes.read).toEqual(['Inbox/**'])
  })

  it('preserves content fallbacks, parent requirements and native declarations', () => {
    const manifest = normalizeAddonManifest(createManifest({
      parentAddonId: 'elephant.ai',
      requires: { 'elephant.ai': '>=2.1.0' },
      permissions: { native: true },
      contributes: {
        contentTypes: [{
          id: 'drawing',
          kind: 'image',
          sourcePattern: '**/.assets/drawing-*.png',
          disabledPresentation: 'static-preview',
          disabledLabel: 'Drawing'
        }]
      }
    }))
    expect(manifest.parentAddonId).toBe('elephant.ai')
    expect(manifest.requires).toEqual({ 'elephant.ai': '>=2.1.0' })
    expect(manifest.permissions.native).toBe(true)
    expect(manifest.contentTypes[0].disabledPresentation).toBe('static-preview')
  })
})

describe('built-in addon catalogue', () => {
  it('contains only irreducible core and editor capabilities', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.addon-packs',
      'elephant.google-keep-import',
      'elephant.excalidraw',
      'elephant.recently-edited'
    ])
    expect(builtinAddons.filter((addon) => addon.manifest.defaultEnabled).map((addon) => addon.manifest.id))
      .toEqual(['elephant.addon-packs'])
    expect(builtinAddons.find((addon) => addon.manifest.id === 'elephant.addon-packs')?.manifest.removable).toBe(false)
    expect(read('addons/official/ai/manifest.json')).toContain('"id": "elephant.ai"')
    expect(read('addons/official/code-execution/manifest.json')).toContain('"id": "elephant.code-execution"')
  })

  it('enables only the addon pack manager by default', async () => {
    const manager = new ElephantAddonManager({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    for (const addon of builtinAddons) manager.register(addon)
    await manager.enableDefaultAddons()
    expect(manager.list().filter((addon) => addon.enabled).map((addon) => addon.manifest.id))
      .toEqual(['elephant.addon-packs'])
  })
})

describe('external and official package runtime', () => {
  it('uses the isolated worker and broker for community packages', async () => {
    const fake = installFakeWorker()
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_addons_list') return []
      if (command === 'tauri_prefs_get') return true
      if (command === 'tauri_addons_read_entry') return { source: 'self.elephantAddon = { activate() {} }' }
      if (command === 'tauri_addons_call' && payload.method === 'app.info') return { name: 'Elephant', version: '0.18.9' }
      if (command === 'tauri_addons_set_enabled') return { ok: true }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const manager = new ElephantAddonManager({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const runtime = installExternalAddonRuntime(manager)
    await flush()
    runtime.register({
      manifest: normalizeAddonManifest(createManifest({ source: 'external' })),
      packageHash: 'hash',
      installedAt: '2026-07-10T00:00:00Z',
      enabled: false
    })
    await manager.enable('com.example.addon')
    fake.worker.emit('message', { type: 'rpc', id: 'rpc-1', method: 'app.info', params: {} })
    await flush()
    expect(fake.messages).toContainEqual(expect.objectContaining({ type: 'rpc-result', id: 'rpc-1', ok: true }))
  })

  it('restores verified official packages even when Community Addons are disabled', async () => {
    installFakeWorker()
    const record = {
      source: 'official',
      manifest: normalizeAddonManifest(createManifest({ id: 'elephant.test-official', source: 'official' })),
      packageHash: 'verified-hash',
      installedAt: '2026-07-13T00:00:00Z',
      enabled: true
    }
    const invoke = vi.fn(async (command) => {
      if (command === 'tauri_addons_list') return [record]
      if (command === 'tauri_prefs_get') return false
      if (command === 'tauri_addons_read_entry') return { source: 'self.elephantAddon = { activate() {} }' }
      if (command === 'tauri_addons_set_enabled') return { ok: true }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })
    const manager = new ElephantAddonManager({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    installExternalAddonRuntime(manager)
    await flush()
    expect(manager.get('elephant.test-official')?.enabled).toBe(true)
    expect(manager.get('elephant.test-official')?.manifest.official).toBe(true)
    expect(invoke).not.toHaveBeenCalledWith('tauri_addons_set_enabled', expect.objectContaining({ enabled: false }))
  })

  it('does not restart a community package while Community Addons are disabled', async () => {
    const record = {
      manifest: normalizeAddonManifest(createManifest({ source: 'external' })),
      packageHash: 'hash',
      installedAt: '2026-07-10T00:00:00Z',
      enabled: true
    }
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_addons_list') return [record]
      if (command === 'tauri_prefs_get') return false
      if (command === 'tauri_addons_set_enabled') return { ...payload }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })
    const manager = new ElephantAddonManager({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    installExternalAddonRuntime(manager)
    await flush()
    expect(manager.get('com.example.addon')?.enabled).toBe(false)
    expect(invoke).toHaveBeenCalledWith('tauri_addons_set_enabled', expect.objectContaining({ enabled: false }))
  })

  it('unregisters a disabled addon and refuses to unregister a running addon', async () => {
    const manager = new ElephantAddonManager()
    manager.register({ manifest: { id: 'com.example.cleanup', name: 'Cleanup', version: '1.0.0' } })
    await manager.enable('com.example.cleanup')
    expect(() => manager.unregister('com.example.cleanup')).toThrow('Cannot unregister an active addon')
    await manager.disable('com.example.cleanup')
    manager.unregister('com.example.cleanup')
    expect(manager.get('com.example.cleanup')).toBeNull()
  })
})
