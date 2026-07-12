import AiSearchSettings from './ui/AiSearchSettings.vue'
import { AI_SETTINGS_PAGE_BY_ID } from './aiSettingsRegistry'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.ai-search'
const SETTINGS_PAGE = AI_SETTINGS_PAGE_BY_ID.search

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
      slot: SETTINGS_PAGE.slot,
      chrome: false,
      title: SETTINGS_PAGE.label,
      description: 'Configure embeddings, chunking and semantic retrieval.',
      order: SETTINGS_PAGE.order,
      render: mountSettingsComponent(ctx, AiSearchSettings)
    })
  }
}
