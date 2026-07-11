import SitesSettings from './ui/SitesSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.sites'

export const sitesAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Sites',
    version: '1.0.0',
    description: 'Builds, opens and stops the existing ElephantNote static site preview.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: ['sites.build', 'sites.preview'],
    contributes: { settings: true, siteGenerator: true }
  },

  activate(ctx) {
    ctx.registerContribution('site.generators', {
      id: `${ADDON_ID}.generator`,
      title: 'ElephantNote Sites',
      description: 'The built-in static site generator and preview service.'
    })
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'sites',
      navigationLabel: 'Sites',
      navigationIcon: 'globe',
      standalone: true,
      chrome: false,
      title: 'Sites',
      description: 'Generate and preview a static site.',
      order: 50,
      render: mountSettingsComponent(ctx, SitesSettings)
    })
  }
}
