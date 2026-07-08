import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readSyncSettingsPanel = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readIrohClient = () => read('Elephant/frontend/app/services/irohSyncClient.js')


describe('SyncSettingsPanel Iroh interactions', () => {
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

    expect(source).not.toContain('rclone')
    expect(source).not.toContain('syncthing-git')
    expect(source).not.toContain('remotePath')
    expect(source).not.toContain('Pairing password')
    expect(source).not.toContain('setTimeout(() => {')
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
})
