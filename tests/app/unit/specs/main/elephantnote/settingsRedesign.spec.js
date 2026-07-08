import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readSettings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const readSettingsStyles = () => read('Elephant/frontend/app/components/settings/settings-redesign.css')
const readSettingsPrimitives = () => read('Elephant/frontend/app/components/settings/settings-primitives.css')
const readSync = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readAi = () => read('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
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
    expect(source).toContain("label: 'Conflict retention'")
    expect(source).toContain("label: 'Semantic search and embeddings'")
    expect(source).toContain('const openSearchResult = (result) =>')
    expect(source).toContain('syncInitialPage.value = result.subpage')
    expect(source).toContain('aiInitialPage.value = result.subpage')
  })

  it('uses a minimal flat navigation and keeps Sites separate from Import', () => {
    const source = readSettings()

    expect(source).toContain("{ id: 'sites', label: 'Sites', icon: Globe2 }")
    expect(source).toContain("{ id: 'import', label: 'Import', icon: Download }")
    expect(source).not.toContain("label: 'Workspace'")
    expect(source).not.toContain("label: 'Services'")
    expect(source).not.toContain("label: 'Data'")
    expect(source).not.toContain('Import & sites')
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

  it('imports one shared visual primitive layer', () => {
    const styles = readSettingsStyles()
    const primitives = readSettingsPrimitives()

    expect(styles).toContain("@import './settings-primitives.css';")
    expect(styles).toContain('Reusable control chrome lives in settings-primitives.css')
    expect(primitives).toContain('--en-ui-control-height: 34px')
    expect(primitives).toContain('--en-ui-card-radius: 14px')
    expect(primitives).toContain(':where(.en-ai-card, .en-sync-card)')
    expect(primitives).toContain(':where(.en-ai-toolbar, .en-sync-toolbar)')
    expect(primitives).toContain(':where(.en-ai-settings button, .en-sync-panel button)')
    expect(primitives).toContain(':where(.en-ai-badge, .en-provider-state, .en-sync-status')
    expect(primitives).toContain(':where(.en-ai-settings input, .en-ai-settings select, .en-ai-settings textarea')
  })

  it('uses one switch geometry for root and nested settings panels', () => {
    const styles = readSettingsStyles()
    const primitives = readSettingsPrimitives()

    expect(styles).not.toContain('.en-settings-panel .en-switch,')
    expect(primitives).toContain('.en-settings-panel .en-switch,')
    expect(primitives).toContain('.en-settings-panel :deep(.en-ai-switch)')
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

  it('uses one Sync page with a focused pairing dialog and directly editable retention', () => {
    const source = readSync()

    expect(source).toContain('class="en-sync-card en-sync-hero"')
    expect(source).toContain('<h4>Devices</h4>')
    expect(source).toContain('<h4>Conflict protection</h4>')
    expect(source).toContain('class="en-pair-modal"')
    expect(source).toContain("pairingMode === 'create'")
    expect(source).toContain("pairingMode === 'join'")
    expect(source).not.toContain('class="en-sync-toolbar"')
    expect(source).not.toContain('activeSyncPage')
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
