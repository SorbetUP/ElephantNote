import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
import { builtinAddons } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/index.js'
import { normalizeAddonManifest } from '../../../../Elephant/frontend/src/renderer/src/addons/manifest.js'
import { installExternalAddonRuntime } from '../../../../Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js'

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
    expect(manifest.contributes.commands).toEqual([{ id: 'com.example.addon.run', title: 'Run example' }])

    source.permissions.notes.read.push('*')
    expect(manifest.permissions.notes.read).toEqual(['Inbox/**'])
  })

  it('keeps legacy builtin permission arrays compatible', () => {
    const manifest = normalizeAddonManifest({
      id: 'elephant.example',
      name: 'Example',
      version: '1.0.0',
      permissions: ['notes.read']
    })

    expect(manifest.permissions).toEqual(['notes.read'])
  })
})

describe('built-in starter addons', () => {
  it('ships addon packs first, extracted system features, useful workflows and one developer inspector', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.addon-packs',
      'elephant.google-keep-import',
      'elephant.codex-connection',
      'elephant.calendar',
      'elephant.sites',
      'elephant.daily-notes',
      'elephant.quick-capture',
      'elephant.vault-overview',
      'elephant.addon-inspector'
    ])
    expect(builtinAddons.filter((addon) => addon.manifest.defaultEnabled)).toHaveLength(4)
    expect(builtinAddons.find((addon) => addon.manifest.id === 'elephant.addon-packs')?.manifest.defaultEnabled).toBe(true)
    for (const id of [
      'elephant.google-keep-import',
      'elephant.codex-connection',
      'elephant.calendar',
      'elephant.sites',
      'elephant.addon-inspector'
    ]) {
      expect(builtinAddons.find((addon) => addon.manifest.id === id)?.manifest.defaultEnabled).toBe(false)
    }
  })

  it('registers starter actions through the same addon manager contract', async () => {
    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    for (const addon of builtinAddons) manager.register(addon)

    await manager.enableDefaultAddons()

    expect(manager.get('elephant.addon-packs')?.enabled).toBe(true)
    expect(manager.get('elephant.daily-notes')?.enabled).toBe(true)
    expect(manager.get('elephant.quick-capture')?.enabled).toBe(true)
    expect(manager.get('elephant.vault-overview')?.enabled).toBe(true)
    expect(manager.get('elephant.google-keep-import')?.enabled).toBe(false)
    expect(manager.get('elephant.codex-connection')?.enabled).toBe(false)
    expect(manager.get('elephant.calendar')?.enabled).toBe(false)
    expect(manager.get('elephant.sites')?.enabled).toBe(false)
    expect(manager.get('elephant.addon-inspector')?.enabled).toBe(false)
    expect(manager.getActions().map((entry) => entry.contribution.id).sort()).toEqual([
      'elephant.addon-packs.apply',
      'elephant.addon-packs.create',
      'elephant.daily-notes.open-today',
      'elephant.quick-capture.create',
      'elephant.vault-overview.generate'
    ])
  })

  it('executes Daily Notes through the registered Tauri read/write commands', async () => {
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_notes_read') throw new Error('not found')
      if (command === 'tauri_notes_write') return { changed: true, path: payload.relativePath }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const manager = new ElephantAddonManager({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const daily = builtinAddons.find((addon) => addon.manifest.id === 'elephant.daily-notes')
    manager.register(daily)
    await manager.enable(daily.manifest.id)
    const action = manager.getActions()[0]
    const result = await action.contribution.run()

    expect(result.path).toMatch(/^Daily\/\d{4}-\d{2}-\d{2}\.md$/)
    expect(invoke).toHaveBeenCalledWith('tauri_notes_write', expect.objectContaining({ relativePath: result.path }))
  })

  it('uses app info, persistent storage and note write/read-back through the public API', async () => {
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
      }

      addEventListener(type, listener) { this.listeners.set(type, listener) }

      removeEventListener(type) { this.listeners.delete(type) }

      emit(type, data) { this.listeners.get(type)?.({ data }) }

      terminate = vi.fn()
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('Blob', class {})
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() })

    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_addons_list') return []
      if (command === 'tauri_prefs_get') return true
      if (command === 'tauri_addons_read_entry') return { source: 'self.onmessage = () => {}' }
      if (command === 'tauri_addons_call') {
        if (payload.method === 'app.info') return { name: 'ElephantNote', version: '0.18.9' }
        if (payload.method === 'storage.get') return null
        if (payload.method === 'storage.set') return { ok: true }
        if (payload.method === 'notes.write') return { ok: true, path: 'Reports/proof.md' }
        if (payload.method === 'notes.read') return { path: 'Reports/proof.md', content: '# Proof' }
      }
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

    worker.emit('message', { type: 'rpc', id: 'rpc-1', method: 'app.info', params: {} })
    await flush()
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'rpc-result',
      id: 'rpc-1',
      ok: true,
      result: expect.objectContaining({ name: 'ElephantNote' })
    }))
  })

  it('unregisters a disabled addon and clears its contributions', async () => {
    const manager = new ElephantAddonManager()
    manager.register({
      manifest: { id: 'com.example.cleanup', name: 'Cleanup', version: '1.0.0' },
      activate(context) {
        context.addAction({ id: 'com.example.cleanup.run', title: 'Run' })
      }
    })
    await manager.enable('com.example.cleanup')
    await manager.disable('com.example.cleanup')
    manager.unregister('com.example.cleanup')
    expect(manager.get('com.example.cleanup')).toBeNull()
    expect(manager.getActions()).toEqual([])
  })

  it('refuses to unregister a running addon', async () => {
    const manager = new ElephantAddonManager()
    manager.register({ manifest: { id: 'com.example.running', name: 'Running', version: '1.0.0' } })
    await manager.enable('com.example.running')
    expect(() => manager.unregister('com.example.running')).toThrow('Cannot unregister an active addon')
  })

  it('does not restart an external addon when community addons are disabled', async () => {
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
    expect(invoke).toHaveBeenCalledWith('tauri_addons_set_enabled', expect.objectContaining({ addonId: 'com.example.addon', enabled: false }))
  })
})
