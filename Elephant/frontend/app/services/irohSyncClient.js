import { invoke } from '@tauri-apps/api/core'

const normalizeObject = (value) => (value && typeof value === 'object' ? value : {})

export const irohSyncClient = {
  status: () => invoke('tauri_sync_status'),
  createInvite: (payload = {}) =>
    invoke('tauri_sync_create_invite', { payload: normalizeObject(payload) }),
  acceptInvite: (manualCode) =>
    invoke('tauri_sync_accept_invite', {
      invite: { manualCode: String(manualCode || '').trim() }
    }),
  run: () => invoke('tauri_sync_run', { payloadByOperation: { sync: {} } }),
  conflictSettings: () => invoke('tauri_sync_conflict_settings_get'),
  setConflictRetentionDays: (days) =>
    invoke('tauri_sync_conflict_settings_set', {
      conflictRetentionDays: Number(days)
    }),
  restoreConflict: (relativePath) =>
    invoke('tauri_sync_conflict_restore', { relativePath: String(relativePath || '') }),
  deleteConflict: (relativePath) =>
    invoke('tauri_sync_conflict_delete', { relativePath: String(relativePath || '') })
}
