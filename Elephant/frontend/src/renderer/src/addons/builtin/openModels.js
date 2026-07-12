import ModelsView from 'elephant-front/components/views/ModelsView.vue'

const ADDON_ID = 'elephant.open-models'

const selectedChatModelFromConfig = (config = {}) => {
  const route = config.routes?.chat || {}
  return String(
    config.localModelSelection?.chat ||
    route.model ||
    route.modelId ||
    route.id ||
    ''
  ).trim()
}

const shouldAutostartLlama = (config = {}) => {
  const route = config.routes?.chat || {}
  const localAi = config.localAi || {}
  if (localAi.enabled === false) return false
  if (localAi.allowLocalRuntimeAutostart === false) return false
  if (!selectedChatModelFromConfig(config)) return false
  return ['app-local', 'local', 'node-llama-cpp', 'local-llama.cpp', ''].includes(String(route.provider || route.source || '').trim())
}

const autostartLlamaRuntime = async (target = globalThis, logger = console) => {
  if (!target.__TAURI__ || !target.elephantnote?.ai?.getConfig || !target.elephantnote?.rag?.chat) return false
  try {
    const config = await target.elephantnote.ai.getConfig()
    const model = selectedChatModelFromConfig(config)
    const enabled = shouldAutostartLlama(config)
    logger.info?.('[open-models-addon] local-runtime:config', {
      enabled,
      model: model || '<none>',
      localAi: config.localAi || {},
      chatRoute: config.routes?.chat || {}
    })
    if (!enabled) return false
    void target.elephantnote.rag.chat({
      message: 'warmup',
      messages: [{ role: 'user', content: 'warmup' }],
      maxTokens: 1,
      temperature: 0,
      aiConfig: config,
      modelSelection: config.localModelSelection || {}
    }).then((result) => {
      logger.info?.('[open-models-addon] local-runtime:ready', {
        model,
        runtime: result?.runtime || '',
        provider: result?.provider || '',
        warning: result?.warning || ''
      })
    }).catch((error) => {
      logger.warn?.('[open-models-addon] local-runtime:failed', { model, error: error?.message || String(error) })
    })
    return true
  } catch (error) {
    logger.warn?.('[open-models-addon] local-runtime:config-failed', { error: error?.message || String(error) })
    return false
  }
}

const dispatchLifecycle = (eventName) => {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return
  globalThis.dispatchEvent(new CustomEvent(eventName, { detail: { addonId: ADDON_ID } }))
}

export const openModelsAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Open Models',
    version: '1.0.0',
    description: 'Browse, download, assign and run open GGUF models with ElephantNote local runtimes.',
    author: 'ElephantNote',
    icon: 'database',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.models', 'ai.local-runtime'],
    contributes: { views: true }
  },

  activate(ctx) {
    ctx.addView({
      id: `${ADDON_ID}.models`,
      title: 'Models',
      description: 'Browse, download and manage open local AI models.',
      icon: 'database',
      kind: 'open-models-v1',
      component: ModelsView,
      order: 45
    })

    void autostartLlamaRuntime(globalThis, ctx.logger)
    dispatchLifecycle('elephantnote:open-models-addon-enabled')

    return () => {
      dispatchLifecycle('elephantnote:open-models-addon-disabled')
    }
  }
}
