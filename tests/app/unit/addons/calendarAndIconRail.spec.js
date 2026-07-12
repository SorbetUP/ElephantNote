import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORE_ICON_RAIL_ITEMS,
  DEFAULT_ICON_RAIL_ORDER,
  addonViewRailId,
  createIconRailSeparatorId,
  isIconRailSeparatorId,
  moveIconRailItem,
  normalizeIconRailHidden,
  normalizeIconRailOrder
} from '../../../../Elephant/frontend/app/components/navigation/iconRailLayout.js'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('optional first-party addons and configurable icon rail', () => {
  it('normalizes persisted order as core controls, dividers and addon views change', () => {
    const tasks = addonViewRailId('com.elephantnote.elephant-tasks.workspace')
    const divider = createIconRailSeparatorId()
    const available = ['vault', 'sidebar-toggle', 'dashboard', tasks, 'search']

    expect(CORE_ICON_RAIL_ITEMS.map((item) => item.id)).toEqual([
      'vault',
      'sidebar-toggle',
      'dashboard',
      'search'
    ])
    expect(DEFAULT_ICON_RAIL_ORDER).toEqual(['vault', 'sidebar-toggle', 'dashboard', 'search'])
    expect(isIconRailSeparatorId(divider)).toBe(true)
    expect(normalizeIconRailOrder(['search', divider, 'unknown', 'search', tasks], available))
      .toEqual(['vault', 'sidebar-toggle', 'search', divider, tasks, 'dashboard'])
    expect(normalizeIconRailHidden(['unknown', divider, 'vault', tasks, tasks], available))
      .toEqual(['vault', tasks])
    expect(moveIconRailItem(['vault', 'sidebar-toggle', 'dashboard', divider, tasks], tasks, 0))
      .toEqual([tasks, 'vault', 'sidebar-toggle', 'dashboard', divider])
  })

  it('renders vault and sidebar through the same customizable icon layout', () => {
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const organizer = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')
    const layout = read('Elephant/frontend/app/components/navigation/iconRailLayout.js')
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')

    expect(layout).toContain("{ id: 'vault', label: 'Vault'")
    expect(layout).toContain("{ id: 'sidebar-toggle', label: 'Sidebar'")
    expect(rail).toContain("id: 'vault'")
    expect(rail).toContain("id: 'sidebar-toggle'")
    expect(rail).toContain('icon: PanelLeft')
    expect(rail).not.toContain('PanelLeftClose')
    expect(rail).not.toContain('PanelLeftOpen')
    expect(rail).toContain('activeVaultIconComponent || Vault')
    expect(shell).toContain(':sidebar-visible="sidebarVisible"')
    expect(rail).not.toContain('<div class="en-rail-separator" />')
    expect(rail).toContain('v-if="item.separator"')
    expect(rail).toContain('visibility: visible; opacity: 1;')
    expect(organizer).toContain('vault: Vault')
    expect(organizer).toContain("'sidebar-toggle': PanelLeft")
    expect(organizer).toContain('en-rail-layout-icon-preview')
    expect(organizer).toContain("pushIconRailLog('settings:mounted'")
    expect(rail).toContain("pushIconRailLog('layout:resolved'")
  })

  it('renders Recently edited only through its optional layout contribution', () => {
    const sidebar = read('Elephant/frontend/app/components/navigation/SidebarNav.vue')
    const recentAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/recentlyEdited.js')

    expect(sidebar).toContain("addonsStore.getContributions('layout.zones')")
    expect(sidebar).toContain("entry?.contribution?.zone === 'sidebar.after-tree'")
    expect(sidebar).toContain(':is="entry.contribution.component"')
    expect(recentAddon).toContain("zone: 'sidebar.after-tree'")
    expect(recentAddon).toContain('defaultEnabled: false')
  })

  it('lets Calendar own its workspace component', () => {
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const calendar = read('Elephant/frontend/src/renderer/src/addons/builtin/calendar.js')
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')

    expect(router).toContain(':is="view.contribution.component"')
    expect(router).not.toContain('CalendarAddonWorkspace')
    expect(calendar).toContain("import CalendarAddonWorkspace from 'elephant-front/components/views/CalendarAddonWorkspace.vue'")
    expect(calendar).toContain('component: CalendarAddonWorkspace')
    expect(builtins).toContain("load: () => import('./calendar')")
  })

  it('lets Sync own its runtime and top-bar component', () => {
    const bootstrap = read('Elephant/backend/tauri/src/lib_min.rs')
    const addon = read('Elephant/frontend/src/renderer/src/addons/builtin/sync.js')
    const navigation = read('Elephant/frontend/app/components/navigation/NavigationBar.vue')

    expect(bootstrap).not.toContain('state.runtime(&sync_handle).await')
    expect(addon).toContain("import SyncNavigationControl from 'elephant-front/components/navigation/SyncNavigationControl.vue'")
    expect(addon).toContain('component: SyncNavigationControl')
    expect(addon).toContain('irohSyncClient.activate()')
    expect(addon).toContain('await irohSyncClient.shutdown()')
    expect(navigation).not.toContain('SyncNavigationControl')
    expect(navigation).toContain(':is="entry.contribution.component"')
  })

  it('keeps AI capabilities independently removable but groups them under the AI parent', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const providers = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const providersUi = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const chat = read('Elephant/frontend/src/renderer/src/addons/builtin/aiChat.js')
    const search = read('Elephant/frontend/src/renderer/src/addons/builtin/aiSearch.js')
    const ocr = read('Elephant/frontend/src/renderer/src/addons/builtin/aiOcr.js')
    const wiki = read('Elephant/frontend/src/renderer/src/addons/builtin/wiki.js')
    const graph = read('Elephant/frontend/src/renderer/src/addons/builtin/graph.js')
    const openModels = read('Elephant/frontend/src/renderer/src/addons/builtin/openModels.js')
    const renderer = read('Elephant/frontend/src/renderer/src/main.js')

    expect(shell).not.toContain("import ChatSidebar from './ChatSidebar.vue'")
    expect(shell).toContain("entry?.contribution?.zone === 'shell.right'")
    expect(router).not.toContain('WikiView')
    expect(router).not.toContain('AtomicGraphView')
    expect(router).not.toContain('ModelsView')

    expect(providers).toContain("name: 'AI'")
    expect(providers).not.toContain("name: 'AI Providers'")
    expect(providers).not.toContain('ChatSidebar')
    expect(providers).not.toContain('WikiView')
    expect(providers).not.toContain('AtomicGraphView')
    expect(providers).not.toContain('ModelsView')
    expect(builtins.match(/parentAddonId: 'elephant\.ai'/g)).toHaveLength(5)
    expect(panel).toContain('const GROUPED_ADDON_IDS = new Set(AI_SUBMODULE_IDS)')
    expect(panel).toContain('class="en-ai-module-list"')

    expect(chat).toContain('component: ChatSidebar')
    expect(chat).toContain("icon: 'message-circle'")
    expect(chat).toContain("section: 'ai'")
    expect(chat).toContain("slot: 'ai.chat'")
    expect(search).toContain("section: 'ai'")
    expect(search).toContain("slot: 'ai.search'")
    expect(ocr).toContain("section: 'ai'")
    expect(ocr).toContain("slot: 'ai.ocr'")
    expect(providersUi).toContain('data-elephant-addon-settings-slot="ai.chat"')
    expect(providersUi).toContain('data-elephant-addon-settings-slot="ai.search"')
    expect(providersUi).toContain('data-elephant-addon-settings-slot="ai.ocr"')
    expect(wiki).toContain('component: WikiView')
    expect(graph).toContain('component: AtomicGraphView')
    expect(graph).toContain('installGraphRuntimeFixes(globalThis)')
    expect(openModels).toContain('component: OpenModelsView')
    expect(openModels).toContain("ctx.registerContribution('ai.providers'")
    expect(openModels).not.toContain('autostartLlamaRuntime')
    expect(renderer).not.toContain('installGraphRuntimeFixes')
    expect(renderer).not.toContain('autostartLlamaRuntime')
  })

  it('lets Sites own its workspace panel', () => {
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const sites = read('Elephant/frontend/src/renderer/src/addons/builtin/sites.js')

    expect(main).not.toContain('SitePreviewPanel')
    expect(main).toContain("entry?.contribution?.zone === 'workspace.notes'")
    expect(sites).toContain("import SitePreviewPanel from 'elephant-front/sitePreview/SitePreviewPanel.vue'")
    expect(sites).toContain("zone: 'workspace.notes'")
    expect(sites).toContain('component: SitePreviewPanel')
  })

  it('lazy-loads optional first-party addon logic and keeps Addon Packs plus core Excalidraw required', () => {
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const runtime = read('Elephant/frontend/src/renderer/src/addons/index.js')

    expect(builtins).toContain('const createLazyBuiltinAddon')
    expect(builtins).toContain("load: () => import('./ai')")
    expect(builtins).toContain("load: () => import('./aiChat')")
    expect(builtins).toContain("load: () => import('./aiSearch')")
    expect(builtins).toContain("load: () => import('./aiOcr')")
    expect(builtins).toContain("load: () => import('./wiki')")
    expect(builtins).toContain("load: () => import('./graph')")
    expect(builtins).toContain("load: () => import('./openModels')")
    expect(builtins).toContain("load: () => import('./excalidraw')")
    expect(builtins).not.toContain("import { aiAddon } from './ai'")
    expect(builtins).not.toContain("import { openModelsAddon } from './openModels'")
    expect(builtins).not.toContain("import { excalidrawAddon } from './excalidraw'")
    expect(runtime).toContain("REQUIRED_BUILTIN_ADDON_IDS = Object.freeze(['elephant.addon-packs', 'elephant.excalidraw'])")
  })
})
