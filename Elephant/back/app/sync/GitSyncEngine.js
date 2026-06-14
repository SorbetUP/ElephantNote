import { execFile } from 'child_process'
import os from 'os'
import { promisify } from 'util'
import fs from 'fs-extra'
import path from 'path'
import {
  SYNC_CONFIG_FILE,
  SYNC_BACKENDS,
  SYNC_DEFAULT_REMOTE,
  SYNC_HISTORY_FILE,
  SYNC_METADATA_DIR,
  SYNC_OPERATIONS,
  SYNC_OPERATION_SEQUENCE,
  SYNC_STATUSES,
  createSyncConfig,
  createMissingVaultSyncError,
  createSyncHistoryRecord,
  createSyncQueueItem,
  createSyncStatus,
  createUnknownSyncOperationError
} from '../../../shared/sync.js'
import { SyncthingManager } from './SyncthingManager.js'

const execFileAsync = promisify(execFile)

export class GitSyncEngine {
  constructor({ cwd = '', executor = execFileAsync, syncthing = new SyncthingManager() } = {}) {
    this.cwd = cwd
    this.executor = executor
    this.syncthing = syncthing
    this.syncthingStatus = syncthing.status()
    this.queue = []
    this.history = []
    this.running = false
    this.lastRunAt = ''
    this.lastError = ''
    this.config = null
    this.repository = {}
  }

  setCwd(cwd) {
    this.cwd = cwd || ''
  }

  enqueue(operation) {
    const item = createSyncQueueItem(operation, new Date(), { strict: false })
    this.queue.push(item)
    return item
  }

  enqueuePlan(payloadByOperation = {}) {
    const requestedOperations = SYNC_OPERATION_SEQUENCE.filter((operation) =>
      Object.prototype.hasOwnProperty.call(payloadByOperation || {}, operation)
    )
    const operations = requestedOperations.length ? requestedOperations : SYNC_OPERATION_SEQUENCE
    return operations.map((operation) => this.enqueue({
      operation,
      payload: payloadByOperation?.[operation] || {}
    }))
  }

  status() {
    return createSyncStatus({
      cwd: this.cwd,
      running: this.running,
      queue: this.queue,
      history: this.history,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      config: this.config,
      repository: this.repository,
      syncthing: this.syncthingStatus
    })
  }

  async run() {
    if (this.running) return this.status()
    if (!this.cwd) {
      throw createMissingVaultSyncError()
    }

    this.running = true
    this.lastError = ''
    try {
      for (const item of this.queue.filter((operation) => operation.status === SYNC_STATUSES.QUEUED)) {
        await this.runOperation(item)
      }
      await this.refreshRepository()
      this.lastRunAt = new Date().toISOString()
      return this.status()
    } catch (error) {
      this.lastError = error?.message || 'Git sync failed.'
      throw error
    } finally {
      this.running = false
    }
  }

  async runOperation(item) {
    item.status = SYNC_STATUSES.RUNNING
    item.updatedAt = new Date().toISOString()
    try {
      if (item.operation === SYNC_OPERATIONS.INIT) {
        await this.init(item.payload)
      } else if (item.operation === SYNC_OPERATIONS.SNAPSHOT) {
        await this.snapshot(item.payload)
      } else if (item.operation === SYNC_OPERATIONS.PULL) {
        await this.pull(item.payload)
      } else if (item.operation === SYNC_OPERATIONS.PUSH) {
        await this.push(item.payload)
      } else {
        throw createUnknownSyncOperationError(item.operation)
      }
      item.status = SYNC_STATUSES.DONE
      item.updatedAt = new Date().toISOString()
      await this.recordHistory(item)
      return item
    } catch (error) {
      item.status = SYNC_STATUSES.ERROR
      item.error = error?.message || 'Sync operation failed.'
      item.updatedAt = new Date().toISOString()
      await this.recordHistory(item)
      throw error
    }
  }

  async git(args) {
    const result = await this.executor('git', args, { cwd: this.cwd })
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    }
  }

  async init({
    remote = '',
    remoteName = SYNC_DEFAULT_REMOTE,
    branch = '',
    backend = '',
    syncthingEndpoint = '',
    syncthingApiKey = '',
    syncthingBinaryPath = '',
    peerDeviceId = '',
    peerAddress = 'dynamic'
  } = {}) {
    await fs.ensureDir(this.cwd)
    if (!await fs.pathExists(path.join(this.cwd, '.git'))) {
      await this.git(['init'])
    }
    await this.ensureGitIdentity()
    await this.persistMetadataIgnore()

    this.config = await this.readConfig()
    const nextPeers = peerDeviceId
      ? [{ deviceId: String(peerDeviceId).trim(), address: String(peerAddress || 'dynamic').trim() || 'dynamic' }]
      : this.config?.peers || []
    const nextConfig = {
      ...createSyncConfig({
        cwd: this.cwd,
        hostname: os.hostname(),
        remote,
        remoteName,
        branch,
        backend: backend || this.config?.backend || SYNC_BACKENDS.GIT,
        syncthingEndpoint: syncthingEndpoint || this.config?.syncthingEndpoint || '',
        syncthingApiKey: syncthingApiKey || this.config?.syncthingApiKey || '',
        peers: nextPeers
      }),
      deviceId: this.config?.deviceId || createSyncConfig({ cwd: this.cwd, hostname: os.hostname() }).deviceId,
      folderId: this.config?.folderId || createSyncConfig({ cwd: this.cwd, hostname: os.hostname() }).folderId,
      remote: remote || this.config?.remote || '',
      remoteName: remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE,
      branch: branch || this.config?.branch || '',
      backend: backend || this.config?.backend || SYNC_BACKENDS.GIT,
      syncthingEndpoint: syncthingEndpoint || this.config?.syncthingEndpoint || '',
      syncthingApiKey: syncthingApiKey || this.config?.syncthingApiKey || '',
      peers: nextPeers
    }

    if (nextConfig.remote) {
      await this.upsertRemote(nextConfig.remoteName, nextConfig.remote)
    }

    this.config = nextConfig
    await this.persistConfig()
    await this.configureSyncthing({ syncthingBinaryPath })
    await this.refreshRepository()
    return this.config
  }

  async snapshot({ message = '' } = {}) {
    await this.ensureReady()
    const status = await this.git(['status', '--short'])
    if (!status.stdout.trim()) {
      return {
        committed: false,
        message: 'No vault changes to snapshot.'
      }
    }
    await this.git(['add', '-A'])
    const commitMessage = message || `ElephantNote sync snapshot ${new Date().toISOString()}`
    try {
      await this.git(['commit', '-m', commitMessage])
      return {
        committed: true,
        message: commitMessage
      }
    } catch (error) {
      const output = `${error?.stdout || ''}\n${error?.stderr || ''}\n${error?.message || ''}`
      if (/nothing to commit|no changes added/i.test(output)) {
        return {
          committed: false,
          message: 'No vault changes to snapshot.'
        }
      }
      throw error
    }
  }

  async pull({ remoteName = '', branch = '' } = {}) {
    await this.ensureReady()
    const targetRemote = remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE
    const targetBranch = branch || this.config?.branch || await this.currentBranch()
    if (this.config?.remote || await this.hasRemote(targetRemote)) {
      await this.git(['pull', '--ff-only', targetRemote, targetBranch])
    }
  }

  async push({ remoteName = '', branch = '' } = {}) {
    await this.ensureReady()
    const targetRemote = remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE
    const targetBranch = branch || this.config?.branch || await this.currentBranch()
    if (this.config?.remote || await this.hasRemote(targetRemote)) {
      await this.git(['push', '-u', targetRemote, targetBranch])
    }
  }

  async ensureReady() {
    if (!await fs.pathExists(path.join(this.cwd, '.git'))) {
      await this.init()
    } else if (!this.config) {
      this.config = await this.readConfig()
      if (!this.config) await this.init()
    }
  }

  async readConfig() {
    const target = path.join(this.cwd, SYNC_METADATA_DIR, SYNC_CONFIG_FILE)
    if (!await fs.pathExists(target)) return null
    return fs.readJson(target).catch(() => null)
  }

  async persistConfig() {
    if (!this.cwd || !this.config) return
    const target = path.join(this.cwd, SYNC_METADATA_DIR, SYNC_CONFIG_FILE)
    await fs.ensureDir(path.dirname(target))
    await fs.writeJson(target, this.config, { spaces: 2 })
  }

  async persistMetadataIgnore() {
    const target = path.join(this.cwd, SYNC_METADATA_DIR, '.gitignore')
    await fs.ensureDir(path.dirname(target))
    await fs.writeFile(target, `${SYNC_HISTORY_FILE}\n`, 'utf8')
  }

  async upsertRemote(remoteName, remote) {
    const exists = await this.hasRemote(remoteName)
    await this.git(exists
      ? ['remote', 'set-url', remoteName, remote]
      : ['remote', 'add', remoteName, remote])
  }

  async ensureGitIdentity() {
    const hasName = await this.git(['config', 'user.name']).then((result) => Boolean(result.stdout.trim()), () => false)
    const hasEmail = await this.git(['config', 'user.email']).then((result) => Boolean(result.stdout.trim()), () => false)
    if (!hasName) await this.git(['config', 'user.name', 'ElephantNote Sync'])
    if (!hasEmail) await this.git(['config', 'user.email', 'sync@elephantnote.local'])
  }

  async hasRemote(remoteName) {
    try {
      await this.git(['remote', 'get-url', remoteName])
      return true
    } catch {
      return false
    }
  }

  async currentBranch() {
    try {
      const result = await this.git(['branch', '--show-current'])
      return result.stdout.trim() || 'main'
    } catch {
      return 'main'
    }
  }

  async refreshRepository() {
    if (!this.cwd || !await fs.pathExists(path.join(this.cwd, '.git'))) return
    const [branch, status] = await Promise.all([
      this.currentBranch(),
      this.git(['status', '--short', '--branch']).catch(() => ({ stdout: '' }))
    ])
    const branchLine = status.stdout.split('\n')[0] || ''
    const ahead = Number(branchLine.match(/ahead (\d+)/)?.[1] || 0)
    const behind = Number(branchLine.match(/behind (\d+)/)?.[1] || 0)
    this.repository = {
      branch,
      ahead,
      behind,
      dirty: status.stdout.split('\n').slice(1).some(Boolean)
    }
    await this.refreshSyncthing()
  }

  async configureSyncthing({ syncthingBinaryPath = '' } = {}) {
    if (!this.config?.syncthingEndpoint && this.config?.backend !== SYNC_BACKENDS.SYNCTHING_GIT) {
      this.syncthingStatus = this.syncthing.status()
      return
    }

    this.syncthing.configure({
      endpoint: this.config.syncthingEndpoint,
      apiKey: this.config.syncthingApiKey,
      binaryPath: syncthingBinaryPath
    })

    const ping = await this.syncthing.ping()
    if (!ping.connected && syncthingBinaryPath) {
      await this.syncthing.start({ cwd: this.cwd, binaryPath: syncthingBinaryPath })
    }
    if (ping.connected) {
      await this.syncthing.ensureFolder({
        folderId: this.config.folderId,
        label: this.config.folderLabel,
        path: this.cwd,
        type: this.config.mode === 'receive-only' ? 'receiveonly' : 'sendreceive'
      })
      for (const peer of this.config.peers || []) {
        await this.syncthing.ensurePeer({
          deviceId: peer.deviceId,
          address: peer.address || 'dynamic',
          folderId: this.config.folderId
        })
      }
    }
    this.syncthingStatus = {
      ...await this.syncthing.folderStatus(this.config.folderId),
      localDeviceId: ping.localDeviceId || ping.myID || ''
    }
  }

  async refreshSyncthing() {
    if (!this.config?.syncthingEndpoint && this.config?.backend !== SYNC_BACKENDS.SYNCTHING_GIT) {
      this.syncthingStatus = this.syncthing.status()
      return
    }
    this.syncthing.configure({
      endpoint: this.config.syncthingEndpoint,
      apiKey: this.config.syncthingApiKey
    })
    const ping = await this.syncthing.ping()
    this.syncthingStatus = {
      ...await this.syncthing.folderStatus(this.config.folderId),
      localDeviceId: ping.localDeviceId || ping.myID || ''
    }
  }

  async recordHistory(item) {
    const record = createSyncHistoryRecord(item)
    this.history = [...this.history, record].slice(-200)
    await this.persistHistory().catch(() => {})
  }

  async persistHistory() {
    if (!this.cwd) return
    const target = path.join(this.cwd, SYNC_METADATA_DIR, SYNC_HISTORY_FILE)
    await fs.ensureDir(path.dirname(target))
    await fs.writeJson(target, {
      version: 1,
      updatedAt: new Date().toISOString(),
      history: this.history
    }, { spaces: 2 })
  }
}
