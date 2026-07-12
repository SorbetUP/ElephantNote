import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
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
  it('normalizes persisted order as features, dividers and addon views change', () => {
    const tasks = addonViewRailId('com.elephantnote.elephant-tasks.workspace')
    const divider = createIconRailSeparatorId()
    const available = ['dashboard', tasks, 'search']

    expect(isIconRailSeparatorId(divider)).toBe(true)
    expect(normalizeIconRailOrder(['search', divider, 'unknown', 'search', tasks], available))
      .toEqual(['search', divider, tasks, 'dashboard'])
    expect(normalizeIconRailHidden(['unknown', divider, tasks, tasks], available)).toEqual([tasks])
    expect(moveIconRailItem(['dashboard', divider, tasks], tasks, 0)).toEqual([tasks, 'dashboard', divider])
  })

  it('does not render an implicit divider and keeps vault/sidebar controls visible', () => {
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')

    expect(rail).toContain('activeVaultIconComponent || Vault')
    expect(rail).toContain('PanelLeftClose')
    expect(rail).toContain('PanelLeftOpen')
    expect(shell).toContain(':sidebar-visible="sidebarVisible"')
    expect(rail).not.toContain('<div class="en-rail-separator" />')
    expect(rail).toContain('v-if="item.separator"')
    expect(rail).toContain('visibility: visible; opacity: 1;')
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

  it('keeps AI views, chat and runtime outside the base shell', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const ai = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const renderer = read('Elephant/frontend/src/renderer/src/main.js')
    const graphRuntime = read('Elephant/frontend/app/runtime/graphRuntimeFixes.js')

    expect(shell).not.toContain("import ChatSidebar from './ChatSidebar.vue'")
    expect(shell).not.toContain('aiAddonEnabled')
    expect(shell).toContain("entry?.contribution?.zone === 'shell.right'")
    expect(router).not.toContain('WikiView')
    expect(router).not.toContain('AtomicGraphView')
    expect(router).not.toContain('ModelsView')
    expect(ai).toContain('component: WikiView')
    expect(ai).toContain('component: AtomicGraphView')
    expect(ai).toContain('component: ModelsView')
    expect(ai).toContain('component: ChatSidebar')
    expect(ai).toContain('installGraphRuntimeFixes(globalThis)')
    expect(ai).toContain('autostartLlamaRuntime')
    expect(renderer).not.toContain('installGraphRuntimeFixes')
    expect(renderer).not.toContain('autostartLlamaRuntime')
    expect(graphRuntime).toContain('dispose()')
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

  it('lazy-loads optional first-party addon logic and keeps Addon Packs required', () => {
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const runtime = read('Elephant/frontend/src/renderer/src/addons/index.js')

    expect(builtins).toContain('const createLazyBuiltinAddon')
    expect(builtins).toContain("load: () => import('./ai')")
    expect(builtins).toContain("load: () => import('./excalidraw')")
    expect(builtins).not.toContain("import { aiAddon } from './ai'")
    expect(builtins).not.toContain("import { excalidrawAddon } from './excalidraw'")
    expect(runtime).toContain("REQUIRED_BUILTIN_ADDON_IDS = Object.freeze(['elephant.addon-packs'])")
  })
})
