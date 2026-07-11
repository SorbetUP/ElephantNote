import ImportSettings from './ui/ImportSettings.vue'
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
      chrome: false,
      title: 'Import',
      description: 'Import Google Keep archives, web pages and RSS feeds.',
      order: 20,
      render: mountSettingsComponent(ctx, ImportSettings)
    })
  }
}
