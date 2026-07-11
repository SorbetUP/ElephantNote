import CodexConnectionSettings from './ui/CodexConnectionSettings.vue'
import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'
import './codexConnection.css'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.codex-connection'

const disableCodexRoute = async () => {
  const config = await elephantnoteClient.ai.getConfig()
  const chat = config?.routes?.chat || {}
  if (chat.source !== 'codex' && chat.provider !== 'codex' && config?.transport !== 'codex') return
  await elephantnoteClient.ai.setConfig({
    ...config,
    provider: 'disabled',
    transport: 'disabled',
    endpoint: '',
    model: '',
    routes: {
      ...(config.routes || {}),
      chat: {
        ...chat,
        source: 'disabled',
        provider: 'disabled',
        endpoint: '',
        model: ''
      }
    }
  })
}

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
    document.documentElement.classList.add('elephant-codex-addon-enabled')
    ctx.addDisposable(() => document.documentElement.classList.remove('elephant-codex-addon-enabled'))

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
      render: mountSettingsComponent(ctx, CodexConnectionSettings)
    })
  },

  async deactivate() {
    document.documentElement.classList.remove('elephant-codex-addon-enabled')
    await disableCodexRoute().catch(() => {})
  }
}
