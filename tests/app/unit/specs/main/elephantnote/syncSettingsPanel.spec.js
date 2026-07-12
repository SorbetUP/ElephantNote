import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readSyncSettingsPanel = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readIrohClient = () => read('Elephant/frontend/app/services/irohSyncClient.js')
const readNavigationBar = () => read('Elephant/frontend/app/components/navigation/NavigationBar.vue')
const readSyncNavigationControl = () => read('Elephant/frontend/app/components/navigation/SyncNavigationControl.vue')
const readSyncAddon = () => read('Elephant/frontend/src/renderer/src/addons/builtin/sync.js')
const readNavigationStore = () => read('Elephant/frontend/app/stores/navigationStore.js')

describe('ElephantNote Iroh UI integration', () => {
  it('uses the real Iroh pairing and synchronization commands', () => {
    const panel = readSyncSettingsPanel()
    const client = readIrohClient()

    expect(panel).toContain('@click="createInvite"')
    expect(panel).toContain('@click="acceptInvite"')
    expect(panel).toContain('@click="syncNow"')
    expect(panel).toContain('irohSyncClient.createInvite')
    expect(panel).toContain('irohSyncClient.acceptInvite')
    expect(panel).toContain('irohSyncClient.run()')
    expect(client).toContain("invoke('tauri_sync_create_invite'")
    expect(client).toContain("invoke('tauri_sync_accept_invite'")
    expect(client).toContain("invoke('tauri_sync_run'")
  })

  it('does not retain the legacy rclone or shared-folder controls', () => {
    const source = readSyncSettingsPanel()
    const navigationStore = readNavigationStore()

    expect(source).not.toContain('rclone')
    expect(source).not.toContain('syncthing-git')
    expect(source).not.toContain('remotePath')
    expect(source).not.toContain('Pairing password')
    expect(source).not.toContain('setTimeout(() => {')
    expect(navigationStore).not.toContain('createDefaultSyncPlan')
    expect(navigationStore).not.toContain('elephantnoteClient.sync.enqueue')
  })

  it('exposes configurable temporary conflict retention', () => {
    const panel = readSyncSettingsPanel()
    const client = readIrohClient()

    expect(panel).toContain('<code>.conflit/</code>')
    expect(panel).toContain('v-model.number="retentionDays"')
    expect(panel).toContain('@click="saveRetention"')
    expect(panel).toContain('irohSyncClient.setConflictRetentionDays')
    expect(client).toContain("invoke('tauri_sync_conflict_settings_get'")
    expect(client).toContain("invoke('tauri_sync_conflict_settings_set'")
  })

  it('lets users restore or delete archived conflicts safely', () => {
    const panel = readSyncSettingsPanel()
    const client = readIrohClient()

    expect(panel).toContain('@click="restoreConflict(entry)"')
    expect(panel).toContain('@click="deleteConflict(entry)"')
    expect(panel).toContain('Restoring ${entry.path}')
    expect(panel).toContain('Restored as ${result?.restoredPath')
    expect(client).toContain("invoke('tauri_sync_conflict_restore'")
    expect(client).toContain("invoke('tauri_sync_conflict_delete'")
  })

  it('connects an addon-owned top navigation component to active-vault Iroh synchronization', () => {
    const navigation = readNavigationBar()
    const control = readSyncNavigationControl()
    const addon = readSyncAddon()
    const store = readNavigationStore()

    expect(navigation).toContain("addonsStore.getContributions('top-bar.items')")
    expect(navigation).toContain(':is="entry.contribution.component"')
    expect(navigation).not.toContain('SyncNavigationControl')
    expect(navigation).not.toContain("entry.contribution.kind === 'sync-control-v1'")
    expect(addon).toContain("import SyncNavigationControl from 'elephant-front/components/navigation/SyncNavigationControl.vue'")
    expect(addon).toContain("ctx.registerContribution('top-bar.items'")
    expect(addon).toContain("kind: 'sync-control-v1'")
    expect(addon).toContain('component: SyncNavigationControl')
    expect(control).toContain('@click.stop="syncWorkspace"')
    expect(control).toContain('await nav.syncWorkspace(activeVaultPath.value)')
    expect(control).toContain("nav.syncStatus === 'syncing'")
    expect(control).toContain('!nav.hasPairedSyncDevice')
    expect(control).toContain("nav.syncStatus === 'error' || nav.syncStatus === 'synced'")
    expect(control).toContain('class="en-sync-dot"')
    expect(control).not.toContain('navigator.onLine')
    expect(store).toContain('const result = await irohSyncClient.run()')
  })

  it('never reports a resolved backend failure as a successful toolbar sync', () => {
    const store = readNavigationStore()

    expect(store).toContain("const lastError = String(result?.lastError || '').trim()")
    expect(store).toContain('if (lastError) throw new Error(lastError)')
    expect(store).toContain("this.syncStatus = 'error'")
    expect(store).toContain("this.syncStatus = 'synced'")
    expect(store).toContain('Number(result?.transferredFiles || 0) > 0')
  })

  it('broadcasts status changes so settings and the addon control cannot drift apart', () => {
    const client = readIrohClient()
    const control = readSyncNavigationControl()

    expect(client).toContain("export const IROH_SYNC_STATUS_EVENT = 'elephantnote:iroh-sync-status'")
    expect(client).toContain('window.dispatchEvent(new CustomEvent')
    expect(client).toContain('publishStatus(await invoke')
    expect(control).toContain('window.addEventListener(IROH_SYNC_STATUS_EVENT, handleSyncStatus)')
    expect(control).toContain('nav.applySyncStatus(event.detail, { preserveRunning: true })')
  })
})
