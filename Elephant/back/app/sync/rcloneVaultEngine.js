import fs from 'fs-extra'
import path from 'path'
import { RcloneManager } from './RcloneManager.js'
import { buildBisyncArgs, buildRcloneFilterRules } from './rcloneArgs.js'
import { createRcloneExecutor } from './rcloneNodeRunner.js'
import {
  SYNC_BACKENDS,
  SYNC_STATUSES,
  createSyncHistoryRecord,
  createSyncQueueItem,
  mergeSyncPeers
} from 'common/elephantnote/sync'

const createDefaultRclone = () => new RcloneManager({ executor: createRcloneExecutor() })
const nowIso = () => new Date().toISOString()
const CONFIG_DIR = '.elephantnote'
const CONFIG_FILE = 'sync-config.json'
const HISTORY_FILE = 'sync-log.json'
const RUN_OPERATIONS = ['snapshot', 'pull', 'push', 'sync']
const PLAN_OPERATIONS = ['init', ...RUN_OPERATIONS]
const MISSING_REMOTE_MESSAGE = 'Sync remote is not configured. Choose a remote path before running rclone sync.'

const hasOwnPayload = (payloadByOperation = {}, operation) => (
  Object.prototype.hasOwnProperty.call(payloadByOperation || {}, operation)
)

const samePayload = (left = {}, right = {}) => JSON.stringify(left || {}) === JSON.stringify(right || {})

const normalizePlanOperation = (operation = '') => {
  const normalized = String(operation || '').trim()
  return PLAN_OPERATIONS.includes(normalized) ? normalized : ''
}

const createRclonePlan = (payloadByOperation = {}) => {
  const explicitOperations = Array.isArray(payloadByOperation?.operations)
    ? payloadByOperation.operations.map(normalizePlanOperation).filter(Boolean)
    : []
  const operations = explicitOperations.length
    ? explicitOperations
    : PLAN_OPERATIONS.filter((operation) => hasOwnPayload(payloadByOperation, operation))

  return operations.map((operation) => ({
    operation,
    payload: payloadByOperation?.[operation] || {}
  }))
}

const readHistoryRecords = async(filePath) => {
  if (!(await fs.pathExists(filePath))) return []
  const data = await fs.readJson(filePath).catch(() => [])
  const records = Array.isArray(data) ? data : data?.records || []
  return Array.isArray(records) ? records.filter((item) => item?.id && item?.operation) : []
}

const createPeerFromPayload = (payload = {}) => {
  const deviceId = String(payload.peerDeviceId || payload.deviceId || payload.id || '').trim()
  if (!deviceId) return null
  return {
    deviceId,
    name: payload.peerName || payload.name || payload.deviceName || deviceId,
    address: payload.peerAddress || payload.address || payload.endpoint || '',
    endpoint: payload.endpoint || payload.peerAddress || payload.address || '',
    vaultIds: payload.vaultIds || payload.vaults || [],
    online: payload.online !== false,
    pairedAt: payload.pairedAt || nowIso()
  }
}

export class RcloneVaultEngine {
  constructor({ cwd = '', rclone = createDefaultRclone() } = {}) {
    this.cwd = cwd
    this.rclone = rclone
    this.queue = []
    this.history = []
    this.running = false
    this.lastError = ''
    this.lastRunAt = ''
    this.remotePath = ''
    this.firstRunDone = false
    this.peers = []
    this.lastConfigLoadedFor = ''
  }

  setCwd(cwd) {
    const nextCwd = cwd || ''
    if (nextCwd !== this.cwd) {
      this.cwd = nextCwd
      this.remotePath = ''
      this.firstRunDone = false
      this.peers = []
      this.lastConfigLoadedFor = ''
      this.queue = []
      this.history = []
      this.lastError = ''
    }
  }

  configPath() {
    return path.join(this.cwd, CONFIG_DIR, CONFIG_FILE)
  }

  syncDir() {
    return path.join(this.cwd, CONFIG_DIR, 'sync')
  }

  filtersPath() {
    return path.join(this.syncDir(), 'rclone-filter.txt')
  }

  historyPath() {
    return path.join(this.syncDir(), HISTORY_FILE)
  }

  legacyHistoryPath() {
    return path.join(this.cwd, CONFIG_DIR, HISTORY_FILE)
  }

  async ensureSupportFiles() {
    if (!this.cwd) return {}
    await fs.ensureDir(this.syncDir())
    await fs.writeFile(this.filtersPath(), `${buildRcloneFilterRules().join('\n')}\n`, 'utf8')
    return { filtersFile: this.filtersPath() }
  }

  applyConfig(config = {}) {
    if (config?.remotePath) this.remotePath = String(config.remotePath)
    this.firstRunDone = Boolean(config?.firstRunDone)
    this.peers = mergeSyncPeers([], config?.peers || [])
  }

  async loadConfig({ force = false } = {}) {
    if (!this.cwd) return
    if (!force && this.lastConfigLoadedFor === this.cwd) return
    const target = this.configPath()
    if (await fs.pathExists(target)) {
      this.applyConfig(await fs.readJson(target).catch(() => ({})))
    }
    const history = await readHistoryRecords(this.historyPath())
    this.history = history.length ? history : await readHistoryRecords(this.legacyHistoryPath())
    this.lastConfigLoadedFor = this.cwd
  }

  async persistConfig() {
    if (!this.cwd) return
    const target = this.configPath()
    await fs.ensureDir(path.dirname(target))
    await fs.writeJson(target, {
      version: 2,
      backend: SYNC_BACKENDS.RCLONE,
      remotePath: this.remotePath,
      firstRunDone: this.firstRunDone,
      peers: this.peers,
      updatedAt: nowIso()
    }, { spaces: 2 })
    this.lastConfigLoadedFor = this.cwd
  }

  async persistHistory() {
    if (!this.cwd) return
    await fs.ensureDir(path.dirname(this.historyPath()))
    await fs.writeJson(this.historyPath(), this.history.slice(-100), { spaces: 2 })
  }

  plan(payloadByOperation = {}) {
    return createRclonePlan(payloadByOperation)
  }

  enqueue(operation) {
    const item = createSyncQueueItem(operation)
    const duplicate = this.queue.find((entry) =>
      entry.status === SYNC_STATUSES.QUEUED &&
      entry.operation === item.operation &&
      samePayload(entry.payload, item.payload)
    )
    if (duplicate) return duplicate
    this.queue.push(item)
    return item
  }

  enqueuePlan(payloadByOperation = {}) {
    const operations = this.plan(payloadByOperation)
    if (!operations.length) {
      if (this.queue.some((item) => item.status === SYNC_STATUSES.QUEUED)) return []
      return this.remotePath ? [this.enqueue({ operation: 'sync', payload: {} })] : []
    }
    return operations.map((operation) => this.enqueue(operation))
  }

  configured() {
    return Boolean(this.remotePath)
  }

  status() {
    return {
      runtime: 'rclone',
      backend: SYNC_BACKENDS.RCLONE,
      cwd: this.cwd,
      running: this.running,
      configured: this.configured(),
      remotePath: this.remotePath,
      firstRunDone: this.firstRunDone,
      peers: this.peers,
      queued: this.queue.filter((item) => item.status === SYNC_STATUSES.QUEUED).length,
      operations: this.queue.slice(-20),
      history: this.history.slice(-50),
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      capabilities: {
        desktopRclone: true,
        mobileRcloneBinary: false,
        mobileSyncRequiresBackend: true
      },
      rclone: this.rclone.status()
    }
  }

  async run(payload = {}) {
    if (this.running) return this.status()
    await this.loadConfig({ force: true })
    this.mergeRemoteFromPayload(payload)
    this.mergePeersFromPayload(payload)
    const payloadKeys = Object.keys(payload || {})
    if (payloadKeys.length) {
      const enqueued = this.enqueuePlan(payload)
      if (!enqueued.length) await this.persistConfig()
    } else {
      this.enqueuePlan({})
    }
    this.running = true
    try {
      const queued = this.queue.filter((entry) => entry.status === SYNC_STATUSES.QUEUED)
      if (!queued.length) {
        if (!this.remotePath) this.lastError = MISSING_REMOTE_MESSAGE
        this.lastRunAt = nowIso()
        return this.status()
      }
      for (const item of queued) {
        await this.runQueueItem(item)
      }
      this.lastRunAt = nowIso()
      return this.status()
    } catch (error) {
      this.lastError = error?.message || 'Rclone sync failed.'
      throw error
    } finally {
      this.running = false
    }
  }

  mergeRemoteFromPayload(payload = {}) {
    const candidates = [
      payload?.remotePath,
      payload?.init?.remotePath,
      payload?.snapshot?.remotePath,
      payload?.sync?.remotePath,
      payload?.pull?.remotePath,
      payload?.push?.remotePath
    ]
    const nextRemotePath = candidates.find((value) => typeof value === 'string' && value.trim())
    if (nextRemotePath) this.remotePath = nextRemotePath.trim()
  }

  mergePeersFromPayload(payload = {}) {
    const candidates = [
      payload?.peer,
      createPeerFromPayload(payload),
      payload?.init?.peer,
      createPeerFromPayload(payload?.init || {}),
      payload?.snapshot?.peer,
      createPeerFromPayload(payload?.snapshot || {}),
      payload?.sync?.peer,
      createPeerFromPayload(payload?.sync || {}),
      payload?.pull?.peer,
      createPeerFromPayload(payload?.pull || {}),
      payload?.push?.peer,
      createPeerFromPayload(payload?.push || {})
    ]
    const peerList = [
      ...candidates.filter(Boolean),
      ...(Array.isArray(payload?.peers) ? payload.peers : []),
      ...(Array.isArray(payload?.init?.peers) ? payload.init.peers : [])
    ]
    if (peerList.length) this.peers = mergeSyncPeers(this.peers, peerList)
  }

  async recordQueueItem(item, status, error = '') {
    item.status = status
    item.error = error || ''
    item.updatedAt = nowIso()
    const record = createSyncHistoryRecord(item)
    this.history.push(record)
    await this.persistHistory()
    return item
  }

  async runQueueItem(item) {
    item.status = SYNC_STATUSES.RUNNING
    item.updatedAt = nowIso()
    try {
      if (item.operation === 'init') {
        this.mergeRemoteFromPayload({ init: item.payload })
        this.mergePeersFromPayload({ init: item.payload })
        await this.persistConfig()
      } else if (RUN_OPERATIONS.includes(item.operation)) {
        if (item.payload.remotePath) this.remotePath = String(item.payload.remotePath).trim()
        if (!this.remotePath) {
          this.lastError = MISSING_REMOTE_MESSAGE
          return this.recordQueueItem(item, SYNC_STATUSES.ERROR, MISSING_REMOTE_MESSAGE)
        }
        await this.sync(item.payload)
      } else {
        throw new Error(`Unknown sync operation: ${item.operation}.`)
      }
      await this.recordQueueItem(item, SYNC_STATUSES.DONE)
      return item
    } catch (error) {
      await this.recordQueueItem(item, SYNC_STATUSES.ERROR, error?.message || 'Sync operation failed.')
      throw error
    }
  }

  async sync({ remotePath = this.remotePath } = {}) {
    this.remotePath = String(remotePath || this.remotePath || '').trim()
    if (!this.cwd) throw new Error('Rclone sync requires an active vault path.')
    if (!this.remotePath) {
      this.lastError = MISSING_REMOTE_MESSAGE
      return this.status()
    }
    await this.persistConfig()
    const supportFiles = await this.ensureSupportFiles()
    try {
      await this.rclone.run(buildBisyncArgs({ localPath: this.cwd, remotePath: this.remotePath, resync: !this.firstRunDone, filtersFile: supportFiles.filtersFile }), { cwd: this.cwd })
      this.firstRunDone = true
      await this.persistConfig()
      this.lastError = ''
      return this.status()
    } catch (error) {
      this.lastError = error?.message || 'Rclone sync failed.'
      throw error
    }
  }
}
