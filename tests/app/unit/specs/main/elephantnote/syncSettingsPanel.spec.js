import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readSyncSettingsPanel = () => read('Elephant/frontend/app/components/settings/SyncSettingsPanel.vue')
const readSyncQrScanner = () => read('Elephant/frontend/app/components/settings/SyncQrScanner.vue')
const readSyncInvite = () => read('Elephant/frontend/app/services/syncInvite.js')
const readIrohClient = () => read('Elephant/frontend/app/services/irohSyncClient.js')
const readNavigationBar = () => read('Elephant/frontend/app/components/navigation/NavigationBar.vue')
const readNavigationStore = () => read('Elephant/frontend/app/stores/navigationStore.js')
const readPackage = () => JSON.parse(read('package.json'))

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

  it('presents synchronization as one understandable page instead of a nested settings dashboard', () => {
    const panel = readSyncSettingsPanel()

    expect(panel).toContain('Last synchronization completed')
    expect(panel).toContain('<h4>Devices</h4>')
    expect(panel).toContain('<h4>Conflict protection</h4>')
    expect(panel).toContain('Settings2 aria-hidden="true" /> Advanced')
    expect(panel).not.toContain('activeSyncPage')
    expect(panel).not.toContain('en-sync-tabs')
    expect(panel).not.toContain('Iroh EndpointId</p>')
    expect(panel).not.toContain('button.primary {')
    expect(panel).not.toContain('.en-sync-card {')
  })

  it('generates a high-resolution local QR code from the exact backend invitation payload', () => {
    const panel = readSyncSettingsPanel()
    const invite = readSyncInvite()
    const pkg = readPackage()

    expect(pkg.dependencies.qrcode).toBe('^1.5.4')
    expect(panel).toContain('generateSyncInviteQrDataUrl(inviteCode.value)')
    expect(panel).toContain(':src="inviteQrDataUrl"')
    expect(invite).toContain("import QRCodeGenerator from 'qrcode'")
    expect(invite).toContain("errorCorrectionLevel: 'L'")
    expect(invite).toContain('width: 640')
    expect(invite).toContain('margin: 4')
  })

  it('supports real invitation file export, native sharing and file import', () => {
    const panel = readSyncSettingsPanel()
    const invite = readSyncInvite()

    expect(invite).toContain("export const INVITE_EXTENSION = '.elephantnote-invite'")
    expect(invite).toContain("export const INVITE_MIME = 'application/vnd.elephantnote.sync-invite+json'")
    expect(invite).toContain('return new File([normalized], fileName')
    expect(panel).toContain('navigator.canShare({ files: [file] })')
    expect(panel).toContain('await navigator.share(sharePayload)')
    expect(panel).toContain('@click="downloadInviteFile"')
    expect(panel).toContain('@change="importInviteFile"')
    expect(panel).toContain('@drop.prevent="handleInviteDrop"')
    expect(panel).toContain('WhatsApp, Messages, Mail')
  })

  it('has a real live-camera scanner and a system camera/image fallback', () => {
    const panel = readSyncSettingsPanel()
    const scanner = readSyncQrScanner()
    const pkg = readPackage()

    expect(pkg.dependencies['@zxing/browser']).toBe('^0.2.1')
    expect(pkg.dependencies['@zxing/library']).toBe('^0.23.0')
    expect(panel).toContain('<SyncQrScanner')
    expect(panel).toContain('@decoded="handleScannedInvite"')
    expect(scanner).toContain("import('@zxing/browser')")
    expect(scanner).toContain('decodeFromConstraints(')
    expect(scanner).toContain("facingMode: { ideal: 'environment' }")
    expect(scanner).toContain('capture="environment"')
    expect(scanner).toContain('decodeFromImageUrl(objectUrl)')
    expect(scanner).toContain('validateSyncInvitePayload(normalized)')
  })

  it('validates the protocol, required fields and expiry before pairing', () => {
    const panel = readSyncSettingsPanel()
    const invite = readSyncInvite()

    expect(invite).toContain("export const INVITE_PROTOCOL = 'elephantnote-iroh-sync-v1'")
    expect(invite).toContain('value.protocol !== INVITE_PROTOCOL')
    expect(invite).toContain('!value.inviteId || !value.inviteToken || !value.endpointAddr || !value.folderId')
    expect(invite).toContain('This invitation has expired')
    expect(panel).toContain(':disabled="loading || !hasVault || !incomingInviteValid"')
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
