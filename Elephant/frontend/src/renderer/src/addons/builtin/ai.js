import AiProvidersSettings from './ui/AiProvidersSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai'

export const aiAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'AI',
    version: '2.1.0',
    description: 'Configures AI providers and owns the optional Chat, Search, OCR, Wiki and Graph modules.',
    author: 'ElephantNote',
    icon: 'sparkles',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.configure'],
    contributes: { settings: true }
  },

  activate(ctx) {
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      navigationLabel: 'AI',
      navigationIcon: 'sparkles',
      standalone: true,
      chrome: false,
      title: 'AI',
      description: 'Configure providers and the AI modules installed in ElephantNote.',
      order: 60,
      render: mountSettingsComponent(ctx, AiProvidersSettings)
    })
  }
}
