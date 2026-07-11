import { invoke } from '@tauri-apps/api/core'

export const IROH_SYNC_STATUS_EVENT = 'elephantnote:iroh-sync-status'

let lastPublishedStatus = null

const normalizeObject = (value) => (value && typeof value === 'object' ? value : {})

const publishStatus = (status) => {
  if (status && typeof status === 'object') lastPublishedStatus = status
  if (typeof window !== 'undefined' && status && typeof status === 'object') {
    window.dispatchEvent(new CustomEvent(IROH_SYNC_STATUS_EVENT, { detail: status }))
  }
  return status
}

const readStatus = async () => publishStatus(await invoke('tauri_sync_status'))

const acceptInvite = async (manualCode) => {
  const result = await invoke('tauri_sync_accept_invite', {
    invite: { manualCode: String(manualCode || '').trim() }
  })
  if (result?.status) publishStatus(result.status)
  return result
}

const run = async () => {
  if (lastPublishedStatus) {
    publishStatus({ ...lastPublishedStatus, running: true, lastError: '' })
  }
  try {
    return publishStatus(await invoke('tauri_sync_run', {
      payloadByOperation: { sync: {} }
    }))
  } catch (error) {
    if (lastPublishedStatus) {
      publishStatus({
        ...lastPublishedStatus,
        running: false,
        lastError: error?.message || 'Iroh synchronization failed.'
      })
    }
    throw error
  }
}

const shutdown = async () => {
  const result = await invoke('tauri_sync_shutdown')
  lastPublishedStatus = null
  return publishStatus({ ...(result || {}), running: false, started: false })
}

export const irohSyncClient = {
  status: readStatus,
  shutdown,
  createInvite: (payload = {}) =>
    invoke('tauri_sync_create_invite', { payload: normalizeObject(payload) }),
  acceptInvite,
  run,
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
