import RecentlyEditedSidebarSection from 'elephant-front/components/navigation/RecentlyEditedSidebarSection.vue'

const ADDON_ID = 'elephant.recently-edited'

export const recentlyEditedAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Recently edited',
    version: '1.0.0',
    description: 'Adds the recently edited notes section to the sidebar.',
    author: 'ElephantNote',
    icon: 'calendar-clock',
    defaultEnabled: false,
    removable: true,
    permissions: ['notes.read'],
    contributes: { layout: true }
  },

  activate(ctx) {
    ctx.registerContribution('layout.zones', {
      id: `${ADDON_ID}.sidebar-section`,
      zone: 'sidebar.after-tree',
      order: 100,
      component: RecentlyEditedSidebarSection
    })
  }
}
