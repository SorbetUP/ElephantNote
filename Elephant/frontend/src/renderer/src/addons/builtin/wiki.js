import WikiView from 'elephant-front/components/views/WikiView.vue'

const ADDON_ID = 'elephant.wiki'

export const wikiAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Wiki',
    version: '1.0.0',
    description: 'Adds AI-organized Wiki pages and cluster navigation.',
    author: 'ElephantNote',
    icon: 'book-open-text',
    defaultEnabled: false,
    removable: true,
    permissions: ['notes.read', 'search.read'],
    contributes: { views: true }
  },

  activate(ctx) {
    ctx.addView({
      id: `${ADDON_ID}.workspace`,
      title: 'Wiki',
      description: 'Browse AI-organized knowledge pages and clusters.',
      icon: 'book-open-text',
      kind: 'ai-wiki-v1',
      component: WikiView,
      order: 30
    })
  }
}
