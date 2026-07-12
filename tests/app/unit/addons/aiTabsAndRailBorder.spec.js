import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('AI settings navigation', () => {
  it('has one navigation owner and page-only child settings', () => {
    const parentSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')
    const routeSettings = read('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
    const chatSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiChatSettings.vue')
    const searchSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiSearchSettings.vue')
    const ocrSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiOcrSettings.vue')

    expect(parentSettings).toContain('class="en-ai-module-tabs"')
    expect(parentSettings.match(/class="en-ai-module-tabs"/g)).toHaveLength(1)
    expect(parentSettings).not.toContain('AiProviderSettingsPanel')
    expect(parentSettings).not.toContain('en-ai-toolbar')
    expect(parentSettings).toContain("getContributions('settings.sections')")
    expect(parentSettings).toContain("activeAiSlots.value.has('ai.ocr')")

    expect(routeSettings).not.toContain('en-ai-toolbar')
    expect(routeSettings).not.toContain('en-ai-tabs')
    expect(routeSettings).not.toContain('aiPages')
    expect(chatSettings).toContain('page="chat"')
    expect(searchSettings).toContain('page="embedding"')
    expect(ocrSettings).toContain('page="ocr"')
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
    expect(routeSettings).toContain("if (!openModelsAvailable) localAi.enabled = false")
    expect(openModels).toContain("providerId: PROVIDER_ID")
    expect(openModels).toContain("capabilities: ['chat', 'embedding']")
    expect(codex).toContain("capabilities: ['chat']")
  })

  it('keeps OCR settings owned only by the OCR addon contribution', () => {
    const parentSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')
    const ocrAddon = read('Elephant/frontend/src/renderer/src/addons/builtin/aiOcr.js')

    expect(parentSettings).toContain("activeAiSlots.value.has('ai.ocr')")
    expect(ocrAddon).toContain("slot: 'ai.ocr'")
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
