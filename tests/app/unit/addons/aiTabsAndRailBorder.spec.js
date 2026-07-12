import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('AI settings navigation', () => {
  it('has one registry-driven navigation owner and page-only child settings', () => {
    const parentSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')
    const routeSettings = read('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
    const registry = read('Elephant/frontend/src/renderer/src/addons/builtin/aiSettingsRegistry.js')
    const chatSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiChatSettings.vue')
    const searchSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiSearchSettings.vue')
    const ocrSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiOcrSettings.vue')

    expect(parentSettings).toContain('class="en-ai-module-tabs"')
    expect(parentSettings.match(/class="en-ai-module-tabs"/g)).toHaveLength(1)
    expect(parentSettings).not.toContain('AiProviderSettingsPanel')
    expect(parentSettings).not.toContain('en-ai-toolbar')
    expect(parentSettings).toContain('visibleAiSettingsPages')
    expect(parentSettings).toContain(':data-elephant-addon-settings-slot="activePage.slot"')

    expect(registry).toContain("slot: 'ai.chat'")
    expect(registry).toContain("slot: 'ai.search'")
    expect(registry).toContain("slot: 'ai.ocr'")
    expect(registry).toContain('return AI_SETTINGS_PAGES.filter((page) => !page.slot || activeSlots.has(page.slot))')

    expect(routeSettings).not.toContain('en-ai-toolbar')
    expect(routeSettings).not.toContain('en-ai-tabs')
    expect(routeSettings).not.toContain('aiPages')
    expect(chatSettings).toContain('AI_SETTINGS_PAGE_BY_ID.chat')
    expect(searchSettings).toContain('AI_SETTINGS_PAGE_BY_ID.search')
    expect(ocrSettings).toContain('AI_SETTINGS_PAGE_BY_ID.ocr')
    expect(chatSettings).not.toContain(':nth-child')
    expect(searchSettings).not.toContain(':nth-child')
    expect(ocrSettings).not.toContain(':nth-child')
  })

  it('exposes local and subscription models only through active provider contributions', () => {
    const routeSettings = read('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
    const openModels = read('Elephant/frontend/src/renderer/src/addons/builtin/openModels.js')
    const codex = read('Elephant/frontend/src/renderer/src/addons/builtin/codexConnection.js')

    expect(routeSettings).toContain("getContributions('ai.providers')")
    expect(routeSettings).not.toContain('<option v-if="form.localAi.enabled" value="app-local">')
    expect(routeSettings).not.toContain('Unavailable addon provider')
    expect(routeSettings).not.toContain('loadLocalModels')
    expect(routeSettings).toContain('const openModelsAvailable = addonProviders.value.some')
    expect(routeSettings).toContain('if (!openModelsAvailable) localAi.enabled = false')
    expect(openModels).toContain('providerId: PROVIDER_ID')
    expect(openModels).toContain("capabilities: ['chat', 'embedding']")
    expect(codex).toContain("capabilities: ['chat']")
  })

  it('keeps OCR settings owned only by the active OCR contribution', () => {
    const registry = read('Elephant/frontend/src/renderer/src/addons/builtin/aiSettingsRegistry.js')
    const ocrAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/aiOcr.js')

    expect(registry).toContain("slot: 'ai.ocr'")
    expect(ocrAddon).toContain('slot: SETTINGS_PAGE.slot')
    expect(ocrAddon).toContain('render: mountSettingsComponent(ctx, AiOcrSettings)')
  })
})

describe('workspace vertical border alignment', () => {
  it('uses the same rail width in flex layout and title strip divider math', () => {
    const layoutFixes = read('Elephant/frontend/app/styles/runtime-layout-fixes.css')

    expect(layoutFixes).toContain('width: 56px !important')
    expect(layoutFixes).toContain('flex: 0 0 56px !important')
    expect(layoutFixes).toContain('left: calc(56px + var(--en-sidebar-width)) !important')
    expect(layoutFixes).toContain('width: 1px !important')
  })
})
