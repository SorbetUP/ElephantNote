import AiOcrSettings from './ui/AiOcrSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai-ocr'

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
      slot: 'ai.ocr',
      chrome: false,
      title: 'OCR',
      description: 'Configure OCR providers, languages and output format.',
      order: 63,
      render: mountSettingsComponent(ctx, AiOcrSettings)
    })
  }
}
