import AtomicGraphView from 'elephant-front/components/views/AtomicGraphView.vue'
import ChatSidebar from 'elephant-front/components/shell/ChatSidebar.vue'
import WikiView from 'elephant-front/components/views/WikiView.vue'
import { installGraphRuntimeFixes } from 'elephant-front/runtime/graphRuntimeFixes'
import { useVaultStore } from 'elephant-front/stores/vaultStore'
import AiAddonSettings from './ui/AiAddonSettings.vue'
import AiGraphFooterButton from './ui/AiGraphFooterButton.vue'
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
    version: '1.1.0',
    description: 'Adds AI providers, chat, semantic search, OCR, Wiki and Graph. Open model downloads and local runtimes are provided by the separate Open Models addon.',
    author: 'ElephantNote',
    icon: 'sparkles',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.configure', 'ai.chat', 'search.manage', 'ocr.run'],
    contributes: { actions: true, sidebar: true, settings: true, views: true, layout: true, editor: true }
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

    ctx.registerContribution('layout.zones', {
      id: `${ADDON_ID}.chat-sidebar`,
      zone: 'shell.right',
      order: 40,
      component: ChatSidebar,
      when: () => useVaultStore().chatSidebarOpen === true
    })

    ctx.registerContribution('editor.footer-items', {
      id: `${ADDON_ID}.graph-footer-button`,
      order: 20,
      component: AiGraphFooterButton
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
      icon: 'message-circle',
      actionId: CHAT_ACTION_ID,
      order: 46
    })

    dispatchLifecycle('elephantnote:ai-addon-enabled')

    return () => {
      const store = useVaultStore()
      store.chatSidebarOpen = false
      graphRuntime?.dispose?.()
      dispatchLifecycle('elephantnote:ai-addon-disabled')
    }
  }
}
