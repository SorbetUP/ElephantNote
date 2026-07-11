import { irohSyncClient } from 'elephant-front/services/irohSyncClient'
import SyncAddonSettings from './ui/SyncAddonSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.sync'

export const syncAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Sync',
    version: '1.0.0',
    description: 'Adds encrypted Iroh device pairing, synchronization and conflict recovery.',
    author: 'ElephantNote',
    icon: 'cloud',
    defaultEnabled: false,
    removable: true,
    permissions: ['sync.status', 'sync.pair', 'sync.run', 'sync.conflicts'],
    contributes: { settings: true }
  },

  activate(ctx) {
    irohSyncClient.activate()
    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'sync',
      navigationLabel: 'Sync',
      navigationIcon: 'cloud',
      standalone: true,
      chrome: false,
      title: 'Sync',
      description: 'Pair devices and synchronize vaults over encrypted Iroh connections.',
      order: 50,
      render: mountSettingsComponent(ctx, SyncAddonSettings)
    })
  },

  async deactivate() {
    await irohSyncClient.shutdown().catch(() => {})
  }
}
