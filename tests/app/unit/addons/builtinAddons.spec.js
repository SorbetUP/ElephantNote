import { describe, expect, it } from 'vitest'
import { ADDON_EXTENSION_POINTS, ElephantAddonManager } from '@/addons'
import { addonPacksAddon, builtinAddons } from '@/addons/builtin'

const OPTIONAL_EDITOR_ADDONS = ['elephant.code-execution', 'elephant.excalidraw']

describe('builtin addons', () => {
  it('exports only the cleaned first-party catalogue', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.addon-packs',
      'elephant.google-keep-import',
      'elephant.codex-connection',
      'elephant.calendar',
      'elephant.sites',
      'elephant.ai',
      'elephant.sync',
      'elephant.code-execution',
      'elephant.excalidraw'
    ])
    expect(builtinAddons).toContain(addonPacksAddon)
    expect(builtinAddons.map((addon) => addon.manifest.id)).not.toContain('elephant.addon-inspector')
  })

  it('registers the required Addon Packs actions and settings contribution', async () => {
    const manager = new ElephantAddonManager()

    manager.register(addonPacksAddon)
    await manager.enable('elephant.addon-packs')

    expect(manager.getContributions(ADDON_EXTENSION_POINTS.actions)
      .map((entry) => entry.contribution.id)
      .sort())
      .toEqual([
        'elephant.addon-packs.apply',
        'elephant.addon-packs.create',
        'elephant.addon-packs.ensure-develop-parity'
      ])
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.settingsSections)).toHaveLength(1)
  })

  it('marks every optional first-party feature as disabled and removable by default', () => {
    const optional = builtinAddons.filter((addon) => addon.manifest.id !== 'elephant.addon-packs')

    expect(optional.every((addon) => addon.manifest.defaultEnabled === false)).toBe(true)
    expect(optional.every((addon) => addon.manifest.removable === true)).toBe(true)
    expect(addonPacksAddon.manifest.removable).toBe(false)
  })

  it('keeps code execution and Excalidraw as real optional addons', () => {
    for (const addonId of OPTIONAL_EDITOR_ADDONS) {
      const addon = builtinAddons.find((entry) => entry.manifest.id === addonId)
      expect(addon).toBeDefined()
      expect(addon.manifest.defaultEnabled).toBe(false)
      expect(addon.manifest.removable).toBe(true)
      expect(typeof addon.activate).toBe('function')
    }
  })
})
