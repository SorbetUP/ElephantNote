import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addonViewRailId,
  moveIconRailItem,
  normalizeIconRailHidden,
  normalizeIconRailOrder
} from '../../../../Elephant/frontend/app/components/navigation/iconRailLayout.js'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))

describe('optional first-party addons and configurable icon rail', () => {
  it('normalizes persisted order as features and addon views change', () => {
    const tasks = addonViewRailId('com.elephantnote.elephant-tasks.workspace')
    const available = ['dashboard', 'wiki', tasks, 'search']

    expect(normalizeIconRailOrder(['search', 'unknown', 'search', tasks], available))
      .toEqual(['search', tasks, 'dashboard', 'wiki'])
    expect(normalizeIconRailHidden(['unknown', tasks, tasks], available)).toEqual([tasks])
    expect(moveIconRailItem(['dashboard', 'wiki', tasks], tasks, 0)).toEqual([tasks, 'dashboard', 'wiki'])
  })

  it('removes Calendar from the vanilla shell and registers it as disabled addon', () => {
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const calendar = read('Elephant/frontend/src/renderer/src/addons/builtin/calendar.js')
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')

    expect(exists('Elephant/frontend/app/components/views/CalendarView.vue')).toBe(false)
    expect(main).not.toContain('CalendarView')
    expect(main).not.toContain("activeWorkspaceView === 'calendar'")
    expect(rail).not.toContain("store.setWorkspaceView('calendar')")
    expect(calendar).toContain("const ADDON_ID = 'elephant.calendar'")
    expect(calendar).toContain('id: ADDON_ID')
    expect(calendar).toContain('defaultEnabled: false')
    expect(calendar).toContain("icon: 'calendar-days'")
    expect(calendar).toContain("kind: 'calendar-v1'")
    expect(calendar).toContain('elephantnoteClient.calendar.list()')
    expect(builtins).toContain('calendarAddon')
  })

  it('preserves the original Calendar workspace while the addon owns its data and lifecycle', () => {
    const workspace = read('Elephant/frontend/app/components/views/CalendarAddonWorkspace.vue')

    expect(workspace).toContain('Offline events plus notes grouped by last edit date.')
    expect(workspace).toContain('Import Google Calendar')
    expect(workspace).toContain('store.calendarBuckets')
    expect(workspace).toContain('bucketCalendarEvents(calendarEvents.value)')
    expect(workspace).toContain("dispatch('importGoogle')")
    expect(workspace).not.toContain('ScheduleXCalendar')
    expect(workspace).not.toContain('Addon workspace')
    expect(workspace).not.toContain("value: 'month-grid'")
  })

  it('does not start Iroh until Sync is enabled and shuts it down on disable', () => {
    const bootstrap = read('Elephant/backend/tauri/src/lib_min.rs')
    const runtime = read('Elephant/backend/tauri/src/sync/mod.rs')
    const commands = read('Elephant/backend/tauri/src/sync_commands.rs')
    const client = read('Elephant/frontend/app/services/irohSyncClient.js')
    const addon = read('Elephant/frontend/src/renderer/src/addons/builtin/sync.js')

    expect(bootstrap).toContain('app.manage(sync::IrohSyncState::new())')
    expect(bootstrap).not.toContain('state.runtime(&sync_handle).await')
    expect(bootstrap).toContain('sync_commands::iroh_sync_shutdown')
    expect(runtime).toContain('runtime: Mutex<Option<Arc<IrohRuntime>>>')
    expect(runtime).toContain('pub async fn shutdown(&self)')
    expect(runtime).toContain('guard.take()')
    expect(commands).toContain('rename = "tauri_sync_shutdown"')
    expect(client).toContain("invoke('tauri_sync_shutdown')")
    expect(client).toContain("throw new Error('The Sync addon is disabled.')")
    expect(addon).toContain('irohSyncClient.activate()')
    expect(addon).toContain('await irohSyncClient.shutdown()')
    expect(addon).toContain('defaultEnabled: false')
  })

  it('removes optional AI and Sites shell elements with their addons', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const ai = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const sites = read('Elephant/frontend/src/renderer/src/addons/builtin/sites.js')

    expect(shell).toContain('aiAddonEnabled && store.chatSidebarOpen')
    expect(shell).toContain("addon.manifest.id === 'elephant.ai' && addon.enabled")
    expect(main).toContain('sitesAddonEnabled && !hasOpenNote')
    expect(main).toContain("addon.manifest.id === 'elephant.sites' && addon.enabled")
    expect(ai).toContain('store.chatSidebarOpen = false')
    expect(sites).toContain("features.set('sitePreview', false)")
    expect(sites).toContain('await previewStore.stopPreview()')
  })

  it('separates addon management from real portable addon packs and persists community shutdown', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const logic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')
    const packUi = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AddonPacksSettings.vue')

    expect(panel).toContain("activePage === 'addons'")
    expect(panel).toContain("activePage === 'packs'")
    expect(panel).toContain('data-elephant-addon-settings-slot="addons.packs"')
    expect(panel).toContain('Installed addons')
    expect(panel).toContain('Built-in addon catalogue')
    expect(panel).toContain('Installed community addons')
    expect(logic).toContain("invoke('tauri_addons_set_enabled'")
    expect(logic).toContain('installedExternalAddons.map')
    expect(packs).toContain("slot: 'addons.packs'")
    expect(packs).toContain("DEVELOP_PARITY_PACK_PATH = `${PACK_DIRECTORY}/develop-parity.enaddonpack`")
    expect(packs).toContain("id: 'elephant.ai'")
    expect(packs).toContain("id: 'elephant.sync'")
    expect(packs).toContain('ctx.addons.installBuiltin(entry.id)')
    expect(packUi).toContain("addonsStore.runAction('elephant.addon-packs.ensure-develop-parity')")
    expect(packUi).toContain('Restore complete app')
    expect(packUi).not.toContain('samplePacks')
  })

  it('lets Settings reorder and hide core and addon icons while keeping safety controls fixed', () => {
    const settings = read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
    const organizer = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const preferences = read('Elephant/frontend/src/renderer/src/store/preferences.js')

    expect(settings).toContain('<icon-rail-layout-settings />')
    expect(settings).toContain("label: 'Vertical icon bar'")
    expect(organizer).toContain('@dragstart="startDrag(item.id, $event)"')
    expect(organizer).toContain('toggleVisibility(item.id)')
    expect(organizer).toContain('resetLayout')
    expect(rail).toContain('normalizeIconRailOrder(preferences.iconRailOrder')
    expect(rail).toContain("addonsStore.getContributions('views')")
    expect(preferences).toContain('iconRailOrder:')
    expect(preferences).toContain('iconRailHidden: []')
    expect(organizer).toContain('Settings button remain fixed')
  })
})
