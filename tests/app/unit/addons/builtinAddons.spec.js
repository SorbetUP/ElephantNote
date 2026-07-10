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
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.sidebarItems)).toHaveLength(1)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.settingsSections)).toHaveLength(1)
  })

  it('opens the Addons section in the active settings panel', async () => {
    const openedSections = []
    const handleOpenSettings = (event) => openedSections.push(event.detail?.section)
    globalThis.addEventListener('elephantnote:open-settings', handleOpenSettings)

    try {
      const manager = new ElephantAddonManager()
      manager.register(addonInspectorAddon)
      await manager.enable('elephant.addon-inspector')

      const result = await manager.runAction('elephant.addon-inspector.open')

      expect(openedSections).toEqual(['addons'])
      expect(result).toEqual({ section: 'addons' })
    } finally {
      globalThis.removeEventListener('elephantnote:open-settings', handleOpenSettings)
    }
  })
})
