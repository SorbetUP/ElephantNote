import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))
const readSettings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const readSettingsStyles = () => read('Elephant/frontend/app/components/settings/settings-redesign.css')
const readSettingsPrimitives = () => read('Elephant/frontend/app/components/settings/settings-primitives.css')
const readSync = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readAi = () => read('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
const readAddons = () => read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
const readAddonRow = () => read('Elephant/frontend/app/components/settings/AddonSettingsRow.vue')
const readAddonStore = () => read('Elephant/frontend/src/renderer/src/store/addons.js')
const readAppShell = () => read('Elephant/frontend/app/components/shell/AppShell.vue')
const readRouter = () => read('Elephant/frontend/src/renderer/src/router/index.js')
const readPreferences = () => read('Elephant/frontend/src/renderer/src/store/preferences.js')

describe('ElephantNote settings redesign', () => {
  it('keeps the floating scene with theme-aware blur and native platform chrome', () => {
    const source = readSettings()
    const styles = readSettingsStyles()

    expect(source).toContain('class="en-settings-backdrop"')
    expect(source).toContain('class="en-settings-panel"')
    expect(source).toContain("'is-macos': isMacOS")
    expect(source).toContain('aria-modal="true"')
    expect(source).not.toContain('en-settings-app-mark')
    expect(styles).toContain('backdrop-filter: blur(30px)')
    expect(styles).toContain('var(--en-primary')
    expect(styles).toContain('grid-template-areas: "close title search"')
  })

  it('searches individual settings across every section and opens nested pages', () => {
    const source = readSettings()

    expect(source).toContain('placeholder="Search all settings"')
    expect(source).toContain('const settingsIndex = [')
    expect(source).toContain("label: 'Quick insert trigger'")
    expect(source).toContain("label: 'Installed addons'")
    expect(source).toContain("label: 'Conflict retention'")
    expect(source).toContain("label: 'Semantic search and embeddings'")
    expect(source).toContain('const openSearchResult = (result) =>')
    expect(source).toContain('syncInitialPage.value = result.subpage')
    expect(source).toContain('aiInitialPage.value = result.subpage')
  })

  it('opens a requested section through the active modal instead of a legacy route', () => {
    const settings = readSettings()
    const shell = readAppShell()

    expect(shell).toContain(':initial-section="settingsInitialSection"')
    expect(shell).toContain("window.addEventListener('elephantnote:open-settings', handleOpenSettingsEvent)")
    expect(settings).toContain("initialSection: { type: String, default: 'appearance' }")
    expect(settings).toContain('const normalizeSection = (section) =>')
    expect(settings).toContain('const activeSection = ref(normalizeSection(props.initialSection))')
    expect(settings).toContain("watch(() => props.initialSection")
  })

  it('uses a minimal flat navigation and keeps Addons, Sites and Import separate', () => {
    const source = readSettings()

    expect(source).toContain("{ id: 'addons', label: 'Addons', icon: Package }")
    expect(source).toContain("{ id: 'sites', label: 'Sites', icon: Globe2 }")
    expect(source).toContain("{ id: 'import', label: 'Import', icon: Download }")
    expect(source).not.toContain("label: 'Workspace'")
    expect(source).not.toContain("label: 'Services'")
    expect(source).not.toContain("label: 'Data'")
    expect(source).not.toContain('Import & sites')
  })

  it('uses one consent gate before rendering addon management', () => {
    const addons = readAddons()

    expect(addons).toContain('v-else-if="!communityAddonsEnabled"')
    expect(addons).toContain('Turn on community addons')
    expect(addons).toContain('v-model="riskAccepted"')
    expect(addons).toContain('setCommunityAddonsEnabled(true)')
    expect(addons).toContain('<template v-else>')
    expect(addons).not.toContain('en-addons-summary')
  })

  it('integrates compact real addon controls into the active settings panel', () => {
    const settings = readSettings()
    const addons = readAddons()
    const row = readAddonRow()

    expect(settings).toContain("activeSection === 'addons'")
    expect(settings).toContain('<addons-settings-panel />')
    expect(settings).toContain("import AddonsSettingsPanel from './AddonsSettingsPanel.vue'")
    expect(addons).toContain('useAddonsStore()')
    expect(addons).toContain('getAddonActions(contributions.value)')
    expect(addons).toContain('installExternalAddon(selected)')
    expect(addons).toContain('setAddonEnabled(addon.manifest.id')
    expect(addons).toContain('runAction(action.id)')
    expect(addons).toContain('<addon-settings-row')
    expect(row).toContain('role="switch"')
    expect(row).toContain("emit('run-action', action)")
    expect(row).toContain("addon.manifest.source === 'external'")
    expect(addons).toContain("log.info('[settings:addons] mounted'")
  })

  it('refreshes the real vault and opens notes produced by addon commands', () => {
    const store = readAddonStore()

    expect(store).toContain('refreshVaultAfterAddonAction')
    expect(store).toContain("import('elephant-front/stores/vaultStore')")
    expect(store).toContain("import('elephant-front/services/elephantnoteClient')")
    expect(store).toContain("elephantnoteClient.directory.list('')")
    expect(store).toContain('vaultStore.openNote(createdEntry)')
    expect(store).toContain("'[addons] action:start'")
    expect(store).toContain("'[addons] action:done'")
  })

  it('removes the dead legacy Addons settings route and component', () => {
    const router = readRouter()

    expect(router).not.toContain("import AddonsSettings from '@/prefComponents/addons'")
    expect(router).not.toContain("path: 'addons'")
    expect(exists('Elephant/frontend/src/renderer/src/prefComponents/addons/index.vue')).toBe(false)
  })

  it('uses semantic controls and exposes real quick-insert preferences', () => {
    const source = readSettings()
    const preferences = readPreferences()

    expect(source).toContain('role="switch"')
    expect(source).toContain(':aria-checked="preferences.showEditorFooter"')
    expect(source).toContain(':aria-checked="!preferences.hideQuickInsertHint"')
    expect(source).toContain("setPreference('quickInsertTrigger'")
    expect(source).toContain("setPreference('autoPairBracket'")
    expect(source).toContain("setPreference('spellcheckerEnabled'")
    expect(source).toContain(':aria-checked="featureFlags.sitePreview"')
    expect(preferences).toContain('hideQuickInsertHint: false')
    expect(preferences).toContain("quickInsertTrigger: '/'")
    expect(preferences).toContain('autoPairBracket: true')
  })

  it('imports one shared visual primitive layer for AI, Sync and Addons', () => {
    const styles = readSettingsStyles()
    const primitives = readSettingsPrimitives()
    const addons = readAddons()
    const row = readAddonRow()

    expect(styles).toContain("@import './settings-primitives.css';")
    expect(styles).toContain('Reusable control chrome lives in settings-primitives.css')
    expect(primitives).toContain('--en-ui-control-height: 34px')
    expect(primitives).toContain('--en-ui-card-radius: 14px')
    expect(primitives).toContain(':where(.en-ai-card, .en-sync-card, .en-addons-card)')
    expect(primitives).toContain(':where(.en-ai-toolbar, .en-sync-toolbar)')
    expect(primitives).toContain('.en-addons-panel .en-primary-button')
    expect(primitives).toContain('.en-addons-panel .en-switch')
    expect(primitives).toContain(':where(.en-ai-badge, .en-provider-state, .en-sync-status')
    expect(addons).not.toContain('.en-addons-mode-row .en-switch {')
    expect(row).not.toContain('.en-switch {')
  })

  it('uses one switch geometry for root and nested settings panels', () => {
    const styles = readSettingsStyles()
    const primitives = readSettingsPrimitives()

    expect(styles).not.toContain('.en-settings-panel .en-switch,')
    expect(primitives).toContain('.en-settings-panel .en-switch,')
    expect(primitives).toContain('.en-ai-switch, .en-addons-panel .en-switch')
    expect(primitives).toContain('display: block !important')
    expect(primitives).toContain('transform: translateX(0) !important')
    expect(primitives).toContain('transform: translateX(18px) !important')
    expect(primitives).toContain('.en-settings-panel :deep(.en-ai-switch.small.active > span)')
  })

  it('retains real vault, import and generated-site actions', () => {
    const source = readSettings()

    expect(source).toContain('await vaultStore.removeVault(vault.id)')
    expect(source).toContain('await elephantnoteClient.imports.googleKeep()')
    expect(source).toContain('await elephantnoteClient.sources.ingestUrl')
    expect(source).toContain('await elephantnoteClient.sources.importRss')
    expect(source).toContain("toggleFeature('sitePreview')")
    expect(source).toContain('sitePreviewStore.openPreviewExternal')
  })

  it('keeps Sync navigation at the top and makes retention directly editable', () => {
    const source = readSync()

    expect(source).toContain('class="en-sync-toolbar"')
    expect(source).toContain("activeSyncPage === 'overview'")
    expect(source).toContain("activeSyncPage === 'devices'")
    expect(source).toContain("activeSyncPage === 'conflicts'")
    expect(source).toContain('v-model.number="retentionDays"')
    expect(source).toContain('@click="saveRetention"')
    expect(source).toContain('initialPage: { type: String')
    expect(source).toContain('irohSyncClient.createInvite')
    expect(source).toContain('irohSyncClient.acceptInvite')
    expect(source).toContain('irohSyncClient.run()')
    expect(source).toContain('irohSyncClient.restoreConflict')
    expect(source).toContain('irohSyncClient.deleteConflict')
  })

  it('removes the redundant AI hero, provider action and Codex duplication', () => {
    const source = readAi()
    const addProviderButtons = source.match(/@click="addProvider"/g) || []

    expect(source).toContain('class="en-ai-toolbar"')
    expect(source).not.toContain('en-ai-hero')
    expect(source).not.toContain('Elephant AI')
    expect(addProviderButtons).toHaveLength(1)
    expect(source).toContain('class="en-ai-setting-row en-codex-row"')
    expect(source).not.toContain('<h4>Codex account</h4>')
    expect(source).toContain('initialPage: { type: String')
  })

  it('separates common AI controls from advanced technical tuning', () => {
    const source = readAi()

    expect(source).toContain('class="en-ai-advanced"')
    expect(source).toContain('Advanced generation settings')
    expect(source).toContain('Advanced indexing settings')
    expect(source).toContain('role="switch"')
    expect(source).toContain('form.routes.chat.temperature')
    expect(source).toContain('form.routes.embedding.chunkOverlap')
    expect(source).toContain('form.routes.ocr.confidenceThreshold')
  })

  it('keeps AI configuration, provider tests and autosave connected to real clients', () => {
    const source = readAi()

    expect(source).toContain('await elephantnoteClient.ai.getConfig()')
    expect(source).toContain('await elephantnoteClient.ai.setConfig')
    expect(source).toContain('await elephantnoteClient.ai.testConfig')
    expect(source).toContain('await elephantnoteClient.search.rebuild?.()')
    expect(source).toContain("scheduleAutosave('form-watch')")
    expect(source).toContain("saveConfig({ silent: true, reason: 'settings-close' })")
  })
})
