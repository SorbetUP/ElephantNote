import fs from 'fs-extra'
import path from 'path'
import { RcloneManager } from './RcloneManager.js'
import { buildBisyncArgs } from './rcloneArgs.js'
import { createRcloneExecutor } from './rcloneNodeRunner.js'

const createDefaultRclone = () => new RcloneManager({ executor: createRcloneExecutor() })
const nowIso = () => new Date().toISOString()
const CONFIG_DIR = '.elephantnote'
const CONFIG_FILE = 'sync-config.json'
const RUN_OPERATIONS = ['snapshot', 'pull', 'push', 'sync']
const MISSING_REMOTE_MESSAGE = 'Sync remote is not configured. Choose a remote path before running rclone sync.'

const createQueueItem = ({ operation, payload = {} } = {}) => ({
  id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  operation: String(operation || '').trim(),
  payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
  status: 'queued',
  createdAt: nowIso(),
  updatedAt: nowIso(),
  error: ''
})

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
    this.lastConfigLoadedFor = ''
  }

  setCwd(cwd) {
    const nextCwd = cwd || ''
    if (nextCwd !== this.cwd) {
      this.cwd = nextCwd
      this.remotePath = ''
      this.firstRunDone = false
      this.lastConfigLoadedFor = ''
      this.queue = []
      this.history = []
      this.lastError = ''
    }
  }

  configPath() {
    return path.join(this.cwd, CONFIG_DIR, CONFIG_FILE)
  }

  applyConfig(config = {}) {
    if (config?.remotePath) this.remotePath = String(config.remotePath)
    this.firstRunDone = Boolean(config?.firstRunDone)
  }

  async loadConfig({ force = false } = {}) {
    if (!this.cwd) return
    if (!force && this.lastConfigLoadedFor === this.cwd) return
    const target = this.configPath()
    if (await fs.pathExists(target)) {
      this.applyConfig(await fs.readJson(target).catch(() => ({})))
    }
    this.lastConfigLoadedFor = this.cwd
  }

  async persistConfig() {
    if (!this.cwd) return
    const target = this.configPath()
    await fs.ensureDir(path.dirname(target))
    await fs.writeJson(target, {
      version: 2,
      backend: 'rclone',
      remotePath: this.remotePath,
      firstRunDone: this.firstRunDone,
      updatedAt: nowIso()
    }, { spaces: 2 })
    this.lastConfigLoadedFor = this.cwd
  }

  enqueue(operation) {
    const item = createQueueItem(operation)
    this.queue.push(item)
    return item
  }

  enqueuePlan(payloadByOperation = {}) {
    const operations = Object.keys(payloadByOperation || {})
    if (!operations.length) {
      if (this.queue.some((item) => item.status === 'queued')) return []
      return this.remotePath ? [this.enqueue({ operation: 'snapshot', payload: {} })] : []
    }
    return operations.map((operation) => this.enqueue({
      operation,
      payload: payloadByOperation?.[operation] || {}
    }))
  }

  configured() {
    return Boolean(this.remotePath)
  }

  status() {
    return {
      cwd: this.cwd,
      running: this.running,
      configured: this.configured(),
      remotePath: this.remotePath,
      firstRunDone: this.firstRunDone,
      queued: this.queue.filter((item) => item.status === 'queued').length,
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
    if (Object.keys(payload || {}).length) this.enqueuePlan(payload)
    else this.enqueuePlan({})
    this.running = true
    try {
      const queued = this.queue.filter((entry) => entry.status === 'queued')
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

  async runQueueItem(item) {
    item.status = 'running'
    item.updatedAt = nowIso()
    try {
      if (item.operation === 'init') {
        if (item.payload.remotePath) this.remotePath = String(item.payload.remotePath).trim()
        await this.persistConfig()
      } else if (RUN_OPERATIONS.includes(item.operation)) {
        if (!this.remotePath && !item.payload.remotePath) {
          item.status = 'queued'
          item.updatedAt = nowIso()
          this.lastError = MISSING_REMOTE_MESSAGE
          return item
        }
        await this.sync(item.payload)
      } else {
        throw new Error(`Unknown sync operation: ${item.operation}.`)
      }
      item.status = 'done'
      item.updatedAt = nowIso()
      this.history.push({ ...item })
      return item
    } catch (error) {
      item.status = 'error'
      item.error = error?.message || 'Sync operation failed.'
      item.updatedAt = nowIso()
      this.history.push({ ...item })
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
    try {
      await this.rclone.run(buildBisyncArgs({ localPath: this.cwd, remotePath: this.remotePath, resync: !this.firstRunDone }), { cwd: this.cwd })
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
