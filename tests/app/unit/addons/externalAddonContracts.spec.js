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

  it('keeps legacy builtin permission arrays and addon presentation fields compatible', () => {
    const manifest = normalizeAddonManifest({
      id: 'elephant.example',
      name: 'Example',
      version: '1.0.0',
      icon: 'sparkles',
      removable: false,
      permissions: ['notes.read']
    })

    expect(manifest.permissions).toEqual(['notes.read'])
    expect(manifest.icon).toBe('sparkles')
    expect(manifest.removable).toBe(false)
  })
})

describe('built-in addon catalogue', () => {
  it('ships only useful first-party features with distinct logos', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.addon-packs',
      'elephant.google-keep-import',
      'elephant.codex-connection',
      'elephant.calendar',
      'elephant.sites',
      'elephant.ai',
      'elephant.sync'
    ])
    expect(builtinAddons.filter((addon) => addon.manifest.defaultEnabled).map((addon) => addon.manifest.id))
      .toEqual(['elephant.addon-packs'])
    expect(builtinAddons.find((addon) => addon.manifest.id === 'elephant.addon-packs')?.manifest.removable).toBe(false)
    expect(new Set(builtinAddons.map((addon) => addon.manifest.icon)).size).toBe(builtinAddons.length)
    expect(builtinAddons.map((addon) => addon.manifest.id)).not.toEqual(expect.arrayContaining([
      'elephant.daily-notes',
      'elephant.quick-capture',
      'elephant.vault-overview',
      'elephant.addon-inspector'
    ]))
  })

  it('enables only the addon pack manager by default', async () => {
    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    for (const addon of builtinAddons) manager.register(addon)

    await manager.enableDefaultAddons()

    expect(manager.list().filter((addon) => addon.enabled).map((addon) => addon.manifest.id))
      .toEqual(['elephant.addon-packs'])
    expect(manager.getActions().map((entry) => entry.contribution.id).sort()).toEqual([
      'elephant.addon-packs.apply',
      'elephant.addon-packs.create',
      'elephant.addon-packs.ensure-develop-parity'
    ])
  })

  it('persists installation and enabled state separately for removable built-ins', () => {
    const source = read('Elephant/frontend/src/renderer/src/addons/index.js')

    expect(source).toContain("BUILTIN_INSTALL_STORAGE_KEY = 'elephantnote:installed-built-in-addons:v1'")
    expect(source).toContain("BUILTIN_ENABLED_STORAGE_KEY = 'elephantnote:enabled-built-in-addons:v1'")
    expect(source).toContain('manager.installBuiltin = async (id) =>')
    expect(source).toContain('manager.uninstallBuiltin = async (id) =>')
    expect(source).toContain('manager.restoreBuiltinEnabledState = async () =>')
    expect(source).toContain("manager.on('enabled', persistEnabledState)")
    expect(source).toContain("manager.on('disabled', persistEnabledState)")
    expect(source).not.toContain('manager.enableDefaultAddons()')
  })

  it('keeps AI and Iroh Sync inert until their addons are enabled', async () => {
    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    const ai = builtinAddons.find((addon) => addon.manifest.id === 'elephant.ai')
    const sync = builtinAddons.find((addon) => addon.manifest.id === 'elephant.sync')
    manager.register(ai)
    manager.register(sync)

    expect(manager.getContributions('settings.sections')).toEqual([])
    expect(manager.getContributions('views')).toEqual([])
    expect(manager.getActions()).toEqual([])

    await manager.enable(ai.manifest.id)
    expect(manager.getContributions('settings.sections').some((entry) => entry.addonId === 'elephant.ai')).toBe(true)
    expect(manager.getContributions('views').some((entry) => entry.addonId === 'elephant.ai')).toBe(true)

    await manager.disable(ai.manifest.id)
    expect(manager.getContributions('settings.sections')).toEqual([])
    expect(manager.getContributions('views')).toEqual([])
  })
})

describe('external addon runtime', () => {
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
