export const SYNC_OPERATIONS = Object.freeze({
  INIT: 'init',
  SNAPSHOT: 'snapshot',
  PULL: 'pull',
  PUSH: 'push',
  SYNC: 'sync'
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
export const SYNC_METADATA_DIR = '.elephantnote/sync'
export const SYNC_LEGACY_METADATA_DIR = '.elephantnote'
export const SYNC_HISTORY_FILE = 'sync-log.json'
export const SYNC_CONFIG_FILE = 'sync-config.json'
export const SYNC_BACKENDS = Object.freeze({
  RCLONE: 'rclone',
  GIT: 'git',
  SYNCTHING_GIT: 'syncthing-git'
})

export const SYNC_BACKEND_IDS = Object.freeze(Object.values(SYNC_BACKENDS))

const compactHash = (value = '') => {
  let hash = 5381
  for (const char of String(value)) hash = ((hash << 5) + hash) ^ char.charCodeAt(0)
  return Math.abs(hash >>> 0).toString(36)
}

const normalizeIsoDate = (value = '', fallback = new Date()) => {
  const text = String(value || '').trim()
  if (text && !Number.isNaN(Date.parse(text))) return new Date(text).toISOString()
  return fallback.toISOString()
}

const normalizeStringList = (value = []) => {
  const list = Array.isArray(value) ? value : []
  return [...new Set(list.map((item) => {
    if (typeof item === 'string') return item.trim()
    return String(item?.id || item?.name || item?.path || '').trim()
  }).filter(Boolean))]
}

const normalizePeerId = (peer = {}) => String(peer.deviceId || peer.id || '').trim()

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
  const error = new Error('Rclone sync requires an active vault path.')
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

const hasPayloadObject = (payloadByOperation = {}, operation) => (
  Object.prototype.hasOwnProperty.call(payloadByOperation || {}, operation)
)

const createPlanItem = (payloadByOperation = {}, operation) => ({
  operation,
  payload: payloadByOperation?.[operation] || {}
})

const normalizeExplicitOperations = (operations = []) => (Array.isArray(operations) ? operations : [])
  .map((operation) => normalizeSyncOperation(operation))
  .filter(Boolean)

export const createDefaultSyncPlan = (payloadByOperation = {}) => {
  const explicitOperations = normalizeExplicitOperations(payloadByOperation?.operations)
  if (explicitOperations.length) {
    return explicitOperations.map((operation) => createPlanItem(payloadByOperation, operation))
  }

  if (hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.SYNC)) {
    return SYNC_GIT_REMOTE_OPERATION_SEQUENCE.map((operation) => ({
      operation,
      payload: payloadByOperation?.[operation] || payloadByOperation?.[SYNC_OPERATIONS.SYNC] || {}
    }))
  }

  const hasExplicitGitOperation = [SYNC_OPERATIONS.INIT, SYNC_OPERATIONS.SNAPSHOT, SYNC_OPERATIONS.PULL, SYNC_OPERATIONS.PUSH]
    .some((operation) => hasPayloadObject(payloadByOperation, operation))

  if (!hasExplicitGitOperation) {
    return SYNC_OPERATION_SEQUENCE.map((operation) => createPlanItem(payloadByOperation, operation))
  }

  const plan = []
  if (
    hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.INIT) ||
    hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.SNAPSHOT) ||
    hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PULL) ||
    hasPayloadObject(payloadByOperation, SYNC_OPERATIONS.PUSH)
  ) {
    plan.push(createPlanItem(payloadByOperation, SYNC_OPERATIONS.INIT))
  }
  for (const operation of [SYNC_OPERATIONS.SNAPSHOT, SYNC_OPERATIONS.PULL, SYNC_OPERATIONS.PUSH]) {
    if (hasPayloadObject(payloadByOperation, operation)) plan.push(createPlanItem(payloadByOperation, operation))
  }
  return plan
}

export const createSyncIdentity = ({ cwd = '', hostname = '', now = new Date() } = {}) => {
  const seed = `${cwd}|${hostname}`
  return {
    deviceId: `en-${compactHash(seed || now.toISOString())}`,
    folderId: `vault-${compactHash(cwd || 'vault')}`,
    folderLabel: cwd ? String(cwd).split(/[\\/]/).filter(Boolean).at(-1) || 'Vault' : 'Vault'
  }
}

export const normalizeSyncPeer = (peer = {}, now = new Date()) => {
  const deviceId = normalizePeerId(peer)
  const address = String(peer.address || peer.peerAddress || peer.endpoint || '').trim()
  const name = String(peer.name || peer.deviceName || peer.label || deviceId || 'Elephant device').trim()
  const fallbackIdSeed = `${name}|${address}|${peer.publicKey || ''}`
  const id = deviceId || (fallbackIdSeed.trim() ? `peer-${compactHash(fallbackIdSeed)}` : '')
  if (!id) return null
  const pairedAt = peer.pairedAt ? normalizeIsoDate(peer.pairedAt, now) : ''
  return {
    id,
    deviceId: deviceId || id,
    name: name || id,
    address,
    endpoint: String(peer.endpoint || address || '').trim(),
    vaultIds: normalizeStringList(peer.vaultIds || peer.vaults),
    online: Boolean(peer.online),
    pairedAt,
    lastSeenAt: normalizeIsoDate(peer.lastSeenAt || peer.announcedAt, now)
  }
}

export const mergeSyncPeers = (currentPeers = [], incomingPeers = [], now = new Date()) => {
  const peers = new Map()
  const upsertPeer = (peer, incoming = false) => {
    const normalized = normalizeSyncPeer(peer, now)
    if (!normalized) return
    const previous = peers.get(normalized.id)
    if (!previous) {
      peers.set(normalized.id, normalized)
      return
    }
    peers.set(normalized.id, {
      ...previous,
      ...normalized,
      vaultIds: [...new Set([...(previous.vaultIds || []), ...(normalized.vaultIds || [])])],
      pairedAt: normalized.pairedAt || previous.pairedAt,
      online: incoming ? normalized.online : previous.online || normalized.online,
      lastSeenAt: incoming ? normalized.lastSeenAt : previous.lastSeenAt || normalized.lastSeenAt
    })
  }

  for (const peer of Array.isArray(currentPeers) ? currentPeers : []) upsertPeer(peer, false)
  for (const peer of Array.isArray(incomingPeers) ? incomingPeers : []) upsertPeer(peer, true)
  return [...peers.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export const createSyncConfig = ({
  cwd = '',
  hostname = '',
  remote = '',
  remotePath = '',
  remoteName = SYNC_DEFAULT_REMOTE,
  branch = '',
  mode = 'send-receive',
  backend = SYNC_BACKENDS.RCLONE,
  peers = [],
  now = new Date()
} = {}) => ({
  version: 2,
  ...createSyncIdentity({ cwd, hostname, now }),
  backend: SYNC_BACKEND_IDS.includes(backend) ? backend : SYNC_BACKENDS.RCLONE,
  mode,
  remoteName: remoteName || SYNC_DEFAULT_REMOTE,
  remote,
  remotePath,
  branch,
  peers: mergeSyncPeers([], peers, now),
  updatedAt: now.toISOString()
})

export const createSyncHistoryRecord = (item = {}) => ({
  id: item.id,
  operation: item.operation,
  status: item.status,
  updatedAt: item.updatedAt,
  error: item.error || ''
})

export const createSyncStatus = ({
  cwd = '',
  running = false,
  queue = [],
  history = [],
  lastRunAt = '',
  lastError = '',
  config = null,
  repository = {}
} = {}) => ({
  runtime: 'web-git',
  cwd,
  running,
  deviceId: config?.deviceId || '',
  folderId: config?.folderId || '',
  backend: config?.backend || SYNC_BACKENDS.RCLONE,
  remote: config?.remote || '',
  remotePath: config?.remotePath || '',
  peers: mergeSyncPeers([], config?.peers || []),
  branch: repository.branch || config?.branch || '',
  ahead: repository.ahead || 0,
  behind: repository.behind || 0,
  dirty: Boolean(repository.dirty),
  syncthing: {
    configured: false,
    connected: false,
    endpoint: '',
    localDeviceId: '',
    folderState: '',
    lastError: ''
  },
  queued: queue.filter((item) => item.status === SYNC_STATUSES.QUEUED).length,
  operations: queue.slice(-20),
  history: history.slice(-50),
  lastRunAt,
  lastError
})
