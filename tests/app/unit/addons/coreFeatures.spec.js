import { describe, expect, it, vi } from 'vitest'
import { ADDON_EXTENSION_POINTS, ElephantAddonManager } from '@/addons'
import { activateCoreFeature } from '@/addons/coreFeatures'

describe('core feature runtime', () => {
  it('registers contributions without creating addon records and disposes them atomically', async () => {
    const manager = new ElephantAddonManager({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const disposed = vi.fn()
    const feature = {
      id: 'core.example',
      activate(ctx) {
        expect(ctx.source).toBe('core')
        ctx.addAction({ id: 'core.example.run', title: 'Run', run: vi.fn() })
        ctx.addSettingsSection({ id: 'core.example.settings', section: 'addons', fields: [] })
        return disposed
      }
    }

    const handle = await activateCoreFeature(manager, feature)
    expect(manager.list()).toEqual([])
    expect(manager.coreFeatures.get('core.example')).toBe(handle)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.actions))
      .toEqual([expect.objectContaining({ source: 'core', coreFeatureId: 'core.example' })])
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.settingsSections)).toHaveLength(1)

    handle.dispose()
    expect(disposed).toHaveBeenCalledOnce()
    expect(manager.coreFeatures.has('core.example')).toBe(false)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.actions)).toEqual([])
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.settingsSections)).toEqual([])
  })

  it('returns the same handle for duplicate activation attempts', async () => {
    const manager = new ElephantAddonManager()
    const activate = vi.fn()
    const feature = { id: 'core.singleton', activate }
    const first = await activateCoreFeature(manager, feature)
    const second = await activateCoreFeature(manager, feature)
    expect(first).toBe(second)
    expect(activate).toHaveBeenCalledOnce()
  })

  it('rolls back contributions when activation fails', async () => {
    const manager = new ElephantAddonManager()
    const feature = {
      id: 'core.failure',
      activate(ctx) {
        ctx.addAction({ id: 'core.failure.run', title: 'Run' })
        throw new Error('activation failed')
      }
    }

    await expect(activateCoreFeature(manager, feature)).rejects.toThrow('activation failed')
    expect(manager.coreFeatures.has('core.failure')).toBe(false)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.actions)).toEqual([])
  })
})
