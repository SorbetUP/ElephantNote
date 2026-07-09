import { describe, expect, it, vi } from 'vitest'
import { ElephantAddonManager } from '../../../../Elephant/frontend/src/renderer/src/addons/AddonManager.js'
import { normalizeAddonManifest } from '../../../../Elephant/frontend/src/renderer/src/addons/manifest.js'

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
