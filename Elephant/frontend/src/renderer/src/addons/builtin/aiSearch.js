import AiSearchSettings from './ui/AiSearchSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai-search'

export const aiSearchAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Semantic Search',
    version: '1.0.0',
    description: 'Adds embedding configuration, semantic indexing and retrieval settings.',
    author: 'ElephantNote',
    icon: 'search',
    defaultEnabled: false,
    removable: true,
    permissions: ['search.manage'],
    contributes: { settings: true }
  },

  activate(ctx) {
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.search',
      chrome: false,
      title: 'Semantic Search',
      description: 'Configure embeddings, chunking and semantic retrieval.',
      order: 62,
      render: mountSettingsComponent(ctx, AiSearchSettings)
    })
  }
}
