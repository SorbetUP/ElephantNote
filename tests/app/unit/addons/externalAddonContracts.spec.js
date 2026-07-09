import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
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
