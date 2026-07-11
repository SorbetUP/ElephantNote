import SystemCodexSettings from 'elephant-front/components/settings/SystemCodexSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.codex-connection'

export const codexConnectionAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Codex Connection',
    version: '1.0.0',
    description: 'Connects a ChatGPT subscription and exposes Codex as an ElephantNote chat provider.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: ['ai.provider', 'codex.account', 'codex.models', 'codex.usage'],
    contributes: { settings: true, aiProvider: true }
  },

  activate(ctx) {
    ctx.registerContribution('ai.providers', {
      id: `${ADDON_ID}.provider`,
      providerId: 'codex',
      title: 'Codex subscription',
      transport: 'codex',
      endpoint: 'codex://app-server'
    })
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'codex',
      navigationLabel: 'Codex',
      navigationIcon: 'sparkles',
      standalone: true,
      title: 'Codex Connection',
      description: 'Connect or disconnect the existing ChatGPT subscription runtime and review usage limits.',
      order: 30,
      render: mountSettingsComponent(ctx, SystemCodexSettings)
    })
  }
}
