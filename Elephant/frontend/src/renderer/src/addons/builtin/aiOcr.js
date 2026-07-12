import AiOcrSettings from './ui/AiOcrSettings.vue'
import { AI_SETTINGS_PAGE_BY_ID } from './aiSettingsRegistry'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai-ocr'
const SETTINGS_PAGE = AI_SETTINGS_PAGE_BY_ID.ocr

export const aiOcrAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'OCR',
    version: '1.0.0',
    description: 'Adds OCR provider and document-recognition settings.',
    author: 'ElephantNote',
    icon: 'scan-text',
    defaultEnabled: false,
    removable: true,
    permissions: ['ocr.run'],
    contributes: { settings: true }
  },

  activate(ctx) {
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: SETTINGS_PAGE.slot,
      chrome: false,
      title: SETTINGS_PAGE.label,
      description: 'Configure OCR providers, languages and output format.',
      order: SETTINGS_PAGE.order,
      render: mountSettingsComponent(ctx, AiOcrSettings)
    })
  }
}
