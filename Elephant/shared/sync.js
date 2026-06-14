export const SYNC_OPERATIONS = Object.freeze({
  INIT: 'init',
  SNAPSHOT: 'snapshot',
  PULL: 'pull',
  PUSH: 'push'
})

export const SYNC_OPERATION_SEQUENCE = Object.freeze([
  SYNC_OPERATIONS.INIT,
  SYNC_OPERATIONS.SNAPSHOT
])

export const SYNC_GIT_REMOTE_OPERATION_SEQUENCE = Object.freeze([
  ...SYNC_OPERATION_SEQUENCE,
  SYNC_OPERATIONS.PULL,
  SYNC_OPERATIONS.PUSH
])

export const SYNC_OPERATION_IDS = Object.freeze(Object.values(SYNC_OPERATIONS))

export const SYNC_STATUSES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error'
})

export const SYNC_ERROR_CODES = Object.freeze({
  NO_VAULT: 'ELEPHANTNOTE_SYNC_NO_VAULT',
  UNKNOWN_OPERATION: 'ELEPHANTNOTE_UNKNOWN_SYNC_OPERATION'
})

export const SYNC_DEFAULT_REMOTE = 'origin'
export const SYNC_METADATA_DIR = '.elephantnote'
export const SYNC_HISTORY_FILE = 'sync-log.json'
export const SYNC_CONFIG_FILE = 'sync-config.json'
export const SYNC_BACKENDS = Object.freeze({
  GIT: 'git',
  SYNCTHING_GIT: 'syncthing-git'
})

export const SYNC_BACKEND_IDS = Object.freeze(Object.values(SYNC_BACKENDS))

const compactHash = (value = '') => {
  let hash = 5381
  for (const char of String(value)) hash = ((hash << 5) + hash) ^ char.charCodeAt(0)
  return Math.abs(hash >>> 0).toString(36)
}

export const normalizeSyncOperation = (operation = '') => {
  const normalized = String(operation || '').trim()
  return SYNC_OPERATION_IDS.includes(normalized) ? normalized : ''
}

export const createUnknownSyncOperationError = (operation = '') => {
  const error = new Error(`Unknown sync operation: ${operation}.`)
  error.code = SYNC_ERROR_CODES.UNKNOWN_OPERATION
  return error
}

export const createMissingVaultSyncError = () => {
  const error = new Error('Git sync requires an active vault path.')
  error.code = SYNC_ERROR_CODES.NO_VAULT
  return error
}

export const createSyncQueueItem = ({ operation, payload = {} } = {}, now = new Date(), { strict = true } = {}) => {
  const normalizedOperation = normalizeSyncOperation(operation)
  if (!normalizedOperation && strict) throw createUnknownSyncOperationError(operation)
  const timestamp = now.toISOString()
  return {
    id: `sync-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    operation: normalizedOperation || String(operation || '').trim(),
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
    status: SYNC_STATUSES.QUEUED,
    createdAt: timestamp,
    updatedAt: timestamp,
    error: ''
  }
}

export const createDefaultSyncPlan = (payloadByOperation = {}) =>
  SYNC_OPERATION_SEQUENCE.map((operation) => ({
    operation,
    payload: payloadByOperation?.[operation] || {}
  }))

export const createSyncIdentity = ({ cwd = '', hostname = '', now = new Date() } = {}) => {
  const seed = `${cwd}|${hostname}`
  return {
    deviceId: `en-${compactHash(seed || now.toISOString())}`,
    folderId: `vault-${compactHash(cwd || 'vault')}`,
    folderLabel: cwd ? String(cwd).split(/[\\/]/).filter(Boolean).at(-1) || 'Vault' : 'Vault'
  }
}

export const createSyncConfig = ({
  cwd = '',
  hostname = '',
  remote = '',
  remoteName = SYNC_DEFAULT_REMOTE,
  branch = '',
  mode = 'send-receive',
  backend = SYNC_BACKENDS.GIT,
  syncthingEndpoint = '',
  syncthingApiKey = '',
  peers = [],
  now = new Date()
} = {}) => ({
  version: 1,
  ...createSyncIdentity({ cwd, hostname, now }),
  backend: SYNC_BACKEND_IDS.includes(backend) ? backend : SYNC_BACKENDS.GIT,
  mode: String(mode || 'send-receive'),
  remoteName: remoteName || SYNC_DEFAULT_REMOTE,
  remote: String(remote || ''),
  branch: String(branch || ''),
  syncthingEndpoint: String(syncthingEndpoint || ''),
  syncthingApiKey: String(syncthingApiKey || ''),
  peers: Array.isArray(peers) ? peers : [],
  updatedAt: now.toISOString()
})

export const createSyncStatus = ({
  cwd = '',
  running = false,
  queue = [],
  history = [],
  lastRunAt = '',
  lastError = '',
  config = null,
  repository = {},
  syncthing = {}
} = {}) => ({
  cwd,
  running: Boolean(running),
  deviceId: config?.deviceId || '',
  folderId: config?.folderId || '',
  backend: config?.backend || SYNC_BACKENDS.GIT,
  remote: config?.remote || '',
  peers: Array.isArray(config?.peers) ? config.peers : [],
  branch: repository?.branch || config?.branch || '',
  ahead: Number(repository?.ahead || 0),
  behind: Number(repository?.behind || 0),
  dirty: Boolean(repository?.dirty),
  syncthing: {
    configured: Boolean(config?.syncthingEndpoint || syncthing?.configured),
    connected: Boolean(syncthing?.connected),
    endpoint: syncthing?.endpoint || config?.syncthingEndpoint || '',
    localDeviceId: syncthing?.localDeviceId || syncthing?.myID || '',
    folderState: syncthing?.folderState || '',
    lastError: syncthing?.lastError || ''
  },
  queued: queue.filter((item) => item.status === SYNC_STATUSES.QUEUED).length,
  operations: queue.slice(-20),
  history: history.slice(-50),
  lastRunAt,
  lastError
})

export const createSyncHistoryRecord = (item = {}) => ({
  id: String(item.id || ''),
  operation: normalizeSyncOperation(item.operation) || String(item.operation || ''),
  status: Object.values(SYNC_STATUSES).includes(item.status) ? item.status : SYNC_STATUSES.ERROR,
  updatedAt: String(item.updatedAt || ''),
  error: String(item.error || '')
})
