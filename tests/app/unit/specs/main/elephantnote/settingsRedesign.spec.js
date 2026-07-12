import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))
const settings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const addonsPanel = () => read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
const addonLogic = () => read('Elephant/frontend/app/components/settings/useAddonsSettings.js')

describe('ElephantNote settings redesign', () => {
  it('keeps the floating modal, search and indispensable core sections', () => {
    const source = settings()
    const styles = read('Elephant/frontend/app/components/settings/settings-redesign.css')

    expect(source).toContain('class="en-settings-backdrop"')
    expect(source).toContain('class="en-settings-panel"')
    expect(source).toContain('placeholder="Search all settings"')
    expect(source).toContain("{ id: 'appearance', label: 'Appearance'")
    expect(source).toContain("{ id: 'editor', label: 'Editor'")
    expect(source).toContain("{ id: 'vaults', label: 'Vaults'")
    expect(source).toContain("{ id: 'addons', label: 'Addons'")
    expect(source).not.toContain("{ id: 'sync', label: 'Sync'")
    expect(source).not.toContain("{ id: 'ai', label: 'AI'")
    expect(styles).toContain('backdrop-filter: blur(30px)')
  })

  it('indexes installed addon settings without restoring legacy catalogue labels', () => {
    const source = settings()

    expect(source).toContain('const settingsIndex = computed')
    expect(source).toContain("addonsStore.getContributions('settings.sections')")
    expect(source).toContain("label: 'Installed addons'")
    expect(source).toContain("label: 'Addon packs'")
    expect(source).not.toContain("label: 'Built-in addon catalogue'")
  })

  it('mounts optional settings pages only through addon contributions', () => {
    const source = settings()
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const importAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/googleKeepImport.js')
    const sitesAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/sites.js')
    const aiAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const syncAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/sync.js')

    expect(source).toContain('addonStandaloneSections')
    expect(importAddon).toContain("section: 'import'")
    expect(sitesAddon).toContain("section: 'sites'")
    expect(aiAddon).toContain("section: 'ai'")
    expect(syncAddon).toContain("section: 'sync'")
    expect(builtins).toContain("load: () => import('./googleKeepImport')")
    expect(builtins).toContain("load: () => import('./sites')")
    expect(builtins).toContain("load: () => import('./ai')")
    expect(builtins).toContain("load: () => import('./sync')")
  })

  it('uses the compact persisted Community Addons checkbox', () => {
    const source = settings()
    const panel = addonsPanel()
    const logic = addonLogic()

    expect(source).toContain('id="en-addons-title-actions"')
    expect(panel).toContain('<Teleport defer to="#en-addons-title-actions">')
    expect(panel).toContain('role="checkbox"')
    expect(panel).toContain(':aria-checked="communityAddonsEnabled"')
    expect(panel).toContain('@click="toggleCommunityAddons"')
    expect(logic).toContain('setCommunityAddonsEnabled(true)')
    expect(logic).toContain('setCommunityAddonsEnabled(false)')
    expect(logic).not.toContain("showMessage('Community addons enabled.')")
    expect(logic).not.toContain("showMessage('Community addons disabled.')")
  })

  it('hides the empty installed section and keeps real install/remove actions', () => {
    const panel = addonsPanel()
    const logic = addonLogic()
    const row = read('Elephant/frontend/app/components/settings/AddonSettingsRow.vue')

    expect(panel).toContain('v-if="filteredInstalledAddons.length || query"')
    expect(panel).not.toContain('No optional addon is installed.')
    expect(panel).toContain('Available addons')
    expect(logic).toContain('installBuiltin(addon.id)')
    expect(logic).toContain('uninstallBuiltin(addon.manifest.id)')
    expect(logic).toContain('installExternalAddon(selected)')
    expect(logic).toContain('setAddonEnabled(addon.manifest.id')
    expect(row).toContain('confirmingUninstall')
    expect(row).toContain('role="switch"')
  })

  it('keeps Theme and the complete vertical icon bar collapsible without redundant copy', () => {
    const source = settings()
    const organizer = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')

    expect(source).toContain('themeExpanded = !themeExpanded')
    expect(source).not.toContain('Choose the visual family used throughout ElephantNote.')
    expect(source).not.toContain('Reorder or hide native features and enabled addon workspaces.')
    expect(organizer).toContain('@click="toggleCollapsed"')
    expect(organizer).toContain('addDivider')
    expect(organizer).toContain('removeDivider(item.id)')
    expect(organizer).toContain('resetLayout')
    expect(organizer).toContain('vault: Vault')
    expect(organizer).toContain("'sidebar-toggle': PanelLeft")
    expect(organizer).toContain('en-rail-layout-icon-preview')
  })

  it('keeps editor preferences semantic and persistent', () => {
    const source = settings()
    const preferences = read('Elephant/frontend/src/renderer/src/store/preferences.js')

    expect(source).toContain('role="switch"')
    expect(source).toContain(':aria-checked="preferences.showEditorFooter"')
    expect(source).toContain(':aria-checked="!preferences.hideQuickInsertHint"')
    expect(source).toContain("setPreference('quickInsertTrigger'")
    expect(source).toContain("setPreference('autoPairBracket'")
    expect(preferences).toContain('hideQuickInsertHint: false')
    expect(preferences).toContain("quickInsertTrigger: '/'")
  })

  it('uses shared settings primitives for root and addon pages', () => {
    const redesign = read('Elephant/frontend/app/components/settings/settings-redesign.css')
    const primitives = read('Elephant/frontend/app/components/settings/settings-primitives.css')

    expect(redesign).toContain("@import './settings-primitives.css';")
    expect(primitives).toContain('--en-ui-control-height: 34px')
    expect(primitives).toContain('--en-ui-card-radius: 14px')
    expect(primitives).toContain('.en-addons-panel .en-primary-button')
    expect(primitives).toContain('.en-addons-panel .en-switch')
  })

  it('keeps Sync, Sites, Codex and AI UI owned by their addon modules', () => {
    const sync = read('Elephant/frontend/src/renderer/src/addons/builtin/sync.js')
    const sites = read('Elephant/frontend/src/renderer/src/addons/builtin/sites.js')
    const codex = read('Elephant/frontend/src/renderer/src/addons/builtin/codexConnection.js')
    const ai = read('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')
    const navigation = read('Elephant/frontend/app/components/navigation/NavigationBar.vue')
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')

    expect(sync).toContain('component: SyncNavigationControl')
    expect(navigation).not.toContain('SyncNavigationControl')
    expect(navigation).toContain(':is="entry.contribution.component"')
    expect(sites).toContain('component: SitePreviewPanel')
    expect(main).not.toContain('SitePreviewPanel')
    expect(codex).toContain("ctx.registerContribution('ai.providers'")
    expect(ai).toContain('component: ChatSidebar')
    expect(ai).toContain('component: WikiView')
    expect(ai).toContain('component: AtomicGraphView')
    expect(ai).toContain('component: ModelsView')
  })

  it('keeps addon-specific shell components absent until their lazy addon loads', () => {
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')

    expect(shell).not.toContain("import ChatSidebar from './ChatSidebar.vue'")
    expect(shell).not.toContain('aiAddonEnabled')
    expect(shell).toContain("entry?.contribution?.zone === 'shell.right'")
    expect(router).toContain(':is="view.contribution.component"')
    expect(router).not.toContain('WikiView')
    expect(router).not.toContain('CalendarAddonWorkspace')
    expect(main).not.toContain('SitePreviewPanel')
    expect(builtins).not.toContain("import { aiAddon } from './ai'")
    expect(builtins).not.toContain("import { excalidrawAddon } from './excalidraw'")
  })

  it('removes the legacy Addons route and component', () => {
    const router = read('Elephant/frontend/src/renderer/src/router/index.js')

    expect(router).not.toContain("import AddonsSettings from '@/prefComponents/addons'")
    expect(router).not.toContain("path: 'addons'")
    expect(exists('Elephant/frontend/src/renderer/src/prefComponents/addons/index.vue')).toBe(false)
  })
})
