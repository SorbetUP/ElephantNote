import SystemImportSettings from 'elephant-front/components/settings/SystemImportSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.google-keep-import'

export const googleKeepImportAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Google Keep Import',
    version: '1.0.0',
    description: 'Imports Google Keep archives, web pages and RSS feeds into the active vault.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: ['imports.google-keep', 'sources.web', 'sources.rss'],
    contributes: { settings: true }
  },

  activate(ctx) {
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'import',
      navigationLabel: 'Import',
      navigationIcon: 'download',
      standalone: true,
      title: 'Import',
      description: 'Import Google Keep archives, web pages and RSS feeds without adding these tools to the vanilla app.',
      order: 20,
      render: mountSettingsComponent(ctx, SystemImportSettings)
    })
  }
}
