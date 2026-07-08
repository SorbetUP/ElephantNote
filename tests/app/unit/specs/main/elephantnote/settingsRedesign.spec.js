import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readSettings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const readSettingsStyles = () => read('Elephant/frontend/app/components/settings/settings-redesign.css')
const readSync = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readAi = () => read('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')

describe('ElephantNote settings redesign', () => {
  it('keeps the floating settings scene while introducing grouped navigation and search', () => {
    const source = readSettings()
    const styles = readSettingsStyles()

    expect(source).toContain('class="en-settings-backdrop"')
    expect(source).toContain('class="en-settings-panel"')
    expect(source).toContain('v-model.trim="settingsQuery"')
    expect(source).toContain("label: 'Workspace'")
    expect(source).toContain("label: 'Services'")
    expect(source).toContain("label: 'Data'")
    expect(styles).toContain('backdrop-filter: blur(18px)')
    expect(styles).toContain('border-radius: 24px')
  })

  it('uses semantic controls instead of text buttons for binary preferences', () => {
    const source = readSettings()

    expect(source).toContain('role="switch"')
    expect(source).toContain(':aria-checked="preferences.showEditorFooter"')
    expect(source).toContain(':aria-checked="preferences.showTagHashInEditor"')
    expect(source).toContain(':aria-checked="featureFlags.sitePreview"')
    expect(source).not.toContain("preferences.showEditorFooter ? 'Visible' : 'Hidden'")
    expect(source).not.toContain("preferences.showTagHashInEditor ? 'Show #' : 'Hide #'")
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

  it('presents Iroh sync as overview, devices and conflicts without replacing real commands', () => {
    const source = readSync()

    expect(source).toContain("activeSyncPage === 'overview'")
    expect(source).toContain("activeSyncPage === 'devices'")
    expect(source).toContain("activeSyncPage === 'conflicts'")
    expect(source).toContain('irohSyncClient.createInvite')
    expect(source).toContain('irohSyncClient.acceptInvite')
    expect(source).toContain('irohSyncClient.run()')
    expect(source).toContain('irohSyncClient.restoreConflict')
    expect(source).toContain('irohSyncClient.deleteConflict')
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
