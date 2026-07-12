import ChatSidebar from 'elephant-front/components/shell/ChatSidebar.vue'
import { useVaultStore } from 'elephant-front/stores/vaultStore'
import AiChatSettings from './ui/AiChatSettings.vue'
import { AI_SETTINGS_PAGE_BY_ID } from './aiSettingsRegistry'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai-chat'
const CHAT_ACTION_ID = `${ADDON_ID}.toggle`
const SETTINGS_PAGE = AI_SETTINGS_PAGE_BY_ID.chat

export const aiChatAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Chat',
    version: '1.0.0',
    description: 'Adds the AI chat sidebar and chat-route settings.',
    author: 'ElephantNote',
    icon: 'message-circle',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.chat'],
    contributes: { actions: true, sidebar: true, settings: true, layout: true }
  },

  activate(ctx) {
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: SETTINGS_PAGE.slot,
      chrome: false,
      title: SETTINGS_PAGE.label,
      description: 'Choose the provider, model and generation settings used by chat.',
      order: SETTINGS_PAGE.order,
      render: mountSettingsComponent(ctx, AiChatSettings)
    })

    ctx.registerContribution('layout.zones', {
      id: `${ADDON_ID}.sidebar`,
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
      id: `${ADDON_ID}.sidebar-item`,
      title: 'Chat',
      tooltip: 'AI chat',
      icon: 'message-circle',
      actionId: CHAT_ACTION_ID,
      order: 46
    })

    return () => {
      useVaultStore().chatSidebarOpen = false
    }
  }
}
