import CodexConnectionSettings from './ui/CodexConnectionSettings.vue'
import { disableProviderRoutes } from './aiProviderRouteOwnership'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.codex-connection'
const PROVIDER_ID = 'codex'

const invokeCodex = (codexOperation, payload = {}) => {
  const invoke = globalThis.window?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for Codex ${codexOperation}`)
  return invoke('tauri_rag_chat', { payload: { codexOperation, ...payload } })
}

export const codexConnectionAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Codex Connection',
    version: '1.0.0',
    description: 'Connects a ChatGPT subscription and exposes Codex as an ElephantNote chat provider.',
    author: 'ElephantNote',
    icon: 'openai',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.provider', 'codex.account', 'codex.models', 'codex.usage'],
    contributes: { settings: true, aiProvider: true }
  },

  activate(ctx) {
    ctx.registerContribution('ai.providers', {
      id: `${ADDON_ID}.provider`,
      providerId: PROVIDER_ID,
      title: 'Codex subscription',
      description: 'ChatGPT subscription through the bundled Codex app server.',
      transport: 'codex',
      endpoint: 'codex://app-server',
      settingsSection: 'ai',
      settingsSubpage: 'provider',
      capabilities: ['chat'],
      async getModels() {
        const result = await invokeCodex('models')
        return Array.isArray(result?.data) ? result.data : []
      }
    })
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.providers.after-external',
      chrome: false,
      title: 'ChatGPT subscription',
      description: 'Connect or disconnect the existing ChatGPT subscription runtime and review usage limits.',
      order: 30,
      render: mountSettingsComponent(ctx, CodexConnectionSettings)
    })
  },

  async deactivate() {
    await disableProviderRoutes(PROVIDER_ID, { capabilities: ['chat'] }).catch(() => {})
  }
}
