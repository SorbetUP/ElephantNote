import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'
import { useSitePreviewStore } from 'elephant-front/sitePreview/sitePreviewStore'
import SitesSettings from './ui/SitesSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.sites'

const stopSitesRuntime = async () => {
  const previewStore = useSitePreviewStore()
  if (previewStore.status !== 'idle' || previewStore.info || previewStore.lastBuild) {
    await previewStore.stopPreview().catch(() => {})
  }
  previewStore.clear()
  await elephantnoteClient.features.set('sitePreview', false).catch(() => {})
}

export const sitesAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Sites',
    version: '1.0.0',
    description: 'Builds, opens and stops the existing ElephantNote static site preview.',
    author: 'ElephantNote',
    icon: 'globe-2',
    defaultEnabled: false,
    removable: true,
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
  },

  async deactivate() {
    await stopSitesRuntime()
  }
}
