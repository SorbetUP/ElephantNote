import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('core editor and responsive layout regression guards', () => {
  it('keeps Excalidraw installed as a core editor feature and out of addon management', () => {
    const main = read('Elephant/frontend/src/renderer/src/main.js')
    const settings = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')

    expect(main).toContain("const CORE_EXCALIDRAW_ADDON_ID = 'elephant.excalidraw'")
    expect(main).toContain('await addonManager.installBuiltin(CORE_EXCALIDRAW_ADDON_ID)')
    expect(main).toContain('await addonManager.enable(CORE_EXCALIDRAW_ADDON_ID)')
    expect(settings).toContain("const CORE_ADDON_IDS = new Set(['elephant.excalidraw'])")
    expect(settings).toContain('visibleInstalledAddons')
    expect(settings).toContain('visibleAvailableAddons')
  })

  it('does not register Muya UI plugins again on every editor remount', () => {
    const main = read('Elephant/frontend/src/renderer/src/main.js')
    const guard = read('Elephant/frontend/src/renderer/src/platform/muyaPluginRegistrationGuard.js')

    expect(main).toContain('installMuyaPluginRegistrationGuard()')
    expect(guard).toContain('const registered = new Set()')
    expect(guard).toContain('if (id && registered.has(id)) return Muya')
    expect(guard).toContain('originalUse(plugin, options)')
  })

  it('preserves an empty task item at the end of a note', () => {
    const document = read('Elephant/frontend/app/utils/noteDocument.js')

    expect(document).toContain('EMPTY_TRAILING_TASK_RE')
    expect(document).toContain('preserveEmptyTrailingTask(markdown)')
    expect(document).toContain('preserveEmptyTrailingTask(merged)')
  })

  it('keeps raw assets and hidden files out of the navigation tree', () => {
    const sidebar = read('Elephant/frontend/app/components/navigation/SidebarNav.vue')

    expect(sidebar).toContain('const isHiddenPath')
    expect(sidebar).toContain('const isMarkdownEntry')
    expect(sidebar).toContain('filterSidebarEntries(await elephantnoteClient.directory.list(relativePath))')
    expect(sidebar).toContain('filterSidebarEntries(store.rootSidebarEntries)')
  })

  it('contains library cards and settings inside the current window', () => {
    const styles = read('Elephant/frontend/app/styles/runtime-layout-fixes.css')

    expect(styles).toContain('grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr))')
    expect(styles).toContain('overflow-x: hidden !important')
    expect(styles).toContain('max-width: calc(100vw - 2 * clamp(6px, 2vw, 24px))')
    expect(styles).toContain('height: calc(100vh - 12px) !important')
  })

  it('reports rather than pretending that lazy addon chunks reduce installer size', () => {
    const packageJson = read('package.json')
    const report = read('build/scripts/report-renderer-bundle.mjs')

    expect(packageJson).toContain('report-renderer-bundle.mjs')
    expect(report).toContain('optionalBuiltinBytes')
    expect(report).toContain('Lazy chunks reduce startup work, not installer size')
    expect(report).toContain('downloadable .enaddon packages outside the renderer import graph')
  })
})
