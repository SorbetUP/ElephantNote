import { invoke } from '@tauri-apps/api/core'

export const IROH_SYNC_STATUS_EVENT = 'elephantnote:iroh-sync-status'
export const IROH_SYNC_FILES_CHANGED_EVENT = 'elephantnote:vault-files-changed'

let lastPublishedStatus = null

const normalizeObject = (value) => (value && typeof value === 'object' ? value : {})
const cleanPeerCloseMessage = (value) => {
  const message = String(value || '').trim().toLowerCase()
  return message === 'closed by peer: 0' ||
    message.includes('closed by peer: 0') ||
    (message.includes('application closed') && /\b0\b/.test(message))
}

const sanitizeStatus = (status) => {
  if (!status || typeof status !== 'object') return status
  if (!cleanPeerCloseMessage(status.lastError)) return status
  return {
    ...status,
    lastError: '',
    running: false,
    transportClosedCleanly: true
  }
}

const publishStatus = (status) => {
  const normalized = sanitizeStatus(status)
  if (normalized && typeof normalized === 'object') lastPublishedStatus = normalized
  if (typeof window !== 'undefined' && normalized && typeof normalized === 'object') {
    window.dispatchEvent(new CustomEvent(IROH_SYNC_STATUS_EVENT, { detail: normalized }))
  }
  return normalized
}

const publishVaultFilesChanged = (status) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(IROH_SYNC_FILES_CHANGED_EVENT, {
    detail: {
      transferredFiles: Number(status?.transferredFiles || 0),
      transferredBytes: Number(status?.transferredBytes || 0)
    }
  }))
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
    const status = publishStatus(await invoke('tauri_sync_run', {
      payloadByOperation: { sync: {} }
    }))
    if (!status?.lastError) publishVaultFilesChanged(status)
    return status
  } catch (error) {
    if (cleanPeerCloseMessage(error?.message || error)) {
      const status = await readStatus().catch(() => ({
        ...(lastPublishedStatus || {}),
        running: false,
        lastError: '',
        transportClosedCleanly: true
      }))
      publishVaultFilesChanged(status)
      return publishStatus(status)
    }
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

export const irohSyncClient = {
  status: readStatus,
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
