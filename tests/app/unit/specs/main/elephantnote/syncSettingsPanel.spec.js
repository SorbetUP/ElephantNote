import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readSyncSettingsPanel = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readIrohClient = () => read('Elephant/frontend/app/services/irohSyncClient.js')
const readNavigationBar = () => read('Elephant/frontend/app/components/navigation/NavigationBar.vue')
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

  it('connects the top navigation icon to the active vault Iroh synchronization', () => {
    const navigation = readNavigationBar()
    const store = readNavigationStore()

    expect(navigation).toContain('@click.stop="syncWorkspace"')
    expect(navigation).toContain('await nav.syncWorkspace(activeVaultPath.value)')
    expect(navigation).toContain("nav.syncStatus === 'syncing'")
    expect(navigation).toContain('!nav.hasPairedSyncDevice')
    expect(navigation).toContain("nav.syncStatus === 'error' || nav.syncStatus === 'synced'")
    expect(navigation).toContain('class="en-sync-dot"')
    expect(navigation).not.toContain('navigator.onLine')
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

  it('broadcasts status changes so settings and toolbar cannot drift apart', () => {
    const client = readIrohClient()
    const navigation = readNavigationBar()

    expect(client).toContain("export const IROH_SYNC_STATUS_EVENT = 'elephantnote:iroh-sync-status'")
    expect(client).toContain('window.dispatchEvent(new CustomEvent')
    expect(client).toContain('publishStatus(await invoke')
    expect(navigation).toContain('window.addEventListener(IROH_SYNC_STATUS_EVENT, handleSyncStatus)')
    expect(navigation).toContain('nav.applySyncStatus(event.detail, { preserveRunning: true })')
  })
})
