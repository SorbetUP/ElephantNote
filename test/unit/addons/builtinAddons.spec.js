import { describe, expect, it } from 'vitest'
import { ADDON_EXTENSION_POINTS, ElephantAddonManager } from '@/addons'
import { addonInspectorAddon, builtinAddons } from '@/addons/builtin'

describe('builtin addons', () => {
  it('exports the addon inspector as a disabled builtin addon', () => {
    expect(builtinAddons).toContain(addonInspectorAddon)
    expect(addonInspectorAddon.manifest).toMatchObject({
      id: 'elephant.addon-inspector',
      defaultEnabled: false
    })
  })

  it('registers addon inspector contributions when enabled', async () => {
    const manager = new ElephantAddonManager({
      router: { push: () => Promise.resolve() }
    })

    manager.register(addonInspectorAddon)
    await manager.enable('elephant.addon-inspector')

    expect(manager.getContributions(ADDON_EXTENSION_POINTS.actions)).toHaveLength(1)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.settingsSections)).toHaveLength(1)
  })
})
