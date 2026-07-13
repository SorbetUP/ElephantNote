import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADDON_EXTENSION_POINTS, ElephantAddonManager } from '@/addons'
import { addonPacksAddon, builtinAddons } from '@/addons/builtin'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const CORE_EDITOR_ADDONS = ['elephant.excalidraw']
const PHYSICAL_ADDONS = [
  'ai',
  'ai-chat',
  'ai-search',
  'ai-ocr',
  'wiki',
  'graph',
  'open-models',
  'codex-connection',
  'sync',
  'calendar',
  'sites',
  'code-execution'
]

const PHYSICAL_IDS = [
  'elephant.ai',
  'elephant.ai-chat',
  'elephant.ai-search',
  'elephant.ai-ocr',
  'elephant.wiki',
  'elephant.graph',
  'elephant.open-models',
  'elephant.codex-connection',
  'elephant.sync',
  'elephant.calendar',
  'elephant.sites',
  'elephant.code-execution'
]

describe('builtin addons', () => {
  it('exports only code that remains physically bundled with the app', () => {
    expect(builtinAddons.map((addon) => addon.manifest.id)).toEqual([
      'elephant.addon-packs',
      'elephant.google-keep-import',
      'elephant.excalidraw',
      'elephant.recently-edited'
    ])
    expect(builtinAddons).toContain(addonPacksAddon)
    expect(builtinAddons.map((addon) => addon.manifest.id))
      .not.toEqual(expect.arrayContaining(PHYSICAL_IDS))
    for (const slug of PHYSICAL_ADDONS) {
      expect(read(`addons/official/${slug}/manifest.json`)).toContain('"runtime"')
      expect(read(`addons/official/${slug}/main.js`).length).toBeGreaterThan(20)
    }
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

  it('keeps code execution physical but makes Excalidraw a required vanilla editor capability', () => {
    const codeExecutionManifest = read('addons/official/code-execution/manifest.json')
    const codeExecutionEntry = read('addons/official/code-execution/main.js')
    expect(codeExecutionManifest).toContain('"id": "elephant.code-execution"')
    expect(codeExecutionEntry).toContain('class ElephantCodeExecutionAddon')

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
