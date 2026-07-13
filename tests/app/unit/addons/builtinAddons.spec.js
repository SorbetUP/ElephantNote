import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADDON_EXTENSION_POINTS, ElephantAddonManager } from '@/addons'
import { addonPacksAddon, builtinAddons } from '@/addons/builtin'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const OPTIONAL_EDITOR_ADDONS = ['elephant.code-execution']
const CORE_EDITOR_ADDONS = ['elephant.excalidraw']

describe('builtin addons', () => {
  it('exports only code that is physically bundled with the app', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.addon-packs',
      'elephant.google-keep-import',
      'elephant.codex-connection',
      'elephant.calendar',
      'elephant.sites',
      'elephant.ai',
      'elephant.ai-chat',
      'elephant.ai-search',
      'elephant.wiki',
      'elephant.graph',
      'elephant.open-models',
      'elephant.sync',
      'elephant.code-execution',
      'elephant.excalidraw',
      'elephant.recently-edited'
    ])
    expect(builtinAddons).toContain(addonPacksAddon)
    expect(builtinAddons.map((addon) => addon.manifest.id)).not.toContain('elephant.ai-ocr')
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

  it('marks optional bundled first-party features as disabled and removable by default', () => {
    const optional = builtinAddons.filter((addon) => (
      addon.manifest.id !== 'elephant.addon-packs' && !CORE_EDITOR_ADDONS.includes(addon.manifest.id)
    ))

    expect(optional.every((addon) => addon.manifest.defaultEnabled === false)).toBe(true)
    expect(optional.every((addon) => addon.manifest.removable === true)).toBe(true)
    expect(addonPacksAddon.manifest.removable).toBe(false)
  })

  it('keeps code execution optional but makes Excalidraw a required vanilla editor capability', () => {
    for (const addonId of OPTIONAL_EDITOR_ADDONS) {
      const addon = builtinAddons.find((entry) => entry.manifest.id === addonId)
      expect(addon).toBeDefined()
      expect(addon.manifest.defaultEnabled).toBe(false)
      expect(addon.manifest.removable).toBe(true)
      expect(typeof addon.activate).toBe('function')
    }

    const excalidraw = builtinAddons.find((entry) => entry.manifest.id === 'elephant.excalidraw')
    const addonSystem = read('Elephant/frontend/src/renderer/src/addons/index.js')
    const main = read('Elephant/frontend/src/renderer/src/main.js')
    expect(excalidraw).toBeDefined()
    expect(typeof excalidraw.activate).toBe('function')
    expect(addonSystem).toContain("REQUIRED_BUILTIN_ADDON_IDS = Object.freeze(['elephant.addon-packs', 'elephant.excalidraw'])")
    expect(main).toContain('await ensureCoreExcalidraw(addonManager)')
  })

  it('moves Recently edited into an optional sidebar layout contribution', async () => {
    const addon = builtinAddons.find((entry) => entry.manifest.id === 'elephant.recently-edited')
    const manager = new ElephantAddonManager()
    manager.register(addon)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.layoutZones)).toEqual([])
    await manager.enable(addon.manifest.id)
    expect(manager.getContributions(ADDON_EXTENSION_POINTS.layoutZones))
      .toEqual([expect.objectContaining({
        addonId: 'elephant.recently-edited',
        contribution: expect.objectContaining({ zone: 'sidebar.after-tree' })
      })])
  })
})
