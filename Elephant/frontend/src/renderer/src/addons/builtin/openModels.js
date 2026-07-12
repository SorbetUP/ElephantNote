import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'
import { disableProviderRoutes } from './aiProviderRouteOwnership'
import OpenModelsView from './ui/OpenModelsView.vue'

const ADDON_ID = 'elephant.open-models'
const PROVIDER_ID = 'app-local'

const enableOpenModelsRuntime = async () => {
  const config = await elephantnoteClient.ai.getConfig()
  const localAi = { ...(config?.localAi || {}) }
  if (
    localAi.enabled === true
    && localAi.showModelLibraryInSidebar === true
    && localAi.allowHuggingFaceDownloads === true
    && localAi.allowLocalRuntimeAutostart === true
  ) return

  await elephantnoteClient.ai.setConfig({
    ...config,
    localAi: {
      ...localAi,
      enabled: true,
      showModelLibraryInSidebar: true,
      allowHuggingFaceDownloads: true,
      allowLocalRuntimeAutostart: true
    }
  })
}

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

  async activate(ctx) {
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

    await enableOpenModelsRuntime()
  },

  async deactivate() {
    await disableProviderRoutes(PROVIDER_ID, {
      capabilities: ['chat', 'embedding'],
      disableLocalAi: true
    }).catch(() => {})
  }
}
