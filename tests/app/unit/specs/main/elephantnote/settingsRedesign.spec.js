import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const settings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const addonsPanel = () => read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
const addonLogic = () => read('Elephant/frontend/app/components/settings/useAddonsSettings.js')

describe('Elephant settings redesign', () => {
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

  it('mounts optional settings pages only through physical addon contributions', () => {
    const source = settings()
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')
    const importAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/googleKeepImport.js')
    const providers = read('addons/official/ai/main.js')
    const chat = read('addons/official/ai-chat/main.js')
    const search = read('addons/official/ai-search/main.js')
    const ocr = read('addons/official/ai-ocr/main.js')
    const code = read('addons/official/code-execution/main.js')
    const sync = read('addons/official/sync/main.js')
    const sites = read('addons/official/sites/main.js')

    expect(source).toContain('addonStandaloneSections')
    expect(importAddon).toContain("section: 'import'")
    expect(providers).toContain("section: 'ai'")
    expect(providers).toContain("navigationLabel: 'AI'")
    expect(chat).toContain("slot: 'ai.chat'")
    expect(search).toContain("slot: 'ai.search'")
    expect(ocr).toContain("slot: 'ai.ocr'")
    expect(code).toContain("section: 'editor'")
    expect(sync).toContain("section: 'sync'")
    expect(sites).toContain("section: 'sites'")
    expect(builtins).toContain("load: () => import('./googleKeepImport')")
    for (const module of ['ai', 'aiChat', 'aiSearch', 'aiOcr', 'codeExecution', 'sync', 'sites']) {
      expect(builtins).not.toContain(`import('./${module}')`)
    }
  })

  it('keeps official packages independent from the Community Addons boundary', () => {
    const source = settings()
    const panel = addonsPanel()
    const logic = addonLogic()
    const runtime = read('Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js')
    const row = read('Elephant/frontend/app/components/settings/AddonSettingsRow.vue')

    expect(source).toContain('id="en-addons-title-actions"')
    expect(panel).toContain('<Teleport defer to="#en-addons-title-actions">')
    expect(panel).toContain('role="checkbox"')
    expect(panel).toContain(':aria-checked="communityAddonsEnabled"')
    expect(panel).toContain('@click="toggleCommunityAddons"')
    expect(logic).toContain('isOfficialCatalogEntry')
    expect(logic).toContain('communityInstalledAddons')
    expect(logic).toContain("installSource: official ? 'official' : 'catalog'")
    expect(runtime).toContain('const isOfficialRecord')
    expect(runtime).toContain('if (!official && !await externalAddonApi.getCommunityEnabled())')
    expect(row).toContain('locked: { type: Boolean, default: false }')
  })

  it('uses one installed/available browser and groups physical AI modules', () => {
    const panel = addonsPanel()
    const logic = addonLogic()
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AddonPacksSettings.vue')
    const packRuntime = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')

    expect(panel).toContain('class="en-addon-browser"')
    expect(panel).toContain('Installed only')
    expect(panel).toContain('const AI_SUBMODULE_IDS')
    expect(panel).toContain('v-if="selectedEntry.id === AI_PARENT_ID"')
    expect(panel).toContain('class="en-ai-module-list"')
    expect(logic).toContain('installBuiltin(addon.id)')
    expect(logic).toContain('installCatalogAddon')
    expect(logic).toContain('installExternalAddon(selected)')
    expect(packRuntime).toContain("source: 'official'")
    expect(packRuntime).toContain("'elephant.ai', version: '2.1.0'")
    expect(packs).not.toContain('{{ pack.path }}')
  })

  it('keeps Theme and the complete vertical icon bar collapsible', () => {
    const source = settings()
    const organizer = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')
    expect(source).toContain('themeExpanded = !themeExpanded')
    expect(organizer).toContain('@click="toggleCollapsed"')
    expect(organizer).toContain('addDivider')
    expect(organizer).toContain('removeDivider(item.id)')
    expect(organizer).toContain('resetLayout')
    expect(organizer).toContain('vault: Vault')
    expect(organizer).toContain("'sidebar-toggle': PanelLeft")
  })

  it('keeps editor preferences semantic and persistent', () => {
    const source = settings()
    const preferences = read('Elephant/frontend/src/renderer/src/store/preferences.js')
    expect(source).toContain('role="switch"')
    expect(source).toContain(':aria-checked="preferences.showEditorFooter"')
    expect(source).toContain(':aria-checked="!preferences.hideQuickInsertHint"')
    expect(source).toContain("setPreference('quickInsertTrigger'")
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
  })

  it('keeps optional UI owned by each physical package', () => {
    const navigation = read('Elephant/frontend/app/components/navigation/NavigationBar.vue')
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const physicalEntries = [
      ['addons/official/sync/main.js', "registerContribution('top-bar.items'"],
      ['addons/official/sites/main.js', "zone: 'workspace.notes'"],
      ['addons/official/codex-connection/main.js', "registerContribution('ai.providers'"],
      ['addons/official/ai-chat/main.js', "zone: 'shell.right'"],
      ['addons/official/wiki/main.js', 'api.workspace.registerView'],
      ['addons/official/graph/main.js', 'api.workspace.registerView'],
      ['addons/official/open-models/main.js', "registerContribution('ai.providers'"],
      ['addons/official/code-execution/main.js', 'class ElephantCodeExecutionAddon']
    ]
    for (const [file, marker] of physicalEntries) expect(read(file)).toContain(marker)
    expect(navigation).toContain(':is="entry.contribution.component"')
    expect(main).toContain("entry?.contribution?.zone === 'workspace.notes'")
  })
})
