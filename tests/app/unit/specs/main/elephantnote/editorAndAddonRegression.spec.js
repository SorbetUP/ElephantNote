import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('editor and addon regression guards', () => {
  it('keeps structural Markdown blocks on Muya native insertion paths', () => {
    const quickInsert = read('Elephant/frontend/src/muya/lib/ui/quickInsert/config.js')

    expect(quickInsert).toContain("label: 'ul-task'")
    expect(quickInsert).toContain("label: 'ul-bullet'")
    expect(quickInsert).toContain("label: 'ol-order'")
    expect(quickInsert).toContain("label: 'table'")
    expect(quickInsert).toContain("label: 'blockquote'")
    expect(quickInsert).not.toContain("label: 'elephant-command tasks'")
    expect(quickInsert).not.toContain("label: 'elephant-command table'")
    expect(quickInsert).not.toContain("label: 'elephant-command image'")
  })

  it('provides readable English fallbacks for every editor key seen in diagnostics', () => {
    const fallbacks = read('Elephant/frontend/src/renderer/src/i18n/editorUiFallbacks.js')
    const bridge = read('Elephant/frontend/src/renderer/src/platform/writingCommandBridge.js')

    for (const token of [
      "cancel: 'Cancel'",
      "ok: 'OK'",
      "title: 'Insert table'",
      "rows: 'Rows'",
      "columns: 'Columns'",
      "insertColumnLeft: 'Insert column left'",
      "insertColumnRight: 'Insert column right'",
      "insertRowAbove: 'Insert row above'",
      "insertRowBelow: 'Insert row below'",
      "removeColumn: 'Remove column'",
      "removeRow: 'Remove row'",
      "alignLeft: 'Align left'",
      "alignCenter: 'Align center'",
      "alignRight: 'Align right'",
      "deleteTable: 'Delete table'",
      "resizeTable: 'Resize table'"
    ]) expect(fallbacks).toContain(token)

    expect(bridge).toContain("import '@/i18n/editorUiFallbacks'")
  })

  it('removes internal addon-pack paths from user-facing settings', () => {
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AddonPacksSettings.vue')
    const addonLogic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')

    expect(packs).not.toContain('{{ pack.path }}')
    expect(packs).not.toContain('pack.description || pack.path')
    expect(packs).not.toContain('<code>{{ pack.path }}</code>')
    expect(addonLogic).not.toContain('result?.path ?')
  })

  it('makes Community Addons a runtime and catalogue boundary rather than a cosmetic checkbox', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')
    const addonLogic = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')
    const row = read('Elephant/frontend/app/components/settings/AddonSettingsRow.vue')
    const store = read('Elephant/frontend/src/renderer/src/store/addons.js')

    expect(addonLogic).toContain('if (communityAddonsEnabled.value)')
    expect(addonLogic).toContain("addon?.manifest?.source === 'external' && !communityAddonsEnabled.value")
    expect(addonLogic).toContain('if (!communityAddonsEnabled.value) return')
    expect(panel).toContain(':locked="isCommunityLocked(addon)"')
    expect(row).toContain(':disabled="busy || locked || addon.status === \'activating\'"')
    expect(row).toContain(':disabled="busy || locked || !addon.enabled || !action.enabled"')
    expect(store).toContain("if (!this.communityAddonsEnabled) throw new Error('Community addons are disabled.')")
    expect(store).toContain("filter((addon) => addon.enabled && addon.manifest.source === 'external')")
  })
})
