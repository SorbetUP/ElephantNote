import AiProvidersSettings from './ui/AiProvidersSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai'

export const aiAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'AI Providers',
    version: '2.0.0',
    description: 'Configures external and addon-provided AI providers. Chat, search, OCR, Wiki, Graph and open models are separate addons.',
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
      navigationLabel: 'AI Providers',
      navigationIcon: 'sparkles',
      standalone: true,
      chrome: false,
      title: 'AI Providers',
      description: 'Configure external APIs and providers registered by other addons.',
      order: 60,
      render: mountSettingsComponent(ctx, AiProvidersSettings)
    })
  }
}
