import { useVaultStore } from 'elephant-front/stores/vaultStore'
import AiAddonSettings from './ui/AiAddonSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai'
const CHAT_ACTION_ID = `${ADDON_ID}.toggle-chat`

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
    contributes: { actions: true, sidebar: true, settings: true, views: true }
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
      order: 30
    })

    ctx.addView({
      id: `${ADDON_ID}.graph`,
      title: 'Graph',
      description: 'Explore note, Wiki and semantic relationships.',
      icon: 'git-fork',
      kind: 'ai-graph-v1',
      order: 35
    })

    ctx.addView({
      id: `${ADDON_ID}.models`,
      title: 'Models',
      description: 'Browse, download and manage local AI models.',
      icon: 'database',
      kind: 'ai-models-v1',
      order: 45
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

    dispatchLifecycle('elephantnote:ai-addon-enabled')

    return () => {
      const store = useVaultStore()
      store.chatSidebarOpen = false
      dispatchLifecycle('elephantnote:ai-addon-disabled')
    }
  }
}
