import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'
import OpenModelsView from './ui/OpenModelsView.vue'

const ADDON_ID = 'elephant.open-models'
const PROVIDER_ID = 'app-local'

export const openModelsAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Open Models',
    version: '1.1.0',
    description: 'Browse, download and remove open GGUF models. Model routing is configured by the feature that consumes them.',
    author: 'ElephantNote',
    icon: 'database',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.models'],
    contributes: { views: true, aiProvider: true }
  },

  activate(ctx) {
    ctx.addView({
      id: `${ADDON_ID}.models`,
      title: 'Models',
      description: 'Browse, download and manage open local AI models.',
      icon: 'database',
      kind: 'open-models-v1',
      component: OpenModelsView,
      order: 45
    })

    ctx.registerContribution('ai.providers', {
      id: `${ADDON_ID}.provider`,
      providerId: PROVIDER_ID,
      title: 'Open Models',
      description: 'Run a downloaded GGUF model with the local llama.cpp runtime.',
      transport: 'tauri-rust',
      endpoint: 'local://llama.cpp',
      capabilities: ['chat', 'embedding'],
      async getModels() {
        const result = await elephantnoteClient.models.list?.()
        return Array.isArray(result?.models) ? result.models : []
      }
    })
  }
}
