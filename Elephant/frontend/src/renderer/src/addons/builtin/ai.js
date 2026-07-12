import AtomicGraphView from 'elephant-front/components/views/AtomicGraphView.vue'
import ChatSidebar from 'elephant-front/components/shell/ChatSidebar.vue'
import ModelsView from 'elephant-front/components/views/ModelsView.vue'
import WikiView from 'elephant-front/components/views/WikiView.vue'
import { installGraphRuntimeFixes } from 'elephant-front/runtime/graphRuntimeFixes'
import { useVaultStore } from 'elephant-front/stores/vaultStore'
import AiAddonSettings from './ui/AiAddonSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai'
const CHAT_ACTION_ID = `${ADDON_ID}.toggle-chat`

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
    logger.info?.('[ai-addon] local-runtime:config', {
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
      logger.info?.('[ai-addon] local-runtime:ready', {
        model,
        runtime: result?.runtime || '',
        provider: result?.provider || '',
        warning: result?.warning || ''
      })
    }).catch((error) => {
      logger.warn?.('[ai-addon] local-runtime:failed', { model, error: error?.message || String(error) })
    })
    return true
  } catch (error) {
    logger.warn?.('[ai-addon] local-runtime:config-failed', { error: error?.message || String(error) })
    return false
  }
}

const dispatchLifecycle = (eventName) => {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return
  globalThis.dispatchEvent(new CustomEvent(eventName, { detail: { addonId: ADDON_ID } }))
}

export const aiAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'AI',
    version: '1.0.0',
    description: 'Adds AI providers, chat, semantic search, OCR, Wiki, Graph and the local model library.',
    author: 'ElephantNote',
    icon: 'sparkles',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.configure', 'ai.chat', 'ai.models', 'search.manage', 'ocr.run'],
    contributes: { actions: true, sidebar: true, settings: true, views: true, layout: true }
  },

  activate(ctx) {
    const graphRuntime = installGraphRuntimeFixes(globalThis)

    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      navigationLabel: 'AI',
      navigationIcon: 'sparkles',
      standalone: true,
      chrome: false,
      title: 'AI',
      description: 'Configure providers, chat, embeddings, semantic search and OCR.',
      order: 60,
      render: mountSettingsComponent(ctx, AiAddonSettings)
    })

    ctx.addView({
      id: `${ADDON_ID}.wiki`,
      title: 'Wiki',
      description: 'Browse AI-organized knowledge pages and clusters.',
      icon: 'book-open-text',
      kind: 'ai-wiki-v1',
      component: WikiView,
      order: 30
    })

    ctx.addView({
      id: `${ADDON_ID}.graph`,
      title: 'Graph',
      description: 'Explore note, Wiki and semantic relationships.',
      icon: 'git-fork',
      kind: 'ai-graph-v1',
      component: AtomicGraphView,
      order: 35
    })

    ctx.addView({
      id: `${ADDON_ID}.models`,
      title: 'Models',
      description: 'Browse, download and manage local AI models.',
      icon: 'database',
      kind: 'ai-models-v1',
      component: ModelsView,
      order: 45
    })

    ctx.registerContribution('layout.zones', {
      id: `${ADDON_ID}.chat-sidebar`,
      zone: 'shell.right',
      order: 40,
      component: ChatSidebar,
      when: () => useVaultStore().chatSidebarOpen === true
    })

    ctx.addAction({
      id: CHAT_ACTION_ID,
      title: 'Toggle AI chat',
      description: 'Open or close the ElephantNote AI chat sidebar.',
      async run() {
        const store = useVaultStore()
        store.toggleChatSidebar()
        return { open: store.chatSidebarOpen }
      }
    })

    ctx.addSidebarItem({
      id: `${ADDON_ID}.chat`,
      title: 'Chat',
      tooltip: 'AI chat',
      icon: 'sparkles',
      actionId: CHAT_ACTION_ID,
      order: 46
    })

    void autostartLlamaRuntime(globalThis, ctx.logger)
    dispatchLifecycle('elephantnote:ai-addon-enabled')

    return () => {
      const store = useVaultStore()
      store.chatSidebarOpen = false
      graphRuntime?.dispose?.()
      dispatchLifecycle('elephantnote:ai-addon-disabled')
    }
  }
}
