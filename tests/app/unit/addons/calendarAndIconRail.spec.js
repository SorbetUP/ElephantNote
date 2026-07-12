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
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))

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

    expect(rail).toContain('activeVaultIconComponent || Vault')
    expect(rail).toContain('PanelLeftClose')
    expect(rail).toContain('PanelLeftOpen')
    expect(rail).toContain(':sidebar-visible')
    expect(rail).not.toContain('<div class="en-rail-separator" />')
    expect(rail).toContain('v-if="item.separator"')
    expect(rail).toContain('visibility: visible; opacity: 1;')
  })

  it('deletes narrow example addons instead of merely hiding them', () => {
    for (const file of [
      'dailyNotes.js',
      'quickCapture.js',
      'vaultOverview.js',
      'addonInspector.js'
    ]) {
      expect(exists(`Elephant/frontend/src/renderer/src/addons/builtin/${file}`)).toBe(false)
    }
    expect(exists('tests/app/unit/addons/builtinAddonsQuality.spec.js')).toBe(false)
  })

  it('renders sidebar additions through generic layout zones', () => {
    const sidebar = read('Elephant/frontend/app/components/navigation/SidebarNav.vue')
    const recent = read('Elephant/frontend/app/components/navigation/RecentlyEditedSidebarSection.vue')
    const addon = read('Elephant/frontend/src/renderer/src/addons/builtin/recentlyEdited.js')

    expect(sidebar).toContain('<AddonIcon :name="entry.contribution.icon" />')
    expect(sidebar).toContain("addonsStore.getContributions('layout.zones')")
    expect(sidebar).toContain("entry?.contribution?.zone === 'sidebar.after-tree'")
    expect(sidebar).toContain(':is="entry.contribution.component"')
    expect(recent).toContain('.en-recent-notes')
    expect(recent).toContain('Recently edited')
    expect(addon).toContain("zone: 'sidebar.after-tree'")
    expect(addon).toContain('defaultEnabled: false')
  })

  it('lets Calendar own its workspace component and lifecycle', () => {
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const calendar = read('Elephant/frontend/src/renderer/src/addons/builtin/calendar.js')
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const workspace = read('Elephant/frontend/app/components/views/CalendarAddonWorkspace.vue')

    expect(exists('Elephant/frontend/app/components/views/CalendarView.vue')).toBe(false)
    expect(main).not.toContain('CalendarView')
    expect(router).not.toContain('CalendarAddonWorkspace')
    expect(router).toContain(':is="view.contribution.component"')
    expect(calendar).toContain("import CalendarAddonWorkspace from 'elephant-front/components/views/CalendarAddonWorkspace.vue'")
    expect(calendar).toContain('component: CalendarAddonWorkspace')
    expect(calendar).toContain('elephantnoteClient.calendar.list()')
    expect(builtins).toContain("load: () => import('./calendar')")
    expect(workspace).toContain('Offline events plus notes grouped by last edit date.')
    expect(workspace).toContain('Import Google Calendar')
  })

  it('does not start Iroh until Sync is enabled and keeps its UI addon-owned', () => {
    const bootstrap = read('Elephant/backend/tauri/src/lib_min.rs')
    const runtime = read('Elephant/backend/tauri/src/sync/mod.rs')
    const commands = read('Elephant/backend/tauri/src/sync_commands.rs')
    const client = read('Elephant/frontend/app/services/irohSyncClient.js')
    const addon = read('Elephant/frontend/src/renderer/src/addons/builtin/sync.js')
    const navigation = read('Elephant/frontend/app/components/navigation/NavigationBar.vue')

    expect(bootstrap).toContain('app.manage(sync::IrohSyncState::new())')
    expect(bootstrap).not.toContain('state.runtime(&sync_handle).await')
    expect(runtime).toContain('runtime: Mutex<Option<Arc<IrohRuntime>>>')
    expect(commands).toContain('rename = "tauri_sync_shutdown"')
    expect(client).toContain("throw new Error('The Sync addon is disabled.')")
    expect(addon).toContain("import SyncNavigationControl from 'elephant-front/components/navigation/SyncNavigationControl.vue'")
    expect(addon).toContain('component: SyncNavigationControl')
    expect(addon).toContain('irohSyncClient.activate()')
    expect(addon).toContain('await irohSyncClient.shutdown()')
    expect(navigation).not.toContain('SyncNavigationControl')
    expect(navigation).toContain(':is="entry.contribution.component"')
  })

  it('keeps Addon Packs as hidden required infrastructure', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/addons/index.js')
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const logic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')

    expect(runtime).toContain("REQUIRED_BUILTIN_ADDON_IDS = Object.freeze(['elephant.addon-packs'])")
    expect(runtime).toContain('if (REQUIRED_BUILTIN_ADDON_IDS.includes(id))')
    expect(logic).toContain("INTERNAL_ADDON_IDS = new Set(['elephant.addon-packs'])")
    expect(logic).toContain('!isHiddenAddonId(addon.manifest.id)')
    expect(panel).not.toContain('Addon Packs is disabled')
  })

  it('keeps AI views, chat and runtime outside the base shell', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const ai = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const renderer = read('Elephant/frontend/src/renderer/src/main.js')
    const graphRuntime = read('Elephant/frontend/app/runtime/graphRuntimeFixes.js')

    expect(shell).not.toContain("import ChatSidebar from './ChatSidebar.vue'")
    expect(shell).not.toContain('aiAddonEnabled')
    expect(shell).toContain("entry?.contribution?.zone === 'shell.right'")
    expect(main).not.toContain('SitePreviewPanel')
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
    expect(sites).toContain("features.set('sitePreview', false)")
  })

  it('uses lazy optional first-party addons and real portable packs', () => {
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')

    expect(builtins).toContain('const createLazyBuiltinAddon')
    expect(builtins).toContain("load: () => import('./ai')")
    expect(builtins).toContain("load: () => import('./excalidraw')")
    expect(builtins).not.toContain("import { aiAddon } from './ai'")
    expect(builtins).not.toContain("import { excalidrawAddon } from './excalidraw'")
    expect(panel).toContain('v-if="filteredInstalledAddons.length || query"')
    expect(packs).toContain("DEVELOP_PARITY_PACK_PATH = `${PACK_DIRECTORY}/develop-parity.enaddonpack`")
    expect(packs).toContain("id: 'elephant.recently-edited'")
    expect(packs).toContain('ctx.addons.installBuiltin(entry.id)')
  })

  it('lets Settings reorder, divide and hide core and addon icons', () => {
    const settings = read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
    const organizer = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const preferences = read('Elephant/frontend/src/renderer/src/store/preferences.js')

    expect(settings).toContain('<icon-rail-layout-settings />')
    expect(organizer).toContain('@dragstart="startDrag(item.id, $event)"')
    expect(organizer).toContain('addDivider')
    expect(organizer).toContain('removeDivider(item.id)')
    expect(organizer).toContain('resetLayout')
    expect(rail).toContain('normalizeIconRailOrder(preferences.iconRailOrder')
    expect(rail).toContain('isIconRailSeparatorId(id)')
    expect(preferences).toContain('iconRailOrder:')
    expect(preferences).toContain('iconRailHidden: []')
  })
})
