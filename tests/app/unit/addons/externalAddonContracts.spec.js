import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn() }
}))

import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
import { builtinAddons } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/index.js'
import { ExternalAddonController } from '../../../../Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js'
import { normalizeAddonManifest } from '../../../../Elephant/frontend/src/renderer/src/addons/manifest.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('external addon manifest contract', () => {
  it('normalizes structured capabilities without exposing mutable arrays', () => {
    const manifest = normalizeAddonManifest({
      id: 'com.example.finance',
      name: 'Finance',
      version: '1.0.0',
      source: 'external',
      runtime: { type: 'javascript-worker', entry: 'main.js' },
      permissions: {
        commands: true,
        storage: true,
        notes: { read: ['Finance/**'], write: ['Finance/**'] },
        network: { hosts: ['api.example.com'] }
      }
    })

    expect(manifest.source).toBe('external')
    expect(manifest.runtime).toEqual({ type: 'javascript-worker', entry: 'main.js' })
    expect(manifest.permissions.commands).toBe(true)
    expect(manifest.permissions.notes.write).toEqual(['Finance/**'])
    expect(Object.isFrozen(manifest.permissions.notes.write)).toBe(true)
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
  it('ships three useful addons and one developer inspector', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.daily-notes',
      'elephant.quick-capture',
      'elephant.vault-overview',
      'elephant.addon-inspector'
    ])
    expect(builtinAddons.filter((addon) => addon.manifest.defaultEnabled)).toHaveLength(3)
  })

  it('registers starter actions through the same addon manager contract', async () => {
    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    for (const addon of builtinAddons) manager.register(addon)

    await manager.enableDefaultAddons()

    expect(manager.get('elephant.daily-notes')?.enabled).toBe(true)
    expect(manager.get('elephant.quick-capture')?.enabled).toBe(true)
    expect(manager.get('elephant.vault-overview')?.enabled).toBe(true)
    expect(manager.get('elephant.addon-inspector')?.enabled).toBe(false)
    expect(manager.getActions().map((entry) => entry.contribution.id).sort()).toEqual([
      'elephant.daily-notes.open-today',
      'elephant.quick-capture.create',
      'elephant.vault-overview.generate'
    ])
  })

  it('executes Daily Notes through the registered Tauri read/write commands', async () => {
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_notes_read') throw new Error('not found')
      if (command === 'tauri_notes_write') {
        return { path: payload.relativePath, changed: true, created: true }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    manager.register(builtinAddons.find((addon) => addon.manifest.id === 'elephant.daily-notes'))
    await manager.enable('elephant.daily-notes')

    const result = await manager.runAction('elephant.daily-notes.open-today')
    const writeCall = invoke.mock.calls.find(([command]) => command === 'tauri_notes_write')

    expect(result.created).toBe(true)
    expect(result.path).toMatch(/^Daily\/\d{4}-\d{2}-\d{2}\.md$/)
    expect(writeCall).toBeDefined()
    expect(writeCall[1].relativePath).toBe(result.path)
    expect(writeCall[1].content).toContain('# ')
    expect(writeCall[1].content).toContain('## Tasks')
  })
})

describe('dynamic addon lifecycle', () => {
  it('unregisters a disabled addon and clears its contributions', async () => {
    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })

    manager.register({
      manifest: { id: 'com.example.dynamic', name: 'Dynamic', version: '1.0.0' },
      activate(context) {
        context.addAction({ id: 'com.example.dynamic.run', title: 'Run', run: vi.fn() })
      }
    })

    await manager.enable('com.example.dynamic')
    await manager.disable('com.example.dynamic')
    manager.unregister('com.example.dynamic')

    expect(manager.get('com.example.dynamic')).toBeNull()
    expect(manager.getActions()).toEqual([])
  })

  it('refuses to unregister a running addon', async () => {
    const manager = new ElephantAddonManager()
    manager.register({
      manifest: { id: 'com.example.running', name: 'Running', version: '1.0.0' },
      activate: vi.fn()
    })
    await manager.enable('com.example.running')

    expect(() => manager.unregister('com.example.running')).toThrow('Cannot unregister an active addon')
  })
})

describe('community addon consent gate', () => {
  it('does not restart an external addon when community addons are disabled', async () => {
    const record = {
      manifest: {
        id: 'com.example.blocked',
        name: 'Blocked addon',
        version: '1.0.0',
        apiVersion: 1,
        runtime: { type: 'javascript-worker', entry: 'main.js' },
        permissions: {
          commands: true,
          storage: false,
          notes: { read: [], write: [] },
          network: { hosts: [] }
        }
      },
      enabled: true,
      packageHash: 'abc123',
      installedAt: '2026-07-09T00:00:00Z',
      source: 'external'
    }
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_addons_list') return [record]
      if (command === 'tauri_prefs_get') return false
      if (command === 'tauri_addons_set_enabled') return { ...record, enabled: payload.enabled }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const manager = new ElephantAddonManager({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    const controller = new ExternalAddonController(manager, { logger: manager.logger })

    await controller.load()

    expect(manager.get(record.manifest.id)?.enabled).toBe(false)
    expect(invoke).toHaveBeenCalledWith('tauri_addons_set_enabled', {
      addonId: record.manifest.id,
      enabled: false
    })
    await expect(manager.enable(record.manifest.id)).rejects.toThrow('Community addons are disabled')
  })
})
